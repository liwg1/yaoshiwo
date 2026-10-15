/**
 * 历史记录清理逻辑测试（跑的是真实源码，不是复制品）。
 *
 * 用法（先编译出一个临时 CommonJS 版本，再跑本脚本）：
 *   node node_modules/typescript/lib/tsc.js --outDir .tmp-cleanup --module commonjs \
 *        --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck \
 *        src/renderer/src/lib/kdbx.ts
 *   node scripts/test-history-cleanup.cjs
 *
 * 覆盖：
 *  A. 密码没变的历史快照被删除
 *  B. 同一个密码重复出现时只保留最近一条
 *  C. 只清理指定条目，其他条目不受影响
 *  D. 重复清理是幂等的（第二次 removed = 0）
 *  E. 保存/重新打开后结果仍然正确（顺带验证 KDBX 4 时间字段的二进制兼容修复）
 *  F. updateEntry 在密码没变时不再新增历史快照
 */
const path = require('path')
const assert = require('assert')

const lib = require(path.join(__dirname, '..', '.tmp-cleanup', 'lib', 'kdbx.js'))
const {
  initCrypto,
  createDatabase,
  saveDatabase,
  loadDatabase,
  createEntry,
  updateEntry,
  cleanupDuplicateHistory,
  getEntryHistory,
  findEntry,
  FIELD_PASSWORD
} = lib

const { ProtectedValue } = require('kdbxweb')

let failures = 0
function check(label, fn) {
  try {
    fn()
    console.log('  ✓ ' + label)
  } catch (e) {
    failures++
    console.log('  ✗ ' + label + '\n      ' + e.message)
  }
}

function setPw(entry, pw) {
  entry.fields.set(FIELD_PASSWORD, ProtectedValue.fromString(pw))
}

function pwOf(entry) {
  const v = entry.fields.get(FIELD_PASSWORD)
  return v && v.getText ? v.getText() : String(v ?? '')
}

function historyPws(entry) {
  return (entry.history ?? []).map(pwOf)
}

async function main() {
  initCrypto()
  const db = await createDatabase('test', 'pw')
  const groupId = db.getDefaultGroup().uuid.id

  // 条目 A：模拟旧版本留下的脏历史 —— P1,P1,P2,P2，当前密码 P3
  const a = createEntry(db, groupId, {
    title: 'A',
    username: 'u',
    password: 'P1',
    url: '',
    notes: '',
    totp: ''
  })
  a.pushHistory() // 快照: P1
  a.pushHistory() // 快照: P1（重复，旧版每次编辑都写）
  setPw(a, 'P2')
  a.pushHistory() // 快照: P2
  a.pushHistory() // 快照: P2（重复）
  setPw(a, 'P3') // 当前密码
  // 再加一条「密码与当前相同」的快照（改备注时留下的）
  a.pushHistory() // 快照: P3

  // 条目 B：同样脏，但本轮不清理它
  const b = createEntry(db, groupId, {
    title: 'B',
    username: 'u',
    password: 'X1',
    url: '',
    notes: '',
    totp: ''
  })
  b.pushHistory() // X1
  b.pushHistory() // X1
  setPw(b, 'X2')

  console.log('\n初始状态')
  check('A 有 5 条快照 [P1,P1,P2,P2,P3]', () =>
    assert.deepStrictEqual(historyPws(a), ['P1', 'P1', 'P2', 'P2', 'P3'])
  )
  check('A 界面统计 rawCount=5（count 已过滤为 2）', () => {
    const h = getEntryHistory(db, a.uuid.id)
    assert.strictEqual(h.rawCount, 5)
    assert.strictEqual(h.count, 2)
  })

  console.log('\n只清理条目 A')
  const r1 = cleanupDuplicateHistory(db, a.uuid.id)
  check('removed = 3（P1 重复 1 + P2 重复 1 + 与当前密码相同的 P3 共 1）', () =>
    assert.strictEqual(r1.removed, 3)
  )
  check('entries = 1', () => assert.strictEqual(r1.entries, 1))
  check('A 剩下 [P1, P2]', () => assert.deepStrictEqual(historyPws(a), ['P1', 'P2']))
  check('B 完全没有被动过，仍是 2 条 [X1,X1]', () =>
    assert.deepStrictEqual(historyPws(b), ['X1', 'X1'])
  )
  check('A 的界面统计变成 2 次密码更新', () =>
    assert.strictEqual(getEntryHistory(db, a.uuid.id).count, 2)
  )

  console.log('\n幂等性')
  const r2 = cleanupDuplicateHistory(db, a.uuid.id)
  check('再次清理 removed = 0', () => assert.strictEqual(r2.removed, 0))

  console.log('\n整库清理')
  const r3 = cleanupDuplicateHistory(db)
  check('整库清理把 B 也处理掉：removed = 1', () => assert.strictEqual(r3.removed, 1))
  check('B 剩下 [X1]', () => assert.deepStrictEqual(historyPws(b), ['X1']))

  console.log('\nupdateEntry 不再为「密码没变」写历史')
  const beforeLen = (a.history ?? []).length
  updateEntry(db, a.uuid.id, {
    title: 'A-改标题',
    username: 'u',
    password: 'P3', // 密码没变
    url: '',
    notes: '只改了备注',
    totp: ''
  })
  check('只改标题/备注时历史条数不变', () =>
    assert.strictEqual((a.history ?? []).length, beforeLen)
  )
  updateEntry(db, a.uuid.id, {
    title: 'A-改标题',
    username: 'u',
    password: 'P4', // 密码变了
    url: '',
    notes: '',
    totp: ''
  })
  check('密码真的变化时新增 1 条历史（内容为 P3）', () => {
    assert.strictEqual((a.history ?? []).length, beforeLen + 1)
    assert.strictEqual(historyPws(a)[historyPws(a).length - 1], 'P3')
  })

  console.log('\n保存并重新打开')
  const data = await saveDatabase(db)
  const tmpFile = path.join(__dirname, '..', '.tmp-cleanup', 'roundtrip.kdbx')
  const fs = require('fs')
  fs.writeFileSync(tmpFile, Buffer.from(data))
  const buf = fs.readFileSync(tmpFile)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const db2 = await loadDatabase(ab, 'pw')
  const a2 = findEntry(db2, a.uuid.id)
  const b2 = findEntry(db2, b.uuid.id)
  check('重新打开后 A 的历史仍是清理后的 [P1,P2] 加上后来改密码产生的 [P3]', () =>
    assert.deepStrictEqual(historyPws(a2), ['P1', 'P2', 'P3'])
  )
  check('重新打开后 B 的历史仍是 1 条 [X1]', () =>
    assert.deepStrictEqual(historyPws(b2), ['X1'])
  )
  check('A 的当前密码没有被动过（P4）', () => assert.strictEqual(pwOf(a2), 'P4'))

  console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('测试脚本异常：', e)
  process.exit(1)
})
