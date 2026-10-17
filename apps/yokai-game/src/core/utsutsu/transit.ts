// 道中（乗り物で移動中）の判定（02 F-61、04 §3.1「道中と着到」）。描画に依存しない。
//
// - 歩くより速く（既定 3.0m/s ≒ 時速11km）動き続けたら（enterSec 秒）道中にする。
//   速さは、端末の速さ（ドップラーで測るので位置の揺れに強い）があればその中央値、なければ窓の中の位置の差から求める。
//   精度の悪い位置（maxAccM 超）は使わない。位置が飛んだだけで道中にならないよう、窓の中に minFixes 以上の点を求める。
// - 道中から戻るのは、遅い（exitSpeed 未満）状態が exitSec 秒続いたとき。信号や駅の停車ではすぐ戻らないように長めにする。
//   戻ったら、ましろ【創作】「着いたね」（画面側）。
// 実機の電車・バスで要調整（段階3のテスト）。

import type { Fix } from '../location/types'

export interface TransitTuning {
  /** 速さを見る窓（ms） */
  windowMs: number
  minFixes: number
  maxAccM: number
  /** これより速いと乗り物とみなす（m/s） */
  enterSpeed: number
  /** これだけ続いたら道中にする（秒） */
  enterSec: number
  /** これより遅い状態が exitSec 続いたら、道中から戻る（m/s） */
  exitSpeed: number
  exitSec: number
}

export const TRANSIT_TUNING: TransitTuning = {
  windowMs: 10_000,
  minFixes: 3,
  maxAccM: 50,
  enterSpeed: 3.0,
  enterSec: 8,
  exitSpeed: 2.2,
  exitSec: 40,
}

function median(v: number[]): number {
  if (v.length === 0) return NaN
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** 直近 windowMs の速さ（m/s）。分からなければ null */
export function recentSpeed(fixes: readonly Fix[], now: number, tune: TransitTuning = TRANSIT_TUNING): number | null {
  const from = now - tune.windowMs
  const pts: Fix[] = []
  for (let i = fixes.length - 1; i >= 0 && fixes[i].t >= from; i--) if (fixes[i].t <= now && fixes[i].acc <= tune.maxAccM) pts.push(fixes[i])
  if (pts.length < tune.minFixes) return null
  pts.reverse()
  const dev = pts.map((f) => f.spd).filter((s): s is number => s !== null)
  if (dev.length >= tune.minFixes) return median(dev)
  const a = pts[0]
  const b = pts[pts.length - 1]
  const dt = (b.t - a.t) / 1000
  return dt > 0 ? Math.hypot(b.x - a.x, b.z - a.z) / dt : null
}

export class TransitDetector {
  inTransit = false
  private fastFor = 0
  private slowFor = 0
  /** 直近の速さ（確認用） */
  speed: number | null = null

  constructor(private readonly tune: TransitTuning = TRANSIT_TUNING) {}

  /** dt 秒ごとに呼ぶ。道中に入った・出たときに 'enter' / 'exit' を返す */
  update(dt: number, fixes: readonly Fix[], now: number): 'enter' | 'exit' | null {
    const t = this.tune
    const v = recentSpeed(fixes, now, t)
    this.speed = v
    if (!this.inTransit) {
      this.fastFor = v !== null && v >= t.enterSpeed ? this.fastFor + dt : 0
      if (this.fastFor >= t.enterSec) {
        this.inTransit = true
        this.slowFor = 0
        return 'enter'
      }
      return null
    }
    // 位置が来ない間（トンネル・地下）は道中のまま
    this.slowFor = v !== null && v < t.exitSpeed ? this.slowFor + dt : 0
    if (this.slowFor >= t.exitSec) {
      this.inTransit = false
      this.fastFor = 0
      return 'exit'
    }
    return null
  }

  reset(): void {
    this.inTransit = false
    this.fastFor = 0
    this.slowFor = 0
  }
}
