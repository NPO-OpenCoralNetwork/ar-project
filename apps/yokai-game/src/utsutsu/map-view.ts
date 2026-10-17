// 現の旅の素の地図（D1。02 F-01: MVP では素の地図に札を重ねる形）。Canvas 2D で、地域パックの層（OSM 由来）を自前で描く。
// 外の地図タイル（tile.openstreetmap.org など）は使わない（05 §5.1）。
//
// - 北が上。現在地を追う（指でずらしたら追うのをやめ、「現在地」で戻る）。指2本・ホイールで拡大縮小。
// - お休みの範囲（境内）は、名前を出さずに淡い霧の面にする（D2）。
// - 地点は小さな札（会った妖怪は名前、まだなら「？」）。気配（近い地点）は墨のにじみ。
//   歩いている間は動かさず、立ち止まるとゆっくり揺れる（04 §2.2: 歩く間は地図に動く演出を出さない）。
// - ほかのプレイヤーの現在地は出さない。

import type { LocalXZ } from '../core/geo'
import type { MapLayers, XZ } from '../core/map-layers'
import type { DayPhase } from '../core/utsutsu/sun'

interface MapPalette {
  paper: string
  grain: string
  green: string
  forest: string
  water: string
  waterLine: string
  road: string
  roadCase: string
  path: string
  building: string
  buildingLine: string
  rail: string
  mist: string
  mistLine: string
  ink: string
  inkSoft: string
  tag: string
  me: string
  meRing: string
}

const PALETTES: Record<DayPhase, MapPalette> = {
  day: {
    paper: '#f3eee2',
    grain: 'rgba(120, 100, 70, 0.05)',
    green: '#e1e7d0',
    forest: '#d5dec5',
    water: '#d3e1e6',
    waterLine: '#a8c4d0',
    road: '#fffdf8',
    roadCase: 'rgba(70, 58, 44, 0.28)',
    path: 'rgba(70, 58, 44, 0.45)',
    building: '#e7ddcb',
    buildingLine: 'rgba(70, 58, 44, 0.32)',
    rail: '#5f564d',
    mist: 'rgba(255, 255, 255, 0.82)',
    mistLine: 'rgba(170, 160, 150, 0.35)',
    ink: '#2a2622',
    inkSoft: 'rgba(42, 38, 34, 0.6)',
    tag: '#fbf8f0',
    me: '#2f4a7a',
    meRing: 'rgba(47, 74, 122, 0.14)',
  },
  oumagatoki: {
    paper: '#efdfd8',
    grain: 'rgba(120, 70, 70, 0.06)',
    green: '#e0d9cf',
    forest: '#d8d0c8',
    water: '#d2d3e2',
    waterLine: '#a6a9c8',
    road: '#fbf3ef',
    roadCase: 'rgba(80, 50, 60, 0.3)',
    path: 'rgba(80, 50, 60, 0.45)',
    building: '#e6d2cb',
    buildingLine: 'rgba(80, 50, 60, 0.32)',
    rail: '#5a4650',
    mist: 'rgba(255, 246, 244, 0.82)',
    mistLine: 'rgba(170, 140, 150, 0.4)',
    ink: '#3e3240',
    inkSoft: 'rgba(62, 50, 64, 0.62)',
    tag: '#fcf4f1',
    me: '#3b3f7a',
    meRing: 'rgba(59, 63, 122, 0.16)',
  },
  night: {
    paper: '#1c2140',
    grain: 'rgba(200, 200, 255, 0.04)',
    green: '#222a45',
    forest: '#20283f',
    water: '#26305a',
    waterLine: '#3e4c86',
    road: '#3a416c',
    roadCase: 'rgba(10, 12, 30, 0.6)',
    path: 'rgba(170, 176, 220, 0.4)',
    building: '#2c3358',
    buildingLine: 'rgba(170, 176, 220, 0.28)',
    rail: '#9aa0c8',
    mist: 'rgba(200, 204, 235, 0.32)',
    mistLine: 'rgba(200, 204, 235, 0.3)',
    ink: '#e8e4f2',
    inkSoft: 'rgba(232, 228, 242, 0.62)',
    tag: '#2a3058',
    me: '#e9d9a6',
    meRing: 'rgba(233, 217, 166, 0.16)',
  },
}

export interface MapSpot {
  id: string
  x: number
  z: number
  /** 札に書く字（会った妖怪の名前、まだなら「？」） */
  label: string
  /** 現地で会った（色の札） */
  onsite: boolean
}

