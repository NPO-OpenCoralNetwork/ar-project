// 台本の会話を進める仕組み（描画に依存しない）。夢の旅と、のちの現の旅で同じものを使う。
//
// 使い方: start() で最初の「拍」（beat）を受け取り、表示し終えたら next()、選択肢なら choose(i)。
// 拍は、台詞（line）・伝承の札（card）・お知らせ（notice: 縁・ピース）・小さな遊び（game）・選択肢（choices）・終わり（end）の6種類。
// 効果（札・ピース・縁）は、その拍に来たときに1回だけ適用して保存する（途中で閉じても、そこまでは残る）。
//
// 段階4b で足したもの（04 §3.8・§3.9、02 F-71）:
// - 台詞の条件（line.when。台詞を出す時に見て、満たさなければ飛ばす）・入口の id と start(entryId)・その日に会ったか（metToday。
//   会話を始めた時の lastMet で見る。この会話の最初の台詞で残す noteSeen は数えない）。
// - 差し込み {呼び名}（ましろの覚え書き。無ければ「きみ」。台詞と選択肢の字は、画面に渡す前に差し込む）。
// - 会ったことの記録: talk（既定）は妖怪が最初に話したとき noteSeen、最後まで話したら noteTalk。
//   visit（夜話）は最後まで話したら noteVisit だけ（会ったことにしない・縁も変えない）。
// - 効果 showCard（開いている札を、もう一度見せる。開かない）と timePiece（会話を始めた時が逢魔が時なら、時間のピースに家でも彩色）。
// - 了承待ち（needsConsent）: 台本は始めない、選択肢は出さない、札は開かない・見せない、手札は白紙（pending）。
// - 知らない条件・効果の種類は、点検で断る（これまでは黙って偽になっていた）。

import { isoInToday, type StoryClock } from './clock'
import type { MemoReader } from './memo'
import { type Gained, type ProgressStore, bondRank, pieceRank } from './progress'
import { fillTokens, tokenProblems, YOBINA_TOKEN } from './text'
import {
  BOND_LABEL,
  BOND_LEVELS,
  type BondLevel,
  type Condition,
  CONDITION_KEYS,
  type DialogueScript,
  type Effect,
  EFFECT_KEYS,
  type EtokiHandCard,
  type EtokiSlot,
  type GameResult,
  type GameSpec,
  type ItemDef,
  type ItemState,
  type LoreCard,
  PIECE_LABEL,
  PIECE_STATES,
  type PieceState,
  type QuestDef,
  type ScriptChoice,
  type ScriptSpeaker,
  type Travel,
} from './types'

export type Notice =
  | { type: 'bond'; yokai: string; level: BondLevel; label: string; capped: boolean }
  | { type: 'piece'; piece: string; state: PieceState; label: string; capped: boolean; travel: Travel; time?: boolean }
  | { type: 'item'; item: string; name: string; action: 'receive' | 'deliver' }

export type Beat =
  | { kind: 'line'; speakerId: string; speaker: ScriptSpeaker; text: string }
  | { kind: 'card'; card: LoreCard; first: boolean }
  | { kind: 'notice'; notice: Notice }
  | {
      kind: 'game'
      game: GameSpec
      /** 話している妖怪（調べる地点の台本では空） */
      yokai: string
      /** 絵解き鎮めの手札（正しい順。持っていない札は白紙） */
      hand?: EtokiHandCard[]
    }
  | {
      kind: 'choices'
      /** 選択肢の前の台詞（画面に残す） */
      context: Extract<Beat, { kind: 'line' }> | null
      options: { index: number; text: string }[]
    }
  | { kind: 'end' }

export interface DialogueContext {
  progress: ProgressStore
  cards: Record<string, LoreCard>
  travel: Travel
  /** 持ち物（お知らせに名前を出す） */
  items?: Record<string, ItemDef>
  /** 悩みごと（同時に3つまでの判定 questRoom に使う） */
  quests?: QuestDef[]
  /** 会話を始めた時の物語の時計（呼ぶ側が storyClock(appNow()) を1回作って渡す）。metToday・timePiece に使う */
  clock?: StoryClock
  /** {呼び名}（無ければ「きみ」） */
  memo?: MemoReader
  /** talk（既定）: 妖怪の最初の台詞で noteSeen、最後まで話したら noteTalk。visit（夜話）: 最後まで話したら noteVisit だけ */
  record?: 'talk' | 'visit'
  /** 最後まで話した（終わりに来た）とき1回。途中で閉じたら呼ばない */
  onFinish?(): void
}

