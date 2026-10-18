// 出現の表（02 F-03・04 §3.1）と、調べる地点（04 §3.4）の引き方。描画に依存しない（夢の旅・現の旅・白描の絵地図で同じものを使う）。
//
// - 主ストーリーの妖怪は決まった地点に置く（F-04）。それとは別に、寄り道の妖怪は場所の種類と時間帯で出る。
//   表はデータ（src/data/appearance.json。F-70）。試作では「水辺」1種類だけ。
// - 寄り道では悩みを始めない・縁も上げない（04 §3.1・§3.3）。寄り道の台本（雑談）だけを使う。
// - 地点の役目（spotRole）と、家の側の夜の決まり（canListenAtHome）も、ここに1か所だけ置く（三つの画面で食い違わないように）。

import { checkConditions } from './dialogue'
import type { ProgressStore } from './progress'
import type { AppearanceTable, ClueDef, TimeSlot, Travel } from './types'

export type Appearance =
  /** 寄り道の妖怪が出る（この台本で話す） */
  | { mode: 'appear'; yokaiId: string; script: string }
  /** 気配だけ（夜・まだ会っていない・まだ作っていない妖怪） */
  | { mode: 'kehai'; reason: 'night' | 'unmet' | 'pending' | 'none' }

/** 場所の種類と時間帯から、いま出るものを引く（表に行の無い場所の種類は、気配だけ） */
export function resolveAppearance(table: AppearanceTable, place: string, time: TimeSlot, progress: ProgressStore, travel: Travel): Appearance {
  const row = table.rows.find((r) => r.placeKind === place)
  const slot = row?.slots[time]
  if (!slot) return { mode: 'kehai', reason: 'none' }
  if (slot.kehaiOnly) return { mode: 'kehai', reason: time === 'night' ? 'night' : 'none' }
  if (slot.pending || !slot.yokaiId || !slot.script) return { mode: 'kehai', reason: 'pending' }
  if (!checkConditions(slot.when, progress, travel, slot.yokaiId)) return { mode: 'kehai', reason: 'unmet' }
  return { mode: 'appear', yokaiId: slot.yokaiId, script: slot.script }
}

/** 調べる地点の気配を、いま出すか（悩みを頼まれ、札をまだ拾っていない間） */
export function clueActive(clue: ClueDef, progress: ProgressStore, travel: Travel): boolean {
  return checkConditions(clue.showWhen, progress, travel)
}

/** 箱庭の時間（昼・夕・夜）を、表の時間帯に当てる（06 §2・§6.9） */
export function timeSlotOfDiorama(time: 'day' | 'dusk' | 'night'): TimeSlot {
  return time === 'dusk' ? 'oumagatoki' : time
}

/**
 * 家の側（箱庭・白描の絵地図）で、いま耳を澄ませるか。夜は、どの地点も気配だけ（04 §2.5「箱庭も夜は気配だけ」）。
 * 決まった妖怪・調べる地点・寄り道の地点のどれも同じ（夕は会える。寄り道の地点は出現の表のとおり）
 */
export function canListenAtHome(time: 'day' | 'dusk' | 'night'): boolean {
  return time !== 'night'
}

/** 家の側で、夜に名所へ寄ったときの言葉（【創作】。現地の状態の帯「夜は、気配だけ」と同じ） */
export const HOME_NIGHT_KEHAI = '夜は、気配だけ。'

/** 地点の役目。yokai＝決まった地点の妖怪（F-04）、clue＝調べる地点（04 §3.4）、wander＝寄り道の地点（出現の表の行。04 §3.1） */
export type SpotRole = 'yokai' | 'clue' | 'wander'

/**
 * 地域パック・テスト用の土地の地点に、役目をつける（夢の旅・現の旅・白描の絵地図で同じ順に見る）:
 * 妖怪がいれば決まった地点 → 調べる地点 → 場所の種類が出現の表の行なら寄り道の地点。どれでもなければ null（置かない）
 */
export function spotRole(spot: { yokaiId?: string; clueId?: string; placeKind?: string }, table: AppearanceTable): SpotRole | null {
  if (spot.yokaiId) return 'yokai'
  if (spot.clueId) return 'clue'
  if (spot.placeKind && table.rows.some((r) => r.placeKind === spot.placeKind)) return 'wander'
  return null
}

/** 表の点検（読み込み時）。知らない妖怪・台本と、同じ場所の種類の行が二つあること（あとの行は使われない）を文で返す */
export function validateAppearance(table: AppearanceTable, yokai: Set<string>, scripts: Set<string>): string[] {
  const errs: string[] = []
  const kinds = new Set<string>()
  for (const r of table.rows) {
    if (kinds.has(r.placeKind)) errs.push(`出現の表 ${r.placeKind}: 同じ場所の種類の行が二つある（あとの行は使われない）`)
    kinds.add(r.placeKind)
  }
  for (const r of table.rows)
    for (const t of ['day', 'oumagatoki', 'night'] as const) {
      const s = r.slots[t]
      if (!s) {
        errs.push(`出現の表 ${r.placeKind}: ${t} のマスがない`)
        continue
      }
      if (s.pending || s.kehaiOnly) continue
      if (!s.yokaiId || !yokai.has(s.yokaiId)) errs.push(`出現の表 ${r.placeKind}/${t}: 妖怪 ${s.yokaiId ?? '(なし)'} がいない`)
      if (!s.script || !scripts.has(s.script)) errs.push(`出現の表 ${r.placeKind}/${t}: 台本 ${s.script ?? '(なし)'} がない`)
    }
  return errs
}
