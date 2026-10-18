// 便り（04 §3.8・§7 10/18、段階4b）。届ける決まりと、読むときの組み立て。描画に依存しない（画面は ui/tayori.ts）。
//
// - 書き手は、ましろの「また聞き」（風が運んだ声を、ましろが書く。04 §7）。文はすべて【創作】。伝承の事実は札の部品（card）だけ。
// - 決まった便り（tayori.letters）: フラグが立った物語の日から days 日あとの、はじめて開いたときに届く（0＝すぐ）。
//   また聞きは、1つの物語の日に1通まで。了承待ちの便りは届けない。フラグが立った時の分からない古い保存は、すぐ届く。
// - 「ましろの便り」（fumi:<物語の日>）: 遊んだ日のあと、はじめて開いた物語の日に1通（04 §3.8「最後に遊んだ日の翌日以降」）。
//   前のましろの便りが届いた日より後に遊んだときだけ（1日遊べば1通。たまった分をまとめて出さない）。離れていた日数には触れない。
//   その日にほかの便りが届いていれば出さない（重ねない）。はじめて遊んだ日には何も届かない（悩みの便りだけは、すぐ）。
// - 「遊んだ」は、保存にもうある時刻から見る（会った・最後に会った・縁・札・持ち物・ピース・彩色・旅印・絵解き）。
//   便りを読んだこと・夜話を聞いたことは数えない（便りのために毎日開く、の輪を作らない。04 §3.8・§5.1）。
// - 届いた時に選んだ部品の id を残す（Progress.letters の parts）。文と差し込みは読む時に組み立てる
//   （誤字を直せば直った文で出る。呼び名を消せば「きみ」に戻る。データから消えた部品は飛ばす）。
// - 呼び名（{呼び名}）を使うのは、ましろの地の文だけ。妖怪の言葉（quote）・気配の一行には使わない（点検で止める）。

import { sheenTier } from './bond'
import { addDays, dayIndex, dayKeyOf, dayOfIso, dayStartMs, type DayKey, type StoryClock } from './clock'
import { checkConditions, isKnownCondition, isPendingConsent } from './dialogue'
import type { MemoReader } from './memo'
import { bondRank, type Progress, type ProgressStore } from './progress'
import { fillTokens, tokenProblems, YOBINA_TOKEN } from './text'
import type { Condition, LetterDef, LetterPart, LoreCard, StoryData, TayoriFile, YokaiDef } from './types'

export interface TayoriEnv {
  progress: ProgressStore
  story: StoryData
  clock: StoryClock
  memo?: MemoReader
}

/** ましろの便りの id の頭（fumi:<物語の日>） */
export const DAILY_PREFIX = 'fumi:'
/** 便りのそえる一言で、まだ会っていないかを見る妖怪（くらがり。帳の影） */
const KURAGARI = 'kuragari'
/** ましろの名（便りの終わり） */
const SIGN = 'ましろ'
/** 便りの頭（呼び名が無ければ「きみへ」） */
const HEAD = `${YOBINA_TOKEN}へ`

const isDaily = (id: string): boolean => id.startsWith(DAILY_PREFIX)
const msOf = (iso: string | undefined): number => (iso ? Date.parse(iso) : NaN)

/** 届いた便りの id（届けたもの）。何度呼んでも同じ（冪等） */
export function deliverDue(env: TayoriEnv): string[] {
  const { progress: p, story, clock } = env
  const out: string[] = []
  const gotToday = (pred: (id: string) => boolean): boolean =>
    Object.entries(p.get().letters).some(([id, l]) => pred(id) && dayOfIso(l.got) === clock.day)
  // 1. 決まった便り（データの順）
  for (const def of story.tayori.letters) {
    if (p.letter(def.id) || def.needsConsent) continue
    const s = p.get()
    const t = s.flags[def.after.flag] ? (s.flagAt[def.after.flag] ?? '') : null
    if (t === null) continue
    const flagDay = t === '' ? null : dayOfIso(t)
    // フラグの時の分からない古い保存（flagAt が無い・読めない）は、すぐ届く
    if (flagDay !== null && addDays(flagDay, def.after.days) > clock.day) continue
    // また聞きは、1つの物語の日に1通まで
    if (def.kind === 'matagiki' && gotToday((id) => story.tayori.letters.some((d) => d.id === id && d.kind === 'matagiki'))) continue
    if (p.deliverLetter(def.id, chooseParts(def, env))) out.push(def.id)
  }
  // 2. ましろの便り（遊んだ日のあと、はじめて開いた日に1通）
  const T = clock.day
  if (!gotToday(() => true)) {
    const id = `${DAILY_PREFIX}${T}`
    const E = lastPlayMs(p.get(), T, story)
    if (E !== null && E > lastDailyMs(p.get()) && !p.letter(id) && p.deliverLetter(id, composeDaily(env))) out.push(id)
  }
  return out
}

