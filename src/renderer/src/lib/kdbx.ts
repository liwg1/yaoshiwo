import { Kdbx, Credentials, ProtectedValue, XmlUtils } from 'kdbxweb'
import type { KdbxGroup, KdbxEntry } from 'kdbxweb'
import { initArgon2 } from './argon2'
import { parseOtpauthUri } from './totp'
import { pinyinSearchText } from './pinyin'
import type { TotpConfig } from './totp'
import type { EntryMeta, GroupMeta } from '../types'

export const FIELD_TITLE = 'Title'
export const FIELD_USER = 'UserName'
export const FIELD_PASSWORD = 'Password'
export const FIELD_URL = 'URL'
export const FIELD_NOTES = 'Notes'
export const FIELD_OTP = 'otp'

export interface EntryData {
  title: string
  username: string
  password: string
  url: string
  notes: string
  totp: string
}

let timeSerializationPatched = false

/**
 * 兼容性修复（重要）：
 * KeePass 的 KdbxFile.ReadTime 对 KDBX 4.x 文件始终用 Convert.FromBase64String 解析时间，
 * 也就是 4.x 的时间必须是「8 字节二进制值 + Base64」。
 *
 * 而 kdbxweb 在写「自定义数据项 / 自定义图标的最后修改时间」(KDBX 4.1 特性) 时，
 * 传了 binary=false，把它们写成了 ISO 文本 -> KeePass 打开时报「无效的 Base64 字符串」。
 *
 * 这里把 setDate 的默认行为改为强制二进制，保证所有时间字段格式统一且被 KeePass 接受。
 */
function forceBinaryTimeSerialization(): void {
  if (timeSerializationPatched) return
  const original = XmlUtils.setDate
  ;(XmlUtils as any).setDate = (node: any, date: any) => original(node, date, true)
  timeSerializationPatched = true
}

export function initCrypto(): void {
  initArgon2()
  forceBinaryTimeSerialization()
}

function fieldText(fields: Map<string, string | ProtectedValue>, name: string): string {
  const v = fields.get(name)
  if (v == null) return ''
  return typeof v === 'string' ? v : v.getText()
}

export async function loadDatabase(
  data: ArrayBuffer,
  password: string,
  keyFile?: ArrayBuffer | null
): Promise<Kdbx> {
  initCrypto()
  const credentials = new Credentials(ProtectedValue.fromString(password), keyFile ?? null)
  const db = await Kdbx.load(data, credentials)
  // 强制保存为 KDBX 4.0（跳过 4.1 的二进制时间等新特性），保证 KeePass 2 完全兼容
  db.setVersion(4)
  return db
}

export function createDatabase(name: string, password: string): Kdbx {
  initCrypto()
  const credentials = new Credentials(ProtectedValue.fromString(password), null)
  const db = Kdbx.create(credentials, name)
  db.createDefaultGroup()
  db.setVersion(4)
  return db
}

export async function saveDatabase(db: Kdbx): Promise<ArrayBuffer> {
  return await db.save()
}

export function extractGroups(root: KdbxGroup): GroupMeta[] {
  const walk = (g: KdbxGroup): GroupMeta => ({
    uuid: g.uuid.id,
    name: g.name ?? '',
    parentId: g.parentGroup ? g.parentGroup.uuid.id : root.uuid.id,
    children: (g.groups ?? []).map(walk)
  })
  return (root.groups ?? []).map(walk)
}

function buildSearchKey(title: string, username: string, url: string, notes: string): string {
  const raw = `${title}${username}${url}${notes}`.toLowerCase().replace(/\s+/g, '')
  return raw + pinyinSearchText(title) + pinyinSearchText(username)
}

export function extractEntries(root: KdbxGroup): EntryMeta[] {
  const out: EntryMeta[] = []
  const walk = (g: KdbxGroup, path: string[]): void => {
    for (const e of g.entries) {
      const title = fieldText(e.fields, FIELD_TITLE)
      const username = fieldText(e.fields, FIELD_USER)
      const password = fieldText(e.fields, FIELD_PASSWORD)
      const url = fieldText(e.fields, FIELD_URL)
      const notes = fieldText(e.fields, FIELD_NOTES)
      out.push({
        uuid: e.uuid.id,
        title,
        username,
        password,
        url,
        notes,
        searchKey: buildSearchKey(title, username, url, notes),
        hasTotp: getTotpConfig(e) !== null,
        groupId: g.uuid.id,
        groupPath: [...path],
        icon: e.icon ?? 0,
        created: e.times.creationTime ?? null,
        modified: e.times.lastModTime ?? null
      })
    }
    for (const sg of g.groups) walk(sg, [...path, sg.name ?? ''])
  }
  walk(root, [])
  return out
}

