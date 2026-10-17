// 現の旅の進み方（段階3）。位置の更新と時刻から「いまの状態」と「起きたこと」を出す。描画に依存しない。
//
// 決まり（04 §2.2・§3.1・§5.3、02 F-01〜F-05・F-60〜F-64）:
// - 妖怪は、立ち止まった人にしか見えない。止まった（stop-detector の判定）うえで、地点の近く（半径 40m ＋ 精度のゆとり最大 10m）で
//   clearSec 秒そのままでいると澄んで、姿が現れる（appear）。歩き出すと、澄みかけた分はゆっくり引く。
// - 「足を止めた」ボタン: 直近数秒の速さを確かめ、止まっていれば判定を待たずに澄みはじめる。歩く速さなら「止まってから、もう一度」。
// - 一度会った地点は、いちど離れる（rearmM 以上）まで、止まるだけでは澄まない（ボタンなら澄む）。会話を終えた直後のため。
// - 道中（乗り物）・お休みの範囲（境内）・逢魔が時・夜は、出会いを止める。気配の表示は、道中とお休み以外では続ける（夜は気配だけ。F-62）。
// - 隠した地点（hidden。調べる地点の、頼まれる前・拾ったあと）は、気配・鈴・出会いのどれにも出さない。
// - 気配: kehaiRangeM（300m）以内の地点を、距離と方角つきで返す。bellRangeM（150m）に入ったときに一度だけ鈴を鳴らす（離れたら戻す）。
// - 位置は端末の中だけで使い、どこにも送らない（F-52）。保存もしない（進み具合だけを保存する）。

import type { LocalXZ } from '../geo'
import { type DetectorState, initialDetectorState, stepDetector } from '../location/stop-detector'
import type { Fix } from '../location/types'
import { type DayPhase, dayPhase, type PhaseInfo } from './sun'
import { TransitDetector } from './transit'
import { RestWatcher, type RestZoneLocal } from './zones'

/** 地点。canAppear・hidden は進み具合と時間帯で変わるので、呼ぶ側が書き換えてよい（次の tick から効く） */
export interface EngineSpot {
  id: string
  x: number
  z: number
  yokaiId?: string
  /** 澄むと出会い（appear）になる地点。ほかは気配だけで、澄むと faint */
  canAppear: boolean
  /** いまは無い地点（気配・鈴・出会いのどれにも出さない） */
  hidden?: boolean
}

export interface EngineTuning {
  kehaiRangeM: number
  bellRangeM: number
  /** 鈴をもう一度鳴らせるようになる距離（m） */
  bellRearmM: number
  encounterRadiusM: number
  /** 精度に応じて出会いの半径を広げる上限（m） */
  accBonusMaxM: number
  /** 止まってから澄むまで（秒） */
  clearSec: number
  /** 歩き出したときに引く速さ（1秒あたり） */
  fadePerSec: number
  /** 会った地点から、これだけ離れると、また止まるだけで澄むようになる（m） */
  rearmM: number
  /** 精度がこれより悪いと「位置が弱い」（m） */
  weakAccM: number
  /** 最後の位置がこれより古いと「位置が途切れている」（ms） */
  staleMs: number
  /** 覚えておく位置の長さ（ms） */
  keepMs: number
}

export const ENGINE_TUNING: EngineTuning = {
  kehaiRangeM: 300,
  bellRangeM: 150,
  bellRearmM: 200,
  encounterRadiusM: 40,
  accBonusMaxM: 10,
  clearSec: 3,
  fadePerSec: 0.6,
  rearmM: 70,
  weakAccM: 60,
  staleMs: 20_000,
  keepMs: 120_000,
}

/**
 * 直近 windowMs の動き。端末の速さ（ドップラー。位置の揺れに強い）があればそれで、なければ位置の差で見る。
 * 位置が来ていないときは「動いていない」とする（iPhone は止まると更新を休むため）
 */
export function movingRecently(fixes: readonly Fix[], now: number, windowMs = 4000): boolean {
  const pts: Fix[] = []
  for (let i = fixes.length - 1; i >= 0 && fixes[i].t >= now - windowMs; i--) if (fixes[i].t <= now) pts.push(fixes[i])
  if (pts.length < 2) return false
  const dev = pts.map((f) => f.spd).filter((v): v is number => v !== null)
  if (dev.length >= 2) return dev.reduce((a, b) => a + b, 0) / dev.length >= 0.7
  const a = pts[pts.length - 1]
  const b = pts[0]
  const dt = Math.max(1, (b.t - a.t) / 1000)
  // 位置の差は、止まっていても精度の分だけ揺れるので、ゆとりを大きくとる
  return Math.hypot(b.x - a.x, b.z - a.z) / dt >= 1.0 && Math.hypot(b.x - a.x, b.z - a.z) > Math.min(15, 2 + b.acc * 0.5)
}