/**
 * 前のましろの便りが、どこまでの遊びを受けたか（その便りが届いた物語の日のはじめ）。無ければ −∞。
 * ましろの便りは、届いた日より前の遊びから書くので、届いた日のうちに遊んだ分は、次の便りに入る
 * （届く少し前に話し終えた会話も、次の便りで受ける）
 */
function lastDailyMs(p: Readonly<Progress>, except?: string): number {
  let last = -Infinity
  for (const [id, l] of Object.entries(p.letters)) {
    if (!isDaily(id) || id === except) continue
    const d = dayOfIso(l.got)
    if (d !== null) last = Math.max(last, dayStartMs(d))
  }
  return last
}

/** 前のましろの便り（届いた時がいちばん新しいもの）。except の id は除く */
function previousDaily(p: Readonly<Progress>, except?: string): { id: string; parts: string[] } | null {
  let best: { id: string; parts: string[]; t: number } | null = null
  for (const [id, l] of Object.entries(p.letters)) {
    if (!isDaily(id) || id === except) continue
    const t = msOf(l.got)
    if (Number.isFinite(t) && (!best || t > best.t)) best = { id, parts: l.parts, t }
  }
  return best
}

/** 決まった便りの部品を選ぶ（届いた時に1回だけ。あとで変えない） */
function chooseParts(def: LetterDef, env: TayoriEnv): string[] {
  const { progress: p, story, clock } = env
  const parts: string[] = []
  for (const part of def.parts) {
    if ('sheen' in part) parts.push(`${part.id}.${sheenTier(p.talksWith(part.yokai))}`)
    else if ('card' in part) parts.push(part.id)
    else {
      const yokai = 'quote' in part ? part.yokai : ''
      if (checkConditions(part.when, p, 'yume', yokai, story.quests, clock)) parts.push(part.id)
    }
  }
  return parts
}

/** その日の「ましろの便り」の部品（書かない。テスト用にも出す） */
export function composeDaily(env: TayoriEnv): string[] {
  const { progress: p, story, clock, memo } = env
  const daily = story.tayori.daily
  const s = p.get()
  const T = clock.day
  const n = dayIndex(T)
  const earlier = Object.entries(s.letters).filter(([id]) => id !== `${DAILY_PREFIX}${T}`)
  const usedParts = earlier.flatMap(([, l]) => l.parts)
  const parts: string[] = []
  // 1. 呼び名を聞く（呼び名を書いても消してもいなくて、前の便りでまだ聞いていないとき）
  if (!memo?.hasYobinaField && !usedParts.includes('ask')) parts.push('ask')
  // 2. はじめの一文
  if (daily.open.length) parts.push(`open:${n % daily.open.length}`)
  // 3. 妖怪の話（前のましろの便りのあとに、いちばん最近会った妖怪。いなければ、いちばん最近会った妖怪）。
  //    会った（met）妖怪だけ（最初の台詞だけで閉じて、まだ会っていない妖怪の名前は出さない。縁帳と同じ）
  const prev = previousDaily(s, `${DAILY_PREFIX}${T}`)
  const since = lastDailyMs(s, `${DAILY_PREFIX}${T}`)
  let latestAfter: { id: string; t: number } | null = null
  let latest: { id: string; t: number } | null = null
  for (const id of Object.keys(story.yokai)) {
    const t = msOf(s.yokai[id]?.lastMet?.at)
    if (!Number.isFinite(t) || !s.yokai[id]?.met) continue
    if (!latest || t > latest.t) latest = { id, t }
    if (t > since && (!latestAfter || t > latestAfter.t)) latestAfter = { id, t }
  }
  const Y = (latestAfter ?? latest)?.id
  const tiers = Y ? daily.snippets[Y] : undefined
  if (Y && tiers) {
    const tier = tiers[sheenTier(p.talksWith(Y))] ?? []
    const prevSnip = prev?.parts.find((x) => x.startsWith('snip:'))
    const ok = tier.filter((l) => checkConditions(l.when, p, 'yume', Y, story.quests, clock) && `snip:${l.id}` !== prevSnip)
    const pick = ok.length ? ok[n % ok.length] : tier[0]
    if (pick) parts.push(`snip:${pick.id}`)
  }
  // 4. そえる一言（1つまで。はじめに当てはまるもの。使った回数は、これまでの便りの部品から数える）
  const used = (id: string) => usedParts.filter((x) => x === `hint:${id}`).length
  const lastPlay = lastPlayMs(s, T, story)
  const lastPlayDay = lastPlay === null ? null : dayKeyOf(lastPlay)
  const applies: Record<string, () => boolean> = {
    'etoki-before': () => lastPlayDay !== null && !!s.etoki[lastPlayDay],
    kuragari: () => !!story.yokai[KURAGARI] && !p.hasMet(KURAGARI),
    yobanashi: () => Object.values(s.yokai).some((y) => bondRank(y.bond) >= bondRank('najimi')) && !Object.keys(s.nights).length,
    etoki: () => !Object.keys(s.etoki).length && Object.keys(s.cards).filter((c) => story.cards[c] && !isPendingConsent(story.cards[c])).length >= 2,
  }
  for (const h of daily.hints) {
    if (applies[h.id]?.() && used(h.id) < h.max) {
      parts.push(`hint:${h.id}`)
      break
    }
  }
  // 5. おわりの一文
  if (daily.close.length) parts.push(`close:${n % daily.close.length}`)
  return parts
}

