// 今日の絵解き（04 §2.4・§3.6・§7 10/18、段階4b）。「今日はここまで」で、ましろとその日を振り返り、開いた札を1〜3枚選んで、
// 決まった一言をそえた横長の和紙の札にする。描画に依存しない（画面は ui/etoki-sheet.ts）。
//
// - 札は開いた札から（今日開いた札を先に、そのあと新しい順）。名産の札もよい。了承待ちの札は出さない（02 F-71）。
//   雷鳥の札と、神仏（立山権現・阿弥陀如来）の札は、同じ絵解きに並べない（04 §3.6。札の topics）。
// - 一言は決まった言葉から選ぶだけ（自由な字は書かない。04 §3.2）。札の添え書き（ましろ）は【創作】。
// - その日（物語の日）に1枚。同じ日につくり直すと入れ替える。節・旅印は終えない（02 F-45）。共有・書き出しはしない（F-12）。
// - はじめての絵解きでは、ましろだけの台本 etoki-first を走らせる（絵解きのピースに線が入り、mandala-2 が開く。現地でつくれば彩色）。

import { isoInToday, type StoryClock } from './clock'
import { checkConditions, isPendingConsent } from './dialogue'
import type { MemoReader } from './memo'
import type { ProgressStore } from './progress'
import { fillTokens, tokenProblems, YOBINA_TOKEN } from './text'
import type { Condition, EtokiFile, LoreCard, QuestDef, StoryData, Travel } from './types'

export const ETOKI_PIECE = 'sato-etoki'
export const ETOKI_SCRIPT = 'etoki-first'
/** 選べる札の数 */
export const ETOKI_PICK_MAX = 3

export interface EtokiEnv {
  progress: ProgressStore
  story: StoryData
  clock: StoryClock
  memo?: MemoReader
}

/** 今日会った妖怪（lastMet が今日。yokai.json の順）。まだ会っていない（met の無い）妖怪の名前は出さない（縁帳と同じ） */
export function metTodayIds(env: EtokiEnv): string[] {
  const s = env.progress.get()
  return Object.keys(env.story.yokai).filter((id) => !!s.yokai[id]?.met && isoInToday(s.yokai[id]?.lastMet?.at, env.clock))
}

/** 悩みが解けた条件の、それぞれの時刻（フラグを書いた時・渡した時・札を開いた時・会った時・縁が上がった時・ピースが入った時） */
function conditionTimes(conds: Condition[], q: QuestDef, p: ProgressStore): string[] {
  const s = p.get()
  const out: (string | undefined)[] = []
  for (const c of conds) {
    if ('flag' in c) out.push(s.flagAt[c.flag])
    else if ('item' in c) out.push(c.state === 'given' ? s.items[c.item]?.given?.at : c.state === 'held' ? s.items[c.item]?.got.at : undefined)
    else if ('card' in c) out.push(s.cards[c.card]?.at)
    else if ('met' in c) out.push(s.yokai[c.yokai ?? q.yokai[0]]?.met?.at)
    else if ('bondAtLeast' in c) out.push(s.yokai[c.yokai ?? q.yokai[0]]?.bondGained?.at)
    else if ('piece' in c) out.push(s.pieces[c.piece]?.at)
  }
  return out.filter((x): x is string => typeof x === 'string')
}

/** 今日解けた悩み（done が成り立ち、done の条件の時刻（flagAt・given.at・cards.at・met.at）の一番新しいものが今日）。quests.json の順で最初 */
export function questDoneToday(env: EtokiEnv): QuestDef | null {
  const { progress: p, story, clock } = env
  for (const q of story.quests) {
    if (!q.done.length || !checkConditions(q.done, p, 'yume', q.yokai[0], story.quests, clock)) continue
    const times = conditionTimes(q.done, q, p)
    if (!times.length) continue
    const latest = times.reduce((a, b) => (a >= b ? a : b))
    if (isoInToday(latest, clock)) return q
  }
  return null
}

/** 開いた札（了承待ちを除く）。today: 今日開いた順、earlier: 新しい順 */
export function etokiPool(env: EtokiEnv): { today: string[]; earlier: string[] } {
  const { progress: p, story, clock } = env
  const opened = Object.entries(p.get().cards).filter(([id]) => story.cards[id] && !isPendingConsent(story.cards[id]))
  const today = opened.filter(([, g]) => isoInToday(g.at, clock)).sort(([a, x], [b, y]) => (x.at < y.at ? -1 : x.at > y.at ? 1 : a < b ? -1 : 1))
  const todaySet = new Set(today.map(([id]) => id))
  const earlier = opened.filter(([id]) => !todaySet.has(id)).sort(([a, x], [b, y]) => (x.at > y.at ? -1 : x.at < y.at ? 1 : a < b ? -1 : 1))
  return { today: today.map(([id]) => id), earlier: earlier.map(([id]) => id) }
}

/** ましろの振り返り（埋め込み済みの文）。canMake: 開いた札が1枚以上 */
export function etokiRecap(env: EtokiEnv): { lines: string[]; canMake: boolean } {
  const { story, memo } = env
  const r = story.etoki.recap
  const met = metTodayIds(env)
  const pool = etokiPool(env)
  const canMake = pool.today.length + pool.earlier.length > 0
  const lines = [fillTokens(r.open, memo)]
  lines.push(met.length ? fillTokens(r.met, memo, { names: namesText(met, story) }) : fillTokens(r.metNone, memo))
  const q = questDoneToday(env)
  if (q?.recap) lines.push(fillTokens(q.recap, memo))
  else if (pool.today.length) lines.push(fillTokens(r.newCard, memo))
  lines.push(fillTokens(canMake ? r.pick : r.noCards, memo))
  return { lines, canMake }
}