type Step =
  | { kind: 'line'; speaker: string; text: string; when?: Condition[] }
  | { kind: 'effect'; effect: Effect }
  | { kind: 'goto'; node: string }
  | { kind: 'choices' }
  | { kind: 'end' }

export class DialogueRunner {
  private queue: Step[] = []
  private nodeId = ''
  private lastLine: Extract<Beat, { kind: 'line' }> | null = null
  private current: Beat | null = null
  private visibleChoices: { index: number; text: string; next: string }[] = []
  private ended = false
  private spoke = false
  /** 妖怪が最初に話した印を残したか（noteSeen は1回だけ） */
  private seen = false
  /** 会話を始めた時の「最後に会った時」の写し（metToday はこれで見る。この会話の noteSeen で書き換わる前の値） */
  private metBefore: ReadonlyMap<string, Gained> | null = null
  /** 通った場面（確認用） */
  readonly trail: string[] = []

  constructor(
    readonly script: DialogueScript,
    private readonly ctx: DialogueContext,
  ) {}

  /**
   * entryId: その入口の when が成り立てば、そこから。でなければ、これまでどおり上から最初に成り立つ入口。
   * 了承待ち（needsConsent）の台本は、すぐ end
   */
  start(entryId?: string): Beat {
    if (this.script.needsConsent) return (this.current = { kind: 'end' })
    // その日に会ったか（metToday）は、この会話より前のことで見る（最初の台詞の noteSeen が lastMet を「いま」にするため）
    this.metBefore = lastMetSnapshot(this.ctx.progress)
    const byId = entryId === undefined ? undefined : this.script.entries.find((e) => e.id === entryId && this.check(e.when))
    const entry = byId ?? this.script.entries.find((e) => this.check(e.when))
    if (!entry) return (this.current = { kind: 'end' })
    this.enter(entry.node)
    return this.advance()
  }

  get beat(): Beat | null {
    return this.current
  }

  get node(): string {
    return this.nodeId
  }

  /** 台詞・札・お知らせを読み終えたら、次の拍へ。小さな遊びのあとは、その結果を渡す */
  next(result?: GameResult): Beat {
    if (!this.current || this.current.kind === 'choices' || this.current.kind === 'end') return this.current ?? { kind: 'end' }
    if (this.current.kind === 'game' && this.current.game.type === 'matsu' && this.current.game.tappedFlag)
      this.ctx.progress.setFlag(this.current.game.tappedFlag, (result?.tapped ?? 0) > 0)
    return this.advance()
  }

  choose(index: number): Beat {
    if (this.current?.kind !== 'choices') return this.current ?? { kind: 'end' }
    const c = this.visibleChoices.find((o) => o.index === index)
    if (!c) return this.current
    this.enter(c.next)
    return this.advance()
  }

  private enter(id: string): void {
    const node = this.script.nodes[id]
    this.nodeId = id
    this.trail.push(id)
    this.queue = []
    if (!node) {
      this.queue.push({ kind: 'end' })
      return
    }
    for (const l of node.lines ?? []) this.queue.push({ kind: 'line', speaker: l.speaker, text: l.text, when: l.when })
    for (const e of node.effects ?? []) this.queue.push({ kind: 'effect', effect: e })
    if (node.choices?.length) this.queue.push({ kind: 'choices' })
    else if (node.next) this.queue.push({ kind: 'goto', node: node.next })
    else this.queue.push({ kind: 'end' })
  }

  /**
   * 会話の終わり。妖怪と最後まで話したら、回数と最後に会った時を残す（縁の段階は上げない）。
   * 夜話（record: 'visit'）は回数だけ。onFinish は最後まで来たときに1回だけ呼ぶ
   */
  private finish(): Beat {
    if (!this.ended) {
      this.ended = true
      const y = this.script.yokaiId
      if (this.spoke && y) {
        if (this.ctx.record === 'visit') this.ctx.progress.noteVisit(y)
        else this.ctx.progress.noteTalk(y, this.ctx.travel)
      }
      this.ctx.onFinish?.()
    }
    return (this.current = { kind: 'end' })
  }