/**
 * 遊んだ印の時刻（会った・最後に会った・縁・札・持ち物・ピース・彩色・旅印・絵解き）のうち、beforeDay より前で一番新しいもの。
 * 便り・夜話の記録とフラグは数えない。story を渡すと、便りを読んで開いた札（その便りの札の部品で、読んだ時より後に開いたもの）も数えない
 */
export function lastPlayMs(p: Readonly<Progress>, beforeDay?: DayKey, story?: Pick<StoryData, 'tayori'>): number | null {
  const limit = beforeDay === undefined ? Infinity : dayStartMs(beforeDay)
  let best: number | null = null
  const see = (iso: string | undefined) => {
    const t = msOf(iso)
    if (Number.isFinite(t) && t < limit && (best === null || t > best)) best = t
  }
  for (const y of Object.values(p.yokai)) {
    see(y.met?.at)
    see(y.dreamMet?.at)
    see(y.lastMet?.at)
    see(y.bondGained?.at)
  }
  // 便りを読んだときに開いた札（その便りの札の部品で、読んだ時より後に開いたもの）は、遊んだ印にしない（札の id → いちばん早く読んだ時）
  const byLetter = new Map<string, number>()
  for (const [id, l] of Object.entries(p.letters)) {
    const r = msOf(l.read)
    const def = story?.tayori.letters.find((d) => d.id === id)
    if (!def || !Number.isFinite(r)) continue
    for (const part of def.parts) {
      if (!('card' in part) || !l.parts.includes(part.id)) continue
      const prev = byLetter.get(part.card)
      if (prev === undefined || r < prev) byLetter.set(part.card, r)
    }
  }
  for (const [id, g] of Object.entries(p.cards)) {
    const r = byLetter.get(id)
    if (r !== undefined && msOf(g.at) >= r) continue
    see(g.at)
  }
  for (const it of Object.values(p.items)) {
    see(it.got.at)
    see(it.given?.at)
  }
  for (const pc of Object.values(p.pieces)) {
    see(pc.at)
    see(pc.colored?.at)
  }
  for (const st of Object.values(p.stamps)) see(st.at)
  for (const e of Object.values(p.etoki)) see(e.at)
  return best
}

export interface LetterSummary {
  id: string
  title: string
  got: string
  read: boolean
  kind: 'daily' | 'matagiki' | 'quest'
}

/** 届いた便り（got の新しい順）。データに無い id（fumi: 以外）と、了承待ちになった便りは出さない */
export function letterList(p: ProgressStore, story: StoryData): LetterSummary[] {
  const out: LetterSummary[] = []
  for (const [id, l] of Object.entries(p.get().letters)) {
    if (isDaily(id)) {
      out.push({ id, title: story.tayori.daily.title, got: l.got, read: !!l.read, kind: 'daily' })
      continue
    }
    const def = story.tayori.letters.find((d) => d.id === id)
    if (!def || def.needsConsent) continue
    out.push({ id, title: def.title, got: l.got, read: !!l.read, kind: def.kind })
  }
  return out.sort((a, b) => (a.got < b.got ? 1 : a.got > b.got ? -1 : a.id < b.id ? 1 : -1))
}

