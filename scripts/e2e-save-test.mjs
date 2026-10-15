// 端到端测试：通过本地 HTTP 服务保存/查询登录信息
import { readFileSync } from 'fs'
import { join } from 'path'

const token = JSON.parse(
  readFileSync(join(process.env.APPDATA || '', 'safevault', 'extension.json'), 'utf8')
).token

async function api(path, body) {
  const res = await fetch(`http://127.0.0.1:38471${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-SafeVault-Token': token },
    body: body ? JSON.stringify(body) : undefined
  })
  return { status: res.status, data: await res.json() }
}

const save1 = await api('/save', {
  url: 'https://example.com/login',
  username: 'newuser',
  password: 'newpass123'
})
console.log('[1] 保存新条目:', JSON.stringify(save1))

const q1 = await api('/query', { domain: 'example.com' })
console.log('[2] 查询 example.com:', JSON.stringify(q1))

const save2 = await api('/save', {
  url: 'https://github.com/login',
  username: 'testuser',
  password: 'CHANGED-PW-456'
})
console.log('[3] 更新 github 密码:', JSON.stringify(save2))

const q2 = await api('/query', { domain: 'github.com' })
console.log('[4] 查询 github.com:', JSON.stringify(q2))

const ok =
  save1.status === 200 &&
  save1.data.ok &&
  save1.data.action === 'created' &&
  q1.data.matches &&
  q1.data.matches.length === 1 &&
  q1.data.matches[0].password === 'newpass123' &&
  save2.status === 200 &&
  save2.data.ok &&
  save2.data.action === 'updated' &&
  q2.data.matches &&
  q2.data.matches.length === 1 &&
  q2.data.matches[0].password === 'CHANGED-PW-456'

console.log(ok ? '\n=== 保存链路验证通过 ===' : '\n=== 保存链路验证失败 ===')
process.exit(ok ? 0 : 1)
