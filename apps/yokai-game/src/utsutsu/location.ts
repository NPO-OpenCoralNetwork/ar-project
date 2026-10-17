// 現の旅の位置の出どころ。本物の GPS（GeoSource）と、開発用の位置シミュレーター（SimSource。02 F-06）。
// どちらも、地域パックの原点を基準にした Fix（core/location）を onFix に渡す。位置はどこにも送らず、保存もしない（F-52）。
//
// 本物の GPS（段階0.5 の検証ページと同じやり方）:
// - watchPosition（高精度、キャッシュなし）。表示中なのに 30秒位置が来ない、または画面が戻って 5秒来ないときは張り直す
//   （iOS ではバックグラウンドから戻ったあと通知が止まったままになる例がある）。
// - 画面を点けたままにする（Screen Wake Lock）。iPhone の Web アプリは表示中しか位置を取れないので、ポケットの中でも点けておく（04 §2.2）。

import { type LatLon, toLatLon } from '../core/geo'
import { makeFix, type RawPosition } from '../core/location/fix'
import type { Fix } from '../core/location/types'

export interface LocationSource {
  readonly kind: 'gps' | 'sim'
  start(): void
  stop(): void
}

export type GeoProblem = 'denied' | 'unavailable' | 'insecure' | 'no-wake-lock' | null

const REWATCH_AFTER_MS = 30_000
const REWATCH_AFTER_VISIBLE_MS = 5_000

export class GeoSource implements LocationSource {
  readonly kind = 'gps'
  private watchId: number | null = null
  private prev: Fix | null = null
  private lastFixReal = 0
  private lastWatchReal = 0
  private visibleSince = 0
  private timer = 0
  private wake: WakeLockSentinel | null = null
  private running = false
  problem: GeoProblem = null
  wakeHeld = false

  constructor(
    private readonly origin: LatLon,
    private readonly onFix: (f: Fix) => void,
    private readonly onProblem: (p: GeoProblem) => void,
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      this.setProblem(window.isSecureContext ? 'unavailable' : 'insecure')
      return
    }
    this.watch()
    this.timer = window.setInterval(() => this.watchdog(), 2000)
    document.addEventListener('visibilitychange', this.onVisibility)
    void this.acquireWake()
  }

  stop(): void {
    this.running = false
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
    window.clearInterval(this.timer)
    document.removeEventListener('visibilitychange', this.onVisibility)
    void this.wake?.release().catch(() => {})
    this.wake = null
    this.wakeHeld = false
  }

  private setProblem(p: GeoProblem): void {
    this.problem = p
    this.onProblem(p)
  }

  private watch(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.lastWatchReal = Date.now()
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        this.lastFixReal = Date.now()
        if (this.problem === 'unavailable') this.setProblem(null)
        this.push({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, spd: p.coords.speed, hdg: p.coords.heading, pt: p.timestamp })
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) this.setProblem('denied')
        else this.setProblem('unavailable')
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
  }

  private push(raw: RawPosition): void {
    const f = makeFix(raw, Date.now(), this.origin, this.prev)
    this.prev = f
    this.onFix(f)
  }

  private watchdog(): void {
    if (!this.running || this.problem === 'denied' || document.visibilityState !== 'visible') return
    const real = Date.now()
    const since = real - Math.max(this.lastFixReal, this.lastWatchReal)
    const afterVisible = this.visibleSince > 0 && real - this.visibleSince > REWATCH_AFTER_VISIBLE_MS && this.lastFixReal < this.visibleSince
    if (since > REWATCH_AFTER_MS || afterVisible) {
      this.visibleSince = 0
      this.watch()
    }
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this.visibleSince = Date.now()
      void this.acquireWake()
    }
  }

  private async acquireWake(): Promise<void> {
    if (!('wakeLock' in navigator)) {
      this.wakeHeld = false
      if (!this.problem) this.setProblem('no-wake-lock')
      return
    }
    if (this.wake && !this.wake.released) return
    try {
      const s = await navigator.wakeLock.request('screen')
      this.wake = s
      this.wakeHeld = true
      if (this.problem === 'no-wake-lock') this.setProblem(null)
      s.addEventListener('release', () => {
        this.wakeHeld = false
        // 表示中に外れた（低電力モードの切り替えなど）なら、少し待って取り直す
        if (this.running && document.visibilityState === 'visible') window.setTimeout(() => void this.acquireWake(), 1000)
      })
    } catch {
      this.wakeHeld = false
      if (!this.problem) this.setProblem('no-wake-lock')
    }
  }
}