export type LetterBlock =
  /** 「{呼び名}へ」を差し込んだもの */
  | { kind: 'head'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'quote'; yokai: string; name: string; text: string }
  | { kind: 'card'; card: LoreCard; lead?: string }
  /** 呼び名を聞くボタン（呼び名をまだ書いても消してもいないときだけ） */
  | { kind: 'ask' }
  /** 「ましろ」 */
  | { kind: 'sign'; text: string }

export interface LetterView extends LetterSummary {
  blocks: LetterBlock[]
}

/** 届いた便りを、読む時の文で組み立てる（書かない）。届いていない・データに無い便りは null */
export function letterView(id: string, p: ProgressStore, story: StoryData, memo?: MemoReader): LetterView | null {
  const rec = p.letter(id)
  if (!rec) return null
  const summary = letterList(p, story).find((l) => l.id === id)
  if (!summary) return null
  const fill = (t: string) => fillTokens(t, memo)
  const blocks: LetterBlock[] = [{ kind: 'head', text: fill(HEAD) }]
  if (isDaily(id)) {
    const daily = story.tayori.daily
    const snippets = Object.values(daily.snippets).flatMap((t) => [...(t.a ?? []), ...(t.b ?? [])])
    for (const part of rec.parts) {
      const [k, v = ''] = splitPart(part)
      if (k === 'ask') {
        // 呼び名を書いたか消したら、聞く一文もボタンも出さない
        if (!memo?.hasYobinaField) blocks.push({ kind: 'p', text: fill(daily.askName) }, { kind: 'ask' })
        continue
      }
      const at = (list: string[]) => (/^\d+$/.test(v) ? list[Number(v)] : undefined)
      const text =
        k === 'open'
          ? at(daily.open)
          : k === 'close'
            ? at(daily.close)
            : k === 'snip'
              ? snippets.find((l) => l.id === v)?.text
              : k === 'hint'
                ? daily.hints.find((h) => h.id === v)?.text
                : undefined
      // データから消えた部品は飛ばす
      if (typeof text === 'string') blocks.push({ kind: 'p', text: fill(text) })
    }
  } else {
    const def = story.tayori.letters.find((d) => d.id === id)
    if (!def) return null
    for (const stored of rec.parts) {
      const block = partBlock(def, stored, story, fill)
      if (block) blocks.push(block)
    }
  }
  blocks.push({ kind: 'sign', text: SIGN })
  return { ...summary, blocks }
}

/** 'open:1' → ['open', '1']、'ask' → ['ask'] */
const splitPart = (part: string): [string, string?] => {
  const i = part.indexOf(':')
  return i < 0 ? [part] : [part.slice(0, i), part.slice(i + 1)]
}

/** 決まった便りの部品（届いた時に残した id）を、いまのデータの文で組み立てる。データから消えた部品は飛ばす */
function partBlock(def: LetterDef, stored: string, story: StoryData, fill: (t: string) => string): LetterBlock | null {
  for (const part of def.parts) {
    if ('sheen' in part) {
      if (stored !== `${part.id}.a` && stored !== `${part.id}.b`) continue
      const text = part.sheen[stored.endsWith('.b') ? 1 : 0]
      return typeof text === 'string' ? { kind: 'p', text: fill(text) } : null
    }
    if (part.id !== stored) continue
    if ('card' in part) {
      const card = story.cards[part.card]
      // 了承待ちの札は見せない（02 F-71）
      if (!card || isPendingConsent(card)) return null
      return { kind: 'card', card, ...(part.lead ? { lead: fill(part.lead) } : {}) }
    }
    // 妖怪の言葉には呼び名を差し込まない（妖怪は呼び名を使わない。点検でも止める）
    if ('quote' in part) return { kind: 'quote', yokai: part.yokai, name: story.yokai[part.yokai]?.name ?? '', text: fillTokens(part.quote) }
    return { kind: 'p', text: fill(part.p) }
  }
  return null
}

