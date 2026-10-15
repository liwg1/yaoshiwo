// 单元测试：upsertLoginEntry 的「同域名同用户名更新、否则新建」逻辑
import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'

kdbxweb.CryptoEngine.setArgon2Impl(
  async (password, salt, memory, iterations, length, parallelism, type) => {
    const opts = {
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      iterations,
      parallelism,
      memorySize: Math.max(8, Math.floor(memory / 1024)),
      hashLength: length,
      outputType: 'binary'
    }
    const hash = type === 0 ? await argon2d(opts) : await argon2id(opts)
    return new Uint8Array(hash).buffer
  }
)

function domainOfUrl(u) {
  const s = (u || '').trim()
  if (!s) return ''
  try {
    const parsed = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? new URL(s) : new URL('https://' + s)
    return parsed.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function fieldText(fields, name) {
  const v = fields.get(name)
  if (v == null) return ''
  return typeof v === 'string' ? v : v.getText()
}

function* walkGroups(g) {
  yield g
  for (const sg of g.groups) yield* walkGroups(sg)
}

function upsertLoginEntry(db, data) {
  const domain = domainOfUrl(data.url)
  let target = null
  if (domain && data.username) {
    outer: for (const g of walkGroups(db.getDefaultGroup())) {
      for (const e of g.entries) {
        const sameUser = fieldText(e.fields, 'UserName') === data.username
        const sameSite = domainOfUrl(fieldText(e.fields, 'URL')) === domain
        if (sameUser && sameSite) {
          target = e
          break outer
        }
      }
    }
  }
  if (target) {
    target.pushHistory()
    target.fields.set('Password', kdbxweb.ProtectedValue.fromString(data.password))
    target.times.update()
    return { action: 'updated', title: fieldText(target.fields, 'Title') || domain }
  }
  const entry = db.createEntry(db.getDefaultGroup())
  const title = domain || (data.title || '').slice(0, 80) || data.url
  entry.fields.set('Title', title)
  entry.fields.set('UserName', data.username)
  entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(data.password))
  entry.fields.set('URL', data.url)
  entry.times.update()
  return { action: 'created', title }
}

function countEntries(db) {
  let n = 0
  for (const g of walkGroups(db.getDefaultGroup())) n += g.entries.length
  return n
}

function assert(cond, msg) {
  if (!cond) {
    console.error('断言失败:', msg)
    process.exit(1)
  }
}

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('pw'))
const db = kdbxweb.Kdbx.create(creds, 'Test')
db.createDefaultGroup()

const e1 = db.createEntry(db.getDefaultGroup())
e1.fields.set('Title', 'GitHub')
e1.fields.set('UserName', 'user1')
e1.fields.set('Password', kdbxweb.ProtectedValue.fromString('oldpass'))
e1.fields.set('URL', 'https://github.com/login')

assert(countEntries(db) === 1, '初始应有 1 个条目')

const r1 = upsertLoginEntry(db, { url: 'https://example.com', username: 'a@b.com', password: 'p1' })
assert(r1.action === 'created', '新域名应新建')
assert(countEntries(db) === 2, '新建后应有 2 个条目')

const r2 = upsertLoginEntry(db, { url: 'https://github.com/login', username: 'user1', password: 'newpass' })
assert(r2.action === 'updated', '同域名同用户名应更新')
assert(countEntries(db) === 2, '更新不应新增条目')
assert(fieldText(e1.fields, 'Password') === 'newpass', '密码应已更新')

const r3 = upsertLoginEntry(db, { url: 'https://www.github.com', username: 'user2', password: 'p2' })
assert(r3.action === 'created', 'www 前缀应视为同域名但不同用户名 → 新建')
assert(countEntries(db) === 3, '新建后应有 3 个条目')

const r4 = upsertLoginEntry(db, { url: 'https://github.com/x', username: 'user2', password: 'p3' })
assert(r4.action === 'updated', '同域名同用户名（不同路径）应更新')

console.log('=== upsertLoginEntry 单元测试通过 ===')
