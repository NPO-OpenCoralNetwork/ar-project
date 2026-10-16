// 操作。PC: WASD／矢印（カメラの向き基準）、Shift で走る、地面をクリックでそこへ歩く、ホイールでズーム、Q/E で回転。
// スマホ: 画面の下半分をドラッグすると出る仮想スティック、地面のタップでそこへ歩く、2本指でズーム。

import type * as THREE from 'three'
import type { MoveIntent } from './player'

export interface ControlsHooks {
  pickGround(clientX: number, clientY: number): THREE.Vector3 | null
  walkTo(p: THREE.Vector3): void
  zoom(factor: number): void
  rotate(dir: -1 | 1): void
  /** 速さの切り替え（F キー） */
  toggleSpeed(): void
  /** 最初に何か操作したとき（ヒントを閉じるため） */
  firstInput(): void
  stickVisual(show: boolean, ox?: number, oy?: number, kx?: number, ky?: number): void
}

interface Ptr {
  id: number
  type: string
  x0: number
  y0: number
  x: number
  y: number
  t0: number
  moved: boolean
}

const STICK_R = 58
const TAP_SLOP = 10
const TAP_MS = 400
/** スティックを始められる範囲から外す、画面の下端の幅（px。ホームインジケーターのジェスチャーと重ねない） */
const STICK_BOTTOM_GAP = 20

export class Controls {
  private readonly keys = new Set<string>()
  private readonly ptrs = new Map<number, Ptr>()
  private stickId: number | null = null
  private stickX = 0
  private stickY = 0
  private pinchDist = 0
  private pinching = false
  private notified = false
  private readonly intentOut: MoveIntent = { x: 0, z: 0, run: false }
  private safeBottomProbe: HTMLDivElement | null = null

  constructor(
    private readonly el: HTMLElement,
    private readonly hooks: ControlsHooks,
  ) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', () => this.keys.clear())
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointercancel', this.onCancel)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** カメラの向き（画面の上 = forward）を基準にした移動の意図。返すオブジェクトは使い回す（毎フレーム作らない） */
  intent(forwardX: number, forwardZ: number): MoveIntent {
    let f = 0
    let s = 0
    const k = this.keys
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1
    let run = k.has('ShiftLeft') || k.has('ShiftRight')
    if (f || s) {
      const l = Math.hypot(f, s)
      f /= l
      s /= l
    } else if (this.stickId !== null) {
      f = -this.stickY
      s = this.stickX
      const m = Math.hypot(f, s)
      if (m < 0.12) {
        f = s = 0
      } else run = run || m > 0.85
    }
    // 右 = (-forwardZ, forwardX)（x = 東, z = 南）
    const rx = -forwardZ
    const rz = forwardX
    const out = this.intentOut
    out.x = forwardX * f + rx * s
    out.z = forwardZ * f + rz * s
    out.run = run
    return out
  }

  /** 画面の下の safe-area の高さ（px） */
  private safeBottom(): number {
    if (!this.safeBottomProbe) {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom, 0px);visibility:hidden;pointer-events:none'
      document.body.appendChild(d)
      this.safeBottomProbe = d
    }
    return this.safeBottomProbe.offsetHeight
  }

  private touchCount(): number {
    let n = 0
    for (const q of this.ptrs.values()) if (q.type !== 'mouse') n++
    return n
  }

  private notify(): void {
    if (this.notified) return
    this.notified = true
    this.hooks.firstInput()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (e.code === 'KeyQ' && !e.repeat) this.hooks.rotate(-1)
    if (e.code === 'KeyE' && !e.repeat) this.hooks.rotate(1)
    if (e.code === 'KeyF' && !e.repeat) this.hooks.toggleSpeed()
    if (e.code === 'Equal' || e.code === 'NumpadAdd') this.hooks.zoom(0.85)
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.hooks.zoom(1 / 0.85)
    if (e.code.startsWith('Arrow')) e.preventDefault()
    this.keys.add(e.code)
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.notify()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onDown = (e: PointerEvent) => {
    this.el.setPointerCapture?.(e.pointerId)
    const p: Ptr = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false }
    this.ptrs.set(e.pointerId, p)
    const touches = [...this.ptrs.values()].filter((q) => q.type !== 'mouse')
    if (touches.length === 2) {
      // 2本指: ズーム（スティックはやめる）。ピンチに使った指は、離してもタップにしない
      for (const q of touches) q.moved = true
      this.endStick()
      this.pinching = true
      this.pinchDist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y)
      return
    }
    const stickBottom = window.innerHeight - this.safeBottom() - STICK_BOTTOM_GAP
    if (e.pointerType !== 'mouse' && this.stickId === null && e.clientY > window.innerHeight * 0.5 && e.clientY < stickBottom) {
      this.stickId = e.pointerId
      this.stickX = this.stickY = 0
    }
  }

  private onMove = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_SLOP) p.moved = true
    if (this.pinching) {
      let a: Ptr | null = null
      let b: Ptr | null = null
      for (const q of this.ptrs.values()) {
        if (q.type === 'mouse') continue
        if (!a) a = q
        else if (!b) b = q
      }
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (this.pinchDist > 0 && d > 0) this.hooks.zoom(this.pinchDist / d)
        this.pinchDist = d
        this.notify()
      }
      return
    }
    if (e.pointerId === this.stickId && p.moved) {
      let dx = (p.x - p.x0) / STICK_R
      let dy = (p.y - p.y0) / STICK_R
      const m = Math.hypot(dx, dy)
      if (m > 1) {
        dx /= m
        dy /= m
      }
      this.stickX = dx
      this.stickY = dy
      this.hooks.stickVisual(true, p.x0, p.y0, dx * STICK_R, dy * STICK_R)
      this.notify()
    }
  }

  private onUp = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId)
    this.ptrs.delete(e.pointerId)
    if (e.pointerId === this.stickId) this.endStick()
    if (!p) return
    if (this.pinching) {
      if (this.touchCount() < 2) this.pinching = false
      return
    }
    const isTap = !p.moved && performance.now() - p.t0 < TAP_MS && (p.type !== 'mouse' || e.button === 0)
    if (isTap) {
      const hit = this.hooks.pickGround(e.clientX, e.clientY)
      if (hit) {
        this.hooks.walkTo(hit)
        this.notify()
      }
    }
  }

  private onCancel = (e: PointerEvent) => {
    this.ptrs.delete(e.pointerId)
    if (e.pointerId === this.stickId) this.endStick()
    if (this.ptrs.size < 2) this.pinching = false
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY
    this.hooks.zoom(Math.exp(clamp(dy, -200, 200) * 0.0015))
    this.notify()
  }

  private endStick(): void {
    this.stickId = null
    this.stickX = this.stickY = 0
    this.hooks.stickVisual(false)
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}
