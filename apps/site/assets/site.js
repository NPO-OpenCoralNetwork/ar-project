/*
 * サイトの試作（見本）の動き
 * - テーマ（自動・明るい・暗い）の切り替え
 * - スクロールで昼 → 夕 → 夜と時間が進む（背景の Canvas に伝える）。時間帯は3つの切り替え（06 §6.9）。
 *   夜に入ったら、テーマに関係なく html に data-scene="night" を付け、文字と板の色も夜にする。
 *   暗いテーマでは、はじめから夜。
 * - 絵巻（遊び方）の送りボタン、約束の立て札の開け閉め
 * - 見本の切り替え（ゲームの名前の候補、見出しの案、時間）
 * - 「入る」の見本（霞が満ちて、ダイアログ）
 */
(() => {
  'use strict'
  const root = document.documentElement
  const store = {
    get(k) { try { return window.localStorage.getItem(`yumeutsutsu-site:${k}`) } catch { return null } },
    set(k, v) { try { window.localStorage.setItem(`yumeutsutsu-site:${k}`, v) } catch { /* 保存できなくても動く */ } },
  }
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)')
  const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && darkMQ.matches)

  // ---------- テーマ ----------
  const THEMES = ['auto', 'light', 'dark']
  const THEME_LABEL = { auto: '端末の設定に合わせる', light: '明るいテーマ', dark: '暗いテーマ' }
  const themeBtn = document.getElementById('theme-btn')
  function applyTheme(mode) {
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode
    else delete root.dataset.theme
    if (themeBtn) {
      themeBtn.dataset.mode = mode
      themeBtn.setAttribute('aria-label', `テーマ: ${THEME_LABEL[mode]}（押すと切り替え）`)
      themeBtn.title = THEME_LABEL[mode]
      themeBtn.querySelectorAll('[data-icon]').forEach((el) => { el.style.display = el.dataset.icon === mode ? '' : 'none' })
    }
    updateTime(true)
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = themeBtn.dataset.mode || 'auto'
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]
      store.set('theme', next)
      applyTheme(next)
    })
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', () => updateTime(true))

  // ---------- 時間（スクロール） ----------
  let timeOverride = null
  const anchors = () => Array.from(document.querySelectorAll('[data-time]'))
  const rail = document.querySelector('.time-rail')
  function scrollTime() {
    const list = anchors()
    if (!list.length) return 0
    const c = window.scrollY + window.innerHeight * 0.5
    const pts = list.map((el) => {
      const r = el.getBoundingClientRect()
      return { y: r.top + window.scrollY + Math.min(r.height, window.innerHeight) * 0.5, t: parseFloat(el.dataset.time) }
    })
    if (c <= pts[0].y) return pts[0].t
    for (let i = 0; i < pts.length - 1; i++) {
      if (c <= pts[i + 1].y) {
        const f = (c - pts[i].y) / Math.max(1, pts[i + 1].y - pts[i].y)
        return pts[i].t + (pts[i + 1].t - pts[i].t) * f
      }
    }
    return pts[pts.length - 1].t
  }
  // 時間帯の境目: 妖怪の区画までが昼、土地の区画が夕、約束の区画に入ったら夜
  const snap = (t) => (t < 0.85 ? 0 : t < 1.2 ? 1 : 2)
  const SCENES = ['day', 'dusk', 'night']
  let lastShown = null
  function updateTime(immediate) {
    let shown
    if (timeOverride != null) shown = timeOverride
    else if (isDark()) shown = 2
    else shown = snap(scrollTime())
    if (shown === lastShown && !immediate) return
    lastShown = shown
    root.dataset.scene = SCENES[shown]
    if (window.Kasumi) window.Kasumi.setTime(shown, immediate)
    if (rail) rail.style.setProperty('--tp', (shown / 2).toFixed(3))
  }

  // ---------- ヘッダーと「入る」の札 ----------
  const header = document.querySelector('.site-header')
  const tag = document.getElementById('land-tag')
  let ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      if (header) header.classList.toggle('scrolled', window.scrollY > 24)
      if (tag) tag.classList.toggle('hide', window.scrollY > window.innerHeight * 0.25)
      updateTime(false)
      updateSubnav()
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)

  // ---------- パートナー向けの小さな目次 ----------
  const subLinks = Array.from(document.querySelectorAll('.subnav a'))
  function updateSubnav() {
    if (!subLinks.length) return
    let on = subLinks[0]
    for (const a of subLinks) {
      const el = document.querySelector(a.getAttribute('href'))
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.35) on = a
    }
    subLinks.forEach((a) => a.classList.toggle('on', a === on))
  }

  // ---------- 見本の切り替え ----------
  const NAMES = {
    yumeutsutsu: { html: 'ゆめうつつ', text: 'ゆめうつつ' },
    enishi: { html: 'えにし旅帳', text: 'えにし旅帳' },
    tomoshibi: { html: '<ruby>灯<rp>（</rp><rt>ともしび</rt><rp>）</rp></ruby>の土地', text: '灯の土地' },
  }
  const HEADLINES = {
    1: ['家で物語を聞き、|現地で本人に会う。', '立山の麓に住む|妖怪たちの、|小さな悩みを|ほどく旅。'],
    2: ['妖怪の悩みを|聞きに、|土地へ。', '夢の旅で出会い、|現の旅で再会する。'],
    3: ['夢で見た顔に、|本当に会いに行く。', '家から箱庭を歩き、|行ける日は|現地を歩く。'],
  }
  function applyName(key) {
    const n = NAMES[key] || NAMES.yumeutsutsu
    document.querySelectorAll('[data-name]').forEach((el) => { el.innerHTML = n.html })
    document.querySelectorAll('[data-name-text]').forEach((el) => { el.textContent = n.text })
    pressed('name', key)
  }
  function applyHeadline(key) {
    const h = HEADLINES[key] || HEADLINES[1]
    // 「|」の位置でだけ折り返す（日本語の行の途中で切れないように）
    const seg = (s) => s.split('|').map((x) => x.replace(/[&<>]/g, '')).join('<wbr>')
    document.querySelectorAll('[data-headline]').forEach((el) => { el.innerHTML = seg(h[0]) })
    document.querySelectorAll('[data-sub]').forEach((el) => { el.innerHTML = seg(h[1]) })
    pressed('headline', String(key))
  }
  function pressed(group, value) {
    document.querySelectorAll(`[data-set="${group}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)))
  }
  document.querySelectorAll('[data-set]').forEach((b) => {
    b.addEventListener('click', () => {
      const g = b.dataset.set
      const v = b.dataset.value
      if (g === 'name') { applyName(v); store.set('name', v) }
      if (g === 'headline') { applyHeadline(v); store.set('headline', v) }
      if (g === 'time') {
        timeOverride = v === 'auto' ? null : Number(v)
        pressed('time', v)
        updateTime(false)
      }
    })
  })
  const dockBtn = document.getElementById('sample-toggle')
  const dockPanel = document.getElementById('sample-panel')
  if (dockBtn && dockPanel) {
    dockBtn.addEventListener('click', () => {
      const open = dockPanel.hidden
      dockPanel.hidden = !open
      dockBtn.setAttribute('aria-expanded', String(open))
    })
  }

  // ---------- 遊び方の絵巻（横に送る） ----------
  const emaki = document.getElementById('emaki')
  const emakiBtns = Array.from(document.querySelectorAll('[data-emaki]'))
  function emakiState() {
    if (!emaki) return
    const max = emaki.scrollWidth - emaki.clientWidth - 4
    emakiBtns.forEach((b) => { b.disabled = Number(b.dataset.emaki) < 0 ? emaki.scrollLeft <= 4 : emaki.scrollLeft >= max })
  }
  if (emaki) {
    emakiBtns.forEach((b) => b.addEventListener('click', () => {
      const leaf = emaki.querySelector('.emaki-leaf')
      const step = leaf ? leaf.getBoundingClientRect().width + 32 : emaki.clientWidth
      emaki.scrollBy({ left: step * Number(b.dataset.emaki), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }))
    emaki.addEventListener('scroll', () => requestAnimationFrame(emakiState), { passive: true })
    emaki.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const b = emakiBtns.find((x) => Number(x.dataset.emaki) === (e.key === 'ArrowRight' ? 1 : -1)); if (b && !b.disabled) b.click() }
    })
    window.addEventListener('resize', emakiState)
    emakiState()
  }

  // ---------- 約束の立て札（押すと、その札のくわしい中身を出す） ----------
  const posts = Array.from(document.querySelectorAll('.fuda-post'))
  posts.forEach((btn) => btn.addEventListener('click', () => {
    posts.forEach((b) => {
      const on = b === btn
      b.setAttribute('aria-expanded', String(on))
      const pane = document.getElementById(b.getAttribute('aria-controls'))
      if (pane) pane.hidden = !on
    })
  }))

  // ---------- 「入る」の見本 ----------
  const dialog = document.getElementById('enter-dialog')
  function enter(e) {
    if (e) e.preventDefault()
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    const show = () => {
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal()
      else if (dialog) dialog.setAttribute('open', '')
    }
    document.body.classList.add('entering')
    const go = () => (window.Kasumi ? window.Kasumi.dive(show) : show())
    if (window.scrollY > 10) setTimeout(go, 500)
    else go()
  }
  document.querySelectorAll('[data-enter]').forEach((el) => el.addEventListener('click', enter))
  if (dialog) {
    dialog.addEventListener('close', () => {
      document.body.classList.remove('entering')
      if (window.Kasumi) window.Kasumi.undive()
    })
    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()))
  }

  // ---------- 初期化 ----------
  applyName(store.get('name') || 'yumeutsutsu')
  applyHeadline(store.get('headline') || '1')
  pressed('time', 'auto')
  const params = new URLSearchParams(window.location.search)
  const qTheme = params.get('theme')
  applyTheme(qTheme && THEMES.includes(qTheme) ? qTheme : store.get('theme') || 'auto')
  if (params.get('time') != null) { timeOverride = Number(params.get('time')); pressed('time', params.get('time')) }
  onScroll()
  updateTime(true)
})()