  private advance(): Beat {
    for (let guard = 0; guard < 200; guard++) {
      const step = this.queue.shift()
      if (!step) return this.finish()
      if (step.kind === 'line') {
        // 台詞の条件は、出す時に見る（満たさなければ飛ばす）
        if (!this.check(step.when)) continue
        const speaker = this.script.speakers[step.speaker] ?? { name: step.speaker, role: 'yokai' as const }
        const beat = { kind: 'line' as const, speakerId: step.speaker, speaker, text: fillTokens(step.text, this.ctx.memo) }
        this.lastLine = beat
        this.spoke = true
        // 妖怪が最初に話したら、その日に会ったことにする（途中で閉じても残る。夜話では残さない）
        if (!this.seen && speaker.role === 'yokai' && this.script.yokaiId && this.ctx.record !== 'visit') {
          this.seen = true
          this.ctx.progress.noteSeen(this.script.yokaiId, this.ctx.travel)
        }
        return (this.current = beat)
      }
      if (step.kind === 'effect') {
        const b = this.apply(step.effect)
        if (b) return (this.current = b)
        continue
      }
      if (step.kind === 'goto') {
        this.enter(step.node)
        continue
      }
      if (step.kind === 'choices') {
        const node = this.script.nodes[this.nodeId]
        // 了承待ちの選択肢は、条件を満たさない選択肢と同じく出さない（02 F-71）
        this.visibleChoices = (node?.choices ?? [])
          .map((c, index) => ({ index, text: c.text, next: c.next, when: c.when, consent: c.needsConsent }))
          .filter((c) => !c.consent && this.check(c.when))
        if (!this.visibleChoices.length) return this.finish()
        return (this.current = {
          kind: 'choices',
          context: this.lastLine,
          options: this.visibleChoices.map(({ index, text }) => ({ index, text: fillTokens(text, this.ctx.memo) })),
        })
      }
      return this.finish()
    }
    return this.finish()
  }

  /** 効果を適用する。画面に見せるもの（札・お知らせ）があれば拍を返す */
  private apply(e: Effect): Beat | null {
    const { progress, travel } = this.ctx
    const yokai = this.script.yokaiId ?? ''
    // 夜話は、札を見せるだけ（縁・ピース・持ち物・フラグは変えない。04 §3.8。点検でも止める）
    if (this.script.kind === 'yobanashi' && !('showCard' in e)) return null
    if ('showCard' in e) {
      const card = this.ctx.cards[e.showCard]
      if (!card || isPendingConsent(card) || !progress.isCardOpened(card.id)) return null
      return { kind: 'card', card, first: false }
    }
    if ('timePiece' in e) {
      // 会話を始めた時の時計で見る（逢魔が時の終わりをまたいでも、始めた時が逢魔が時なら色が入る）
      const dusk = this.ctx.clock?.phase === 'oumagatoki'
      const r = progress.setPiece(e.timePiece, dusk ? 'saishiki' : 'hakubyo', travel, { time: dusk })
      if (!r.changed) return null
      return {
        kind: 'notice',
        notice: { type: 'piece', piece: e.timePiece, state: r.state, label: PIECE_LABEL[r.state], capped: r.capped, travel, time: dusk },
      }
    }
    if ('meet' in e) {
      progress.meet(yokai, travel)
      return null
    }
    if ('bond' in e) {
      const r = progress.raiseBond(yokai, e.bond, travel)
      if (!r.changed) return null
      return { kind: 'notice', notice: { type: 'bond', yokai, level: r.level, label: BOND_LABEL[r.level], capped: r.capped } }
    }
    if ('openCard' in e) {
      const card = this.ctx.cards[e.openCard]
      // 了承待ちの札は、了承が出るまで開かない（02 F-71）
      if (!card || isPendingConsent(card)) return null
      const first = progress.openCard(card.id, travel)
      return { kind: 'card', card, first }
    }
    if ('piece' in e) {
      const r = progress.setPiece(e.piece, e.state, travel)
      if (!r.changed) return null
      return { kind: 'notice', notice: { type: 'piece', piece: e.piece, state: r.state, label: PIECE_LABEL[r.state], capped: r.capped, travel } }
    }
    if ('flag' in e) {
      progress.setFlag(e.flag, e.value)
      return null
    }
    if ('receive' in e || 'deliver' in e) {
      const id = 'receive' in e ? e.receive : e.deliver
      const changed = 'receive' in e ? progress.receive(id, travel) : progress.deliver(id, travel)
      if (!changed) return null
      const name = this.ctx.items?.[id]?.name ?? id
      return { kind: 'notice', notice: { type: 'item', item: id, name, action: 'receive' in e ? 'receive' : 'deliver' } }
    }
    if ('game' in e) {
      if (e.game.type !== 'etoki') return { kind: 'game', game: e.game, yokai }
      // 手札は、いま持っている札から作る（画面の側は進み具合を読まない）
      const hand = etokiHand(e.game.slots.map(slotKey), this.ctx.cards, progress)
      return { kind: 'game', game: e.game, yokai, hand }
    }
    return null
  }