/** 並べてよい組み合わせか（雷鳥の札と神仏の札を同じ絵解きに並べない。04 §3.6） */
export function etokiPairAllowed(ids: string[], cards: Record<string, LoreCard>): boolean {
  const has = (t: 'raicho' | 'kami') => ids.some((id) => cards[id]?.topics?.includes(t))
  return !(has('raicho') && has('kami'))
}

/** 札の添え書きの鍵: 今日解けた悩みがあれば 'q:<id>'、今日会った妖怪がいれば 'met:<a,b>'、なければ 'none' */
export function captionKey(env: EtokiEnv): string {
  const q = questDoneToday(env)
  if (q) return `q:${q.id}`
  const met = metTodayIds(env)
  return met.length ? `met:${met.join(',')}` : 'none'
}

/** 添え書きの鍵から、いまのデータの文（つくった時の鍵を残し、読む時に文にする） */
export function captionText(key: string, story: StoryData): string {
  const c = story.etoki.caption
  if (key.startsWith('q:')) {
    const q = story.quests.find((x) => x.id === key.slice(2))
    return q?.recap ? fillTokens(q.recap) : fillTokens(c.none)
  }
  if (key.startsWith('met:')) {
    const ids = key.slice(4).split(',').filter((id) => story.yokai[id])
    if (ids.length) return fillTokens(c.met, null, { names: namesText(ids, story) })
  }
  return fillTokens(c.none)
}

/** 妖怪の名前の並べ方（1: X、2: XとY、3+: X、Y、Z） */
export function namesText(ids: string[], story: StoryData): string {
  const names = ids.map((id) => story.yokai[id]?.name).filter((n): n is string => !!n)
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]}と${names[1]}`
  return names.join('、')
}

/**
 * 今日の絵解きを残す。札は開いた札（了承待ちを除く）から、選んだ順に3枚まで（並べてはいけない組み合わせになる札は飛ばす）。
 * 一言は決まった言葉の id（言葉そのものを渡しても id に直す。知らなければ無し）。札が1枚も無ければ残さない
 */
export function saveTodayEtoki(env: EtokiEnv, picks: string[], phrase: string | undefined, travel: Travel): void {
  const { progress: p, story, clock } = env
  const cards: string[] = []
  for (const id of picks) {
    if (cards.length >= ETOKI_PICK_MAX || cards.includes(id)) continue
    if (!story.cards[id] || isPendingConsent(story.cards[id]) || !p.isCardOpened(id)) continue
    if (!etokiPairAllowed([...cards, id], story.cards)) continue
    cards.push(id)
  }
  if (!cards.length) return
  const ph = phrase === undefined ? undefined : story.etoki.phrases.find((x) => x.id === phrase || x.text === phrase)?.id
  p.saveEtoki(clock.day, { cards, ...(ph ? { phrase: ph } : {}), caption: captionKey(env) }, travel)
}

/** etoki-first を走らせるか: 絵解きのピースが空白、または現地で白描 */
export function needsEtokiScript(p: ProgressStore, travel: Travel): boolean {
  const st = p.pieceOf(ETOKI_PIECE)
  return st === 'empty' || (travel === 'utsutsu' && st === 'hakubyo')
}

/** 今日の絵解きのデータの点検（一言は6〜8・id は1回・14字まで、振り返り・添え書き・ましろの言葉がそろう、差し込みは {呼び名}・{names} だけ） */
export function validateEtokiFile(e: EtokiFile): string[] {
  const errs: string[] = []
  const allowed = [YOBINA_TOKEN, '{names}']
  const text = (v: unknown, where: string) => {
    if (typeof v !== 'string' || !v) {
      errs.push(`絵解き ${where}: 文がない`)
      return
    }
    for (const t of tokenProblems(v, allowed)) errs.push(`絵解き ${where}: 差し込み ${t} は使えない`)
  }
  const phrases = Array.isArray(e.phrases) ? e.phrases : []
  if (phrases.length < 6 || phrases.length > 8) errs.push('絵解き: 一言は6〜8')
  const ids = new Set<string>()
  for (const ph of phrases) {
    if (!ph?.id) errs.push('絵解き: id の無い一言がある')
    else if (ids.has(ph.id)) errs.push(`絵解き: 一言の id ${ph.id} が2回ある`)
    ids.add(ph?.id)
    text(ph?.text, `一言 ${ph?.id}`)
    if (typeof ph?.text === 'string' && [...ph.text].length > 14) errs.push(`絵解き: 一言 ${ph.id} は14字まで`)
  }
  for (const k of ['open', 'met', 'metNone', 'newCard', 'pick', 'noCards'] as const) text(e.recap?.[k], `振り返り ${k}`)
  for (const k of ['met', 'none'] as const) text(e.caption?.[k], `添え書き ${k}`)
  text(e.phraseLabel, '一言の見出し')
  for (const k of ['saved', 'bye', 'pairBlocked'] as const) text(e.lines?.[k], `ましろの言葉 ${k}`)
  return errs
}