export interface MapKehai {
  spotId: string
  x: number
  z: number
  strength: number
}

export interface MapViewHooks {
  /** 地図をタップした（ローカル座標）。地点の札に当たったら spotId */
  tap(p: LocalXZ, spotId: string | null): void
  /** 追うのをやめた／戻した */
  followChange(follow: boolean): void
}

const MIN_SCALE = 0.35 // px/m（引いたとき）
const MAX_SCALE = 6

export class MapView {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private w = 1
  private h = 1
  private dpr = 1
  /** 画面の中心のローカル座標 */
  private cx = 0
  private cz = 0
  /** px / m */
  scale = 1.6
  follow = true
  private phase: DayPhase = 'day'
  private me: (LocalXZ & { acc: number; heading: number | null }) | null = null
  private spots: MapSpot[] = []
  private kehai: MapKehai[] = []
  private stopped = false
  private clearing: { spotId: string; v: number } | null = null
  private simTarget: LocalXZ | null = null
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private drag: { x: number; y: number; moved: number } | null = null
  private pinch: { d: number; scale: number } | null = null
  private dirty = true
  private raf = 0
  private lastDraw = 0
  private grain: CanvasPattern | null = null
  /** 会話や曼荼羅帳で地図が隠れている間は描かない（電池のため） */
  private paused = false
  /** 確認用 */
  frames = 0

