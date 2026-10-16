// 耳を澄ます／立ち止まる（出会いの手前）の進み具合。描画に依存しない。
//
// 夢の旅（04 §2.2・§3.1、02 F-27）: 気配の地点の近く（6m）で、ボタンを長押しするか、約2秒そのまま止まると、
// 霞が寄って夢の姿が浮かぶ。歩くと途切れる（ゆっくり引く）。お休みの範囲（境内）では起こさない（04 §3.1）。
// 現の旅でも「数秒ほぼ動かずにいると澄む」に同じ仕組みを使う想定（速さと近さの判定だけを差し替える）。

export interface ListenTuning {
  /** 満ちるまでの秒数（長押し・止まる、どちらも） */
  fillSec: number
  /** 止まってから、ひとりでに満ちはじめるまでの秒数 */
  settleSec: number
  /** これより速いと「歩いている」（m/s） */
  movingSpeed: number
  /** 途切れたときに引く速さ（1秒あたり） */
  fadePerSec: number
  /** これ以上進んでから途切れたら「途切れた」と知らせる */
  interruptAt: number
}

export const LISTEN_TUNING: ListenTuning = {
  fillSec: 2.0,
  settleSec: 0.35,
  movingSpeed: 0.25,
  fadePerSec: 0.9,
  interruptAt: 0.2,
}

export interface ListenInput {
  /** 気配の地点の近く（夢の旅は 6m） */
  near: boolean
  /** ボタン（または Space キー）を押している */
  held: boolean
  /** アバターの速さ（m/s） */
  speed: number
  /** お休みの範囲の中か（中では起こさない） */
  inRest: boolean
  /** 会話や曼荼羅帳を開いているなど、始めてはいけないとき */
  blocked: boolean
}

export type ListenEvent = 'none' | 'start' | 'interrupted' | 'complete'

export class ListenGauge {
  /** 0..1 */
  progress = 0
  private stillFor = 0
  /** 止まるだけで満ちてよいか（いちど地点を離れるまでは、止まっていても始めない。会話を終えた直後のため） */
  private armed = true
  private wasActive = false

  constructor(readonly tune: ListenTuning = LISTEN_TUNING) {}

  /** 会話のあとなど: 地点からいちど離れるまで、止まるだけでは始めない（ボタンなら始められる） */
  disarm(): void {
    this.armed = false
    this.progress = 0
    this.wasActive = false
  }

  reset(): void {
    this.progress = 0
    this.stillFor = 0
    this.wasActive = false
  }

  get isHeldOrStill(): boolean {
    return this.wasActive
  }

  update(dt: number, i: ListenInput): ListenEvent {
    const t = this.tune
    if (!i.near) this.armed = true
    const moving = i.speed > t.movingSpeed
    this.stillFor = moving ? 0 : this.stillFor + dt
    const allowed = i.near && !i.inRest && !i.blocked && !moving
    const active = allowed && (i.held || (this.armed && this.stillFor >= t.settleSec))
    let ev: ListenEvent = 'none'
    if (active) {
      if (!this.wasActive && this.progress < 0.02) ev = 'start'
      this.progress = Math.min(1, this.progress + dt / t.fillSec)
      if (this.progress >= 1) {
        ev = 'complete'
        this.progress = 0
        this.wasActive = false
        this.armed = false
        this.stillFor = 0
        return ev
      }
    } else {
      if (this.wasActive && this.progress >= t.interruptAt && (moving || !i.near)) ev = 'interrupted'
      this.progress = Math.max(0, this.progress - dt * t.fadePerSec)
    }
    this.wasActive = active
    return ev
  }
}
