import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  nativeTheme,
  net,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { join } from 'path'
import { promises as fsp } from 'fs'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import {
  initExtensionServer,
  setExtensionEnabled,
  regenerateToken,
  getExtensionConfig,
  syncCredentials,
  clearCredentials,
  setSaveHandler,
  type CredentialItem,
  type SaveRequest,
  type SaveResult
} from './extension-server'
import { TRAY_ICON_BASE64 } from './tray-icon'

let mainWindow: BrowserWindow | null = null
let clipboardTimer: ReturnType<typeof setTimeout> | null = null
let tray: Tray | null = null
let isQuitting = false
let trayHintShown = false

// 品牌已改名为「钥匙窝」，但用户配置目录继续沿用旧的 safevault：
// 里面的 recent.json、extension.json（扩展令牌）和本地存储（设置、主题、关闭行为）都要保住，
// 否则改名等于把用户设置清空。目录不存在时先建出来（setPath 对不存在的目录会抛错）。
const userDataDir = join(app.getPath('appData'), 'safevault')
try {
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })
  app.setPath('userData', userDataDir)
} catch {
  // 极端情况下保留 Electron 默认目录，不能让程序起不来
}

// ---- 单实例锁：反复点击桌面图标只会唤醒已有进程，托盘图标保持唯一 ----
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  // 已有实例在运行，直接退出本进程，避免出现多个托盘图标
  app.quit()
} else {
  app.on('second-instance', () => {
    // 用户再次点击桌面图标时，把已隐藏到托盘的窗口唤回前台
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))

  // 关闭按钮 -> 隐藏到系统托盘（后台常驻，保证浏览器扩展持续可用）
  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    // 给渲染进程机会在隐藏前保存
    mainWindow?.webContents.send('app:before-close')
    mainWindow?.hide()
    if (!trayHintShown && tray) {
      trayHintShown = true
      try {
        tray.displayBalloon({
          title: '钥匙窝仍在后台运行',
          content:
            '已最小化到系统托盘，浏览器扩展可继续自动填充与保存密码。右键托盘图标可选择「退出钥匙窝」。'
        })
      } catch {
        // 某些系统不支持气泡提示，忽略
      }
    }
  })

  mainWindow.on('show', () => refreshTrayMenu())
  mainWindow.on('hide', () => refreshTrayMenu())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function toggleMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function refreshTrayMenu(): void {
  if (!tray) return
  const visible = Boolean(mainWindow?.isVisible())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: visible ? '隐藏主界面' : '显示主界面',
        click: () => toggleMainWindow()
      },
      {
        label: '锁定密码库',
        click: () => mainWindow?.webContents.send('lock-request')
      },
      { type: 'separator' },
      {
        label: '退出钥匙窝',
        click: () => requestQuit()
      }
    ])
  )
}

/**
 * 退出前先让渲染进程保存未落盘的改动，再真正退出。
 * 渲染进程无响应时用定时器兜底，避免退不掉。
 */
function requestQuit(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    isQuitting = true
    app.quit()
    return
  }
  mainWindow.webContents.send('quit-request')
  setTimeout(() => {
    if (!isQuitting) {
      isQuitting = true
      app.quit()
    }
  }, 2500)
}

function createTray(): void {
  if (tray) return
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  tray = new Tray(icon)
  tray.setToolTip('钥匙窝 YaoShiWo · 本地密码管理器')
  tray.on('click', () => toggleMainWindow())
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  refreshTrayMenu()
}

function recentFilePath(): string {
  return join(app.getPath('userData'), 'recent.json')
}

