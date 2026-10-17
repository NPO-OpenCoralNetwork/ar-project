// 出現の表（02 F-03・04 §3.1）と、調べる地点（04 §3.4）の引き方。描画に依存しない（夢の旅・現の旅・白描の絵地図で同じものを使う）。
//
// - 主ストーリーの妖怪は決まった地点に置く（F-04）。それとは別に、寄り道の妖怪は場所の種類と時間帯で出る。
//   表はデータ（src/data/appearance.json。F-70）。試作では「水辺」1種類だけ。
// - 寄り道では悩みを始めない・縁も上げない（04 §3.1・§3.3）。寄り道の台本（雑談）だけを使う。

import { checkConditions } from './dialogue'
import type { ProgressStore } from './progress'
import type { AppearanceTable, ClueDef, PlaceKind, TimeSlot, Travel } from './types'

export type Appearance =
  /** 寄り道の妖怪が出る（この台本で話す） */
  | { mode: 'appear'; yokaiId: string; script: string }
  /** 気配だけ（夜・まだ会っていない・まだ作っていない妖怪） */
  | { mode: 'kehai'; reason: 'night' | 'unmet' | 'pending' | 'none' }

/** 場所の種類と時間帯から、いま出るものを引く */
export function resolveAppearance(table: AppearanceTable, place: PlaceKind, time: TimeSlot, progress: ProgressStore, travel: Travel): Appearance {
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

/** 表の点検（読み込み時）。知らない妖怪・台本を文で返す */
export function validateAppearance(table: AppearanceTable, yokai: Set<string>, scripts: Set<string>): string[] {
  const errs: string[] = []
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
