// 進み具合（会った・札・ピース・縁・持ち物）。端末に保存する（02 F-50）。描画に依存しない。
//
// 決まり:
// - 縁は下がらない。夢の旅で上がるのは「なじみ」まで（BOND_CAP、05 §3）。
// - ピースは下がらない。台本で入るのは、夢の旅では白描まで・現地では彩色まで（PIECE_CAP）。
//   金の縁取りは、彩色済みのピースを稽古で語り返したときだけ（家でも現地でも。goldPiece。04 §3.6）。
// - 出会い・札・ピースには、最初から「現地で得たか」の印（onsite）を持たせる（02 F-46）。座標は残さない。
//   彩色のあとに家で金になっても、彩色を現地で得た印（colored）は残す。
// - 旅印（02 F-45）は現地で節を終えたときだけ押せる。日付（at）だけを持ち、場所は持たない。売ったり譲ったりする仕組みはない。
// - 会話を最後まで話した回数（talks）は、縁の段階を上げない（04 §3.3「会話では段階は上がらない」）。糸の艶にだけ使う。
// - 版2（10/18）: 持ち物・会話の回数・最後に会った時・フラグを書いた時（引き継ぎで2台の保存を合わせるため）を足した。
//   版1の保存は読み込むときに版2へ直す（捨てない）。

import {
  BOND_CAP,
  BOND_LEVELS,
  type BondLevel,
  type ItemState,
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
  /** 最後に会った時（夜話の「その日に会った」に使う。04 §3.8） */
  lastMet?: Gained
  /** 会話を最後まで話した回数（縁の段階は上げない。糸の艶にだけ使う） */
  talks?: number
}

/** ピース。at・travel・onsite は、いまの状態になった時。colored は彩色を得た時（家で金になっても残す） */
export type PieceProgress = Gained & { state: PieceState; colored?: Gained }

/** 持ち物。got＝受け取った時、given＝渡した時 */
export interface ItemProgress {
  got: Gained
  given?: Gained
}

export interface Progress {
  v: 2
  yokai: Record<string, YokaiProgress>
  cards: Record<string, Gained>
  pieces: Record<string, PieceProgress>
  flags: Record<string, boolean>
  /** フラグを書いた時（ISO。引き継ぎで2台の保存を合わせるとき、新しいほうを取る） */
  flagAt: Record<string, string>
  /** 旅印（節の id → 押した時。現地だけ） */
  stamps: Record<string, Gained>
  items: Record<string, ItemProgress>
  /** 最後に書いた時（ISO） */
  updatedAt?: string
}

/** localStorage と同じ形（テストや、保存できない環境では差し替える） */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function emptyProgress(): Progress {
  return { v: 2, yokai: {}, cards: {}, pieces: {}, flags: {}, flagAt: {}, stamps: {}, items: {} }
}

export const bondRank = (b: BondLevel): number => BOND_LEVELS.indexOf(b)
export const pieceRank = (s: PieceState): number => PIECE_STATES.indexOf(s)

/** 読めない版の保存（版1・版2 のどちらでもない）。読み込まずに、別の鍵へ写して残す */
class UnknownVersion extends Error {}

/**
 * 壊れた保存や古い形を、読める形に直す（読めない項目は捨てる）。版1 は版2 に直す。
 * 手で書き換えた保存や、引き継ぎで読み込んだ保存でも、旅ごとの上限（夢は「なじみ」・白描まで）を超えないように丸める。
 * onsite は travel と食い違っていたら捨てる（02 F-46）。
 */
