// 修复 recent.json（恢复正确的中文路径），Node 的 UTF-8 处理可靠
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const appData = process.env.APPDATA || ''
const file = join(appData, 'safevault', 'recent.json')
// 改成你自己放密码库的目录（或直接改下面的 candidates）
const folder = process.env.SAFEVAULT_DB_DIR || process.cwd()

const candidates = [join(folder, '数据库.kdbx'), join(folder, '数据库-备份1.kdbx')]
let paths = candidates.filter((p) => existsSync(p))

if (paths.length === 0) {
  try {
    const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.kdbx'))
    paths = files.map((f) => join(folder, f))
    console.log('通过扫描目录找到:', files.join(', '))
  } catch (e) {
    console.log('无法读取目录:', e.message)
  }
}

writeFileSync(file, JSON.stringify(paths), 'utf8')

console.log('已修复 recent.json，回读校验：')
const back = JSON.parse(readFileSync(file, 'utf8'))
for (const p of back) console.log('  -', p, existsSync(p) ? '(文件存在)' : '(文件缺失)')
