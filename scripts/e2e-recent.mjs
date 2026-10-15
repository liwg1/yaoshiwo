// 端到端测试辅助：备份/设置/还原 recent.json（用 Node 保证 UTF-8 正确）
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'

const appData = process.env.APPDATA || ''
const recentFile = join(appData, 'safevault', 'recent.json')
const backupFile = 'E:/Code/harness/safevault/.e2e/recent-backup.json'

const mode = process.argv[2]

if (mode === 'prepare') {
  const vaultPath = process.argv[3]
  mkdirSync(dirname(backupFile), { recursive: true })
  const existed = existsSync(recentFile)
  const content = existed ? readFileSync(recentFile, 'utf8') : ''
  writeFileSync(backupFile, JSON.stringify({ existed, content }), 'utf8')
  writeFileSync(recentFile, JSON.stringify([vaultPath]), 'utf8')
  console.log('prepare: recent.json 已指向测试库，原内容已备份')
  console.log('  备份前 existed =', existed, ', 长度 =', content.length)
} else if (mode === 'restore') {
  let info = { existed: false, content: '' }
  try {
    info = JSON.parse(readFileSync(backupFile, 'utf8'))
  } catch (e) {
    console.log('restore: 无备份文件，跳过')
    process.exit(0)
  }
  if (info.existed) {
    writeFileSync(recentFile, info.content, 'utf8')
    console.log('restore: recent.json 已还原')
    console.log('  还原内容:', info.content)
  } else {
    rmSync(recentFile, { force: true })
    console.log('restore: 原文件不存在，已删除测试写入')
  }
  rmSync('E:/Code/harness/safevault/.e2e', { recursive: true, force: true })
} else {
  console.log('用法: node e2e-recent.mjs prepare|restore [vaultPath]')
}