  check(conds: Condition[] | undefined): boolean {
    return checkConditions(conds, this.ctx.progress, this.ctx.travel, this.script.yokaiId ?? '', this.ctx.quests, this.ctx.clock, this.metBefore ?? undefined)
  }
}

/** 了承待ちの札か（02 F-71。了承まで開かない・見せない）。前の書き方（review: '了承待ち'）も了承待ちとして扱う */
export function isPendingConsent(card: LoreCard | undefined): boolean {
  return !!card && (card.needsConsent === true || (card.review as string) === '了承待ち')
}

/** 同時に抱えられる悩みの数（04 §2.4。4つ目はましろが「また今度にしよう」と保留にする） */
export const QUEST_LIMIT = 3

/** いま抱えている悩み（始まっていて、まだ解けていない） */
export function activeQuests(quests: QuestDef[], p: ProgressStore, travel: Travel): QuestDef[] {
  return quests.filter((q) => checkConditions(q.start, p, travel, q.yokai[0]) && !checkConditions(q.done, p, travel, q.yokai[0]))
}

/** 同時に3つまでの数に入る悩み（番外は、その場で終わる遊びなので数えない） */
const countsTowardLimit = (q: QuestDef): boolean => q.type !== '番外'

/** 妖怪ごとの「最後に会った時」の写し（会話を始めた時に取る） */
function lastMetSnapshot(p: ProgressStore): ReadonlyMap<string, Gained> {
  const out = new Map<string, Gained>()
  for (const [id, y] of Object.entries(p.get().yokai)) if (y.lastMet) out.set(id, { ...y.lastMet })
  return out
}

/**
 * 条件（すべて満たすと真）。yokai を省いた条件は yokaiDefault の妖怪で見る。台本の入口・選択肢と、節の終わり（旅印）で使う。
 * quests を渡さないとき、questRoom はいつも「空きあり」。clock が無いとき metToday はいつも偽。
 * metBefore: metToday で見る「最後に会った時」（会話の中では、始めた時の写し。無ければいまの進み具合）
 */
export function checkConditions(
  conds: Condition[] | undefined,
  p: ProgressStore,
  travel: Travel,
  yokaiDefault = '',
  quests?: QuestDef[],
  clock?: StoryClock,
  metBefore?: ReadonlyMap<string, Gained>,
): boolean {
  if (!conds?.length) return true
  return conds.every((c) => {
    if ('metToday' in c) {
      if (!clock) return false
      const id = c.yokai ?? yokaiDefault
      const lm = metBefore ? metBefore.get(id) : p.get().yokai[id]?.lastMet
      return !!lm && isoInToday(lm.at, clock) && (c.metToday === 'any' || lm.travel === c.metToday)
    }
    if ('met' in c) return p.hasMet(c.yokai ?? yokaiDefault) === c.met
    if ('card' in c) return p.isCardOpened(c.card) === c.opened
    if ('bondAtLeast' in c) return bondRank(p.bondOf(c.yokai ?? yokaiDefault)) >= bondRank(c.bondAtLeast)
    if ('piece' in c) return pieceRank(p.pieceOf(c.piece)) >= pieceRank(c.atLeast)
    if ('flag' in c) return p.flag(c.flag) === c.is
    if ('travel' in c) return travel === c.travel
    if ('item' in c) return p.itemState(c.item) === c.state
    if ('questRoom' in c) return (!quests || activeQuests(quests, p, travel).filter(countsTowardLimit).length < QUEST_LIMIT) === c.questRoom
    return false
  })
}

