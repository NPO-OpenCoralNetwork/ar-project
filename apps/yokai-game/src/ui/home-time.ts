// 家の箱庭・白描の絵地図の「時間」（段階4b。04 §7 10/18、01-app-ux G1「時間帯」）。描画に依存しない（DOM も three.js も読まない）。
//
// - 「いま」（auto）: 立山の時刻（core/story/clock.ts。いつも STORY_ORIGIN の日の出・日の入り）の時間帯に合わせる。
//   昼 → 昼、逢魔が時 → 夕、夜 → 夜（04:00〜日の出も夜）。テスト用の土地の位置は読まない（F-52）。
// - 「時間」のボタン（箱庭は T キーも）で、いま → 昼 → 夕 → 夜 → いま と回す。手で選んだ時間帯は、このページの間だけ。
//   次に入ると、また「いま」から（保存の time は段階4a のために書くが、もう読まない）。
// - はじめて入ったとき（箱庭は操作のヒントをまだ閉じていない、絵地図はまだ耳を澄ましていない）は、その回だけ手で昼（04 §7 10/18 の 496）。
// - 箱庭の時間帯は見た目だけ。夜話・くらがり（逢魔が時）・時間のピースは、いつも立山の時刻で決まる（手で夕にしても、くらがりは来ない）。

import { storyClock } from '../core/story/clock'
import type { DayPhase } from '../core/utsutsu/sun'

export type TimeLook = 'day' | 'dusk' | 'night'
export type TimeMode = 'auto' | TimeLook

export interface HomeTime {
  readonly mode: TimeMode
  readonly look: TimeLook
  /** auto → day → dusk → night → auto。新しい look を返す */
  cycle(): TimeLook
  /** auto のとき、立山の時刻が変わっていたら新しい look（変わらなければ null）。manual なら null */
  tick(): TimeLook | null
  /** ボタンの字と読み上げ */
  label(): { value: string; aria: string }
}

/** 立山の時刻の時間帯 → 見た目の時間帯 */
const LOOK_OF: Record<DayPhase, TimeLook> = { day: 'day', oumagatoki: 'dusk', night: 'night' }
const LOOK_LABEL: Record<TimeLook, string> = { day: '昼', dusk: '夕', night: '夜' }
/** ボタンを押す順 */
const ORDER: readonly TimeMode[] = ['auto', 'day', 'dusk', 'night']

/** first: はじめて入った（箱庭は !saved.hintSeen、絵地図は !prefs.listened）→ mode 'day'（その回は手で昼）。ほかは 'auto' */
export function createHomeTime(o: { first: boolean; now: () => number }): HomeTime {
  const real = (): TimeLook => LOOK_OF[storyClock(o.now()).phase]
  let mode: TimeMode = o.first ? 'day' : 'auto'
  let look: TimeLook = mode === 'auto' ? real() : mode
  return {
    get mode() {
      return mode
    },
    get look() {
      return look
    },
    cycle() {
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
      look = mode === 'auto' ? real() : mode
      return look
    },
    tick() {
      if (mode !== 'auto') return null
      const next = real()
      if (next === look) return null
      look = next
      return next
    },
    label() {
      const l = LOOK_LABEL[look]
      return mode === 'auto'
        ? { value: `いま（${l}）`, aria: `時間を切り替える（いまは立山の時刻に合わせている。${l}）` }
        : { value: l, aria: `時間を切り替える（いまは${l}。立山の時刻に戻すには、夜のあとに「いま」）` }
    },
  }
}