/** 読んだ印・onRead のフラグ・札の部品をまだ開いていなければ開く（旅は yume。了承待ちは飛ばす） */
export function openLetter(id: string, p: ProgressStore, story: StoryData, memo?: MemoReader): LetterView | null {
  const view = letterView(id, p, story, memo)
  if (!view) return null
  // 読んだ印を先に（そのあとで開いた札は、遊んだ印に数えない。lastPlayMs）
  p.readLetter(id)
  const def = story.tayori.letters.find((d) => d.id === id)
  if (def?.onRead && !p.flag(def.onRead.flag)) p.setFlag(def.onRead.flag, true)
  for (const b of view.blocks) if (b.kind === 'card' && !p.isCardOpened(b.card.id)) p.openCard(b.card.id, 'yume')
  return letterView(id, p, story, memo)
}

/** まだ読んでいない便りがあるか（「新」の字だけに使う。数は出さない） */
export function hasUnreadLetter(p: ProgressStore, story: StoryData): boolean {
  return letterList(p, story).some((l) => !l.read)
}

const LETTER_KINDS: readonly unknown[] = ['matagiki', 'quest']
const HINT_IDS: readonly unknown[] = ['etoki-before', 'kuragari', 'yobanashi', 'etoki']

/**
 * 便りのデータの点検（読み込み時）。id の重なり・届く条件のフラグ・札・妖怪・言い回しの段・気配の一行・差し込みを見る。
 * 書かない言葉の点検（lintText）は validate.ts で、ほかのデータと一緒に見る
 */