const isRecord = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const optStr = (v: unknown): boolean => v === undefined || isStr(v)
const ITEM_STATE_SET: readonly unknown[] = ['none', 'held', 'given']
/** 条件の種類ごとに、使ってよい鍵と、その形 */
const CONDITION_SHAPES: Record<(typeof CONDITION_KEYS)[number], (c: Record<string, unknown>) => boolean> = {
  met: (c) => isBool(c.met) && optStr(c.yokai),
  card: (c) => isStr(c.card) && isBool(c.opened),
  bondAtLeast: (c) => (BOND_LEVELS as readonly unknown[]).includes(c.bondAtLeast) && optStr(c.yokai),
  piece: (c) => isStr(c.piece) && (PIECE_STATES as readonly unknown[]).includes(c.atLeast),
  flag: (c) => isStr(c.flag) && isBool(c.is),
  travel: (c) => c.travel === 'yume' || c.travel === 'utsutsu',
  item: (c) => isStr(c.item) && ITEM_STATE_SET.includes(c.state),
  questRoom: (c) => isBool(c.questRoom),
  metToday: (c) => (c.metToday === 'yume' || c.metToday === 'utsutsu' || c.metToday === 'any') && optStr(c.yokai),
}
const CONDITION_FIELDS: Record<(typeof CONDITION_KEYS)[number], readonly string[]> = {
  met: ['met', 'yokai'],
  card: ['card', 'opened'],
  bondAtLeast: ['bondAtLeast', 'yokai'],
  piece: ['piece', 'atLeast'],
  flag: ['flag', 'is'],
  travel: ['travel'],
  item: ['item', 'state'],
  questRoom: ['questRoom'],
  metToday: ['metToday', 'yokai'],
}

/** 知っている条件か（鍵が CONDITION_KEYS の1つだけで、ほかの鍵が無く、形が合う。flag の is は boolean など） */
export function isKnownCondition(c: unknown): boolean {
  if (!isRecord(c)) return false
  const kinds = CONDITION_KEYS.filter((k) => k in c)
  if (kinds.length !== 1) return false
  const kind = kinds[0]
  if (Object.keys(c).some((k) => !CONDITION_FIELDS[kind].includes(k))) return false
  return CONDITION_SHAPES[kind](c)
}

const EFFECT_SHAPES: Record<(typeof EFFECT_KEYS)[number], { fields: readonly string[]; ok: (e: Record<string, unknown>) => boolean }> = {
  meet: { fields: ['meet'], ok: (e) => e.meet === true },
  bond: { fields: ['bond'], ok: (e) => (BOND_LEVELS as readonly unknown[]).includes(e.bond) },
  openCard: { fields: ['openCard'], ok: (e) => isStr(e.openCard) },
  piece: { fields: ['piece', 'state'], ok: (e) => isStr(e.piece) && (PIECE_STATES as readonly unknown[]).includes(e.state) },
  flag: { fields: ['flag', 'value'], ok: (e) => isStr(e.flag) && isBool(e.value) },
  game: { fields: ['game'], ok: (e) => isRecord(e.game) },
  receive: { fields: ['receive'], ok: (e) => isStr(e.receive) },
  deliver: { fields: ['deliver'], ok: (e) => isStr(e.deliver) },
  showCard: { fields: ['showCard'], ok: (e) => isStr(e.showCard) },
  timePiece: { fields: ['timePiece'], ok: (e) => isStr(e.timePiece) },
}

/** 知っている効果か（鍵が EFFECT_KEYS の1つだけで、ほかの鍵が無く、形が合う） */
export function isKnownEffect(e: unknown): boolean {
  if (!isRecord(e)) return false
  const kinds = EFFECT_KEYS.filter((k) => k in e)
  if (kinds.length !== 1) return false
  const shape = EFFECT_SHAPES[kinds[0]]
  if (Object.keys(e).some((k) => !shape.fields.includes(k))) return false
  return shape.ok(e)
}

/** 条件の書き方（点検の文に出す） */
const showCond = (c: unknown): string => {
  try {
    return JSON.stringify(c)
  } catch {
    return String(c)
  }
}

/**
 * 台本の点検（読み込み時と確認用）。行き先のない場面、知らない話し手・札、
 * 話し手が出てこない入口などを、文で返す（空なら問題なし）。
 * 段階4b: 知らない条件・効果、時間のピース（opts.timePieces だけ）、夜話の台本の決まり、差し込み（{呼び名} はましろの台詞だけ）も見る
 */
