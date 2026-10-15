import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

/**
 * 科技感动画背景：粒子网络 + 流动光晕，跟随明暗主题。
 * 纯 canvas 实现，避免引入额外依赖。
 */
export default function TechBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let width = 0
    let height = 0
    let dpr = 1
    let nodes: Node[] = []
    let last = 0

    const isDark = (): boolean => document.documentElement.classList.contains('dark')

    function resize(): void {
      const parent = canvas!.parentElement
      if (!parent) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = parent.clientWidth
      height = parent.clientHeight
      canvas!.width = Math.max(1, Math.floor(width * dpr))
      canvas!.height = Math.max(1, Math.floor(height * dpr))
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      const target = Math.min(90, Math.max(30, Math.floor((width * height) / 18000)))
      nodes = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.8
      }))
    }

    function frame(t: number): void {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(32, last ? t - last : 16)
      last = t
      const dark = isDark()

      ctx!.clearRect(0, 0, width, height)

      const LINK_DIST = 150
      const nodeColor = dark ? 'rgba(96,165,250,' : 'rgba(59,130,246,'
      const lineBase = dark ? 'rgba(99,102,241,' : 'rgba(99,102,241,'

      for (const n of nodes) {
        n.x += n.vx * (dt / 16)
        n.y += n.vy * (dt / 16)
        if (n.x < -20) n.x = width + 20
        else if (n.x > width + 20) n.x = -20
        if (n.y < -20) n.y = height + 20
        else if (n.y > height + 20) n.y = -20
      }

      // 连线
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 > LINK_DIST * LINK_DIST) continue
          const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * (dark ? 0.32 : 0.22)
          ctx!.strokeStyle = lineBase + alpha.toFixed(3) + ')'
          ctx!.lineWidth = 1
          ctx!.beginPath()
          ctx!.moveTo(a.x, a.y)
          ctx!.lineTo(b.x, b.y)
          ctx!.stroke()
        }
      }

      // 节点
      for (const n of nodes) {
        ctx!.fillStyle = nodeColor + (dark ? '0.85)' : '0.5)')
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx!.fill()
      }
    }

    resize()
    raf = requestAnimationFrame(frame)

    const onResize = (): void => resize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* 流动光晕 */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-400/30 dark:bg-blue-600/20 blur-3xl animate-float-slow" />
      <div className="absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full bg-indigo-400/25 dark:bg-indigo-600/20 blur-3xl animate-float-slower" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 rounded-full bg-cyan-300/20 dark:bg-cyan-500/15 blur-3xl animate-float-slow" />
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* 网格叠加，增强科技感 */}
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.25]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />
    </div>
  )
}
