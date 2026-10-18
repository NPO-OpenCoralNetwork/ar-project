// 立山の時刻（物語の時計。段階4b）。家のページ（箱庭・白描の絵地図・入口の便り）は、どの土地でもこの1つの時計で動く。
// 描画に依存しない。
//
// - 日の出・日の入りは、いつも立山のふもとの原点（STORY_ORIGIN）で計算する（04 §7 10/18「立山の実際の日の入り」）。
//   テスト用の土地の位置は読まない（F-52。土地の位置は端末から出さないし、時計にも使わない）。現地の安全の決まり（暗くなるまで）は、
//   これまでどおり、その土地の太陽で見る（core/utsutsu/engine.ts）。
// - 時刻は日本時間（JST）で、端末の時間帯に関係なく同じ結果にする（ms に9時間を足して UTC の読み方で読む）。
//   端末のローカル時刻の読み方（getHours など）は使わない。テストは二つの時間帯（東京・ニューヨーク）で走らせる。
// - 物語の日は 04:00〜翌04:00（JST）。日付の鍵は 'YYYY-MM-DD'。夜中に遊んだ分は、その晩のうち。
// - その日（D）の太陽は、いつも D の12:00（JST）から求める（sunTimes は、夜中に呼ぶと次の日の日の出を返すため）。
// - 時間帯: 昼＝日の出〜逢魔が時、逢魔が時＝日の入りの30分前〜20分後（sun.ts と同じ）、夜＝それ以外（04:00〜日の出も夜）。
//   夜話の窓は、日の入り20分後〜翌04:00（04 §3.8「日の入り20分後から」）。

import { type DayPhase, OUMAGATOKI_AFTER_MIN, OUMAGATOKI_BEFORE_MIN, sunTimes } from '../utsutsu/sun'

/** 立山の時刻の原点（= iwakurajiPack.origin。テストで同じか確かめる。core は data を読まない） */
export const STORY_ORIGIN = { lat: 36.6076615, lon: 137.3146664 } as const
export const DAY_START_HOUR = 4
export const JST_MS = 9 * 3_600_000
/** 物語の日 'YYYY-MM-DD'（JST、04:00 区切り） */
export type DayKey = string

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export interface StoryClock {
  now: number
  day: DayKey
  /** D 04:00 JST（ms） */
  dayStart: number
  /** D+1 04:00 JST */
  dayEnd: number
  sunrise: number
  sunset: number
  /** sunset − 30分 */
  oumaStart: number
  /** sunset + 20分 */
  nightStart: number
  /** day: [sunrise, oumaStart) / oumagatoki: [oumaStart, nightStart) / night: それ以外（04:00〜日の出も夜） */
  phase: DayPhase
  /** 夜話の窓: nightStart ≤ now < dayEnd */
  yobanashiOpen: boolean
}

/** その時刻の物語の日（JST の 04:00 区切り） */
export function dayKeyOf(ms: number): DayKey {
  return new Date(ms + JST_MS - DAY_START_HOUR * HOUR_MS).toISOString().slice(0, 10)
}

/** 物語の日のはじめ（その日の 04:00 JST の ms） */
export function dayStartMs(day: DayKey): number {
  return Date.parse(`${day}T00:00:00Z`) - JST_MS + DAY_START_HOUR * HOUR_MS
}

/** n 日あとの物語の日（月末・年末もまたぐ） */
export function addDays(day: DayKey, n: number): DayKey {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

/** 日の通し番号（言い回しを日ごとに回すのに使う） */
export function dayIndex(day: DayKey): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
}

/** いまの物語の時計（立山の日の出・日の入りと、時間帯） */
export function storyClock(nowMs: number): StoryClock {
  const day = dayKeyOf(nowMs)
  const dayStart = dayStartMs(day)
  const dayEnd = dayStartMs(addDays(day, 1))
  const st = sunTimes(new Date(Date.parse(`${day}T12:00:00+09:00`)), STORY_ORIGIN.lat, STORY_ORIGIN.lon)
  // 日本では白夜・極夜は起きないが、念のため 6:00・18:00（JST）で埋める
  const sunrise = st.sunrise ?? dayStart + 2 * HOUR_MS
  const sunset = st.sunset ?? dayStart + 14 * HOUR_MS
  const oumaStart = sunset - OUMAGATOKI_BEFORE_MIN * 60_000
  const nightStart = sunset + OUMAGATOKI_AFTER_MIN * 60_000
  const phase: DayPhase = nowMs >= sunrise && nowMs < oumaStart ? 'day' : nowMs >= oumaStart && nowMs < nightStart ? 'oumagatoki' : 'night'
  return { now: nowMs, day, dayStart, dayEnd, sunrise, sunset, oumaStart, nightStart, phase, yobanashiOpen: nowMs >= nightStart && nowMs < dayEnd }
}

/** ISO の時刻が「今日」（物語の日のはじめ〜いま）か。読めない時刻は偽 */
export function isoInToday(iso: string | undefined, c: StoryClock): boolean {
  if (typeof iso !== 'string') return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= c.dayStart && t <= c.now
}

/** ISO の時刻の物語の日。読めなければ null */
export function dayOfIso(iso: string): DayKey | null {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? dayKeyOf(t) : null
}

/** JST の日付の字（'1月16日'）。'YYYY-MM-DD'（物語の日の鍵）を渡すと、その日付 */
export function jstDateLabel(msOrIso: number | string): string {
  if (typeof msOrIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(msOrIso)) {
    const [, m, d] = msOrIso.split('-').map(Number)
    return `${m}月${d}日`
  }
  const ms = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso)
  if (!Number.isFinite(ms)) return ''
  const j = new Date(ms + JST_MS)
  return `${j.getUTCMonth() + 1}月${j.getUTCDate()}日`
}

/** JST の時刻の字（'17:14'） */
export function jstTimeLabel(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const j = new Date(ms + JST_MS)
  return `${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`
}