export function validateScript(
  script: DialogueScript,
  cards: Record<string, LoreCard>,
  pieceIds: Set<string>,
  itemIds?: Set<string>,
  opts?: { timePieces?: ReadonlySet<string> },
): string[] {
  const errs: string[] = []
  const nodes = script.nodes
  const has = (id: string) => Object.prototype.hasOwnProperty.call(nodes, id)
  const yobanashi = script.kind === 'yobanashi'
  if (script.kind !== undefined && script.kind !== 'talk' && script.kind !== 'yobanashi') errs.push(`${script.id}: 台本の種類 ${String(script.kind)} は知らない（talk か yobanashi）`)
  if (script.needsConsent !== undefined && script.needsConsent !== true) errs.push(`${script.id}: needsConsent は true だけ`)
  if (!script.entries.length) errs.push(`${script.id}: 入口がない`)
  for (const e of script.entries) if (!has(e.node)) errs.push(`${script.id}: 入口の場面 ${e.node} がない`)
  const entryIds = new Set<string>()
  for (const e of script.entries) {
    if (e.id === undefined) continue
    if (entryIds.has(e.id)) errs.push(`${script.id}: 入口の id ${e.id} が2回ある`)
    entryIds.add(e.id)
  }
  if (yobanashi) {
    if (!script.yokaiId) errs.push(`${script.id}: 夜話の台本には妖怪（yokaiId）が要る`)
    for (const e of script.entries) if (!e.id) errs.push(`${script.id}: 夜話の入口 ${e.node} に id がない`)
    const last = script.entries[script.entries.length - 1]
    if (last && (last.id !== 'again' || last.when?.length)) errs.push(`${script.id}: 夜話の最後の入口は、条件の無い again にする`)
  }
  /** 条件の点検（知らない種類・妖怪のいない台本で妖怪を省いた条件・知らない持ち物） */
  const checkConds = (conds: unknown, where: string) => {
    if (conds === undefined) return
    if (!Array.isArray(conds)) {
      errs.push(`${script.id}: ${where}の条件が並び（配列）でない`)
      return
    }
    for (const w of conds as unknown[]) {
      if (!isKnownCondition(w)) {
        errs.push(`${script.id}: ${where}の条件 ${showCond(w)} は知らない（種類か形が違う）`)
        continue
      }
      const c = w as Condition
      if (!script.yokaiId && needsYokai(c)) errs.push(`${script.id}: ${where}の条件に妖怪を書く`)
      if ('item' in c && itemIds && !itemIds.has(c.item)) errs.push(`${script.id}: ${where}の条件の持ち物 ${c.item} がない`)
    }
  }
  for (const e of script.entries) checkConds(e.when, `入口 ${e.node} `)
  const reach = new Set<string>()
  const walk = (id: string) => {
    if (reach.has(id) || !has(id)) return
    reach.add(id)
    const n = nodes[id]
    if (n.next) walk(n.next)
    for (const c of n.choices ?? []) walk(c.next)
  }
  for (const e of script.entries) walk(e.node)
  for (const [id, n] of Object.entries(nodes)) {
    if (!reach.has(id)) errs.push(`${script.id}: 場面 ${id} にどこからも来ない`)
    const exits = (n.choices?.length ? 1 : 0) + (n.next ? 1 : 0) + (n.end ? 1 : 0)
    if (exits !== 1) errs.push(`${script.id}: 場面 ${id} の出口（choices / next / end）は1つだけにする`)
    if (n.next && !has(n.next)) errs.push(`${script.id}: 場面 ${id} の next ${n.next} がない`)
    for (const c of n.choices ?? []) if (!has(c.next)) errs.push(`${script.id}: 場面 ${id} の選択肢「${c.text}」の行き先 ${c.next} がない`)
    // 同時に出る選択肢は3つまで。条件つき（when）の選択肢は、状態によって出し分ける分だけ多く書いてよい（全部で6つまで）
    if ((n.choices?.length ?? 0) > 6) errs.push(`${script.id}: 場面 ${id} の選択肢は全部で6つまで`)
    else if ((n.choices?.length ?? 0) > 3) {
      const most = maxVisibleChoices(n.choices ?? [], script.yokaiId ?? '')
      if (most > 3) errs.push(`${script.id}: 場面 ${id} の選択肢が、同時に ${most} つ出ることがある（3つまで）`)
    }
    if (n.choices?.length && !n.lines?.length) errs.push(`${script.id}: 場面 ${id} は選択肢の前に台詞を置く`)
    for (const l of n.lines ?? []) {
      const sp = script.speakers[l.speaker]
      if (!sp) errs.push(`${script.id}: 場面 ${id} の話し手 ${l.speaker} がいない`)
      checkConds(l.when, `場面 ${id} の台詞`)
      // 差し込みは {呼び名} だけ。呼び名を使うのは、ましろ（companion）だけ（妖怪は呼び名を使わない。04 §3.3）
      for (const t of tokenProblems(l.text, [YOBINA_TOKEN])) errs.push(`${script.id}: 場面 ${id} の台詞の差し込み ${t} は使えない（{呼び名} だけ）`)
      if (l.text.includes(YOBINA_TOKEN) && sp?.role !== 'companion') errs.push(`${script.id}: 場面 ${id} の ${l.speaker} の台詞に {呼び名} は使えない（ましろだけ）`)
    }
    for (const c of n.choices ?? []) {
      checkConds(c.when, `場面 ${id} の選択肢「${c.text}」`)
      if (c.needsConsent !== undefined && c.needsConsent !== true) errs.push(`${script.id}: 場面 ${id} の選択肢「${c.text}」の needsConsent は true だけ`)
      for (const t of tokenProblems(c.text, [])) errs.push(`${script.id}: 場面 ${id} の選択肢「${c.text}」に差し込み ${t} は使えない`)
    }
    for (const e of n.effects ?? []) {
      if (!isKnownEffect(e)) {
        errs.push(`${script.id}: 場面 ${id} の効果 ${showCond(e)} は知らない（種類か形が違う）`)
        continue
      }
      if (yobanashi && !('showCard' in e)) errs.push(`${script.id}: 場面 ${id} は夜話なので、効果は showCard だけ`)
      if ('showCard' in e && !cards[e.showCard]) errs.push(`${script.id}: 場面 ${id} の札 ${e.showCard} がない`)
      if ('timePiece' in e) {
        if (!pieceIds.has(e.timePiece)) errs.push(`${script.id}: 場面 ${id} のピース ${e.timePiece} が曼荼羅にない`)
        if (!opts?.timePieces?.has(e.timePiece)) errs.push(`${script.id}: 場面 ${id} の timePiece ${e.timePiece} は時間のピースでない`)
      }
      if ('openCard' in e && !cards[e.openCard]) errs.push(`${script.id}: 場面 ${id} の札 ${e.openCard} がない`)
      if ('piece' in e && !pieceIds.has(e.piece)) errs.push(`${script.id}: 場面 ${id} のピース ${e.piece} が曼荼羅にない`)
      if (('meet' in e || 'bond' in e) && !script.yokaiId) errs.push(`${script.id}: 場面 ${id} は妖怪のいない台本なので、会う・縁の効果は使えない`)
      const item = 'receive' in e ? e.receive : 'deliver' in e ? e.deliver : null
      if (item !== null && itemIds && !itemIds.has(item)) errs.push(`${script.id}: 場面 ${id} の持ち物 ${item} がない`)
      if ('game' in e) errs.push(...validateGame(e.game, cards).map((m) => `${script.id}: 場面 ${id} の${m}`))
    }
  }
  return errs
}

