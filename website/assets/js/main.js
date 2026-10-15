/* ============================================================
   钥匙窝 官网交互
   原生 JavaScript · 无依赖
   ============================================================ */
(function () {
  'use strict'

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ---------------------------------------------------------
     1. 首屏粒子网络背景
     --------------------------------------------------------- */
  function initHeroCanvas() {
    var canvas = document.getElementById('heroCanvas')
    if (!canvas) return
    var ctx = canvas.getContext('2d')
    if (!ctx) return

    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    var w = 0
    var h = 0
    var dots = []
    var raf = null
    var running = true

    function build() {
      var rect = canvas.parentElement.getBoundingClientRect()
      w = Math.max(320, Math.round(rect.width))
      h = Math.max(320, Math.round(rect.height))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      var count = Math.round(Math.min(84, Math.max(26, (w * h) / 22000)))
      dots = []
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: 0.9 + Math.random() * 1.5
        })
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h)

      // 连线
      for (var i = 0; i < dots.length; i++) {
        for (var j = i + 1; j < dots.length; j++) {
          var dx = dots[i].x - dots[j].x
          var dy = dots[i].y - dots[j].y
          var d2 = dx * dx + dy * dy
          if (d2 < 20000) {
            var a = (1 - d2 / 20000) * 0.32
            ctx.strokeStyle = 'rgba(96, 165, 250, ' + a.toFixed(3) + ')'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(dots[i].x, dots[i].y)
            ctx.lineTo(dots[j].x, dots[j].y)
            ctx.stroke()
          }
        }
      }

      // 粒子
      for (var k = 0; k < dots.length; k++) {
        var p = dots[k]
        p.x += p.vx
        p.y += p.vy
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20
        ctx.fillStyle = 'rgba(125, 211, 252, 0.65)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function loop() {
      if (!running) return
      draw()
      raf = window.requestAnimationFrame(loop)
    }

    function start() {
      if (reduceMotion) {
        draw()
        return
      }
      if (raf) window.cancelAnimationFrame(raf)
      running = true
      loop()
    }

    function stop() {
      running = false
      if (raf) window.cancelAnimationFrame(raf)
      raf = null
    }

    build()
    start()

    var resizeTimer = null
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(function () {
        build()
        if (reduceMotion) draw()
      }, 180)
    })

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop()
      else start()
    })
  }

  /* ---------------------------------------------------------
     2. 导航栏滚动态 + 移动端菜单
     --------------------------------------------------------- */
  function initNav() {
    var nav = document.getElementById('nav')
    var burger = document.getElementById('navBurger')
    var links = document.getElementById('navLinks')

    function onScroll() {
      if (!nav) return
      if (window.scrollY > 12) nav.classList.add('scrolled')
      else nav.classList.remove('scrolled')
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    if (burger && links) {
      burger.addEventListener('click', function () {
        var open = links.classList.toggle('open')
        burger.setAttribute('aria-expanded', open ? 'true' : 'false')
      })
      links.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          links.classList.remove('open')
          burger.setAttribute('aria-expanded', 'false')
        }
      })
    }
  }

  /* ---------------------------------------------------------
     3. 滚动出现动画
     --------------------------------------------------------- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'))
    if (!items.length) return

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in') })
      return
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return
          var el = entry.target
          var delay = Math.min(i * 70, 280)
          window.setTimeout(function () { el.classList.add('in') }, delay)
          io.unobserve(el)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
    )
    items.forEach(function (el) { io.observe(el) })
  }

  /* ---------------------------------------------------------
     4. 数字滚动
     --------------------------------------------------------- */
  function initCounters() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-count]'))
    if (!nodes.length) return

    function run(el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0
      var suffix = el.getAttribute('data-suffix') || ''
      if (reduceMotion) {
        el.textContent = target + suffix
        return
      }
      var start = null
      var dur = 1100
      function tick(ts) {
        if (start === null) start = ts
        var p = Math.min(1, (ts - start) / dur)
        var eased = 1 - Math.pow(1 - p, 3)
        el.textContent = Math.round(target * eased) + suffix
        if (p < 1) window.requestAnimationFrame(tick)
      }
      window.requestAnimationFrame(tick)
    }

    if (!('IntersectionObserver' in window)) {
      nodes.forEach(run)
      return
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return
        run(entry.target)
        io.unobserve(entry.target)
      })
    }, { threshold: 0.4 })
    nodes.forEach(function (el) { io.observe(el) })
  }

  /* ---------------------------------------------------------
     5. 卡片跟随鼠标的高光
     --------------------------------------------------------- */
  function initCardGlow() {
    if (reduceMotion) return
    if (window.matchMedia('(hover: none)').matches) return
    Array.prototype.slice.call(document.querySelectorAll('.card')).forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect()
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%')
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%')
      })
    })
  }

  /* ---------------------------------------------------------
     6. FAQ：一次只展开一个
     --------------------------------------------------------- */
  function initFaq() {
    var all = Array.prototype.slice.call(document.querySelectorAll('.faq details'))
    all.forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) return
        all.forEach(function (other) { if (other !== item) other.open = false })
      })
    })
  }

  function boot() {
    initHeroCanvas()
    initNav()
    initReveal()
    initCounters()
    initCardGlow()
    initFaq()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