export function sanitize(raw: unknown): Progress {
  const p = emptyProgress()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p
  const v = (raw as { v?: unknown }).v
  if (v !== 1 && v !== 2) throw new UnknownVersion(String(v))
  const r = raw as Partial<Omit<Progress, 'v'>>
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
    const lastMet = gainedOf(y.lastMet)
    const talks = typeof y.talks === 'number' && Number.isFinite(y.talks) && y.talks > 0 ? Math.floor(y.talks) : undefined
    p.yokai[id] = { bond, met, bondGained: bond === 'kehai' ? undefined : bondGained, lastMet, talks }
  }
  for (const [id, g] of Object.entries(obj(r.cards))) {
    const c = gainedOf(g)
    if (c) p.cards[id] = c
  }
  for (const [id, g] of Object.entries(obj(r.pieces))) {
    const c = gainedOf(g)
    const st = (g as { state?: unknown }).state as PieceState
    if (!c || !PIECE_STATES.includes(st) || st === 'empty') continue
    // 彩色を現地で得た印があれば、金まで（家で稽古した金も残す）。なければ、その旅で台本が入れられる上限まで
    let colored = gainedOf((g as { colored?: unknown }).colored)
    if (!colored && c.onsite && pieceRank(st) >= pieceRank('saishiki')) colored = c
    const cap: PieceState = colored?.onsite ? 'kin' : PIECE_CAP[c.travel]
    p.pieces[id] = { ...c, state: pieceRank(st) > pieceRank(cap) ? cap : st, ...(colored?.onsite ? { colored } : {}) }
  }
  for (const [k, v] of Object.entries(obj(r.flags))) if (typeof v === 'boolean') p.flags[k] = v
  for (const [k, v] of Object.entries(obj(r.flagAt))) if (typeof v === 'string' && k in p.flags) p.flagAt[k] = v
  for (const [id, it] of Object.entries(obj(r.items))) {
    const got = gainedOf((it as { got?: unknown })?.got)
    if (!got) continue
    const given = gainedOf((it as { given?: unknown }).given)
    p.items[id] = given ? { got, given } : { got }
  }
  if (typeof r.updatedAt === 'string') p.updatedAt = r.updatedAt
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
      // 読めない保存（壊れた JSON・知らない版）は、次の保存で上書きする前に別の鍵へ写しておく
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
    this.state.updatedAt = this.now().toISOString()
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

  /** 会話を最後まで話した（回数と最後に会った時を残す。縁の段階は変えない） */
  noteTalk(yokai: string, travel: Travel): void {
    const y = this.yokaiOf(yokai)
    y.talks = (y.talks ?? 0) + 1
    y.lastMet = this.gained(travel)
    this.commit()
  }

  talksWith(yokai: string): number {
    return this.state.yokai[yokai]?.talks ?? 0
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

  /** ピースの状態を上げる（台本の効果）。下げない。夢の旅では白描まで、現地では彩色まで */
  setPiece(id: string, state: PieceState, travel: Travel): { state: PieceState; changed: boolean; capped: boolean } {
    const cap = PIECE_CAP[travel]
    const capped = pieceRank(state) > pieceRank(cap)
    const want = capped ? cap : state
    const cur = this.pieceOf(id)
    if (pieceRank(want) <= pieceRank(cur)) return { state: cur, changed: false, capped }
    const g = this.gained(travel)
    this.state.pieces[id] = { ...g, state: want, ...(want === 'saishiki' ? { colored: g } : {}) }
    this.commit()
    return { state: want, changed: true, capped }
  }

  /** 稽古で語り返した: 彩色済みのピースに金の縁取りを入れる（家でも現地でも。04 §3.6）。入れたら true */
  goldPiece(id: string, travel: Travel): boolean {
    const cur = this.state.pieces[id]
    if (!cur || cur.state !== 'saishiki') return false
    this.state.pieces[id] = { ...this.gained(travel), state: 'kin', colored: cur.colored ?? cur }
    this.commit()
    return true
  }

  itemState(id: string): ItemState {
    const it = this.state.items[id]
    return !it ? 'none' : it.given ? 'given' : 'held'
  }

  /** 持ち物を受け取る（まだ持っていなければ）。受け取ったら true */
  receive(id: string, travel: Travel): boolean {
    if (this.state.items[id]) return false
    this.state.items[id] = { got: this.gained(travel) }
    this.commit()
    return true
  }

  /** 持ち物を渡す（持っていれば）。渡したら true */
  deliver(id: string, travel: Travel): boolean {
    const it = this.state.items[id]
    if (!it || it.given) return false
    it.given = this.gained(travel)
    this.commit()
    return true
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
    this.state.flagAt[key] = this.now().toISOString()
    this.commit()
  }

  /** ほかの端末の保存を合わせる（引き継ぎ）。上がるもの（縁・札・ピース・持ち物・旅印）は高いほう、フラグは新しく書いたほう */
  mergeFrom(other: Progress): void {
    this.state = mergeProgress(this.state, other)
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

const later = (a: Gained | undefined, b: Gained | undefined): Gained | undefined => (!a ? b : !b ? a : a.at >= b.at ? a : b)
const earlier = (a: Gained | undefined, b: Gained | undefined): Gained | undefined => (!a ? b : !b ? a : a.at <= b.at ? a : b)
/** 会った印: 現地の印を先に、同じ格なら早いほう */
const betterMet = (a: Gained | undefined, b: Gained | undefined): Gained | undefined => {
  if (!a || !b) return a ?? b
  if (a.onsite !== b.onsite) return a.onsite ? a : b
  return earlier(a, b)
}

/**
 * 2つの保存を合わせる（引き継ぎ。F-51）。どちらも読める形（sanitize 済み）であること。
 * - 縁・ピースは高いほう（同じなら早く得たほう）。札・旅印・持ち物は両方を合わせる（早く得たほう、渡した印は残す）
 * - フラグは、書いた時（flagAt）が新しいほう。時の分からないフラグは、時の分かるほうに負ける
 * - 会話の回数は多いほう、最後に会った時は新しいほう
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out = emptyProgress()
  for (const id of new Set([...Object.keys(a.yokai), ...Object.keys(b.yokai)])) {
    const x = a.yokai[id]
    const y = b.yokai[id]
    if (!x || !y) {
      out.yokai[id] = structuredClone(x ?? y)
      continue
    }
    const hi = bondRank(x.bond) > bondRank(y.bond) ? x : bondRank(y.bond) > bondRank(x.bond) ? y : (earlier(x.bondGained, y.bondGained) === x.bondGained ? x : y)
    out.yokai[id] = {
      bond: hi.bond,
      bondGained: hi.bondGained,
      met: betterMet(x.met, y.met),
      lastMet: later(x.lastMet, y.lastMet),
      talks: Math.max(x.talks ?? 0, y.talks ?? 0) || undefined,
    }
  }
  for (const id of new Set([...Object.keys(a.cards), ...Object.keys(b.cards)])) out.cards[id] = earlier(a.cards[id], b.cards[id])!
  for (const id of new Set([...Object.keys(a.stamps), ...Object.keys(b.stamps)])) out.stamps[id] = earlier(a.stamps[id], b.stamps[id])!
  for (const id of new Set([...Object.keys(a.pieces), ...Object.keys(b.pieces)])) {
    const x = a.pieces[id]
    const y = b.pieces[id]
    const hi = !x || !y ? (x ?? y) : pieceRank(x.state) !== pieceRank(y.state) ? (pieceRank(x.state) > pieceRank(y.state) ? x : y) : x.at <= y.at ? x : y
    const colored = earlier(x?.colored, y?.colored)
    out.pieces[id] = { ...hi, ...(colored ? { colored } : {}) }
  }
  for (const id of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) {
    const x = a.items[id]
    const y = b.items[id]
    const got = earlier(x?.got, y?.got)!
    const given = earlier(x?.given, y?.given)
    out.items[id] = given ? { got, given } : { got }
  }
  for (const k of new Set([...Object.keys(a.flags), ...Object.keys(b.flags)])) {
    const ta = k in a.flags ? (a.flagAt[k] ?? '') : null
    const tb = k in b.flags ? (b.flagAt[k] ?? '') : null
    const fromB = ta === null || (tb !== null && tb > ta)
    out.flags[k] = fromB ? b.flags[k] : a.flags[k]
    const t = fromB ? tb : ta
    if (t) out.flagAt[k] = t
  }
  out.updatedAt = [a.updatedAt, b.updatedAt].filter(Boolean).sort().pop()
  return out
}