export function validateTayori(
  t: TayoriFile,
  ctx: { cards: Record<string, LoreCard>; yokai: Record<string, YokaiDef>; flagsSetByScripts: Set<string> },
): string[] {
  const errs: string[] = []
  const tokens = (text: unknown, where: string, allowed: readonly string[] = [YOBINA_TOKEN]) => {
    if (typeof text !== 'string' || !text) {
      errs.push(`便り ${where}: 文がない`)
      return
    }
    for (const tok of tokenProblems(text, allowed)) errs.push(`便り ${where}: 差し込み ${tok} は使えない`)
  }
  const conds = (when: Condition[] | undefined, where: string) => {
    if (when === undefined) return
    if (!Array.isArray(when)) errs.push(`便り ${where}: 条件が並び（配列）でない`)
    else for (const c of when as unknown[]) if (!isKnownCondition(c)) errs.push(`便り ${where}: 条件 ${JSON.stringify(c)} は知らない（種類か形が違う）`)
  }
  const letterIds = new Set<string>()
  for (const def of t.letters ?? []) {
    const w = `${def.id}`
    if (!def.id || !/^[a-z0-9][a-z0-9:_.-]{0,63}$/.test(def.id) || isDaily(def.id)) errs.push(`便り ${w}: id が使えない形`)
    if (letterIds.has(def.id)) errs.push(`便り ${w}: id が2回ある`)
    letterIds.add(def.id)
    if (!def.title) errs.push(`便り ${w}: 題がない`)
    if (!LETTER_KINDS.includes(def.kind)) errs.push(`便り ${w}: 種類 ${String(def.kind)} は知らない（matagiki か quest）`)
    if (def.about !== undefined && !ctx.yokai[def.about]) errs.push(`便り ${w}: about の妖怪 ${def.about} がいない`)
    if (!def.after || typeof def.after.flag !== 'string') errs.push(`便り ${w}: 届く条件（after.flag）がない`)
    else if (!ctx.flagsSetByScripts.has(def.after.flag)) errs.push(`便り ${w}: フラグ ${def.after.flag} を true にする台本がない（届かない）`)
    if (def.after && def.after.days !== 0 && def.after.days !== 1) errs.push(`便り ${w}: days は 0 か 1`)
    if (def.onRead !== undefined && (typeof def.onRead?.flag !== 'string' || !def.onRead.flag)) errs.push(`便り ${w}: onRead のフラグがない`)
    if (def.needsConsent !== undefined && def.needsConsent !== true) errs.push(`便り ${w}: needsConsent は true だけ`)
    const partIds = new Set<string>()
    if (!Array.isArray(def.parts) || !def.parts.length) errs.push(`便り ${w}: 部品がない`)
    for (const part of def.parts ?? []) {
      const pw = `${w} の部品 ${part.id}`
      if (!part.id || !/^[a-z0-9_-]{1,32}$/.test(part.id)) errs.push(`便り ${pw}: id が使えない形`)
      if (partIds.has(part.id)) errs.push(`便り ${pw}: id が2回ある`)
      partIds.add(part.id)
      const kinds = (['p', 'quote', 'card', 'sheen'] as const).filter((k) => k in part)
      if (kinds.length !== 1) {
        errs.push(`便り ${pw}: p・quote・card・sheen のどれか1つにする`)
        continue
      }
      const p = part as LetterPart
      if ('card' in p) {
        const card = ctx.cards[p.card]
        if (!card) errs.push(`便り ${pw}: 札 ${p.card} がない`)
        else if (isPendingConsent(card)) errs.push(`便り ${pw}: 了承待ちの札 ${p.card} は便りに入れない（02 F-71）`)
        if (p.lead !== undefined) tokens(p.lead, `${pw} の前置き`)
      } else if ('sheen' in p) {
        if (!ctx.yokai[p.yokai]) errs.push(`便り ${pw}: 妖怪 ${p.yokai} がいない`)
        if (!Array.isArray(p.sheen) || p.sheen.length !== 2) errs.push(`便り ${pw}: sheen は2つの文（艶0〜1段・2段から）`)
        else p.sheen.forEach((s, i) => tokens(s, `${pw} の言い回し ${i ? 'b' : 'a'}`))
      } else if ('quote' in p) {
        if (!ctx.yokai[p.yokai]) errs.push(`便り ${pw}: 妖怪 ${p.yokai} がいない`)
        // 妖怪の言葉に呼び名は使わない（04 §3.3。呼び名を使うのはましろだけ）
        tokens(p.quote, `${pw}（妖怪の言葉）`, [])
        conds(p.when, pw)
      } else {
        tokens(p.p, pw)
        conds(p.when, pw)
      }
    }
  }
  const d = t.daily
  if (!d) return [...errs, '便り: daily（ましろの便り）がない']
  if (!d.title) errs.push('便り daily: 題がない')
  tokens(d.askName, 'daily の askName')
  if (!Array.isArray(d.open) || !d.open.length) errs.push('便り daily: open は1つ以上')
  if (!Array.isArray(d.close) || !d.close.length) errs.push('便り daily: close は1つ以上')
  ;(d.open ?? []).forEach((x, i) => tokens(x, `daily の open ${i}`))
  ;(d.close ?? []).forEach((x, i) => tokens(x, `daily の close ${i}`))
  const hintIds = new Set<string>()
  for (const h of d.hints ?? []) {
    if (!HINT_IDS.includes(h.id)) errs.push(`便り daily: そえる一言 ${String(h.id)} は知らない`)
    if (hintIds.has(h.id)) errs.push(`便り daily: そえる一言 ${h.id} が2回ある`)
    hintIds.add(h.id)
    if (typeof h.max !== 'number' || !(h.max >= 1)) errs.push(`便り daily: そえる一言 ${h.id} の max は1以上`)
    tokens(h.text, `daily のそえる一言 ${h.id}`)
  }
  const snipIds = new Set<string>()
  for (const [y, tiers] of Object.entries(d.snippets ?? {})) {
    if (!ctx.yokai[y]) errs.push(`便り daily: 言い回しの妖怪 ${y} がいない`)
    for (const tier of ['a', 'b'] as const)
      for (const l of tiers?.[tier] ?? []) {
        if (!l.id) errs.push(`便り daily: ${y}/${tier} に id の無い一行がある`)
        else if (snipIds.has(l.id)) errs.push(`便り daily: 言い回しの id ${l.id} が2回ある`)
        snipIds.add(l.id)
        tokens(l.text, `daily の言い回し ${l.id}`)
        conds(l.when, `daily の言い回し ${l.id}`)
      }
  }
  for (const y of Object.values(ctx.yokai)) {
    const tiers = d.snippets?.[y.id]
    if (!tiers?.a?.length || !tiers?.b?.length) errs.push(`便り daily: 妖怪 ${y.id} の言い回し（a・b）が1つずつ以上ない`)
    if (y.yobanashi && !t.nightKehai?.[y.id]?.length) errs.push(`便り: 夜話のある妖怪 ${y.id} の気配の一行（nightKehai）がない`)
  }
  for (const [y, lines] of Object.entries(t.nightKehai ?? {})) {
    if (!ctx.yokai[y]) errs.push(`便り: 気配の一行の妖怪 ${y} がいない`)
    // 気配の一行は妖怪の気配なので、呼び名は使わない
    if (!Array.isArray(lines)) errs.push(`便り: ${y} の気配の一行が並び（配列）でない`)
    else lines.forEach((x, i) => tokens(x, `気配の一行 ${y} ${i}`, []))
  }
  return errs
}