export type Motion = 'locating' | 'weak' | 'transit' | 'rest' | 'walking' | 'stopped'

/** 出会いを止めている理由（null なら出会える） */
export type BlockReason = 'locating' | 'weak' | 'transit' | 'rest' | 'oumagatoki' | 'night' | 'busy' | null

export interface Kehai {
  spotId: string
  yokaiId?: string
  distM: number
  /** 方角（度。北=0、時計回り） */
  bearingDeg: number
  /** 近いほど 1 */
  strength: number
  canAppear: boolean
  /** 出会いの範囲の中 */
  inRange: boolean
}

export type EngineEvent =
  | { type: 'bell'; spotId: string }
  | { type: 'appear'; spotId: string }
  | { type: 'stop' }
  | { type: 'go' }
  | { type: 'transit-enter' }
  | { type: 'transit-exit' }
  | { type: 'rest-enter' }
  | { type: 'rest-exit' }
  | { type: 'phase'; phase: DayPhase }
  | { type: 'faint'; spotId: string }

export interface EngineView {
  motion: Motion
  block: BlockReason
  phase: PhaseInfo
  kehai: Kehai[]
  /** 出会いの範囲にいる、いちばん近い地点 */
  near: Kehai | null
  /** 澄み具合 0..1 */
  clearing: number
  /** いまの位置（ローカル座標）と精度。まだなければ null */
  position: (LocalXZ & { acc: number; heading: number | null }) | null
  speed: number | null
}

export class UtsutsuEngine {
  readonly fixes: Fix[] = []
  private detector: DetectorState = initialDetectorState(0)
  private readonly transit = new TransitDetector()
  private readonly rest: RestWatcher
  private clearingV = 0
  private lastPhase: DayPhase | null = null
  private readonly belled = new Set<string>()
  /** 会ったあと、離れるまで止まるだけでは澄まない地点 */
  private readonly disarmed = new Set<string>()
  /** 「足を止めた」で澄みはじめてよい（止まりの判定を待たない） */
  private manualStill = false
  private lastTick = 0
  view: EngineView

  constructor(
    private readonly spots: readonly EngineSpot[],
    restZones: readonly RestZoneLocal[],
    /** 時間帯を計算する場所（地域パックの原点） */
    private readonly where: { lat: number; lon: number },
    readonly tune: EngineTuning = ENGINE_TUNING,
  ) {
    this.rest = new RestWatcher(restZones)
    this.view = {
      motion: 'locating',
      block: 'locating',
      phase: dayPhase(Date.now(), where.lat, where.lon),
      kehai: [],
      near: null,
      clearing: 0,
      position: null,
      speed: null,
    }
  }

  get lastFix(): Fix | null {
    return this.fixes[this.fixes.length - 1] ?? null
  }

  addFix(f: Fix): void {
    this.fixes.push(f)
    const from = f.t - this.tune.keepMs
    let k = 0
    while (k < this.fixes.length && this.fixes[k].t < from) k++
    if (k) this.fixes.splice(0, k)
  }

  /** 会話を終えた地点: 離れるまで、止まるだけでは澄まない */
  disarm(spotId: string): void {
    this.disarmed.add(spotId)
    this.clearingV = 0
    this.manualStill = false
  }

  /**
   * 「足を止めた」ボタン。直近数秒が止まっていれば true（澄みはじめる）。
   * 'moving' は「止まってから、もう一度」、'nothing' は近くに気配がない、'blocked' は出会えない時（理由は view.block）
   */
  pressStop(now: number): 'ok' | 'moving' | 'nothing' | 'blocked' {
    const b = this.view.block
    if (b && b !== 'busy') return 'blocked'
    if (!this.view.near) return 'nothing'
    if (movingRecently(this.fixes, now)) return 'moving'
    this.manualStill = true
    this.disarmed.delete(this.view.near.spotId)
    return 'ok'
  }

