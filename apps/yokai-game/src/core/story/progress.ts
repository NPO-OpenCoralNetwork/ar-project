// 進み具合（会った・札・ピース・縁）。端末に保存する（02 F-50）。描画に依存しない。
//
// 決まり:
// - 縁は下がらない。夢の旅で上がるのは「なじみ」まで（BOND_CAP、05 §3）。
// - ピースは下がらない。夢の旅では白描まで（PIECE_CAP）。
// - 出会い・札・ピースには、最初から「現地で得たか」の印（onsite）を持たせる（02 F-46）。座標は残さない。
// - 旅印（02 F-45）は現地で節を終えたときだけ押せる。日付（at）だけを持ち、場所は持たない。売ったり譲ったりする仕組みはない。

import {
  BOND_CAP,
  BOND_LEVELS,
  type BondLevel,
  PIECE_CAP,
  PIECE_STATES,
  type PieceState,
  type Travel,
} from './types'

export interface Gained {
  /** ISO 8601 の日時 */
  at: string
  travel: Travel
  /** 現地で得たか（02 F-46 verified_onsite） */
  onsite: boolean
}

export interface YokaiProgress {
  met?: Gained
  bond: BondLevel
  /** 縁が上がった時（夢か現地か） */
  bondGained?: Gained
}

export interface Progress {
  v: 1
  yokai: Record<string, YokaiProgress>
  cards: Record<string, Gained>
  pieces: Record<string, Gained & { state: PieceState }>
  flags: Record<string, boolean>
  /** 旅印（節の id → 押した時。現地だけ） */
  stamps: Record<string, Gained>
}

/** localStorage と同じ形（テストや、保存できない環境では差し替える） */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function emptyProgress(): Progress {
  return { v: 1, yokai: {}, cards: {}, pieces: {}, flags: {}, stamps: {} }
}

export const bondRank = (b: BondLevel): number => BOND_LEVELS.indexOf(b)
export const pieceRank = (s: PieceState): number => PIECE_STATES.indexOf(s)

/**
 * 壊れた保存や古い形を、読める形に直す（読めない項目は捨てる）。
 * 手で書き換えた保存でも、旅ごとの上限（夢は「なじみ」・白描まで）を超えないように丸める。
 * onsite は travel と食い違っていたら捨てる（02 F-46）。
 */
function sanitize(raw: unknown): Progress {
  const p = emptyProgress()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as { v?: unknown }).v !== 1) return p
  const r = raw as Partial<Progress>
  const isGained = (g: unknown): g is Gained => {
    if (!g || typeof g !== 'object') return false
    const x = g as Gained
    if (typeof x.at !== 'string' || (x.travel !== 'yume' && x.travel !== 'utsutsu')) return false
    return typeof x.onsite === 'boolean' && x.onsite === (x.travel === 'utsutsu')
  }
  const gainedOf = (g: unknown): Gained | undefined => (isGained(g) ? { at: g.at, travel: g.travel, onsite: g.onsite } : undefined)
  const obj = (o: unknown): Record<string, unknown> => (o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {})
  for (const [id, yv] of Object.entries(obj(r.yokai))) {
    if (!yv || typeof yv !== 'object') continue
    const y = yv as Partial<YokaiProgress>
    const met = gainedOf(y.met)
    const bondGained = gainedOf(y.bondGained)
    let bond: BondLevel = BOND_LEVELS.includes(y.bond as BondLevel) ? (y.bond as BondLevel) : 'kehai'
    // 縁が上がった時の印がなければ夢の上限、あればその旅の上限で丸める
    const cap = BOND_CAP[bondGained?.travel ?? 'yume']
    if (bondRank(bond) > bondRank(cap)) bond = cap
    p.yokai[id] = { bond, met, bondGained: bond === 'kehai' ? undefined : bondGained }
  }
  for (const [id, g] of Object.entries(obj(r.cards))) {
    const c = gainedOf(g)
    if (c) p.cards[id] = c
  }
  for (const [id, g] of Object.entries(obj(r.pieces))) {
    const c = gainedOf(g)
    const st = (g as { state?: unknown }).state as PieceState
    if (!c || !PIECE_STATES.includes(st) || st === 'empty') continue
    const cap = PIECE_CAP[c.travel]
    p.pieces[id] = { ...c, state: pieceRank(st) > pieceRank(cap) ? cap : st }
  }
  for (const [k, v] of Object.entries(obj(r.flags))) if (typeof v === 'boolean') p.flags[k] = v
  for (const [id, g] of Object.entries(obj(r.stamps))) {
    const c = gainedOf(g)
    if (c?.onsite) p.stamps[id] = c
  }
  return p
}

export class ProgressStore {
  private state: Progress
  private readonly listeners = new Set<(p: Readonly<Progress>) => void>()

