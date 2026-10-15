import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'

// 注入 Argon2 实现（与 src/renderer/src/lib/argon2.ts 逻辑一致）
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

const PW = 'test-password-123'

async function testDefaultKdf() {
  const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(PW))
  const db = kdbxweb.Kdbx.create(creds, 'TestDB')
  db.createDefaultGroup()
  const group = db.getDefaultGroup()
  const entry = db.createEntry(group)
  entry.fields.set('Title', '测试条目')
  entry.fields.set('UserName', 'user@test.com')
  entry.fields.set('Password', kdbxweb.ProtectedValue.fromString('my-secret-pass'))
  entry.fields.set('URL', 'https://example.com')

  const saved = await db.save()
  console.log('[default-kdf] saved bytes:', saved.byteLength)

  const creds2 = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(PW))
  const db2 = await kdbxweb.Kdbx.load(saved, creds2)
  const e2 = db2.getDefaultGroup().entries[0]
  const title = e2.fields.get('Title')
  const pw = e2.fields.get('Password')
  console.log('[default-kdf] title:', typeof title === 'string' ? title : title.getText())
  console.log('[default-kdf] password:', pw.getText())
  if (pw.getText() !== 'my-secret-pass') throw new Error('密码不一致')
}

async function testArgon2Kdf() {
  const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(PW))
  const db = kdbxweb.Kdbx.create(creds, 'ArgonDB')
  db.createDefaultGroup()
  db.setKdf(kdbxweb.Consts.KdfId.Argon2) // Argon2d（KeePass 2 默认）
  const group = db.getDefaultGroup()
  const entry = db.createEntry(group)
  entry.fields.set('Title', 'Argon2 条目')
  entry.fields.set('Password', kdbxweb.ProtectedValue.fromString('argon-pass'))

  const saved = await db.save()
  console.log('[argon2] saved bytes:', saved.byteLength)

  const creds2 = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(PW))
  const db2 = await kdbxweb.Kdbx.load(saved, creds2)
  const e2 = db2.getDefaultGroup().entries[0]
  const pw = e2.fields.get('Password')
  console.log('[argon2] password:', pw.getText())
  if (pw.getText() !== 'argon-pass') throw new Error('Argon2 密码不一致')
}

async function testWrongPassword() {
  const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(PW))
  const db = kdbxweb.Kdbx.create(creds, 'TestDB')
  db.createDefaultGroup()
  const saved = await db.save()

  try {
    const bad = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('wrong-password'))
    await kdbxweb.Kdbx.load(saved, bad)
    throw new Error('错误密码竟然通过了！')
  } catch (e) {
    console.log('[wrong-password] 正确拒绝:', e.code ?? e.message)
  }
}

async function main() {
  await testDefaultKdf()
  await testArgon2Kdf()
  await testWrongPassword()
  console.log('=== 全部 KDBX 测试通过 ===')
}

main().catch((e) => {
  console.error('=== 测试失败 ===')
  console.error(e)
  process.exit(1)
})