export function getTotpConfig(entry: KdbxEntry): TotpConfig | null {
  const otp = fieldText(entry.fields, FIELD_OTP)
  if (otp) {
    const parsed = parseOtpauthUri(otp)
    if (parsed) return parsed
  }
  const secret = fieldText(entry.fields, 'TimeOtp-Secret')
  if (secret) {
    const period = Number(fieldText(entry.fields, 'TimeOtp-Period')) || 30
    const digits = Number(fieldText(entry.fields, 'TimeOtp-Length')) || 6
    const algRaw = fieldText(entry.fields, 'TimeOtp-Algorithm').toUpperCase()
    const algorithm = algRaw.includes('256')
      ? ('SHA256' as const)
      : algRaw.includes('512')
        ? ('SHA512' as const)
        : ('SHA1' as const)
    return { secret, period, digits, algorithm }
  }
  return null
}

function* walkGroups(g: KdbxGroup): Generator<KdbxGroup> {
  yield g
  for (const sg of g.groups) yield* walkGroups(sg)
}

export interface EntryHistoryItem {
  modified: Date | null
  password: string
}

export interface EntryHistory {
  /** 密码真正发生过变化的版本数（已去掉密码没变的快照与重复密码） */
  count: number
  items: EntryHistoryItem[]
  /** 数据库里原始的 pushHistory 快照总数，用于说明「其中 N 条密码未变化已省略」 */
  rawCount: number
}

/**
 * 读取条目的密码更新历史（pushHistory 快照），按时间倒序；password 为该历史版本的明文密码。
 * 会做两步过滤：
 * 1. 密码与「当前密码」相同的快照不算一次密码更新（很多时候只是改了备注/网址也会产生快照）；
 * 2. 同一个密码在历史上出现过多次时，只保留最近的那一条日期。
 */
export function getEntryHistory(db: Kdbx, uuid: string): EntryHistory {
  const entry = findEntry(db, uuid)
  if (!entry) return { count: 0, items: [], rawCount: 0 }
  const raw = (entry.history ?? []).map((h) => ({
    modified: h.times?.lastModTime ?? null,
    password: fieldText(h.fields, FIELD_PASSWORD)
  }))
  raw.sort((a, b) => (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0))

  const seen = new Set<string>([fieldText(entry.fields, FIELD_PASSWORD)])
  const items: EntryHistoryItem[] = []
  for (const item of raw) {
    if (seen.has(item.password)) continue
    seen.add(item.password)
    items.push(item)
  }
  return { count: items.length, items, rawCount: raw.length }
}

export interface HistoryCleanupResult {
  /** 被改动的条目数 */
  entries: number
  /** 真正删掉的历史快照条数 */
  removed: number
}

/**
 * 清理冗余的密码历史快照（会真正写进数据库）：
 * - 密码与「当前密码」相同的快照直接删除，这类快照并不代表密码发生过变化；
 * - 同一个密码在历史上重复出现时，只保留最近的那一条。
 * 传入 uuid 只清理该条目，不传则清理整库。
 */
export function cleanupDuplicateHistory(db: Kdbx, uuid?: string): HistoryCleanupResult {
  const single = uuid ? findEntry(db, uuid) : undefined
  const targets: KdbxEntry[] = uuid ? (single ? [single] : []) : collectAllEntries(db)
  let entries = 0
  let removed = 0
  for (const entry of targets) {
    const history = entry.history ?? []
    if (history.length === 0) continue
    const seen = new Set<string>([fieldText(entry.fields, FIELD_PASSWORD)])
    const keep = new Set<KdbxEntry>()
    // 从新到旧挑选，保证同一个密码留下的是最近那一条
    const newestFirst = [...history].sort(
      (a, b) => (b.times?.lastModTime?.getTime() ?? 0) - (a.times?.lastModTime?.getTime() ?? 0)
    )
    for (const h of newestFirst) {
      const pw = fieldText(h.fields, FIELD_PASSWORD)
      if (seen.has(pw)) continue
      seen.add(pw)
      keep.add(h)
    }
    if (keep.size === history.length) continue
    removed += history.length - keep.size
    entries += 1
    // 按原有顺序写回，保留数据库里的历史排列
    entry.history = history.filter((h) => keep.has(h))
  }
  return { entries, removed }
}

