import { useEffect, useState } from 'react'
import { useVault } from './store/vault'
import { initCrypto } from './lib/kdbx'
import UnlockScreen from './components/UnlockScreen'
import MainLayout from './components/MainLayout'

// 模块加载时立即注入 Argon2 实现
initCrypto()

export default function App(): JSX.Element {
  const locked = useVault((s) => s.locked)
  const settings = useVault((s) => s.settings)
  const setFontScale = useVault((s) => s.setFontScale)
  const toast = useVault((s) => s.toast)

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    void window.api.setTheme(settings.theme)
  }, [dark, settings.theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale))
  }, [settings.fontScale])

  // Ctrl + 滚轮 缩放字体
  useEffect(() => {
    const handler = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.05 : -0.05
      const next = Math.min(1.6, Math.max(0.85, settings.fontScale + delta))
      setFontScale(Math.round(next * 100) / 100)
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [settings.fontScale, setFontScale])

  // 空闲自动锁定
  useEffect(() => {
    if (locked) return
    const minutes = settings.autoLockMinutes
    if (minutes <= 0) return
    let timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      void useVault.getState().lock()
    }, minutes * 60000)
    const reset = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void useVault.getState().lock()
      }, minutes * 60000)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']
    events.forEach((e) => window.addEventListener(e, reset))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [locked, settings.autoLockMinutes])

  // 系统托盘菜单「锁定密码库」
  useEffect(() => {
    const off = window.api.onLockRequest(() => {
      void useVault.getState().lock()
    })
    return off
  }, [])

  // 托盘菜单「退出 钥匙窝」：先保存未落盘的改动，再退出
  useEffect(() => {
    const off = window.api.onQuitRequest(() => {
      void (async () => {
        const st = useVault.getState()
        if (!st.locked && st.dirty) await st.save(true)
        await window.api.quit()
      })()
    })
    return off
  }, [])

  // 浏览器扩展请求保存登录信息（注册/登录新网站时）
  useEffect(() => {
    const off = window.api.onSaveRequest((payload) => {
      const p = payload as {
        id: string
        url: string
        username: string
        password: string
        title?: string
      }
      void useVault
        .getState()
        .saveFromBrowser({
          url: p.url,
          username: p.username,
          password: p.password,
          title: p.title
        })
        .then((result) => window.api.sendSaveResult(p.id, result))
    })
    return off
  }, [])

  return (
    <>
      {locked ? <UnlockScreen /> : <MainLayout />}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm shadow-lg animate-pop-in">
          {toast}
        </div>
      )}
    </>
  )
}