  /**
   * 1秒に数回呼ぶ。now は位置の時計（ms）、clock は時間帯を決める時刻（ms。シミュレーターで差し替える）。
   * busy: 会話・帳を開いているなど、新しく出会いを始めてはいけないとき
   */
  tick(now: number, clock: number, busy: boolean): EngineEvent[] {
    const t = this.tune
    const dt = this.lastTick ? Math.min(2, Math.max(0, (now - this.lastTick) / 1000)) : 0
    this.lastTick = now
    const events: EngineEvent[] = []

    const phase = dayPhase(clock, this.where.lat, this.where.lon)
    if (phase.phase !== this.lastPhase) {
      if (this.lastPhase !== null) events.push({ type: 'phase', phase: phase.phase })
      this.lastPhase = phase.phase
    }

    const last = this.lastFix
    // 止まり・歩き出し
    const step = stepDetector(this.detector, this.fixes, now)
    this.detector = step.state
    if (step.detection) events.push({ type: step.detection.type === 'stop' ? 'stop' : 'go' })
    if (step.detection?.type === 'go') this.manualStill = false
    // 直近数秒で動いているか（止まりの判定は歩き出しを 10m 以上離れてから出すので、それより先に澄むのを止める）。
    // 位置が来ないだけのときは「動いている」にしない（iPhone は止まると更新を休むため）
    const movingNow = movingRecently(this.fixes, now)
    if (movingNow) this.manualStill = false

    // 道中
    const tr = this.transit.update(dt, this.fixes, now)
    if (tr === 'enter') events.push({ type: 'transit-enter' })
    if (tr === 'exit') events.push({ type: 'transit-exit' })

    // お休みの範囲
    if (last) {
      const r = this.rest.update(last)
      if (r === 'enter') events.push({ type: 'rest-enter' })
      if (r === 'exit') events.push({ type: 'rest-exit' })
    }

    let motion: Motion
    if (!last) motion = 'locating'
    else if (this.transit.inTransit) motion = 'transit'
    else if (this.rest.inside) motion = 'rest'
    else if (now - last.t > t.staleMs || last.acc > t.weakAccM) motion = 'weak'
    else motion = this.detector.mode === 'stopped' || this.manualStill ? 'stopped' : 'walking'

    // 気配
    const kehai: Kehai[] = []
    if (last && motion !== 'transit' && motion !== 'rest') {
      const radius = t.encounterRadiusM + Math.min(t.accBonusMaxM, last.acc * 0.5)
      for (const s of this.spots) {
        if (s.hidden) {
          // また出てきたときに、近くにいれば鈴が鳴るように
          this.belled.delete(s.id)
          continue
        }
        const dx = s.x - last.x
        const dz = s.z - last.z
        const d = Math.hypot(dx, dz)
        if (d > t.kehaiRangeM) {
          if (d > t.bellRearmM) this.belled.delete(s.id)
          if (d > t.rearmM) this.disarmed.delete(s.id)
          continue
        }
        const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360
        kehai.push({
          spotId: s.id,
          yokaiId: s.yokaiId,
          distM: d,
          bearingDeg: bearing,
          strength: Math.max(0, Math.min(1, 1 - (d - radius) / (t.kehaiRangeM - radius))),
          canAppear: s.canAppear,
          inRange: d <= radius,
        })
        if (d <= t.bellRangeM && !this.belled.has(s.id)) {
          this.belled.add(s.id)
          events.push({ type: 'bell', spotId: s.id })
        } else if (d > t.bellRearmM) this.belled.delete(s.id)
        if (d > t.rearmM) this.disarmed.delete(s.id)
      }
      kehai.sort((a, b) => a.distM - b.distM)
    }
    const near = kehai.find((k) => k.inRange) ?? null

    let block: BlockReason = null
    if (motion === 'locating' || motion === 'weak' || motion === 'transit' || motion === 'rest') block = motion
    else if (phase.phase === 'oumagatoki') block = 'oumagatoki'
    else if (phase.phase === 'night') block = 'night'
    else if (busy) block = 'busy'

    // 澄む
    const canClear = !block && near !== null && motion === 'stopped' && !movingNow && (this.manualStill || !this.disarmed.has(near.spotId))
    if (canClear && near) {
      this.clearingV = Math.min(1, this.clearingV + dt / t.clearSec)
      if (this.clearingV >= 1) {
        this.clearingV = 0
        this.manualStill = false
        this.disarmed.add(near.spotId)
        events.push(near.canAppear ? { type: 'appear', spotId: near.spotId } : { type: 'faint', spotId: near.spotId })
      }
    } else {
      this.clearingV = Math.max(0, this.clearingV - dt * t.fadePerSec)
    }
    if (block === 'transit' || block === 'rest') this.clearingV = 0

    this.view = {
      motion,
      block,
      phase,
      kehai,
      near,
      clearing: this.clearingV,
      position: last ? { x: last.x, z: last.z, acc: last.acc, heading: last.hdg } : null,
      speed: this.transit.speed,
    }
    return events
  }
}