const ITEM_STATES: ItemState[] = ['none', 'held', 'given']

/** 妖怪のいない台本で、妖怪を省いた「会ったか」「縁」「その日に会ったか」の条件は使えない */
const needsYokai = (c: Condition): boolean => ('met' in c || 'bondAtLeast' in c || 'metToday' in c) && !c.yokai

function validateGame(g: GameSpec, cards: Record<string, LoreCard>): string[] {
  const errs: string[] = []
  const type = (g as { type: unknown }).type
  if (type !== 'matsu' && type !== 'etoki') return [`遊び ${String(type)} は知らない`]
  for (const [k, v] of Object.entries(g.lines ?? {})) if (typeof v !== 'string') errs.push(`遊びの台詞 ${k} が文字でない`)
  if (g.type === 'etoki') {
    if (!g.title) errs.push('絵解き鎮めに題がない')
    errs.push(...validateEtokiKeys((g.slots ?? []).map(slotKey), cards).map((m) => `絵解き鎮めの${m}`))
  }
  return errs
}

/** 並べる札の数のいちばん多いとき（絵解き鎮めも稽古も） */
const ETOKI_MAX = 4

/** 絵解き鎮めの札の並びを、稽古と同じ書き方（札の id か、pending:<確認待ちの理由>）にする。理由が文字でなければ、理由なし（pending:）として点検にかける */
const slotKey = (s: EtokiSlot): string => ('card' in s ? s.card : `pending:${typeof s.pending === 'string' ? s.pending : ''}`)

/**
 * 並べる札の点検（絵解き鎮めの slots と、曼荼羅のピースの稽古 keiko で同じ決まり）。
 * 札の数（min〜4枚）、同じ札を2回入れない、知らない札がない、白紙の札には確認待ちの理由がある。文の頭は呼ぶ側が付ける
 */
