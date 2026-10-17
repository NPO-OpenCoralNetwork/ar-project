// 現の旅の素の地図（D1。02 F-01: MVP では素の地図に札を重ねる形）。Canvas 2D で、地域パックの層（OSM 由来）を自前で描く。
// 外の地図タイル（tile.openstreetmap.org など）は使わない（05 §5.1）。
//
// - 北が上。現在地を追う（指でずらしたら追うのをやめ、「現在地」で戻る）。指2本・ホイールで拡大縮小。
// - お休みの範囲（境内）は、名前を出さずに淡い霧の面にする（D2）。
// - 地点は小さな札（会った妖怪は名前、まだなら「？」）。気配（近い地点）は墨のにじみ。
//   歩いている間は動かさず、立ち止まるとゆっくり揺れる（04 §2.2: 歩く間は地図に動く演出を出さない）。
// - ほかのプレイヤーの現在地は出さない。
//
// 白描の絵地図（look: 'hakubyo'。家の側。02 F-07、04 §3.8）にも使う。同じ層を、和紙に墨の線で描く:
// 道は墨の二重線、水は輪郭と横の筋、建物は淡い輪郭、緑はごく淡い墨、お休みの範囲は霧（中には何も書かない）。
// 昼・夕・夜で紙と墨の色を変える（夕は暖かい紙、夜は藍鼠の紙に明るい線）。気配のにじみは揺らさない（静かな絵にし、描き直しも減らす）。
// 現在地は出さず、追わない。
// 名所に指を置くと hold で知らせる（長押しで耳を澄ます。F-27）。指が動いたら（8px）やめ、地図はふだんどおり動く。

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

/** 白描の絵地図の紙と墨（06 §5: 白描は曼荼羅帳・夢の姿と同じ絵の言葉） */
interface InkPalette {
  paper: string
  /** 和紙の繊維 */
  fiber: string
  /** 公園・草地（ごく淡い墨） */
  wash: string
  /** 林 */
  washDeep: string
  /** 水の面のにじみ */
  water: string
  /** 道・水の輪郭の墨 */
  line: string
  /** 水の筋（細い横線） */
  hatch: string
  /** 建物の淡い輪郭 */
  faint: string
  path: string
  mist: string
  mistLine: string
  ink: string
  tag: string
  me: string
  meRing: string
}