  constructor(
    private readonly storage: KeyValueStore | null,
    private readonly key: string,
    /** 時刻（テストで差し替える） */
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load()
  }

  get(): Readonly<Progress> {
    return this.state
  }

  onChange(fn: (p: Readonly<Progress>) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private load(): Progress {
    if (!this.storage) return emptyProgress()
    let s: string | null = null
    try {
      s = this.storage.getItem(this.key)
      return s ? sanitize(JSON.parse(s)) : emptyProgress()
    } catch {
      // 読めない保存は、次の保存で上書きする前に別の鍵へ写しておく（調べられるように）
      if (s) {
        try {
          this.storage.setItem(`${this.key}.broken`, s)
        } catch {
          // 写せなくても遊べる
        }
      }
      return emptyProgress()
    }
  }

  private commit(): void {
    if (this.storage) {
      try {
        this.storage.setItem(this.key, JSON.stringify(this.state))
      } catch {
        // 保存できなくても遊べる（再読み込みで最初から）
      }
    }
    for (const fn of this.listeners) fn(this.state)
  }

  private gained(travel: Travel): Gained {
    return { at: this.now().toISOString(), travel, onsite: travel === 'utsutsu' }
  }

  private yokaiOf(id: string): YokaiProgress {
    return (this.state.yokai[id] ??= { bond: 'kehai' })
  }

  hasMet(yokai: string): boolean {
    return !!this.state.yokai[yokai]?.met
  }

  bondOf(yokai: string): BondLevel {
    return this.state.yokai[yokai]?.bond ?? 'kehai'
  }

  pieceOf(id: string): PieceState {
    return this.state.pieces[id]?.state ?? 'empty'
  }

  /** 会った（夢の姿でも現地でも）。はじめてなら true */
  meet(yokai: string, travel: Travel): boolean {
    const y = this.yokaiOf(yokai)
    if (y.met && (y.met.onsite || travel === 'yume')) return false
    // 夢で会った後に現地で会ったら、現地の印に書き換える（格が上がる）
    const first = !y.met
    y.met = this.gained(travel)
    this.commit()
    return first
  }

  /**
   * 縁を上げる。下げない。旅ごとの上限（夢は「なじみ」まで）を超える分は上限で止める。
   * 戻り値: 変わった後の段階と、変わったか、上限で止めたか
   */
  raiseBond(yokai: string, to: BondLevel, travel: Travel): { level: BondLevel; changed: boolean; capped: boolean } {
    const y = this.yokaiOf(yokai)
    const cap = BOND_CAP[travel]
    const capped = bondRank(to) > bondRank(cap)
    const want = capped ? cap : to
    if (bondRank(want) <= bondRank(y.bond)) return { level: y.bond, changed: false, capped }
    y.bond = want
    y.bondGained = this.gained(travel)
    this.commit()
    return { level: want, changed: true, capped }
  }

  isCardOpened(id: string): boolean {
    return !!this.state.cards[id]
  }

  /** 札を開いた。はじめてなら true */
  openCard(id: string, travel: Travel): boolean {
    if (this.state.cards[id]) return false
    this.state.cards[id] = this.gained(travel)
    this.commit()
    return true
  }

  /** ピースの状態を上げる。下げない。夢の旅では白描まで */
  setPiece(id: string, state: PieceState, travel: Travel): { state: PieceState; changed: boolean; capped: boolean } {
    const cap = PIECE_CAP[travel]
    const capped = pieceRank(state) > pieceRank(cap)
    const want = capped ? cap : state
    const cur = this.pieceOf(id)
    if (pieceRank(want) <= pieceRank(cur)) return { state: cur, changed: false, capped }
    this.state.pieces[id] = { ...this.gained(travel), state: want }
    this.commit()
    return { state: want, changed: true, capped }
  }

  stampOf(id: string): Gained | undefined {
    return this.state.stamps[id]
  }

  /** 旅印を押す。現地（utsutsu）だけ。はじめてなら true */
  stamp(id: string, travel: Travel): boolean {
    if (travel !== 'utsutsu' || this.state.stamps[id]) return false
    this.state.stamps[id] = this.gained(travel)
    this.commit()
    return true
  }

  flag(key: string): boolean {
    return this.state.flags[key] === true
  }

  setFlag(key: string, value: boolean): void {
    if (this.state.flags[key] === value) return
    this.state.flags[key] = value
    this.commit()
  }

  /** 最初からやり直す（保存も消す） */
  reset(): void {
    this.state = emptyProgress()
    if (this.storage) {
      try {
        this.storage.removeItem(this.key)
      } catch {
        // 消せなくても、次の保存で上書きされる
      }
    }
    for (const fn of this.listeners) fn(this.state)
  }
}

/** localStorage を安全に包む（使えない環境では null） */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage
    const k = '__probe__'
    s.setItem(k, '1')
    s.removeItem(k)
    return s
  } catch {
    return null
  }
}