export function validateEtokiKeys(keys: readonly string[], cards: Record<string, LoreCard>, min = 1): string[] {
  const errs: string[] = []
  if (keys.length < min || keys.length > ETOKI_MAX) errs.push(`札は${min}〜${ETOKI_MAX}枚`)
  const seen = new Set<unknown>()
  // 台本・パックの JSON から来るので、文字でない札（"card": null など）も、落ちずに「ない」と返す
  for (const key of keys as readonly unknown[]) {
    if (seen.has(key)) errs.push(`札 ${String(key)} が2回ある`)
    seen.add(key)
    if (typeof key !== 'string') errs.push(`札 ${String(key)} がない`)
    else if (!key.startsWith('pending:')) {
      if (!cards[key]) errs.push(`札 ${key} がない`)
    } else if (key === 'pending:') errs.push('白紙の札に、確認待ちの理由がない')
  }
  return errs
}

/**
 * 並べる遊びの手札（話の順。会話の絵解きと稽古で同じ作り方）。
 * 開いた札は中身つき、まだ拾っていない札は白紙（missing）、まだ作っていない札（pending:）も白紙（pending）
 */
export function etokiHand(keys: readonly string[], cards: Record<string, LoreCard>, progress: ProgressStore): EtokiHandCard[] {
  return keys.map((key): EtokiHandCard => {
    if (key.startsWith('pending:')) return { key, blank: 'pending' }
    const card = cards[key]
    // 了承待ちの札は、開いていても見せない（まだ作っていない札と同じ白紙。02 F-71）
    if (isPendingConsent(card)) return { key, blank: 'pending' }
    return card && progress.isCardOpened(key) ? { key, card } : { key, blank: 'missing' }
  })
}

/**
 * 条件つきの選択肢が、いちどに最大いくつ出るか。条件が見ているもの（フラグ・札・会ったか・旅・縁・ピース・その日に会ったか）ごとに
 * 取りうる値をすべて組み合わせて数える（同じフラグの true と false は同時に成り立たない）。了承待ちの選択肢は出ないので数えない。
 */
function maxVisibleChoices(all: ScriptChoice[], yokaiDefault: string): number {
  const choices = all.filter((c) => !c.needsConsent)
  const keyOf = (c: Condition): string => {
    if ('metToday' in c) return `metToday:${c.yokai ?? yokaiDefault}`
    if ('met' in c) return `met:${c.yokai ?? yokaiDefault}`
    if ('card' in c) return `card:${c.card}`
    if ('bondAtLeast' in c) return `bond:${c.yokai ?? yokaiDefault}`
    if ('piece' in c) return `piece:${c.piece}`
    if ('flag' in c) return `flag:${c.flag}`
    if ('item' in c) return `item:${c.item}`
    if ('questRoom' in c) return 'questRoom'
    return 'travel'
  }
  const domain = new Map<string, number[]>()
  for (const ch of choices)
    for (const c of ch.when ?? []) {
      const k = keyOf(c)
      if (domain.has(k)) continue
      if ('bondAtLeast' in c) domain.set(k, BOND_LEVELS.map((_, i) => i))
      // その日に会ったか: 0＝会っていない、1＝夢で、2＝現地で
      else if ('metToday' in c) domain.set(k, [0, 1, 2])
      else if ('piece' in c) domain.set(k, PIECE_STATES.map((_, i) => i))
      else if ('item' in c) domain.set(k, ITEM_STATES.map((_, i) => i))
      else domain.set(k, [0, 1])
    }
  const keys = [...domain.keys()]
  const truth = (c: Condition, v: number): boolean => {
    if ('metToday' in c) return v !== 0 && (c.metToday === 'any' || (v === 1 ? 'yume' : 'utsutsu') === c.metToday)
    if ('met' in c) return (v === 1) === c.met
    if ('card' in c) return (v === 1) === c.opened
    if ('bondAtLeast' in c) return v >= bondRank(c.bondAtLeast)
    if ('piece' in c) return v >= pieceRank(c.atLeast)
    if ('flag' in c) return (v === 1) === c.is
    if ('item' in c) return ITEM_STATES[v] === c.state
    if ('questRoom' in c) return (v === 1) === c.questRoom
    return (v === 1) === (c.travel === 'utsutsu')
  }
  let most = 0
  const assign = new Map<string, number>()
  const walk = (i: number): void => {
    if (i === keys.length) {
      const n = choices.filter((ch) => (ch.when ?? []).every((c) => truth(c, assign.get(keyOf(c)) ?? 0))).length
      most = Math.max(most, n)
      return
    }
    for (const v of domain.get(keys[i]) ?? [0]) {
      assign.set(keys[i], v)
      walk(i + 1)
    }
  }
  walk(0)
  return most
}
