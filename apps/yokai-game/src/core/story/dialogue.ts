// 台本の会話を進める仕組み（描画に依存しない）。夢の旅と、のちの現の旅で同じものを使う。
//
// 使い方: start() で最初の「拍」（beat）を受け取り、表示し終えたら next()、選択肢なら choose(i)。
// 拍は、台詞（line）・伝承の札（card）・お知らせ（notice: 縁・ピース）・小さな遊び（game）・選択肢（choices）・終わり（end）の6種類。
// 効果（札・ピース・縁）は、その拍に来たときに1回だけ適用して保存する（途中で閉じても、そこまでは残る）。

import { type ProgressStore, bondRank, pieceRank } from './progress'
import {
  BOND_LABEL,
  type BondLevel,
  type Condition,
  type DialogueScript,
  type Effect,
  type GameResult,
  type GameSpec,
  type LoreCard,
  PIECE_LABEL,
  type PieceState,
  type ScriptSpeaker,
  type Travel,
} from './types'

export type Notice =
  | { type: 'bond'; yokai: string; level: BondLevel; label: string; capped: boolean }
  | { type: 'piece'; piece: string; state: PieceState; label: string; capped: boolean; travel: Travel }

export type Beat =
  | { kind: 'line'; speakerId: string; speaker: ScriptSpeaker; text: string }
  | { kind: 'card'; card: LoreCard; first: boolean }
  | { kind: 'notice'; notice: Notice }
  | { kind: 'game'; game: GameSpec; yokai: string }
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
}

type Step = { kind: 'line'; speaker: string; text: string } | { kind: 'effect'; effect: Effect } | { kind: 'goto'; node: string } | { kind: 'choices' } | { kind: 'end' }

export class DialogueRunner {
  private queue: Step[] = []
  private nodeId = ''
  private lastLine: Extract<Beat, { kind: 'line' }> | null = null
  private current: Beat | null = null
  private visibleChoices: { index: number; text: string; next: string }[] = []
  /** 通った場面（確認用） */
  readonly trail: string[] = []

  constructor(
    readonly script: DialogueScript,
    private readonly ctx: DialogueContext,
  ) {}

  /** 条件を満たした最初の入口から始める */
  start(): Beat {
    const entry = this.script.entries.find((e) => this.check(e.when))
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
    if (this.current.kind === 'game' && this.current.game.tappedFlag)
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
    for (const l of node.lines ?? []) this.queue.push({ kind: 'line', speaker: l.speaker, text: l.text })
    for (const e of node.effects ?? []) this.queue.push({ kind: 'effect', effect: e })
    if (node.choices?.length) this.queue.push({ kind: 'choices' })
    else if (node.next) this.queue.push({ kind: 'goto', node: node.next })
    else this.queue.push({ kind: 'end' })
  }

  private advance(): Beat {
    for (let guard = 0; guard < 200; guard++) {
      const step = this.queue.shift()
      if (!step) return (this.current = { kind: 'end' })
      if (step.kind === 'line') {
        const speaker = this.script.speakers[step.speaker] ?? { name: step.speaker, role: 'yokai' as const }
        const beat = { kind: 'line' as const, speakerId: step.speaker, speaker, text: step.text }
        this.lastLine = beat
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
        this.visibleChoices = (node?.choices ?? [])
          .map((c, index) => ({ index, text: c.text, next: c.next, when: c.when }))
          .filter((c) => this.check(c.when))
        if (!this.visibleChoices.length) return (this.current = { kind: 'end' })
        return (this.current = {
          kind: 'choices',
          context: this.lastLine,
          options: this.visibleChoices.map(({ index, text }) => ({ index, text })),
        })
      }
      return (this.current = { kind: 'end' })
    }
    return (this.current = { kind: 'end' })
  }

  /** 効果を適用する。画面に見せるもの（札・お知らせ）があれば拍を返す */
  private apply(e: Effect): Beat | null {
    const { progress, travel } = this.ctx
    const yokai = this.script.yokaiId
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
      if (!card) return null
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
    if ('game' in e) return { kind: 'game', game: e.game, yokai }
    return null
  }

  check(conds: Condition[] | undefined): boolean {
    return checkConditions(conds, this.ctx.progress, this.ctx.travel, this.script.yokaiId)
  }
}

/** 条件（すべて満たすと真）。yokai を省いた条件は yokaiDefault の妖怪で見る。台本の入口・選択肢と、節の終わり（旅印）で使う */
export function checkConditions(conds: Condition[] | undefined, p: ProgressStore, travel: Travel, yokaiDefault = ''): boolean {
  if (!conds?.length) return true
  return conds.every((c) => {
    if ('met' in c) return p.hasMet(c.yokai ?? yokaiDefault) === c.met
    if ('card' in c) return p.isCardOpened(c.card) === c.opened
    if ('bondAtLeast' in c) return bondRank(p.bondOf(c.yokai ?? yokaiDefault)) >= bondRank(c.bondAtLeast)
    if ('piece' in c) return pieceRank(p.pieceOf(c.piece)) >= pieceRank(c.atLeast)
    if ('flag' in c) return p.flag(c.flag) === c.is
    if ('travel' in c) return travel === c.travel
    return false
  })
}

/**
 * 台本の点検（読み込み時と確認用）。行き先のない場面、知らない話し手・札、
 * 話し手が出てこない入口などを、文で返す（空なら問題なし）。
 */
export function validateScript(script: DialogueScript, cards: Record<string, LoreCard>, pieceIds: Set<string>): string[] {
  const errs: string[] = []
  const nodes = script.nodes
  const has = (id: string) => Object.prototype.hasOwnProperty.call(nodes, id)
  if (!script.entries.length) errs.push(`${script.id}: 入口がない`)
  for (const e of script.entries) if (!has(e.node)) errs.push(`${script.id}: 入口の場面 ${e.node} がない`)
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
    const always = (n.choices ?? []).filter((c) => !c.when?.length).length
    if (always > 3 || (n.choices?.length ?? 0) > 6) errs.push(`${script.id}: 場面 ${id} の選択肢は、条件なしで3つまで・全部で6つまで`)
    if (n.choices?.length && !n.lines?.length) errs.push(`${script.id}: 場面 ${id} は選択肢の前に台詞を置く`)
    for (const l of n.lines ?? []) if (!script.speakers[l.speaker]) errs.push(`${script.id}: 場面 ${id} の話し手 ${l.speaker} がいない`)
    for (const e of n.effects ?? []) {
      if ('openCard' in e && !cards[e.openCard]) errs.push(`${script.id}: 場面 ${id} の札 ${e.openCard} がない`)
      if ('piece' in e && !pieceIds.has(e.piece)) errs.push(`${script.id}: 場面 ${id} のピース ${e.piece} が曼荼羅にない`)
      if ('game' in e && e.game.type !== 'matsu') errs.push(`${script.id}: 場面 ${id} の遊び ${String((e.game as { type: unknown }).type)} は知らない`)
    }
  }
  return errs
}