  constructor(
    host: HTMLElement,
    private readonly layers: MapLayers,
    private readonly rest: readonly LocalXZ[][],
    private readonly hooks: MapViewHooks,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'um-canvas'
    host.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    const r = layers.rect
    this.cx = (r.minX + r.maxX) / 2
    this.cz = (r.minZ + r.maxZ) / 2
    this.bindInput()
    new ResizeObserver(() => this.resize()).observe(host)
    this.resize()
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop)
      if (this.paused) return
      // 立ち止まって気配が揺れている間だけ、20fps で描き直す。ほかは変化があったときだけ
      const animating = this.stopped && this.kehai.length > 0
      if (!this.dirty && !(animating && t - this.lastDraw > 50)) return
      this.lastDraw = t
      this.dirty = false
      this.draw(t / 1000)
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.canvas.remove()
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return
    this.paused = p
    if (!p) this.dirty = true
  }

  setPhase(p: DayPhase): void {
    if (p === this.phase) return
    this.phase = p
    this.grain = null
    this.dirty = true
  }

  setMe(p: (LocalXZ & { acc: number; heading: number | null }) | null): void {
    this.me = p
    if (p && this.follow) {
      this.cx = p.x
      this.cz = p.z
    }
    this.dirty = true
  }

  setSpots(s: MapSpot[]): void {
    this.spots = s
    this.dirty = true
  }

  setKehai(k: MapKehai[], stopped: boolean, clearing: { spotId: string; v: number } | null): void {
    this.kehai = k
    this.stopped = stopped
    this.clearing = clearing
    this.dirty = true
  }

  setSimTarget(p: LocalXZ | null): void {
    this.simTarget = p
    this.dirty = true
  }

  recenter(): void {
    this.follow = true
    if (this.me) {
      this.cx = this.me.x
      this.cz = this.me.z
    }
    this.hooks.followChange(true)
    this.dirty = true
  }

  zoomBy(f: number): void {
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * f))
    this.dirty = true
  }

  /** 画面の座標 → ローカル座標 */
  toLocal(px: number, py: number): LocalXZ {
    return { x: this.cx + (px - this.w / 2) / this.scale, z: this.cz + (py - this.h / 2) / this.scale }
  }

  private toScreen(x: number, z: number): [number, number] {
    return [(x - this.cx) * this.scale + this.w / 2, (z - this.cz) * this.scale + this.h / 2]
  }

  private resize(): void {
    const r = this.canvas.parentElement!.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = Math.max(1, r.width)
    this.h = Math.max(1, r.height)
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.dirty = true
  }

  private bindInput(): void {
    const c = this.canvas
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.pointers.size === 1) this.drag = { x: e.clientX, y: e.clientY, moved: 0 }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale }
        this.drag = null
      }
    })
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (this.pinch.scale * d) / Math.max(1, this.pinch.d)))
        this.dirty = true
        return
      }
      if (this.drag) {
        this.drag.moved += Math.abs(dx) + Math.abs(dy)
        if (this.drag.moved > 8) {
          if (this.follow) {
            this.follow = false
            this.hooks.followChange(false)
          }
          this.cx -= dx / this.scale
          this.cz -= dy / this.scale
          this.dirty = true
        }
      }
    })
    const up = (e: PointerEvent) => {
      const wasDrag = this.drag
      this.pointers.delete(e.pointerId)
      if (this.pointers.size < 2) this.pinch = null
      if (this.pointers.size === 0) this.drag = null
      if (wasDrag && wasDrag.moved <= 8 && e.type === 'pointerup') {
        const r = c.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        this.hooks.tap(this.toLocal(px, py), this.hitSpot(px, py))
      }
    }
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoomBy(Math.exp(-e.deltaY * 0.0015))
      },
      { passive: false },
    )
  }

  private hitSpot(px: number, py: number): string | null {
    let best: { id: string; d: number } | null = null
    for (const s of this.spots) {
      const [sx, sy] = this.toScreen(s.x, s.z)
      const d = Math.hypot(px - sx, py - (sy - 16))
      if (d < 26 && (!best || d < best.d)) best = { id: s.id, d }
    }
    return best?.id ?? null
  }

  private grainPattern(pal: MapPalette): CanvasPattern | null {
    if (this.grain) return this.grain
    const g = document.createElement('canvas')
    g.width = g.height = 64
    const gc = g.getContext('2d')!
    let seed = 3
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    gc.fillStyle = pal.grain
    for (let i = 0; i < 90; i++) gc.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 1.5, 1 + rnd())
    this.grain = this.ctx.createPattern(g, 'repeat')
    return this.grain
  }

  private path(points: readonly XZ[], close = false): void {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i < points.length; i++) {
      const [sx, sy] = this.toScreen(points[i][0], points[i][1])
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    if (close) ctx.closePath()
  }

  private draw(time: number): void {
    this.frames++
    const ctx = this.ctx
    const pal = PALETTES[this.phase]
    const s = this.scale
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = pal.paper
    ctx.fillRect(0, 0, this.w, this.h)
    const gp = this.grainPattern(pal)
    if (gp) {
      ctx.fillStyle = gp
      ctx.fillRect(0, 0, this.w, this.h)
    }
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const L = this.layers
    // 緑・水の面
    for (const g of L.greens) {
      this.path(g.polygon, true)
      ctx.fillStyle = g.kind === 'forest' ? pal.forest : pal.green
      ctx.fill()
    }
    for (const a of L.waterAreas) {
      this.path(a, true)
      ctx.fillStyle = pal.water
      ctx.fill()
    }
    for (const w of L.waterLines) {
      this.path(w.points)
      ctx.strokeStyle = pal.waterLine
      ctx.lineWidth = Math.max(1.2, w.widthM * s)
      ctx.stroke()
    }
    // 建物
    ctx.lineWidth = 0.8
    for (const b of L.buildings) {
      this.path(b, true)
      ctx.fillStyle = pal.building
      ctx.fill()
      ctx.strokeStyle = pal.buildingLine
      ctx.stroke()
    }
    // 道（小道は点線、ほかは縁取り＋白）
    const isPath = (k: string) => k === 'path' || k === 'footway' || k === 'steps' || k === 'track' || k === 'cycleway'
    for (const r of L.roads) {
      if (isPath(r.kind)) continue
      this.path(r.points)
      ctx.strokeStyle = pal.roadCase
      ctx.lineWidth = Math.max(2.4, r.widthM * s) + 2
      ctx.stroke()
    }
    for (const r of L.roads) {
      if (isPath(r.kind)) continue
      this.path(r.points)
      ctx.strokeStyle = pal.road
      ctx.lineWidth = Math.max(2.4, r.widthM * s)
      ctx.stroke()
    }
    ctx.setLineDash([3, 3])
    for (const r of L.roads) {
      if (!isPath(r.kind)) continue
      this.path(r.points)
      ctx.strokeStyle = pal.path
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    ctx.setLineDash([])
    // 線路（線と枕木）
    for (const r of L.rails) {
      this.path(r.points)
      ctx.strokeStyle = pal.rail
      ctx.lineWidth = 2
      ctx.stroke()
      // 枕木（丸い端だと玉に見えるので、平らな端で）
      ctx.save()
      ctx.lineCap = 'butt'
      ctx.globalAlpha = 0.55
      ctx.setLineDash([1.2, 6])
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.restore()
    }
    // 駅（名前は出さない）
    for (const [x, z] of L.stations) {
      const [sx, sy] = this.toScreen(x, z)
      ctx.fillStyle = pal.tag
      ctx.strokeStyle = pal.rail
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(sx - 7, sy - 5, 14, 10, 2)
      ctx.fill()
      ctx.stroke()
    }
    // お休みの範囲: 霧の面（縁をぼかす）と、すやり霞の筋
    for (const poly of this.rest) {
      const xz = poly.map((p): XZ => [p.x, p.z])
      ctx.save()
      ctx.shadowColor = pal.mist
      ctx.shadowBlur = 18
      this.path(xz, true)
      ctx.fillStyle = pal.mist
      ctx.fill()
      ctx.fill()
      ctx.restore()
      ctx.save()
      this.path(xz, true)
      ctx.clip()
      let minY = Infinity
      let maxY = -Infinity
      let minX = Infinity
      let maxX = -Infinity
      for (const p of xz) {
        const [sx, sy] = this.toScreen(p[0], p[1])
        minY = Math.min(minY, sy)
        maxY = Math.max(maxY, sy)
        minX = Math.min(minX, sx)
        maxX = Math.max(maxX, sx)
      }
      ctx.strokeStyle = pal.mistLine
      ctx.lineWidth = 1
      for (let y = minY + 9, i = 0; y < maxY; y += 13, i++) {
        const off = (i % 3) * 14
        ctx.beginPath()
        ctx.moveTo(minX + off, y)
        ctx.lineTo(maxX - 20 + off, y)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 気配（墨のにじみ）。立ち止まっているときだけ、ゆっくり揺れる
    for (const k of this.kehai) {
      const [sx, sy] = this.toScreen(k.x, k.z)
      const wob = this.stopped ? Math.sin(time * 1.3 + k.x) * 0.08 : 0
      const r = (26 + 22 * k.strength) * (1 + wob)
      const a = (this.stopped ? 0.4 : 0.22) * (0.4 + 0.6 * k.strength)
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r)
      const ink = this.phase === 'night' ? '232, 228, 242' : '42, 38, 34'
      grd.addColorStop(0, `rgba(${ink}, ${a})`)
      grd.addColorStop(0.55, `rgba(${ink}, ${a * 0.45})`)
      grd.addColorStop(1, `rgba(${ink}, 0)`)
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
      if (this.clearing && this.clearing.spotId === k.spotId && this.clearing.v > 0) {
        ctx.strokeStyle = pal.ink
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(sx, sy, r * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.clearing.v)
        ctx.stroke()
      }
    }

    // 地点の札
    ctx.font = `600 12px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const sp of this.spots) {
      const [sx, sy] = this.toScreen(sp.x, sp.z)
      const label = sp.label
      const tw = Math.max(16, ctx.measureText(label).width + 10)
      const th = 20
      ctx.save()
      ctx.translate(sx, sy - 16)
      ctx.fillStyle = sp.onsite ? (this.phase === 'night' ? '#4a3a5a' : '#f6e3cf') : pal.tag
      ctx.strokeStyle = pal.ink
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.roundRect(-tw / 2, -th / 2, tw, th, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = pal.ink
      ctx.fillText(label, 0, 1)
      ctx.beginPath()
      ctx.moveTo(0, th / 2)
      ctx.lineTo(0, 13)
      ctx.stroke()
      ctx.restore()
    }

    // シミュレーターの目的地
    if (this.simTarget) {
      const [sx, sy] = this.toScreen(this.simTarget.x, this.simTarget.z)
      ctx.strokeStyle = '#b5523b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sx - 6, sy - 6)
      ctx.lineTo(sx + 6, sy + 6)
      ctx.moveTo(sx + 6, sy - 6)
      ctx.lineTo(sx - 6, sy + 6)
      ctx.stroke()
    }

    // 現在地（精度の輪・向き・点）
    if (this.me) {
      const [sx, sy] = this.toScreen(this.me.x, this.me.z)
      ctx.fillStyle = pal.meRing
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(10, this.me.acc * s), 0, Math.PI * 2)
      ctx.fill()
      if (this.me.heading !== null) {
        const a = ((this.me.heading - 90) * Math.PI) / 180
        ctx.fillStyle = pal.me
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.arc(sx, sy, 26, a - 0.45, a + 0.45)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(sx, sy, 8.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = pal.me
      ctx.beginPath()
      ctx.arc(sx, sy, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