function readRecent(): string[] {
  try {
    const data = readFileSync(recentFilePath(), 'utf8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]): void {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(recentFilePath(), JSON.stringify(list), 'utf8')
  } catch {
    // 忽略写入失败，不影响主流程
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: '打开密码库',
      filters: [
        { name: 'KeePass 密码库', extensions: ['kdbx'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const path = res.filePaths[0]
    try {
      const buf = await fsp.readFile(path)
      return { canceled: false, path, data: buf.toString('base64') }
    } catch (err) {
      return { canceled: false, path, error: String(err) }
    }
  })

  ipcMain.handle('dialog:openKeyFile', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: '选择密钥文件',
      properties: ['openFile'],
      filters: [{ name: '所有文件', extensions: ['*'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const path = res.filePaths[0]
    const buf = await fsp.readFile(path)
    return { canceled: false, path, data: buf.toString('base64') }
  })

  ipcMain.handle('dialog:saveFile', async (_e, defaultName: string) => {
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: '保存密码库',
      defaultPath: defaultName,
      filters: [{ name: 'KeePass 密码库', extensions: ['kdbx'] }]
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    return { canceled: false, path: res.filePath }
  })

  ipcMain.handle('file:write', async (_e, path: string, dataB64: string) => {
    await fsp.writeFile(path, Buffer.from(dataB64, 'base64'))
    return true
  })

  ipcMain.handle('file:read', async (_e, path: string) => {
    const buf = await fsp.readFile(path)
    return buf.toString('base64')
  })

  ipcMain.handle('favicon:fetch', async (_e, domain: string) => {
    if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) return { data: null }
    const paths = ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png']
    for (const p of paths) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 6000)
        const res = await net.fetch(`https://${domain}${p}`, {
          signal: ctrl.signal
        })
        clearTimeout(timer)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length === 0) continue
        const ct = (res.headers.get('content-type') || '').toLowerCase()
        const type = ct.includes('image') ? ct.split(';')[0].trim() : 'image/x-icon'
        return { data: `data:${type};base64,${buf.toString('base64')}` }
      } catch {
        // 尝试下一个路径
      }
    }
    return { data: null }
  })

  ipcMain.handle('clipboard:write', (_e, text: string, clearMs: number) => {
    clipboard.writeText(text)
    if (clipboardTimer) clearTimeout(clipboardTimer)
    if (clearMs > 0) {
      clipboardTimer = setTimeout(() => {
        if (clipboard.readText() === text) clipboard.clear()
      }, clearMs)
    }
    return true
  })

  ipcMain.handle('clipboard:clear', () => {
    if (clipboardTimer) clearTimeout(clipboardTimer)
    clipboard.clear()
    return true
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:toggleMaximize', () => {
    if (mainWindow?.isMaximized()) mainWindow?.unmaximize()
    else mainWindow?.maximize()
    return mainWindow?.isMaximized() ?? false
  })
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:hide', () => mainWindow?.hide())
  ipcMain.handle('window:show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  ipcMain.handle('app:quit', () => {
    isQuitting = true
    app.quit()
  })
  // 用于在「设置」里显示版本号，方便区分新旧构建
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('app:getRecent', () => readRecent())
  ipcMain.handle('app:addRecent', (_e, path: string) => {
    const list = readRecent().filter((p) => p !== path)
    list.unshift(path)
    writeRecent(list.slice(0, 10))
    return list
  })
  ipcMain.handle('app:removeRecent', (_e, path: string) => {
    const list = readRecent().filter((p) => p !== path)
    writeRecent(list)
    return list
  })

  ipcMain.handle('app:setTheme', (_e, theme: string) => {
    nativeTheme.themeSource = theme as 'light' | 'dark' | 'system'
  })

  // ---- 浏览器扩展相关 ----
  ipcMain.handle('extension:getConfig', () => getExtensionConfig())
  // 设置面板里「下载扩展包」按钮：只放行 https 链接，避免被当作任意命令执行入口
  ipcMain.handle('shell:openExternal', (_e, url: unknown) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false
    void shell.openExternal(url)
    return true
  })
  ipcMain.handle('extension:setEnabled', (_e, value: boolean) => {
    setExtensionEnabled(value)
    return getExtensionConfig()
  })
  ipcMain.handle('extension:regenerateToken', () => {
    regenerateToken()
    return getExtensionConfig()
  })
  ipcMain.on('credentials:sync', (_e, list: CredentialItem[]) => syncCredentials(list))
  ipcMain.on('credentials:clear', () => clearCredentials())
}

let saveRequestSeq = 0
const saveResolvers = new Map<string, (result: SaveResult) => void>()

/** 扩展请求保存登录信息 → 转发给渲染层（密码库在渲染层内存中）并等待结果 */
function setupSaveBridge(): void {
  setSaveHandler((data: SaveRequest) => {
    return new Promise<SaveResult>((resolve) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        resolve({ ok: false, error: 'no_window' })
        return
      }
      const id = `save-${++saveRequestSeq}`
      const timer = setTimeout(() => {
        saveResolvers.delete(id)
        resolve({ ok: false, error: 'timeout' })
      }, 8000)
      saveResolvers.set(id, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
      mainWindow.webContents.send('credential:save-request', { id, ...data })
    })
  })

  ipcMain.on('credential:save-result', (_e, id: string, result: SaveResult) => {
    const resolver = saveResolvers.get(id)
    if (resolver) {
      saveResolvers.delete(id)
      resolver(result)
    }
  })
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    registerIpc()
    setupSaveBridge()
    initExtensionServer()
    createWindow()
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    // 仅在真正退出时结束进程；平时关闭窗口只是隐藏到托盘
    if (isQuitting) app.quit()
  })
}