const INK_PALETTES: Record<DayPhase, InkPalette> = {
  day: {
    paper: '#f7f1e3',
    fiber: 'rgba(150, 128, 92, 0.15)',
    wash: 'rgba(60, 54, 40, 0.035)',
    washDeep: 'rgba(60, 54, 40, 0.065)',
    water: 'rgba(60, 70, 80, 0.045)',
    line: 'rgba(43, 36, 32, 0.78)',
    hatch: 'rgba(43, 36, 32, 0.3)',
    faint: 'rgba(43, 36, 32, 0.24)',
    path: 'rgba(43, 36, 32, 0.5)',
    mist: 'rgba(255, 253, 248, 0.94)',
    mistLine: 'rgba(150, 140, 125, 0.32)',
    ink: '#2b2420',
    tag: '#fbf7ec',
    me: '#2b2420',
    meRing: 'rgba(43, 36, 32, 0.12)',
  },
  // 夕: 紙を暖かく、墨を赤茶に寄せる
  oumagatoki: {
    paper: '#f2dfc8',
    fiber: 'rgba(150, 96, 66, 0.15)',
    wash: 'rgba(90, 50, 40, 0.04)',
    washDeep: 'rgba(90, 50, 40, 0.07)',
    water: 'rgba(80, 60, 80, 0.05)',
    line: 'rgba(72, 44, 40, 0.8)',
    hatch: 'rgba(72, 44, 40, 0.3)',
    faint: 'rgba(72, 44, 40, 0.26)',
    path: 'rgba(72, 44, 40, 0.5)',
    mist: 'rgba(255, 246, 238, 0.92)',
    mistLine: 'rgba(160, 120, 110, 0.34)',
    ink: '#3d2a28',
    tag: '#fbefe2',
    me: '#3d2a28',
    meRing: 'rgba(61, 42, 40, 0.12)',
  },
  // 夜: 藍鼠の紙に、明るい線
  night: {
    paper: '#2b3148',
    fiber: 'rgba(200, 205, 235, 0.08)',
    wash: 'rgba(220, 224, 245, 0.035)',
    washDeep: 'rgba(220, 224, 245, 0.06)',
    water: 'rgba(160, 175, 230, 0.06)',
    line: 'rgba(228, 225, 240, 0.62)',
    hatch: 'rgba(228, 225, 240, 0.28)',
    faint: 'rgba(228, 225, 240, 0.2)',
    path: 'rgba(228, 225, 240, 0.42)',
    mist: 'rgba(205, 210, 235, 0.3)',
    mistLine: 'rgba(205, 210, 235, 0.3)',
    ink: '#ebe7f3',
    tag: '#353c58',
    me: '#ebe7f3',
    meRing: 'rgba(235, 231, 243, 0.14)',
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
  /** 地点の札に指を置いた（spotId）／離した・指が動いた（null）。長押しのあとのタップは出さない */
  hold?(spotId: string | null): void
  /** 見えている範囲が変わった（描き直した） */
  viewChange?(): void
}

export interface MapViewOptions {
  /** 描き方。plain＝現の旅の素の地図（既定）、hakubyo＝家の白描の絵地図 */
  look?: 'plain' | 'hakubyo'
}

/** 板の分の余白（px） */
export interface MapPad {
  top: number
  right: number
  bottom: number
  left: number
}

const MIN_SCALE = 0.35 // px/m（引いたとき）
const MAX_SCALE = 6
/** これより長く指を置いていたら「長押し」（離してもタップにしない。ms） */
const HOLD_TAP_MS = 400

export class MapView {
  readonly canvas: HTMLCanvasElement
  /** 描く先（白描の絵地図は、地図の層をいったん別の紙に描いて取っておくので、その間だけ差し替える） */
  private ctx: CanvasRenderingContext2D
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
  /** 白描の絵地図の層を描いておいた紙（見ている範囲・大きさ・時間が同じなら、描き直さずに写す） */
  private layerCache: { key: string; canvas: HTMLCanvasElement } | null = null
  /** 水の筋（白描の絵地図。4px おきの横線。色が変わったら作り直す） */
  private hatch: { color: string; dpr: number; pat: CanvasPattern | null } | null = null
  /** 会話や曼荼羅帳で地図が隠れている間は描かない（電池のため） */
  private paused = false
  private readonly look: 'plain' | 'hakubyo'
  /** 気配を揺らさない（白描の絵地図。静かな絵にし、描き直しも減らす） */
  private readonly still: boolean
  /** 選んだ地点（札を二重の枠で囲む） */
  private selected: string | null = null
  /** 地点の札に指を置いている（長押し） */
  private press: { spotId: string; at: number } | null = null
  /** 範囲に合わせたときの余白。指やボタンで動かすまでは、画面の大きさが変わったら合わせ直す */
  private fitPad: MapPad | null = null
  /** 確認用 */
  frames = 0

  constructor(
    host: HTMLElement,
    private readonly layers: MapLayers,
    private readonly rest: readonly LocalXZ[][],
    private readonly hooks: MapViewHooks,
    opts: MapViewOptions = {},
  ) {
    this.look = opts.look ?? 'plain'
    this.still = this.look === 'hakubyo'
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
      const animating = this.stopped && this.kehai.length > 0 && !this.still
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
    this.fitPad = null
    this.dirty = true
  }

  /** 選んだ地点（null で外す） */
  setSelected(spotId: string | null): void {
    if (spotId === this.selected) return
    this.selected = spotId
    this.dirty = true
  }

  /** データのある範囲が、余白（板の分）の内側にまるごと入るように合わせる */
  fit(pad: MapPad = { top: 16, right: 16, bottom: 16, left: 16 }): void {
    this.fitPad = pad
    const r = this.layers.rect
    const aw = Math.max(40, this.w - pad.left - pad.right)
    const ah = Math.max(40, this.h - pad.top - pad.bottom)
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(aw / (r.maxX - r.minX), ah / (r.maxZ - r.minZ))))
    // 余白の内側の中ほどに、範囲の中心が来るように
    this.cx = (r.minX + r.maxX) / 2 - (pad.left - pad.right) / 2 / this.scale
    this.cz = (r.minZ + r.maxZ) / 2 - (pad.top - pad.bottom) / 2 / this.scale
    this.dirty = true
  }

  /** その点が画面の端（margin px）より外なら、画面の中ほどへ寄せる（キーボードで地点を選んだとき） */
  reveal(x: number, z: number, margin = 64): void {
    const [sx, sy] = this.toScreen(x, z)
    if (sx >= margin && sx <= this.w - margin && sy >= margin && sy <= this.h - margin) return
    this.cx = x
    this.cz = z
    this.fitPad = null
    this.dirty = true
  }

  /** 画面の座標 → ローカル座標 */
  toLocal(px: number, py: number): LocalXZ {
    return { x: this.cx + (px - this.w / 2) / this.scale, z: this.cz + (py - this.h / 2) / this.scale }
  }

  /** ローカル座標 → 画面の座標（px。地図の左上から） */
  screenOf(x: number, z: number): [number, number] {
    return this.toScreen(x, z)
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
    if (this.fitPad) this.fit(this.fitPad)
    this.dirty = true
  }

  /** 指を置いていた地点を離した（長押しをやめた） */
  private endHold(): void {
    if (!this.press) return
    this.press = null
    this.hooks.hold?.(null)
  }

  private bindInput(): void {
    const c = this.canvas
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.pointers.size === 1) {
        this.drag = { x: e.clientX, y: e.clientY, moved: 0 }
        // 地点の札に指を置いた（長押しで耳を澄ます。知らせる先があるときだけ。マウスは左ボタンだけ）
        if (this.hooks.hold && e.button === 0) {
          const r = c.getBoundingClientRect()
          const id = this.hitSpot(e.clientX - r.left, e.clientY - r.top)
          if (id) {
            this.press = { spotId: id, at: performance.now() }
            this.hooks.hold(id)
          }
        }
      }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale }
        this.drag = null
        this.fitPad = null
        this.endHold()
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
          // 指が動いたら、長押しはやめて地図を動かす
          this.endHold()
          this.fitPad = null
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
      const pressed = this.press
      this.pointers.delete(e.pointerId)
      if (this.pointers.size < 2) this.pinch = null
      if (this.pointers.size === 0) {
        this.drag = null
        this.endHold()
      }
      // 長押し（耳を澄ます）のあとは、タップにしない
      const longPress = !!pressed && performance.now() - pressed.at >= HOLD_TAP_MS
      if (wasDrag && wasDrag.moved <= 8 && e.type === 'pointerup' && !longPress) {
        const r = c.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        this.hooks.tap(this.toLocal(px, py), this.hitSpot(px, py))
      }
    }
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    // 地点の札の長押しで、端末のメニューを出さない
    c.addEventListener('contextmenu', (e) => {
      if (this.press) e.preventDefault()
    })
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.endHold()
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

  /** いまの道すじに、線を足す（beginPath しない。同じ線の太さのものをまとめて引くとき） */
  private trace(points: readonly XZ[], close = false): void {
    const ctx = this.ctx
    for (let i = 0; i < points.length; i++) {
      const [sx, sy] = this.toScreen(points[i][0], points[i][1])
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    if (close) ctx.closePath()
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

  /** 和紙の繊維（白描の絵地図）。短い曲がった筋を、ばらばらの向きで散らす */
  private fiberPattern(pal: InkPalette): CanvasPattern | null {
    if (this.grain) return this.grain
    const g = document.createElement('canvas')
    g.width = g.height = 96
    const gc = g.getContext('2d')!
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    gc.strokeStyle = pal.fiber
    gc.lineWidth = 0.5
    gc.lineCap = 'round'
    for (let i = 0; i < 14; i++) {
      const x = rnd() * 96
      const y = rnd() * 96
      // 繊維は横に寝かせぎみに、ゆるく曲げる
      const a = (rnd() - 0.5) * 1.2
      const l = 8 + rnd() * 12
      const bend = (rnd() - 0.5) * 3
      gc.beginPath()
      gc.moveTo(x, y)
      gc.quadraticCurveTo(x + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * l, y + Math.sin(a) * l)
      gc.stroke()
    }
    this.grain = this.ctx.createPattern(g, 'repeat')
    return this.grain
  }

  /** 水の筋の模様（4px おきの細い横線）。画面に対して固定なので、水の面と川の筋がそろう */
  private hatchPattern(color: string): CanvasPattern | null {
    if (this.hatch && this.hatch.color === color && this.hatch.dpr === this.dpr) return this.hatch.pat
    const d = this.dpr
    const g = document.createElement('canvas')
    g.width = Math.round(8 * d)
    g.height = Math.round(4 * d)
    const gc = g.getContext('2d')!
    gc.fillStyle = color
    gc.fillRect(0, 0, g.width, Math.max(1, Math.round(0.7 * d)))
    const pat = this.ctx.createPattern(g, 'repeat')
    pat?.setTransform(new DOMMatrix().scale(1 / d))
    this.hatch = { color, dpr: d, pat }
    return pat
  }

  /**
   * 白描の絵地図の層を、取っておいた紙から写す（耳を澄ます輪・選んだ札が変わるだけなら、道や建物は描き直さない）。
   * 見ている範囲・大きさ・時間が変わったら、描き直して取っておく。
   */
  private inkLayersCached(pal: InkPalette): InkPalette {
    const key = `${this.cx},${this.cz},${this.scale},${this.canvas.width}x${this.canvas.height},${this.dpr},${this.phase}`
    if (this.layerCache?.key !== key) {
      const c = this.layerCache?.canvas ?? document.createElement('canvas')
      c.width = this.canvas.width
      c.height = this.canvas.height
      const main = this.ctx
      const off = c.getContext('2d')!
      off.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      off.lineJoin = 'round'
      off.lineCap = 'round'
      this.ctx = off
      try {
        this.drawInkLayers(pal)
      } finally {
        this.ctx = main
      }
      this.layerCache = { key, canvas: c }
    }
    const ctx = this.ctx
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.layerCache.canvas, 0, 0)
    ctx.restore()
    return pal
  }

  /**
   * 白描の絵地図の紙と層（家の側）。和紙に墨の線だけで描く。
   * 道は墨の二重線（中は紙のまま）、川・用水は二重線の中に細い水の筋、水の面は輪郭と横の筋、
   * 建物は淡い輪郭、緑はごく淡い墨の面、線路は線と枕木。お休みの範囲は霧で覆い、中には何も書かない（名前も印も出さない）。
   * 層は土地の端（データのある範囲）で切り、細い二重の枠で囲む（範囲の外へ出た道の切れ端を描かない）。
   */
  private drawInkLayers(pal: InkPalette): InkPalette {
    const ctx = this.ctx
    const s = this.scale
    ctx.fillStyle = pal.paper
    ctx.fillRect(0, 0, this.w, this.h)
    const fp = this.fiberPattern(pal)
    if (fp) {
      ctx.fillStyle = fp
      ctx.fillRect(0, 0, this.w, this.h)
    }

    const L = this.layers
    const [x0, y0] = this.toScreen(L.rect.minX, L.rect.minZ)
    const [x1, y1] = this.toScreen(L.rect.maxX, L.rect.maxZ)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, x1 - x0, y1 - y0)
    ctx.clip()
    // 緑（輪郭は引かない）
    for (const g of L.greens) {
      this.path(g.polygon, true)
      ctx.fillStyle = g.kind === 'forest' ? pal.washDeep : pal.wash
      ctx.fill()
    }
    // 水の面と川・用水: 墨の輪郭（川は二重線）の内に、横の筋（道の二重線は中が白いので、筋で見分ける）
    const hatch = this.hatchPattern(pal.hatch)
    ctx.beginPath()
    for (const a of L.waterAreas) this.trace(a, true)
    ctx.fillStyle = pal.water
    ctx.fill()
    if (hatch) {
      ctx.fillStyle = hatch
      ctx.fill()
    }
    ctx.strokeStyle = pal.line
    ctx.lineWidth = 1
    ctx.stroke()
    for (const w of L.waterLines) {
      const iw = Math.max(2.6, w.widthM * s)
      this.path(w.points)
      ctx.strokeStyle = pal.line
      ctx.lineWidth = iw + 2.2
      ctx.stroke()
      ctx.strokeStyle = pal.paper
      ctx.lineWidth = iw
      ctx.stroke()
      if (hatch) {
        ctx.strokeStyle = hatch
        ctx.stroke()
      }
    }
    // 建物（淡い輪郭だけ。まとめて1回で引く）
    ctx.beginPath()
    for (const b of L.buildings) this.trace(b, true)
    ctx.strokeStyle = pal.faint
    ctx.lineWidth = 0.7
    ctx.stroke()
    // 道: 先に墨の太い線を全部引き、あとで紙の色で中を抜く（交わる所がつながって見える）
    const isPath = (k: string) => k === 'path' || k === 'footway' || k === 'steps' || k === 'track' || k === 'cycleway'
    const inner = (widthM: number) => Math.max(2, widthM * s)
    for (const r of L.roads) {
      if (isPath(r.kind)) continue
      this.path(r.points)
      ctx.strokeStyle = pal.line
      ctx.lineWidth = inner(r.widthM) + 2
      ctx.stroke()
    }
    for (const r of L.roads) {
      if (isPath(r.kind)) continue
      this.path(r.points)
      ctx.strokeStyle = pal.paper
      ctx.lineWidth = inner(r.widthM)
      ctx.stroke()
    }
    ctx.beginPath()
    for (const r of L.roads) if (isPath(r.kind)) this.trace(r.points)
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = pal.path
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    // 線路（線と枕木）
    for (const r of L.rails) {
      this.path(r.points)
      ctx.strokeStyle = pal.line
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.save()
      ctx.lineCap = 'butt'
      ctx.setLineDash([1, 6])
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.restore()
    }
    // 駅（名前は出さない）
    for (const [x, z] of L.stations) {
      const [sx, sy] = this.toScreen(x, z)
      ctx.fillStyle = pal.paper
      ctx.strokeStyle = pal.line
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.roundRect(sx - 7, sy - 5, 14, 10, 2)
      ctx.fill()
      ctx.stroke()
    }
    // お休みの範囲: 縁をぼかした霧で覆い、すやり霞の淡い筋を2本だけ（中に字や印は書かない）
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
      for (const k of [0.38, 0.66]) {
        const y = minY + (maxY - minY) * k
        ctx.beginPath()
        ctx.moveTo(minX + (maxX - minX) * 0.12, y)
        ctx.bezierCurveTo(minX + (maxX - minX) * 0.4, y - 4, minX + (maxX - minX) * 0.6, y + 4, maxX - (maxX - minX) * 0.12, y)
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.restore()
    // 土地の端（細い二重の枠）
    ctx.strokeStyle = pal.faint
    ctx.lineWidth = 1
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
    ctx.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8)
    return pal
  }

  /** 素の地図の紙と層（現の旅） */
  private drawPlainLayers(pal: MapPalette): MapPalette {
    const ctx = this.ctx
    const s = this.scale
    ctx.fillStyle = pal.paper
    ctx.fillRect(0, 0, this.w, this.h)
    const gp = this.grainPattern(pal)
    if (gp) {
      ctx.fillStyle = gp
      ctx.fillRect(0, 0, this.w, this.h)
    }

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
    return pal
  }

  private draw(time: number): void {
    this.frames++
    const ctx = this.ctx
    const s = this.scale
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // 紙と地図の層（素の地図か、白描の絵地図か）。この上に、気配・地点の札・現在地を重ねる
    const pal = this.look === 'hakubyo' ? this.inkLayersCached(INK_PALETTES[this.phase]) : this.drawPlainLayers(PALETTES[this.phase])

    // 気配（墨のにじみ）。立ち止まっているときだけ、ゆっくり揺れる
    for (const k of this.kehai) {
      const [sx, sy] = this.toScreen(k.x, k.z)
      const wob = this.stopped && !this.still ? Math.sin(time * 1.3 + k.x) * 0.08 : 0
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
        // 白描の絵地図では、指に隠れないよう大きめの輪にし、淡い溝を敷く
        const wide = this.look === 'hakubyo'
        const rr = wide ? Math.max(46, r) : r * 0.7
        if (wide) {
          ctx.strokeStyle = pal.tag
          ctx.lineWidth = 7
          ctx.beginPath()
          ctx.arc(sx, sy, rr, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.strokeStyle = pal.ink
        ctx.lineWidth = wide ? 3.5 : 2.5
        ctx.beginPath()
        ctx.arc(sx, sy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.clearing.v)
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
      // 選んだ地点は、札を二重の枠で囲む（色だけにしない）
      if (sp.id === this.selected) {
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.roundRect(-tw / 2 - 4, -th / 2 - 4, tw + 8, th + 8, 6)
        ctx.stroke()
      }
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
    this.hooks.viewChange?.()
  }
}
