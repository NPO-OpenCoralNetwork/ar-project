// 夜話（04 §3.8・§7 10/18、段階4b）。夜（立山の日の入り20分後〜翌4時）に、その日に会った「なじみ」以上の妖怪が、便りの画面に話しに来る。
// 描画に依存しない（画面は ui/tayori.ts。会話は GenEncounter で record: 'visit'）。
//
// - 一晩に一つだけ（ほかに来られる妖怪は、ボタンの無い気配の一行だけ。04 §3.8。「聞きそびれ」にしない）。
// - 来るのは、夜話をいちばん長く聞いていない妖怪（聞いたことが無ければいちばん先）。同じなら、今日あとに会ったほう、次に yokai.json の順。
//   場面は、上から順に、まだ聞いていない入口で条件を満たすもの。聞き終えたら again（短いあいさつ）。
// - 始めた時に、その夜の記録を書く（startNight）。途中で閉じても、同じ妖怪・同じ場面で「つづきを聞く」（選び直さない）。
// - 開かなかった夜は、何も残さない・出さない・あとで触れない（04 §3.8）。現の旅（utsutsu）では始めない（画面の決まり）。
// - 夜話は会ったことにしない（lastMet・dreamMet・縁は変えない）。会話の回数（糸の艶）だけ1つ増える（noteVisit）。

import { dayIndex, type DayKey, isoInToday, type StoryClock } from './clock'
import { checkConditions } from './dialogue'
import { bondRank, type ProgressStore } from './progress'
import type { DialogueScript, StoryData } from './types'

export type Tonight =
  | { state: 'none' }
  | { state: 'later'; nightStart: number }
  | { state: 'quiet' }
  | { state: 'offer' | 'resume'; yokai: string; script: string; entry: string; others: string[] }
  | { state: 'done'; yokai: string; others: string[] }

/** 聞き終えた夜話の場面の印（finishNight が立てる） */
const heardFlag = (yokai: string, entry: string): string => `yb:${yokai}:${entry}`

/** 夜話の台本（了承待ち・種類の違う台本は無いものとする） */
function scriptOf(story: StoryData, yokai: string): DialogueScript | null {
  const id = story.yokai[yokai]?.yobanashi
  const s = id ? story.scripts[id] : undefined
  if (!s || s.needsConsent || s.kind !== 'yobanashi' || s.yokaiId !== yokai) return null
  return s
}

/**
 * 最後に夜話を聞いた時（ms。聞いたことが無ければ −∞）。yb:<妖怪>:* の印の flagAt のいちばん新しいもの。
 * finishNight は、聞き終えるたびに（again をくり返し聞いても）flagAt を書き直すので、場面を聞き終えた妖怪も順番に回る
 */
function lastHeardMs(p: ProgressStore, yokai: string): number {
  const s = p.get()
  let best = -Infinity
  const head = `yb:${yokai}:`
  for (const [k, v] of Object.entries(s.flags)) {
    if (!v || !k.startsWith(head)) continue
    const t = Date.parse(s.flagAt[k] ?? '')
    // 時の分からない印は、いちばん古い「聞いた」として扱う（聞いたことの無い妖怪よりはあと）
    best = Math.max(best, Number.isFinite(t) ? t : -Number.MAX_VALUE)
  }
  return best
}

/** 夜話に来られる妖怪（好む順）: なじみ以上・lastMet が今日・夜話の台本があり了承待ちでない・入口が1つは成り立つ */
export function eligibleTonight(clock: StoryClock, p: ProgressStore, story: StoryData): string[] {
  const s = p.get()
  const order = Object.keys(story.yokai)
  const list: { id: string; heard: number; met: number; i: number }[] = []
  order.forEach((id, i) => {
    const y = s.yokai[id]
    if (!y || bondRank(y.bond) < bondRank('najimi')) return
    if (!isoInToday(y.lastMet?.at, clock)) return
    const script = scriptOf(story, id)
    if (!script) return
    if (!script.entries.some((e) => checkConditions(e.when, p, 'yume', id, story.quests, clock))) return
    list.push({ id, heard: lastHeardMs(p, id), met: Date.parse(y.lastMet?.at ?? ''), i })
  })
  list.sort((a, b) => a.heard - b.heard || b.met - a.met || a.i - b.i)
  return list.map((x) => x.id)
}

/** 今夜の夜話（書かない。始めるのは画面の側で startNight） */
export function tonight(clock: StoryClock, p: ProgressStore, story: StoryData): Tonight {
  if (!clock.yobanashiOpen) {
    if (clock.now < clock.nightStart && eligibleTonight(clock, p, story).length) return { state: 'later', nightStart: clock.nightStart }
    return { state: 'none' }
  }
  const eligible = eligibleTonight(clock, p, story)
  const rec = p.night(clock.day)
  if (rec) {
    const others = eligible.filter((y) => y !== rec.yokai)
    if (rec.done) return { state: 'done', yokai: rec.yokai, others }
    return { state: 'resume', yokai: rec.yokai, script: story.yokai[rec.yokai]?.yobanashi ?? '', entry: rec.entry, others }
  }
  if (!eligible.length) return { state: 'quiet' }
  const yokai = eligible[0]
  const script = scriptOf(story, yokai)
  if (!script) return { state: 'quiet' }
  return { state: 'offer', yokai, script: script.id, entry: pickEntry(script, yokai, clock, p, story), others: eligible.slice(1) }
}

/** 聞いていない入口（上から、when が成り立つもの。again を除く）。無ければ 'again' */
export function pickEntry(script: DialogueScript, yokai: string, clock: StoryClock, p: ProgressStore, story: StoryData): string {
  for (const e of script.entries) {
    if (!e.id || e.id === 'again') continue
    if (p.flag(heardFlag(yokai, e.id))) continue
    if (checkConditions(e.when, p, 'yume', yokai, story.quests, clock)) return e.id
  }
  return 'again'
}

/** 夜話に来なかった、その日に会ったなじみの妖怪の気配の一行（日で回す）。無ければ null */
export function kehaiLine(story: StoryData, yokai: string, day: DayKey): string | null {
  const lines = story.tayori.nightKehai[yokai]
  if (!lines?.length) return null
  return lines[((dayIndex(day) % lines.length) + lines.length) % lines.length] ?? null
}

/** 便りの「新」に入れるか（来ている・つづきがある夜だけ） */
export const yobanashiNews = (t: Tonight): boolean => t.state === 'offer' || t.state === 'resume'