// ---------------------------------------------------------------- 位置シミュレーター（開発用。F-06）

export interface SimSettings {
  /** 歩く速さ（m/s）。0 で止まる */
  speed: number
  /** 精度（m）。位置のずれもこの大きさに合わせる */
  acc: number
  /** 端末の速さを渡さない（Wi-Fi 測位や、iPhone の再開直後の真似） */
  noDeviceSpeed: boolean
  /** 止まって数秒たつと位置の更新を休む（iPhone の真似） */
  pauseWhenStill: boolean
}

/**
 * 本物の座標の地図の上で、瞬間移動・目的地まで歩く・速さ・GPS のずれを切り替える。
 * 夢の旅の箱庭とは別物で、共通にするのはデータとロジックだけ（05 §5）。
 */
export class SimSource implements LocationSource {
  readonly kind = 'sim'
  /** 本当の位置（ずれを足す前） */
  x: number
  z: number
  private target: { x: number; z: number } | null = null
  private prev: Fix | null = null
  private timer = 0
  private stillFor = 0
  private nx = 0
  private nz = 0
  private seed = 7
  readonly settings: SimSettings = { speed: 1.3, acc: 6, noDeviceSpeed: false, pauseWhenStill: false }

  constructor(
    private readonly origin: LatLon,
    start: { x: number; z: number },
    private readonly onFix: (f: Fix) => void,
  ) {
    this.x = start.x
    this.z = start.z
  }

  start(): void {
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.step(1), 1000)
    this.step(0)
  }

  stop(): void {
    window.clearInterval(this.timer)
  }

  /** 目的地（ローカル座標）へ、いまの速さで歩きはじめる */
  walkTo(x: number, z: number): void {
    this.target = { x, z }
  }

  teleport(x: number, z: number): void {
    this.x = x
    this.z = z
    this.target = null
    this.step(0)
  }

  halt(): void {
    this.target = null
  }

  get moving(): boolean {
    return this.target !== null && this.settings.speed > 0
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  private step(dt: number): void {
    const s = this.settings
    let v = 0
    let hdg: number | null = null
    if (this.target && s.speed > 0 && dt > 0) {
      const dx = this.target.x - this.x
      const dz = this.target.z - this.z
      const d = Math.hypot(dx, dz)
      const go = Math.min(d, s.speed * dt)
      if (d > 0.01) {
        this.x += (dx / d) * go
        this.z += (dz / d) * go
        v = go / dt
        hdg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360
      }
      if (d - go < 0.01) this.target = null
    }
    this.stillFor = v > 0 ? 0 : this.stillFor + dt
    if (s.pauseWhenStill && this.stillFor > 4) return
    // ずれ: ゆっくり動く（AR(1)）。精度の 0.4 倍くらいの大きさ
    const k = 0.85
    const amp = s.acc * 0.4 * Math.sqrt(1 - k * k)
    this.nx = this.nx * k + (this.rand() - 0.5) * 2 * amp
    this.nz = this.nz * k + (this.rand() - 0.5) * 2 * amp
    const ll = toLatLon({ x: this.x + this.nx, z: this.z + this.nz }, this.origin)
    const now = Date.now()
    const raw: RawPosition = {
      lat: ll.lat,
      lon: ll.lon,
      acc: s.acc * (0.85 + this.rand() * 0.3),
      spd: s.noDeviceSpeed ? null : Math.max(0, v + (this.rand() - 0.5) * 0.15),
      hdg,
      pt: now,
    }
    const f = makeFix(raw, now, this.origin, this.prev)
    this.prev = f
    this.onFix(f)
  }
}
