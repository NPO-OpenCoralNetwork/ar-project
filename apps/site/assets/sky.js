/*
 * 光と霞の背景（Canvas 2D）
 * - 空・太陽の光の輪・朱い月・星
 * - 立山連峰の切り絵の書き割り（遠景の稜線は apps/yokai-game/src/data/tateyama-skyline.json の
 *   距離帯ごとの稜線。地理院タイル（標高）を加工して作成）
 * - 雲海、漂う霞、田と土の道、道しるべの行灯、麓の家並み、お休みの範囲の霧、光の粒、ましろ
 * 時間は t（0=昼、1=夕、2=夜）で、色は docs/yokai-game/06-art-direction.md §2 のパレットから取る。
 * 時間帯は3つの切り替え（06 §6.9）。site.js が 0／1／2 に揃えた値を渡し、ここでは切り替えの間（約1.2秒）だけ重ねて変える。
 * 色の混ぜ方は OKLab（sRGB のまま混ぜると、夕と夜の中間が灰色に濁るため）。
 * 動きを減らす設定（prefers-reduced-motion）のときは、動きを止めて、時間は3つの切り替えだけにする。
 */
(() => {
  'use strict'

  // 距離帯ごとの稜線の仰角（度）。方位 60°〜140° を 1° 刻み。[近い 2–8km, 中 8–20km, 遠い 20–45km]
  const RIDGE_RAW = [
    [1.81,1.91,2.21,2.38,2.56,2.9,3.07,3.07,2.93,2.93,3.09,3.0,3.25,3.42,3.25,3.41,3.45,3.67,3.77,3.96,3.92,3.86,3.69,3.59,3.57,3.65,3.71,3.79,3.81,3.85,3.83,3.83,3.85,3.66,3.68,3.66,4.0,4.24,4.17,4.38,4.46,4.46,4.28,4.11,4.04,4.08,4.11,4.09,4.21,4.48,4.36,3.96,4.05,4.12,4.12,4.06,4.01,4.11,3.95,4.22,3.91,4.22,4.34,4.01,4.07,4.3,4.2,4.41,4.34,4.29,5.03,4.51,4.16,3.98,4.2,4.43,4.53,4.44,4.18,4.16,3.83],
    [3.13,3.45,3.57,3.3,3.14,3.27,3.39,3.03,3.13,3.23,3.58,3.9,3.69,3.73,3.77,3.85,3.92,4.06,4.11,4.17,4.02,3.89,3.81,4.18,4.35,4.14,4.24,4.14,4.49,5.01,5.44,5.43,5.2,5.31,5.04,4.84,4.83,4.68,4.87,4.52,4.19,4.23,4.19,4.26,4.23,4.19,4.13,3.84,3.32,3.29,3.74,4.19,4.36,4.87,5.4,5.73,5.99,6.5,6.11,6.03,5.76,5.49,5.36,5.39,5.54,5.47,5.32,4.95,4.92,5.15,5.37,5.37,5.63,5.78,5.89,6.05,6.27,6.09,5.95,5.78,5.55],
    [3.11,3.22,3.34,3.69,4.21,4.18,4.38,4.65,4.48,4.7,4.61,4.59,4.62,4.22,3.88,3.36,3.5,4.05,4.13,4.15,4.37,4.03,4.61,4.7,5,5.24,5.73,5.53,5.29,5.03,5.45,5.72,6.04,5.93,5.83,5.46,5.41,5.7,5.75,5.59,5.63,5.24,5.11,5.24,4.99,4.74,5.12,5.25,5.21,5.28,4.86,4.78,4.96,5.15,4.82,4.56,4.42,4.37,4.58,4.67,5.06,5.29,5.42,5.76,5.9,6.01,5.86,5.96,5.85,5.56,5.42,5.05,4.83,4.78,4.77,4.86,4.81,4.93,5.0,5.07,5.01],
  ]
  const AZ0 = 60
  const AZ1 = 140
  const smooth = (a) => a.map((v, i) => (a[Math.max(0, i - 1)] + 2 * v + a[Math.min(a.length - 1, i + 1)]) / 4)
  // 角の丸い単純な形にするため、2回ならす（06 §4）
  const RIDGE = RIDGE_RAW.map((b) => smooth(smooth(b)))
  const ridgeAt = (band, az) => {
    const f = Math.min(AZ1, Math.max(AZ0, az)) - AZ0
    const i = Math.min(band.length - 2, Math.floor(f))
    const t = f - i
    const s = (1 - Math.cos(Math.PI * t)) / 2
    return band[i] + (band[i + 1] - band[i]) * s
  }
  // いちばん高い所の方位（朱い月の位置。06 §3.11）
  let peakAz = AZ0
  let peakEl = -1
  for (const band of RIDGE) band.forEach((v, i) => { if (v > peakEl) { peakEl = v; peakAz = AZ0 + i } })

  // ---------- パレット（06 §2） ----------
  const PAL = {
    day: {
      skyTop: '#86bfd6', skyMid: '#cfe2d4', skyHor: '#f4e2b8',
      glow: '#ffe6a0', glowA: 0.5, sun: '#fff6dc', sunA: 1,
      far: '#b9cbd6', farLine: '#9fb9ca', mid: '#a7c2c0', midLine: '#8fb0ad', near: '#9cb894', nearLine: '#84a67e',
      snow: '#fbf6ea', rimLight: '#ffe7a0', rimA: 0,
      fog: '#f6dfa6', fogA: 0.42, cloud: '#efe2bd', cloudRim: '#fffaf0', cloudShade: '#c9d0cc',
      field1: '#d6c47f', field2: '#cdbb74', fieldLine: '#b9a862', grass: '#9cba78', grassFar: '#a9c27e',
      path: '#dcae74', pathEdge: '#c99860', wall: '#e4d4bc', roof: '#6a7392', cedar: '#5b8a68', broad: '#8fb26a',
      mist: '#fbf2da', restGlow: '#fff4dc', restA: 0.08,
      p1: '#ffe7a8', p2: '#fff8e6', pA: 0.55,
      lamp: 0, win: 0, stars: 0, moon: 0, moonPale: 0,
      lampBox: '#efe4cc', post: '#8a6a50', haloMashiro: 0.18,
    },
    dusk: {
      skyTop: '#3b3d78', skyMid: '#9a86b0', skyHor: '#eaa6a2',
      glow: '#ffb08a', glowA: 0.55, sun: '#ffd0a0', sunA: 0.85,
      far: '#8e84aa', farLine: '#d99c9c', mid: '#7a7598', midLine: '#8f84a6', near: '#626686', nearLine: '#6c6e8e',
      snow: '#f4c2b8', rimLight: '#ffb48a', rimA: 0.35,
      fog: '#a99ab4', fogA: 0.5, cloud: '#a99ab4', cloudRim: '#f4c0a2', cloudShade: '#7e6f92',
      field1: '#d8ae8c', field2: '#cfa486', fieldLine: '#b78c74', grass: '#a09a8c', grassFar: '#8f9488',
      path: '#d49c86', pathEdge: '#b98270', wall: '#e6c4b6', roof: '#585a80', cedar: '#566878', broad: '#7a8a7a',
      mist: '#c9b8cf', restGlow: '#f6c0a8', restA: 0.15,
      p1: '#ffc79a', p2: '#f7a8b8', pA: 0.6,
      lamp: 0.5, win: 0.15, stars: 0.12, moon: 0, moonPale: 0.6,
      lampBox: '#f2d7b0', post: '#5a4048', haloMashiro: 0.3,
    },
    night: {
      skyTop: '#070b1d', skyMid: '#0f1633', skyHor: '#1d2548',
      glow: '#4a2230', glowA: 0, sun: '#ffd0a0', sunA: 0,
      far: '#1c2244', farLine: '#2e2a4c', mid: '#161c38', midLine: '#22243e', near: '#10162c', nearLine: '#181c32',
      snow: '#3c4466', rimLight: '#8a4a58', rimA: 0.9,
      fog: '#161d3a', fogA: 0.55, cloud: '#161d3a', cloudRim: '#4a3a5c', cloudShade: '#0e1428',
      field1: '#34416a', field2: '#303c64', fieldLine: '#2a355a', grass: '#2f4d5e', grassFar: '#2a4250',
      path: '#66708e', pathEdge: '#56607e', wall: '#4a5272', roof: '#1e2340', cedar: '#1e3242', broad: '#2a3e4a',
      mist: '#4a3c5e', restGlow: '#e89a52', restA: 0.35,
      p1: '#cfe6ff', p2: '#ffb866', pA: 0.8,
      lamp: 1, win: 0.3, stars: 1, moon: 1, moonPale: 0,
      lampBox: '#ffd89a', post: '#2a2430', haloMashiro: 0.5,
    },
  }
  const parseHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const PARSED = {}
  for (const k of Object.keys(PAL)) {
    PARSED[k] = {}
    for (const [key, v] of Object.entries(PAL[k])) PARSED[k][key] = typeof v === 'string' ? parseHex(v) : v
  }
  const lerp = (a, b, t) => a + (b - a) * t
  // sRGB(0-255) ⇄ OKLab
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const fromLin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055)
  function toOklab([r8, g8, b8]) {
    const r = toLin(r8); const g = toLin(g8); const b = toLin(b8)
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
  }
  function fromOklab([L, A, B]) {
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
    const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
    const c = (v) => Math.min(255, Math.max(0, fromLin(v)))
    return [c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]
  }
  const mixLab = (a, b, t) => { if (t <= 0) return a; if (t >= 1) return b; const x = toOklab(a); const y = toOklab(b); return fromOklab([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]) }
  const mixVal = (a, b, t) => (Array.isArray(a) ? mixLab(a, b, t) : lerp(a, b, t))
  function palAt(t) {
    const a = t <= 1 ? PARSED.day : PARSED.dusk
    const b = t <= 1 ? PARSED.dusk : PARSED.night
    const f = t <= 1 ? t : t - 1
    const out = {}
    for (const key of Object.keys(a)) out[key] = mixVal(a[key], b[key], f)
    return out
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
  const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
  const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

  // 決まった乱数（毎回同じ絵になるように）
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const noise1 = (x) => {
    // なめらかな1次元の値ノイズ
    const i = Math.floor(x)
    const f = x - i
    const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
    const u = f * f * (3 - 2 * f)
    return lerp(h(i), h(i + 1), u)
  }

  // ---------- 状態 ----------
  const canvas = document.getElementById('kasumi')
  if (!canvas) return
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) { document.documentElement.classList.add('no-canvas'); return }
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduce = reduceMQ.matches
  let W = 0
  let H = 0
  let dpr = 1
  let tNow = 0
  let tTarget = 0
  let dive = 0
  let diveTarget = 0
  let diveDone = null
  let mx = 0
  let my = 0
  let mxT = 0
  let myT = 0
  let clock = 0
  let last = 0
  let running = false
  let L = null // レイアウト
  let quality = 1 // 重い端末では解像度を下げる
  let frames = 0
  let frameSum = 0

  const STARS = Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd() * 0.5, r: 0.4 + rnd() * 1.0, ph: rnd() * 6.28 }))
  const PARTS = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd(), r: 1 + rnd() * 1.6, sp: 0.006 + rnd() * 0.012, ph: rnd() * 6.28, k: rnd(), f: 0.2 + rnd() * 0.5 }))
  const MISTS = Array.from({ length: 6 }, (_, i) => ({ x: rnd(), y: 0.55 + rnd() * 0.12, w: 0.25 + rnd() * 0.25, sp: 0.004 + rnd() * 0.006, a: 0.25 + rnd() * 0.25, i }))
  const HOUSES = Array.from({ length: 9 }, () => ({ dx: (rnd() - 0.5) * 2, dy: rnd(), w: 0.7 + rnd() * 0.6, h: 0.6 + rnd() * 0.3, lit: rnd() }))
  const TREES = Array.from({ length: 16 }, () => ({ dx: (rnd() - 0.5) * 2, dy: rnd(), s: 0.7 + rnd() * 0.6, k: rnd() < 0.65 ? 'cedar' : 'broad' }))
  const LAMPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88]

  function layout() {
    const portrait = W / H < 0.9
    const hw = Math.min(40, Math.max(19, 23 * (W / H)))
    const azC = Math.min(AZ1 - hw, Math.max(AZ0 + hw, portrait ? 108 : 104))
    const cloudTop = H * (portrait ? 0.665 : 0.6)
    const base = cloudTop + H * 0.05
    const k = H * (portrait ? 0.036 : 0.05)
    const groundTop = cloudTop + H * 0.045
    const vx = W * (portrait ? 0.6 : 0.66)
    const vy = groundTop + H * 0.035
    const u = Math.min(W, H) / 100
    L = { portrait, hw, azC, cloudTop, base, k, groundTop, vx, vy, u }
    const tag = document.getElementById('land-tag')
    if (tag) {
      tag.style.setProperty('--vx', `${vx}px`)
      tag.style.setProperty('--vy', `${vy - u * 7}px`)
    }
  }
  const azToX = (az) => ((az - L.azC) / (2 * L.hw) + 0.5) * W
  const elToY = (el) => L.base - (el - 1.4) * L.k

  function resize() {
    const r = canvas.getBoundingClientRect()
    W = Math.max(1, Math.round(r.width))
    H = Math.max(1, Math.round(r.height))
    dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 1) * quality
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    layout()
    draw()
  }

  // 奥行きごとの拡大（「入る」の動き）
  function depthBegin(depth) {
    const z = easeInOut(dive)
    const s = 1 + z * depth
    ctx.save()
    ctx.translate(L.vx, L.vy)
    ctx.scale(s, s)
    ctx.translate(-L.vx, -L.vy)
  }

  function drawSky(p) {
    const g = ctx.createLinearGradient(0, 0, 0, L.cloudTop)
    g.addColorStop(0, rgba(p.skyTop))
    g.addColorStop(0.55, rgba(p.skyMid))
    g.addColorStop(1, rgba(p.skyHor))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // 星（夜）
    if (p.stars > 0.01) {
      for (const s of STARS) {
        const tw = reduce ? 0.8 : 0.65 + 0.35 * Math.sin(clock * 0.9 + s.ph)
        ctx.fillStyle = `rgba(223,230,255,${(p.stars * tw * 0.8).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(s.x * W, s.y * L.cloudTop, s.r, 0, 6.283)
        ctx.fill()
      }
    }

    // 太陽の光の輪（昼・夕）
    if (p.glowA > 0.01) {
      const sx = W * (L.portrait ? 0.86 : 0.84)
      const sy = lerp(H * 0.1, L.cloudTop * 0.86, Math.min(1, tNow))
      const R = Math.min(W, H) * lerp(0.42, 0.55, Math.min(1, tNow))
      const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R)
      gg.addColorStop(0, rgba(p.glow, p.glowA))
      gg.addColorStop(0.4, rgba(p.glow, p.glowA * 0.45))
      gg.addColorStop(1, rgba(p.glow, 0))
      ctx.fillStyle = gg
      ctx.fillRect(Math.max(0, sx - R), Math.max(0, sy - R), R * 2, R * 2)
      if (p.sunA > 0.01) {
        const r = Math.min(W, H) * 0.035
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.2)
        sg.addColorStop(0, rgba(p.sun, p.sunA * 0.95))
        sg.addColorStop(0.45, rgba(p.sun, p.sunA * 0.7))
        sg.addColorStop(1, rgba(p.sun, 0))
        ctx.fillStyle = sg
        ctx.beginPath()
        ctx.arc(sx, sy, r * 2.2, 0, 6.283)
        ctx.fill()
      }
    }

    // 朱い月（夜）／白っぽい月（夕）
    const mxPos = L.portrait ? W * 0.84 : azToX(peakAz + 4)
    // 縦長の画面では、文字に重ならないよう右上に小さく置く
    const r = Math.min(W, H) * (L.portrait ? 0.05 : 0.065)
    const myPos = L.portrait ? Math.max(H * 0.115, 64 + r) : elToY(ridgeAt(RIDGE[1], peakAz + 4)) - r * 1.8 - L.k * 0.6
    if (p.moonPale > 0.01) {
      ctx.fillStyle = `rgba(244,214,204,${(p.moonPale * 0.55).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(mxPos, myPos, r * 0.9, 0, 6.283)
      ctx.fill()
    }
    if (p.moon > 0.01) {
      const a = p.moon
      const outer = ctx.createRadialGradient(mxPos, myPos, r, mxPos, myPos, r * 3.2)
      outer.addColorStop(0, `rgba(58,26,38,${0.35 * a})`)
      outer.addColorStop(1, 'rgba(58,26,38,0)')
      ctx.fillStyle = outer
      ctx.fillRect(mxPos - r * 3.3, myPos - r * 3.3, r * 6.6, r * 6.6)
      const inner = ctx.createRadialGradient(mxPos, myPos, r * 0.9, mxPos, myPos, r * 1.6)
      inner.addColorStop(0, `rgba(122,46,54,${0.55 * a})`)
      inner.addColorStop(1, 'rgba(122,46,54,0)')
      ctx.fillStyle = inner
      ctx.beginPath()
      ctx.arc(mxPos, myPos, r * 1.6, 0, 6.283)
      ctx.fill()
      const body = ctx.createRadialGradient(mxPos - r * 0.25, myPos - r * 0.25, r * 0.1, mxPos, myPos, r)
      body.addColorStop(0, `rgba(205,108,98,${a})`)
      body.addColorStop(0.82, `rgba(196,97,90,${a})`)
      body.addColorStop(1, `rgba(227,144,126,${a})`)
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(mxPos, myPos, r, 0, 6.283)
      ctx.fill()
      // まだら
      ctx.fillStyle = `rgba(142,63,66,${0.28 * a})`
      for (const [ox, oy, rr] of [[-0.3, -0.15, 0.28], [0.25, 0.2, 0.22], [0.05, -0.4, 0.16], [-0.1, 0.4, 0.14]]) {
        ctx.beginPath()
        ctx.arc(mxPos + ox * r, myPos + oy * r, rr * r, 0, 6.283)
        ctx.fill()
      }
    }
  }

  function ridgePath(band, lift) {
    const step = Math.max(3, W / 260)
    ctx.beginPath()
    ctx.moveTo(-10, H)
    for (let x = -10; x <= W + 10; x += step) {
      const az = L.azC + ((x / W) - 0.5) * 2 * L.hw
      ctx.lineTo(x, elToY(ridgeAt(band, az)) - lift)
    }
    ctx.lineTo(W + 10, H)
    ctx.closePath()
  }

  function drawMountains(p) {
    const layers = [
      { band: RIDGE[2], face: p.far, line: p.farLine, lift: L.k * 0.75, par: 0.15, snowAt: 5.55, depth: 0.12 },
      { band: RIDGE[1], face: p.mid, line: p.midLine, lift: L.k * 0.2, par: 0.3, snowAt: 5.75, depth: 0.2 },
      { band: RIDGE[0], face: p.near, line: p.nearLine, lift: -L.k * 0.15, par: 0.55, snowAt: 99, depth: 0.32 },
    ]
    for (const ly of layers) {
      depthBegin(ly.depth)
      ctx.translate(mx * ly.par * 14, my * ly.par * 4)
      ridgePath(ly.band, ly.lift)
      const g = ctx.createLinearGradient(0, L.base - L.k * 5.5, 0, L.cloudTop + H * 0.03)
      g.addColorStop(0, rgba(ly.face))
      g.addColorStop(1, rgba(mixC(ly.face, p.fog, 0.3)))
      ctx.fillStyle = g
      ctx.fill()
      // 雪（面の色の違いだけ）
      if (ly.snowAt < 99) {
        ctx.save()
        ctx.clip()
        ctx.beginPath()
        const step = Math.max(3, W / 260)
        const pts = []
        for (let x = -10; x <= W + 10; x += step) {
          const az = L.azC + ((x / W) - 0.5) * 2 * L.hw
          const el = ridgeAt(ly.band, az)
          const y = elToY(el) - ly.lift
          const d = Math.min(L.k * 0.6, Math.max(0, el - ly.snowAt) * L.k * 1.2)
          pts.push([x, y, d])
        }
        ctx.moveTo(pts[0][0], pts[0][1] - 1)
        for (const [x, y] of pts) ctx.lineTo(x, y - 1)
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + pts[i][2])
        ctx.closePath()
        ctx.fillStyle = rgba(ly.snow || p.snow, 0.85)
        ctx.fill()
        ctx.restore()
      }
      // 稜線は細い1本の線
      ridgePath(ly.band, ly.lift)
      ctx.strokeStyle = rgba(ly.line, 0.9)
      ctx.lineWidth = 1.2
      ctx.stroke()
      // 逆光のふち（夕・夜）
      if (p.rimA > 0.02 && ly.depth < 0.3) {
        ctx.strokeStyle = rgba(p.rimLight, p.rimA * 0.55)
        ctx.lineWidth = 1.6
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  function drawCloudSea(p) {
    depthBegin(0.45)
    // 空気遠近（地平の霞）
    const hg = ctx.createLinearGradient(0, L.cloudTop - H * 0.22, 0, L.cloudTop + H * 0.05)
    hg.addColorStop(0, rgba(p.fog, 0))
    hg.addColorStop(1, rgba(p.fog, p.fogA * 0.6))
    ctx.fillStyle = hg
    ctx.fillRect(-W, L.cloudTop - H * 0.22, W * 3, H * 0.27)

    const step = Math.max(4, W / 200)
    const edge = []
    for (let x = -20; x <= W + 20; x += step) {
      const n = noise1(x * 0.012 + clock * 0.05) * 0.6 + noise1(x * 0.004 - clock * 0.02) * 0.4
      edge.push([x, L.cloudTop + (n - 0.5) * H * 0.035])
    }
    ctx.beginPath()
    ctx.moveTo(-20, H)
    for (const [x, y] of edge) ctx.lineTo(x, y)
    ctx.lineTo(W + 20, H)
    ctx.closePath()
    const cg = ctx.createLinearGradient(0, L.cloudTop - H * 0.02, 0, L.groundTop + H * 0.03)
    cg.addColorStop(0, rgba(p.cloudRim))
    cg.addColorStop(0.18, rgba(p.cloud))
    cg.addColorStop(1, rgba(p.cloudShade))
    ctx.fillStyle = cg
    ctx.fill()

    // 漂う霞
    for (const m of MISTS) {
      const x = ((m.x + clock * m.sp) % 1.4) * W * 1.1 - W * 0.2
      const y = m.y * H
      const w = m.w * W
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(1, 0.16)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w)
      g.addColorStop(0, rgba(p.cloudRim, m.a * 0.7))
      g.addColorStop(1, rgba(p.cloudRim, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, w, 0, 6.283)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  // 土の道（下から家並みへ）
  function pathPoint(s) {
    const x0 = W * (L.portrait ? 0.38 : 0.46)
    const y0 = H + 10
    const cx = W * (L.portrait ? 0.92 : 0.86)
    const cy = H * 0.82
    const x1 = L.vx - L.u * 2
    const y1 = L.vy + L.u * 1.2
    const a = (1 - s) * (1 - s)
    const b = 2 * (1 - s) * s
    const c = s * s
    return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1]
  }
  const pathWidth = (s) => lerp(W * (L.portrait ? 0.13 : 0.075), L.u * 0.5, Math.pow(s, 0.6))

  function drawLand(p) {
    depthBegin(3.2)
    const gt = L.groundTop
    // 地面
    const gg = ctx.createLinearGradient(0, gt, 0, H)
    gg.addColorStop(0, rgba(mixC(p.grassFar, p.fog, 0.45)))
    gg.addColorStop(0.35, rgba(p.grass))
    gg.addColorStop(1, rgba(mixC(p.grass, p.field2, 0.35)))
    ctx.fillStyle = gg
    ctx.beginPath()
    ctx.moveTo(-20, H + 20)
    const step = Math.max(6, W / 120)
    for (let x = -20; x <= W + 20; x += step) {
      const y = gt + (noise1(x * 0.006 + 3) - 0.5) * H * 0.02
      ctx.lineTo(x, y)
    }
    ctx.lineTo(W + 20, H + 20)
    ctx.closePath()
    ctx.fill()

    // 田（遠いほど細い帯。消える点は家並み）
    const rows = 9
    for (let i = 0; i < rows; i++) {
      const y0 = gt + H * 0.012 + (H - gt) * Math.pow(i / rows, 1.9)
      const y1 = gt + H * 0.012 + (H - gt) * Math.pow((i + 1) / rows, 1.9)
      const gap = (y1 - y0) * 0.05
      const cols = 7
      for (let j = 0; j < cols; j++) {
        const xa = (fx, y) => L.vx + (fx * W * 1.6 - W * 0.8 + (L.vx - W * 0.5) * 0.0) * ((y - (gt - H * 0.02)) / (H - gt))
        const f0 = j / cols
        const f1 = (j + 1) / cols
        const pad = 0.0025
        ctx.beginPath()
        ctx.moveTo(xa(f0 + pad, y0 + gap), y0 + gap)
        ctx.lineTo(xa(f1 - pad, y0 + gap), y0 + gap)
        ctx.lineTo(xa(f1 - pad, y1 - gap), y1 - gap)
        ctx.lineTo(xa(f0 + pad, y1 - gap), y1 - gap)
        ctx.closePath()
        const fade = smoothstep(0, 0.5, (y0 - gt) / (H - gt))
        const base = mixC((i + j) % 2 ? p.field1 : p.field2, p.grass, 0.18 + 0.12 * ((i * 7 + j * 3) % 3) / 2)
        ctx.fillStyle = rgba(mixC(base, p.fog, 0.45 * (1 - fade)), 0.9)
        ctx.fill()
      }
    }

    // 家並み・木（消える点のまわり）
    const u = L.u
    const trees = TREES.map((t) => ({ ...t, x: L.vx + t.dx * u * 13, y: L.vy - u * 0.4 + t.dy * u * 1.6 }))
    const houses = HOUSES.map((h) => ({ ...h, x: L.vx + h.dx * u * 9, y: L.vy + h.dy * u * 1.8 }))
    const items = [...trees.map((t) => ({ y: t.y, t })), ...houses.map((h) => ({ y: h.y, h }))].sort((a, b) => a.y - b.y)

    // お休みの範囲の霧（家並みの奥、木立の中。社寺は描かない）
    {
      const rx = L.vx - u * 10
      const ry = L.vy - u * 1.2
      const R = u * 7
      ctx.save()
      ctx.translate(rx, ry)
      ctx.scale(1, 0.42)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R)
      const glow = mixC(p.mist, p.restGlow, Math.min(1, p.restA * 2.2))
      const pulse = reduce ? 1 : 0.88 + 0.12 * Math.sin(clock * 6.283 / 9)
      g.addColorStop(0, rgba(glow, 0.9 * pulse))
      g.addColorStop(0.55, rgba(p.mist, 0.55))
      g.addColorStop(1, rgba(p.mist, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, 6.283)
      ctx.fill()
      ctx.restore()
    }

    for (const it of items) {
      if (it.t) {
        const t = it.t
        const s = u * t.s * 0.95
        if (t.k === 'cedar') {
          ctx.fillStyle = rgba(mixC(p.cedar, p.fog, 0.25))
          for (let k = 0; k < 3; k++) {
            const w = s * (1.1 - k * 0.28)
            const yb = t.y - k * s * 0.9
            ctx.beginPath()
            ctx.moveTo(t.x - w, yb)
            ctx.quadraticCurveTo(t.x, yb - s * 2.2, t.x + w, yb)
            ctx.closePath()
            ctx.fill()
          }
        } else {
          ctx.fillStyle = rgba(mixC(p.broad, p.fog, 0.25))
          for (const [ox, oy, rr] of [[-0.6, -0.9, 0.9], [0.5, -1.0, 0.85], [0, -1.6, 0.9]]) {
            ctx.beginPath()
            ctx.arc(t.x + ox * s, t.y + oy * s, rr * s, 0, 6.283)
            ctx.fill()
          }
        }
      } else {
        const h = it.h
        const w = u * 2.2 * h.w
        const hh = u * 1.3 * h.h
        ctx.fillStyle = rgba(mixC(p.wall, p.fog, 0.15))
        ctx.fillRect(h.x - w / 2, h.y - hh, w, hh)
        // 窓の灯り（壁の発光で表す）
        if (p.win > 0.01 && h.lit < p.win * 2.4) {
          ctx.fillStyle = `rgba(242,184,102,${Math.min(1, p.win * 3)})`
          ctx.fillRect(h.x - w * 0.18, h.y - hh * 0.62, w * 0.36, hh * 0.32)
        }
        ctx.fillStyle = rgba(p.roof)
        ctx.beginPath()
        ctx.moveTo(h.x - w * 0.66, h.y - hh)
        ctx.lineTo(h.x - w * 0.36, h.y - hh - u * 0.95 * h.h)
        ctx.lineTo(h.x + w * 0.36, h.y - hh - u * 0.95 * h.h)
        ctx.lineTo(h.x + w * 0.66, h.y - hh)
        ctx.closePath()
        ctx.fill()
      }
    }

    // 土の道
    const N = 40
    const left = []
    const right = []
    for (let i = 0; i <= N; i++) {
      const s = i / N
      const [x, y] = pathPoint(s)
      const [x2, y2] = pathPoint(Math.min(1, s + 0.01))
      let nx = -(y2 - y)
      let ny = x2 - x
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      const w = pathWidth(s) / 2
      left.push([x + nx * w, y + ny * w])
      right.push([x - nx * w, y - ny * w])
    }
    ctx.beginPath()
    ctx.moveTo(left[0][0], left[0][1])
    for (const [x, y] of left) ctx.lineTo(x, y)
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1])
    ctx.closePath()
    const pg = ctx.createLinearGradient(0, L.vy, 0, H)
    pg.addColorStop(0, rgba(mixC(p.path, p.fog, 0.35)))
    pg.addColorStop(1, rgba(p.path))
    ctx.fillStyle = pg
    ctx.fill()
    ctx.strokeStyle = rgba(p.pathEdge, 0.6)
    ctx.lineWidth = 1
    ctx.stroke()

    // 道しるべの行灯（社寺の灯籠ではない。細い柱と紙の箱だけ。06 §3.9）
    LAMPS.forEach((s, i) => {
      const [x, y] = pathPoint(s)
      const side = i % 2 ? 1 : -1
      const [x2, y2] = pathPoint(Math.min(1, s + 0.01))
      let nx = -(y2 - y)
      let ny = x2 - x
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      const off = pathWidth(s) * 0.62 * side
      const lx = x + nx * off
      const ly = y + ny * off
      const sc = lerp(2.6, 0.35, Math.pow(s, 0.6)) * u
      if (p.lamp > 0.01) {
        const flick = reduce ? 1 : 0.97 + 0.03 * Math.sin(clock * 5 + i * 1.7)
        const R1 = sc * 7
        const g = ctx.createRadialGradient(lx, ly - sc * 1.6, 0, lx, ly - sc * 1.6, R1)
        g.addColorStop(0, `rgba(255,216,154,${0.55 * p.lamp * flick})`)
        g.addColorStop(0.35, `rgba(255,154,72,${0.22 * p.lamp * flick})`)
        g.addColorStop(0.7, `rgba(196,64,44,${0.08 * p.lamp})`)
        g.addColorStop(1, 'rgba(196,64,44,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(lx, ly - sc * 1.6, R1, 0, 6.283)
        ctx.fill()
        // 地面の明かり
        ctx.save()
        ctx.translate(lx, ly)
        ctx.scale(1, 0.3)
        const gg2 = ctx.createRadialGradient(0, 0, 0, 0, 0, sc * 4)
        gg2.addColorStop(0, `rgba(255,174,92,${0.3 * p.lamp})`)
        gg2.addColorStop(1, 'rgba(255,174,92,0)')
        ctx.fillStyle = gg2
        ctx.beginPath()
        ctx.arc(0, 0, sc * 4, 0, 6.283)
        ctx.fill()
        ctx.restore()
      }
      ctx.strokeStyle = rgba(p.post)
      ctx.lineWidth = Math.max(1, sc * 0.22)
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx, ly - sc * 1.25)
      ctx.stroke()
      ctx.fillStyle = rgba(p.lampBox)
      ctx.fillRect(lx - sc * 0.32, ly - sc * 1.95, sc * 0.64, sc * 0.8)
      ctx.fillStyle = rgba(p.post)
      ctx.beginPath()
      ctx.moveTo(lx - sc * 0.45, ly - sc * 1.92)
      ctx.quadraticCurveTo(lx, ly - sc * 2.35, lx + sc * 0.45, ly - sc * 1.92)
      ctx.closePath()
      ctx.fill()
    })

    // 手前の木立（左右の端で画面を縁どる）
    const fgTrees = L.portrait
      ? [[-0.04, 1.02, 2.4], [0.08, 1.04, 1.8], [1.02, 1.0, 2.2], [0.93, 1.05, 1.6]]
      : [[-0.03, 1.04, 2.1], [0.045, 1.07, 1.6], [1.01, 1.02, 2.2], [0.95, 1.06, 1.5]]
    const fgC = mixC(p.cedar, p.skyTop, 0.12)
    for (const [fx, fy, fs] of fgTrees) {
      const x = fx * W
      const y = fy * H
      const s = u * 9 * fs
      ctx.fillStyle = rgba(fgC)
      for (let k = 0; k < 4; k++) {
        const w = s * (0.62 - k * 0.12)
        const yb = y - k * s * 0.55
        ctx.beginPath()
        ctx.moveTo(x - w, yb)
        ctx.quadraticCurveTo(x, yb - s * 1.25, x + w, yb)
        ctx.closePath()
        ctx.fill()
      }
      if (p.rimA > 0.02) {
        ctx.strokeStyle = rgba(p.rimLight, p.rimA * 0.25)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x - s * 0.26, y - s * 1.65)
        ctx.quadraticCurveTo(x, y - s * 2.3, x + s * 0.26, y - s * 1.65)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  function drawParticles(p) {
    depthBegin(1.6)
    const n = W < 700 ? 34 : PARTS.length
    for (let i = 0; i < n; i++) {
      const q = PARTS[i]
      const y = ((q.y - (reduce ? 0 : clock * q.sp)) % 1 + 1) % 1
      const x = q.x + (reduce ? 0 : Math.sin(clock * q.f + q.ph) * 0.012)
      const px = x * W + mx * 20
      const py = (0.12 + y * 0.86) * H
      const c = q.k < 0.7 ? p.p1 : p.p2
      const tw = reduce ? 0.8 : 0.6 + 0.4 * Math.sin(clock * (0.4 + q.f * 1.5) + q.ph)
      const a = p.pA * tw
      ctx.fillStyle = rgba(c, a * 0.22)
      ctx.beginPath()
      ctx.arc(px, py, q.r * 3, 0, 6.283)
      ctx.fill()
      ctx.fillStyle = rgba(c, a)
      ctx.beginPath()
      ctx.arc(px, py, q.r, 0, 6.283)
      ctx.fill()
    }
    ctx.restore()
  }

  // ましろ（折り紙の鳥。平らな三角の面だけ。光を受けない紙の白）
  function drawMashiro(p) {
    let x
    let y
    let flap
    const period = 18
    if (reduce) {
      x = W * (L.portrait ? 0.78 : 0.7)
      y = H * (L.portrait ? 0.4 : 0.3)
      flap = 0.6
    } else {
      const ph = (clock % period) / period
      if (ph > 0.62) return
      const q = ph / 0.62
      x = lerp(-W * 0.08, W * 1.08, q)
      y = H * (L.portrait ? 0.42 : 0.3) - Math.sin(q * Math.PI) * H * 0.08 + Math.sin(clock * 2.1) * H * 0.006
      flap = Math.sin(clock * 6.5)
    }
    const s = Math.max(1, Math.min(W, H) / 420) * 1.15
    // 見出しの裏を通る間は、光の輪を弱めて文字を薄くしない
    let haloA = p.haloMashiro
    for (const r of avoidRects) {
      if (x > r.left - 40 && x < r.right + 40 && y > r.top - 30 && y < r.bottom + 30) { haloA *= 0.5; break }
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 34)
    halo.addColorStop(0, `rgba(255,241,214,${haloA})`)
    halo.addColorStop(1, 'rgba(255,241,214,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(0, 0, 34, 0, 6.283)
    ctx.fill()
    const paper = '#fbf8f0'
    const crease = 'rgba(184,170,152,0.6)'
    const tri = (pts, fill) => {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      ctx.lineTo(pts[1][0], pts[1][1])
      ctx.lineTo(pts[2][0], pts[2][1])
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = crease
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
    const wy = -14 * flap
    tri([[-4, 0], [6, -1], [-1, wy - 2]], '#f1ebdf') // 奥の羽
    tri([[-16, -1], [14, -3], [-2, 6]], paper) // 胴
    tri([[14, -3], [20, -7], [11, 1]], paper) // 頭
    tri([[-16, -1], [-25, -8], [-20, 3]], '#f4efe4') // 尾
    tri([[-6, -1], [5, -2], [-3, wy]], paper) // 手前の羽
    ctx.restore()
  }

  function draw() {
    if (!L) return
    const p = palAt(tNow)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    depthBegin(0.04)
    drawSky(p)
    ctx.restore()
    drawMountains(p)
    drawCloudSea(p)
    drawLand(p)
    drawParticles(p)
    if (dive < 0.05) drawMashiro(p)
    // 「入る」: 霞が満ちる
    if (dive > 0.001) {
      const a = smoothstep(0.25, 1, easeInOut(dive))
      const c = mixC(p.cloudRim, p.fog, 0.3)
      ctx.fillStyle = rgba(c, a)
      ctx.fillRect(0, 0, W, H)
    }
  }

  function tick(now) {
    if (!running) return
    const realDt = Math.max(0, (now - last) / 1000 || 0)
    const dt = Math.min(0.1, realDt)
    last = now
    clock += dt
    // 切り替えは約1.2秒で重ねて変える（指数で近づけ、近くなったら止める）
    tNow += (tTarget - tNow) * Math.min(1, dt * 2.6)
    if (Math.abs(tTarget - tNow) < 0.002) tNow = tTarget
    mx += (mxT - mx) * Math.min(1, dt * 2)
    my += (myT - my) * Math.min(1, dt * 2)
    if (dive !== diveTarget) {
      const sp = Math.min(0.25, realDt) / 1.5 // 画面の更新が遅い端末でも、約1.5秒で入りきる
      dive = diveTarget > dive ? Math.min(diveTarget, dive + sp) : Math.max(diveTarget, dive - sp)
      if (dive === diveTarget && diveDone) { const cb = diveDone; diveDone = null; cb() }
    }
    draw()
    // 2秒ほど様子を見て、1枚に 45ms 以上かかるなら解像度を下げる（2回まで）
    frames++
    frameSum += realDt
    if (frames >= 40) {
      if (frameSum / frames > 0.045 && quality > 0.6) { quality *= 0.75; resize() }
      frames = 0
      frameSum = 0
    }
    requestAnimationFrame(tick)
  }
  function start() {
    if (running || reduce || document.hidden) return
    running = true
    last = performance.now()
    requestAnimationFrame(tick)
  }
  function stop() { running = false }

  // ましろが避ける見出しの範囲（スクロールと大きさの変化のときだけ測る）
  let avoidRects = []
  const measureAvoid = () => {
    avoidRects = Array.from(document.querySelectorAll('.hero-copy, .invite h2, .free h2')).map((el) => el.getBoundingClientRect()).filter((r) => r.bottom > 0 && r.top < H)
  }
  window.addEventListener('scroll', measureAvoid, { passive: true })
  window.addEventListener('resize', measureAvoid)
  window.addEventListener('load', measureAvoid)

  // ---------- 公開する操作 ----------
  window.Kasumi = {
    setTime(t, immediate) {
      tTarget = reduce ? Math.round(t) : t
      if (immediate || reduce || !running) { tNow = tTarget; draw() }
    },
    dive(cb) {
      diveTarget = 1
      if (reduce || !running) { dive = 1; draw(); if (cb) cb(); return }
      diveDone = cb || null
    },
    undive() {
      diveTarget = 0
      if (reduce || !running) { dive = 0; draw() }
    },
  }

  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', (e) => {
    if (reduce || e.pointerType === 'touch') return
    mxT = (e.clientX / W - 0.5) * 2
    myT = (e.clientY / H - 0.5) * 2
  }, { passive: true })
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  const onReduce = () => {
    reduce = reduceMQ.matches
    if (reduce) { stop(); mx = my = mxT = myT = 0; tNow = tTarget = Math.round(tTarget); draw() } else start()
  }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce)
  resize()
  start()
})()