/** 遍历数据库里的全部条目 */
function collectAllEntries(db: Kdbx): KdbxEntry[] {
  const out: KdbxEntry[] = []
  for (const g of walkGroups(db.getDefaultGroup())) {
    for (const e of g.entries) out.push(e)
  }
  return out
}

export function findEntry(db: Kdbx, uuid: string): KdbxEntry | undefined {
  const root = db.getDefaultGroup()
  for (const g of walkGroups(root)) {
    for (const e of g.entries) {
      if (e.uuid.id === uuid) return e
    }
  }
  return undefined
}

function domainOfUrl(u: string): string {
  const s = (u || '').trim()
  if (!s) return ''
  try {
    const parsed = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? new URL(s) : new URL('https://' + s)
    return parsed.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export interface BrowserCredential {
  url: string
  username: string
  password: string
  title?: string
}

/** 浏览器扩展保存登录信息：同域名 + 同用户名则更新密码，否则新建条目 */
export function upsertLoginEntry(
  db: Kdbx,
  data: BrowserCredential
): { action: 'created' | 'updated'; title: string } {
  const domain = domainOfUrl(data.url)
  let target: KdbxEntry | undefined

  if (domain && data.username) {
    outer: for (const g of walkGroups(db.getDefaultGroup())) {
      for (const e of g.entries) {
        const sameUser = fieldText(e.fields, FIELD_USER) === data.username
        const sameSite = domainOfUrl(fieldText(e.fields, FIELD_URL)) === domain
        if (sameUser && sameSite) {
          target = e
          break outer
        }
      }
    }
  }

  if (target) {
    // 只有密码真的变了才写历史版本，避免扩展重复保存同一密码时堆出一串没用的快照
    if (fieldText(target.fields, FIELD_PASSWORD) !== data.password) target.pushHistory()
    target.fields.set(FIELD_PASSWORD, ProtectedValue.fromString(data.password))
    target.times.update()
    return { action: 'updated', title: fieldText(target.fields, FIELD_TITLE) || domain }
  }

  const entry = db.createEntry(db.getDefaultGroup())
  const title = domain || (data.title || '').trim().slice(0, 80) || data.url
  entry.fields.set(FIELD_TITLE, title)
  entry.fields.set(FIELD_USER, data.username)
  entry.fields.set(FIELD_PASSWORD, ProtectedValue.fromString(data.password))
  entry.fields.set(FIELD_URL, data.url)
  entry.times.update()
  return { action: 'created', title }
}

function applyEntryData(entry: KdbxEntry, data: EntryData): void {
  entry.fields.set(FIELD_TITLE, data.title)
  entry.fields.set(FIELD_USER, data.username)
  entry.fields.set(FIELD_PASSWORD, ProtectedValue.fromString(data.password))
  entry.fields.set(FIELD_URL, data.url)
  entry.fields.set(FIELD_NOTES, data.notes)
  if (data.totp) entry.fields.set(FIELD_OTP, ProtectedValue.fromString(data.totp))
  else entry.fields.delete(FIELD_OTP)
  entry.times.update()
}

export function createEntry(db: Kdbx, groupId: string, data: EntryData): KdbxEntry {
  const group = db.getGroup(groupId) ?? db.getDefaultGroup()
  const entry = db.createEntry(group)
  applyEntryData(entry, data)
  return entry
}

export function updateEntry(db: Kdbx, uuid: string, data: EntryData): void {
  const entry = findEntry(db, uuid)
  if (!entry) return
  // 只有密码发生变化时才记录历史版本：只改标题/备注/网址等不写历史快照
  if (fieldText(entry.fields, FIELD_PASSWORD) !== data.password) entry.pushHistory()
  applyEntryData(entry, data)
}

export function removeEntry(db: Kdbx, uuid: string): void {
  const entry = findEntry(db, uuid)
  if (entry) db.remove(entry)
}

export function moveEntryToGroup(db: Kdbx, uuid: string, toGroupId: string): void {
  const entry = findEntry(db, uuid)
  const group = db.getGroup(toGroupId)
  if (entry && group) db.move(entry, group)
}

export function addGroup(db: Kdbx, parentId: string, name: string): KdbxGroup {
  const parent = db.getGroup(parentId) ?? db.getDefaultGroup()
  return db.createGroup(parent, name)
}

export function renameGroup(db: Kdbx, uuid: string, name: string): void {
  const group = db.getGroup(uuid)
  if (group) group.name = name
}

export function removeGroup(db: Kdbx, uuid: string): void {
  const group = db.getGroup(uuid)
  if (group) db.remove(group)
}
