// 進み具合（会った・札・ピース・縁・持ち物）。端末に保存する（02 F-50）。描画に依存しない。
//
// 決まり:
// - 縁は下がらない。夢の旅で上がるのは「なじみ」まで（BOND_CAP、05 §3）。
// - ピースは下がらない。台本で入るのは、夢の旅では白描まで・現地では彩色まで（PIECE_CAP）。
//   金の縁取りは、彩色済みのピースを稽古で語り返したときだけ（家でも現地でも。goldPiece。04 §3.6）。
// - 出会い・札・ピースには、最初から「現地で得たか」の印（onsite）を持たせる（02 F-46）。座標は残さない。
//   彩色のあとに家で金になっても、彩色を現地で得た印（colored）は残す。
// - 旅印（02 F-45）は現地で節を終えたときだけ押せる。日付（at）だけを持ち、場所は持たない。売ったり譲ったりする仕組みはない
//   （ただ、引き継ぎコード（transfer.ts）では、旅印ごと別の端末へ写せる。04 §7）。
// - 会話を最後まで話した回数（talks）は、縁の段階を上げない（04 §3.3「会話では段階は上がらない」）。糸の艶にだけ使う。
// - 版2（10/18）: 持ち物・会話の回数・最後に会った時・彩色を得た時（colored）・フラグを書いた時と最後に書いた時
//   （flagAt・updatedAt。引き継ぎで2台の保存を合わせるため）を足した。版1の保存は読み込むときに版2へ直す（捨てない）。
//   夢の旅で初めて会った時（dreamMet。縁帳の「夢で会った」）は、あとから足した。無い保存は、夢で得た印から作る。
// - 保存の名前は storage-keys.ts。前の名前の保存は、いまの名前に保存が無いときだけ写す（migrateLegacySave。4a review F1）。
//   一度写したか、この版でやり直したら、印を残して、もう写さない（やり直しても、保存は消す。4a review R1）。
//   進み具合の無い保存（フラグだけ）は写さず、印だけ残す（hasProgress）。
// - 「進み具合がある」は、会った妖怪・開いた札・ピース・持ち物・旅印のどれかがあること（hasProgress）。保存の鍵があるだけ、
//   フラグ（「新」の印を見た、など）だけの保存は数えない（写す・引き継ぎコードに入れる・保存を長く残す頼み）。
// - ほかのタブが同じ保存を書いたら、このタブの状態をそれに入れ替える（follow。開いたままのタブが、古い状態で書き戻さないように）。
//   入れ替えたことは onReplace で知らせる（このタブで変えたときは来ない。地図の地点や開いている帳を描き直すため）。
// - 版3（段階4b）: 便り（letters）・夜話（nights）・今日の絵解き（etoki）を足した。保存の名前も .v3 にした（storage-keys.ts）。
//   写すのは v3 ← v2 ← v1 の順。時間のピース（TIME_PIECES）だけは、ほんとうの逢魔が時に家で会えば彩色まで入り
//   （colored.time。04 §3.6 例外）、稽古で金まで行ける。ほかのピースの決まりは変えない。
// - 「最後に会った時」（lastMet）は、会話で妖怪が最初に話したとき（noteSeen）にも残す（途中で閉じても、その日に会ったことになる）。
//   夜話（noteVisit）は、会話の回数だけ（会ったことにしない・縁も変えない）。

import { LEGACY_STORY_KEY, LEGACY_TEST_KEY, STORY_KEY, TEST_KEY, V2_STORY_KEY, V2_TEST_KEY } from '../storage-keys'
import type { DayKey } from './clock'
import {
  BOND_CAP,
  BOND_LEVELS,
  type BondLevel,
  type ItemState,
  PIECE_CAP,
  PIECE_STATES,
  type PieceState,
  TIME_PIECES,
  type Travel,
} from './types'

/** 保存の版 */
export const SAVE_VERSION = 3

export interface Gained {
  /** ISO 8601 の日時 */
  at: string
  travel: Travel
  /** 現地で得たか（02 F-46 verified_onsite） */
  onsite: boolean
}

export interface YokaiProgress {
  /** 会った時（夢で会ったあとに現地で会うと、現地の印に書き換える） */
  met?: Gained
  /** 夢の旅で初めて会った時（会った・話し終えた・縁が上がった、のうち最初。現地で会い直しても残す。縁帳の「夢で会った」） */
  dreamMet?: Gained
  bond: BondLevel
  /** 縁が上がった時（夢か現地か） */
  bondGained?: Gained
  /** 最後に会った時（夜話の「その日に会った」に使う。04 §3.8） */
  lastMet?: Gained
  /** 会話を最後まで話した回数（縁の段階は上げない。糸の艶にだけ使う） */
  talks?: number
}

/** 彩色を得た時。time は時間のピースを、家で（ほんとうの逢魔が時に）彩色にした印 */
export type ColoredGained = Gained & { time?: true }
/** ピース。at・travel・onsite は、いまの状態になった時。colored は彩色を得た時（家で金になっても残す） */
export type PieceProgress = Gained & { state: PieceState; colored?: ColoredGained }

/** 持ち物。got＝受け取った時、given＝渡した時 */
export interface ItemProgress {
  got: Gained
  given?: Gained
}

/** 便り。got＝届いた時（ISO）、parts＝届いた時に選んだ部品の id（あとで変えない）、read＝はじめて読んだ時 */
export interface LetterRecord {
  got: string
  parts: string[]
  read?: string
}
/** その夜の夜話（一晩に一つ）。done＝最後まで聞いた */
export interface NightRecord {
  yokai: string
  entry: string
  at: string
  done?: true
}
/** その日の絵解き。caption は絵解きの添え書きの鍵（'q:<クエスト id>' | 'met:<妖怪 id,…>' | 'none'）。phrase は一言の id */
export interface EtokiRecord {
  at: string
  travel: Travel
  cards: string[]
  phrase?: string
  caption: string
}

export interface Progress {
  v: 3
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
  /** 届いた便り（便りの id → 記録。ましろの便りは fumi:<物語の日>） */
  letters: Record<string, LetterRecord>
  /** 夜話（物語の日 → その夜の記録。来なかった夜は何も残さない） */
  nights: Record<DayKey, NightRecord>
  /** 今日の絵解き（物語の日 → その日の札。同じ日につくり直すと入れ替える） */
  etoki: Record<DayKey, EtokiRecord>
}

/** localStorage と同じ形（テストや、保存できない環境では差し替える） */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** ほかのタブがその鍵を書いた・消したときに呼ぶ（新しい値。消したら null）。やめる関数を返す。ブラウザだけ（browserStorage） */
  subscribe?(key: string, fn: (value: string | null) => void): () => void
}

export function emptyProgress(): Progress {
  return { v: 3, yokai: {}, cards: {}, pieces: {}, flags: {}, flagAt: {}, stamps: {}, items: {}, letters: {}, nights: {}, etoki: {} }
}

/** 夜話・絵解きの記録を残す日数（新しいほうから） */
export const DAY_RECORDS_MAX = 60

export const bondRank = (b: BondLevel): number => BOND_LEVELS.indexOf(b)
export const pieceRank = (s: PieceState): number => PIECE_STATES.indexOf(s)

/** この版より新しい版の保存（版が 3 より大きい数）。読み込まずに、別の鍵へ写して残す */
export class UnknownVersion extends Error {}
/** 読めない保存（表の形でない・版が無い・版が数でない、1〜3 でもない）。新しい版とは分ける。これも読み込まずに、別の鍵へ写して残す */
export class UnreadableSave extends Error {}

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const LETTER_ID_RE = /^[a-z0-9][a-z0-9:_.-]{0,63}$/
const chars = (s: string): number => [...s].length
/** 日ごとの記録を、新しい日から max 日分だけ残す */
function keepLatest<T>(rec: Record<string, T>, max = DAY_RECORDS_MAX): Record<string, T> {
  const keys = Object.keys(rec).sort().slice(-max)
  return Object.fromEntries(keys.map((k) => [k, rec[k]]))
}

/**
 * 壊れた保存や古い形を、読める形に直す（読めない項目は捨てる）。版1・版2 は版3 に直す。
 * 手で書き換えた保存や、引き継ぎで読み込んだ保存でも、旅ごとの上限（夢は「なじみ」・白描まで）を超えないように丸める。
 * onsite は travel と食い違っていたら捨てる（02 F-46）。
 * 版が 3 より大きい数なら UnknownVersion、表の形でない・版が無い（null・数でない）なら UnreadableSave を投げる（空として扱わない）
 */
export function sanitize(raw: unknown): Progress {
  const p = emptyProgress()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UnreadableSave('進み具合の形ではない')
  const v = (raw as { v?: unknown }).v
  if (typeof v === 'number' && v > SAVE_VERSION) throw new UnknownVersion(String(v))
  if (v !== 1 && v !== 2 && v !== 3) throw new UnreadableSave(`読めない版（${String(v)}）`)
  const r = raw as Partial<Omit<Progress, 'v'>>
  const isGained = (g: unknown): g is Gained => {
    if (!g || typeof g !== 'object') return false
    const x = g as Gained
    if (typeof x.at !== 'string' || (x.travel !== 'yume' && x.travel !== 'utsutsu')) return false
    return typeof x.onsite === 'boolean' && x.onsite === (x.travel === 'utsutsu')
  }
  const gainedOf = (g: unknown): Gained | undefined => (isGained(g) ? { at: g.at, travel: g.travel, onsite: g.onsite } : undefined)
  const obj = (o: unknown): Record<string, unknown> => (o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {})
  /** 項目が表（オブジェクト）の表を読む。null・数・配列の項目は飛ばす */
  const records = (o: unknown): [string, Record<string, unknown>][] =>
    Object.entries(obj(o)).filter((e): e is [string, Record<string, unknown>] => !!e[1] && typeof e[1] === 'object' && !Array.isArray(e[1]))
  for (const [id, yv] of records(r.yokai)) {
    const y = yv as Partial<YokaiProgress>
    const met = gainedOf(y.met)
    const bondGained = gainedOf(y.bondGained)
    let bond: BondLevel = BOND_LEVELS.includes(y.bond as BondLevel) ? (y.bond as BondLevel) : 'kehai'
    // 縁が上がった時の印がなければ夢の上限、あればその旅の上限で丸める
    const cap = BOND_CAP[bondGained?.travel ?? 'yume']
    if (bondRank(bond) > bondRank(cap)) bond = cap
    const lastMet = gainedOf(y.lastMet)
    const talks = typeof y.talks === 'number' && Number.isFinite(y.talks) && y.talks > 0 ? Math.floor(y.talks) : undefined
    const keptBond = bond === 'kehai' ? undefined : bondGained
    // 夢で初めて会った印。無い保存（版1・前の版2）は、夢で得た印（会った・縁が上がった・最後に会った）のいちばん早いものから作る
    const dm = gainedOf(y.dreamMet)
    const dreamMet = dm?.travel === 'yume' ? dm : [met, keptBond, lastMet].filter((g) => g?.travel === 'yume').reduce<Gained | undefined>(earlier, undefined)
    p.yokai[id] = { bond, met, dreamMet, bondGained: keptBond, lastMet, talks }
  }
  for (const [id, g] of records(r.cards)) {
    const c = gainedOf(g)
    if (c) p.cards[id] = c
  }
  for (const [id, g] of records(r.pieces)) {
    const c = gainedOf(g)
    const st = g.state as PieceState
    if (!c || !PIECE_STATES.includes(st) || st === 'empty') continue
    // 彩色を現地で得た印があれば、金まで（家で稽古した金も残す）。時間のピースは、家で逢魔が時に得た印（time）でも金まで。
    // なければ、その旅で台本が入れられる上限まで（time の印は、時間のピースのものだけ読む）
    const cg = gainedOf(g.colored)
    const time = !!cg && TIME_PIECES.has(id) && (g.colored as { time?: unknown }).time === true
    let colored: ColoredGained | undefined = cg && time ? { ...cg, time: true } : cg
    if (!colored && c.onsite && pieceRank(st) >= pieceRank('saishiki')) colored = c
    const keep = !!colored && (colored.onsite || colored.time === true)
    const cap: PieceState = keep ? 'kin' : PIECE_CAP[c.travel]
    p.pieces[id] = { ...c, state: pieceRank(st) > pieceRank(cap) ? cap : st, ...(keep ? { colored } : {}) }
  }
  for (const [k, v] of Object.entries(obj(r.flags))) if (typeof v === 'boolean') p.flags[k] = v
  for (const [k, v] of Object.entries(obj(r.flagAt))) if (typeof v === 'string' && k in p.flags) p.flagAt[k] = v
  for (const [id, it] of records(r.items)) {
    const got = gainedOf(it.got)
    if (!got) continue
    const given = gainedOf(it.given)
    p.items[id] = given ? { got, given } : { got }
  }
  if (typeof r.updatedAt === 'string') p.updatedAt = r.updatedAt
  for (const [id, g] of records(r.stamps)) {
    const c = gainedOf(g)
    if (c?.onsite) p.stamps[id] = c
  }
  // 便り（知らない id も残す。画面の側で、データに無い便りは出さない）
  for (const [id, l] of records(r.letters)) {
    if (!LETTER_ID_RE.test(id) || !isIso(l.got)) continue
    const parts = l.parts
    if (!Array.isArray(parts) || parts.length > 32 || !parts.every((x) => typeof x === 'string' && x.length <= 64)) continue
    p.letters[id] = { got: l.got, parts: [...(parts as string[])], ...(isIso(l.read) ? { read: l.read } : {}) }
  }
  const nights: Record<string, NightRecord> = {}
  for (const [day, n] of records(r.nights)) {
    if (!DAY_KEY_RE.test(day) || typeof n.yokai !== 'string' || typeof n.entry !== 'string' || typeof n.at !== 'string') continue
    if (n.done !== undefined && n.done !== true) continue
    nights[day] = { yokai: n.yokai, entry: n.entry, at: n.at, ...(n.done === true ? { done: true as const } : {}) }
  }
  p.nights = keepLatest(nights)
  const etoki: Record<string, EtokiRecord> = {}
  for (const [day, e] of records(r.etoki)) {
    if (!DAY_KEY_RE.test(day) || !isIso(e.at) || (e.travel !== 'yume' && e.travel !== 'utsutsu')) continue
    const cards = e.cards
    if (!Array.isArray(cards) || cards.length < 1 || cards.length > 3 || !cards.every((x) => typeof x === 'string') || new Set(cards).size !== cards.length) continue
    if (e.phrase !== undefined && (typeof e.phrase !== 'string' || chars(e.phrase) > 32)) continue
    const caption = e.caption === undefined ? 'none' : e.caption
    if (typeof caption !== 'string' || chars(caption) > 128) continue
    etoki[day] = { at: e.at, travel: e.travel, cards: [...(cards as string[])], ...(typeof e.phrase === 'string' ? { phrase: e.phrase } : {}), caption }
  }
  p.etoki = keepLatest(etoki)
  return p
}

/**
 * 進み具合があるか（会った妖怪・開いた札・ピース・持ち物・旅印のどれか）。
 * フラグだけ（「新」の印を見た、など）や、縁の段階・会話の回数だけで会った印の無い妖怪は数えない
 */
export function hasProgress(p: Readonly<Progress>): boolean {
  return Object.values(p.yokai).some((y) => !!y.met) || [p.cards, p.pieces, p.items, p.stamps].some((o) => Object.keys(o).length > 0)
}

/** いまの保存の名前 → 前の名前（新しい版から順。storage-keys.ts。前の版のゲームが読み書きする） */
const LEGACY_SAVE_CHAINS: Record<string, readonly string[]> = {
  [STORY_KEY]: [V2_STORY_KEY, LEGACY_STORY_KEY],
  [TEST_KEY]: [V2_TEST_KEY, LEGACY_TEST_KEY],
}
/** 前の名前の保存を、もう扱った印（写した・この版でやり直した）。あれば、いまの名前に保存が無くても写さない */
const legacyDoneKey = (key: string): string => `${key}.legacy-done`

/**
 * 前の名前の保存を、いまの名前へ写す（4a review F1。版3 は v3 ← v2 ← v1 の順）。保存を読む前に、どのページでもこれを通す（ProgressStore・引き継ぎ・写し）。
 * - 写すのは、いまの名前に保存が無く、まだ一度も写していない（この版でやり直してもいない）ときだけ。写したら印を残す
 *   （legacyDoneKey。あとでこの版でやり直しても、前の版で遊んでも、混ぜ戻さない）。
 * - 前の名前は新しい版から順に見る。保存があれば、その保存だけを見て止める（それより古い版は、その版がもう写している）。
 *   保存が無く、その版の「扱った印」があれば止める（その版が写してから、そこでやり直した。古い版から写し直さない）。どちらも無ければ、次の古い版へ。
 * - 写すのは読める保存（版1〜3）だけ。直した形（sanitize）で写す。読めない保存（知らない版・壊れた JSON）は写さず、印も残さない（4a と同じ）。
 * - 進み具合の無い保存（空・フラグだけ。hasProgress）は写さず、印だけ残す（空の保存を書くと、ほかの所が「進み具合あり」と取り違える）。
 * - どの版にも保存も印も無ければ、何も書かない（印を残すと、あとで前の版で遊んだ分を、もう写せない。4a と同じ）。
 * - 前の名前の保存は、消さず、書き換えもしない（前の版の保存で、控えにもなる）。
 */
export function migrateLegacySave(storage: KeyValueStore, key: string): void {
  const chain = LEGACY_SAVE_CHAINS[key]
  if (!chain) return
  try {
    if (storage.getItem(key) !== null || storage.getItem(legacyDoneKey(key)) !== null) return
    let decided = false
    for (const legacy of chain) {
      const raw = storage.getItem(legacy)
      if (raw !== null) {
        const old = JSON.parse(raw) as { v?: unknown } | null
        if (old?.v !== 1 && old?.v !== 2 && old?.v !== 3) return
        const p = sanitize(old)
        if (hasProgress(p)) storage.setItem(key, JSON.stringify(p))
        decided = true
        break
      }
      if (storage.getItem(legacyDoneKey(legacy)) !== null) {
        decided = true
        break
      }
    }
    if (decided) storage.setItem(legacyDoneKey(key), '1')
  } catch {
    // 読めない・写せないときは、そのまま（前の名前の保存にも触れない）
  }
}

export class ProgressStore {
  private state: Progress
  private readonly listeners = new Set<(p: Readonly<Progress>) => void>()
  private readonly replaceListeners = new Set<(p: Readonly<Progress>) => void>()

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

  /**
   * ほかのタブの保存に入れ替えたとき（follow）だけ呼ぶ。onChange のあとに呼ぶ。このタブで変えたとき・やり直したときは呼ばない。
   * 地図の地点の出方や、開いている帳を描き直すのに使う（このタブで変えたときは、会話の終わり・帳の操作のあとに描き直している）
   */
  onReplace(fn: (p: Readonly<Progress>) => void): () => void {
    this.replaceListeners.add(fn)
    return () => this.replaceListeners.delete(fn)
  }

  /**
   * ほかのタブが同じ保存を書いたら、この状態をそれに入れ替えて知らせる（引き継ぎの読み込み・ほかのタブで進めた・やり直した）。
   * ページは、開いている間使う ProgressStore で、はじめに一度呼ぶ。
   * 合わせずに入れ替える（このタブは変えるたびにすぐ書くので、いまの状態はもう保存にある。合わせると、やり直しが戻ってしまう）。
   * 読めない値（知らない版・壊れた JSON・形の違う値）なら、いまの状態のままにして、何も書かない。入れ替えたら onChange、続けて onReplace を呼ぶ。
   * やめる関数を返す
   */
  follow(): () => void {
    const stop = this.storage?.subscribe?.(this.key, (raw) => {
      let next: Progress
      try {
        next = raw === null ? emptyProgress() : sanitize(JSON.parse(raw))
      } catch {
        return
      }
      this.state = next
      for (const fn of this.listeners) fn(this.state)
      for (const fn of this.replaceListeners) fn(this.state)
    })
    return stop ?? (() => {})
  }

  private load(): Progress {
    if (!this.storage) return emptyProgress()
    migrateLegacySave(this.storage, this.key)
    let s: string | null = null
    try {
      s = this.storage.getItem(this.key)
      return s ? sanitize(JSON.parse(s)) : emptyProgress()
    } catch {
      // 読めない保存（壊れた JSON・形の違う値・新しい版）は、次の保存で上書きする前に別の鍵へ写しておく
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

  /** 妖怪が会話で最初に話した: lastMet = いま（夢なら dreamMet ??=）。回数は増やさない */
  noteSeen(yokai: string, travel: Travel): void {
    const y = this.yokaiOf(yokai)
    y.lastMet = this.gained(travel)
    if (travel === 'yume') y.dreamMet ??= y.lastMet
    this.commit()
  }

  /** 夜話を最後まで聞いた: talks + 1 だけ（lastMet・dreamMet・縁は変えない） */
  noteVisit(yokai: string): void {
    const y = this.yokaiOf(yokai)
    y.talks = (y.talks ?? 0) + 1
    this.commit()
  }

  /** 会話を最後まで話した（回数と最後に会った時を残す。縁の段階は変えない） */
  noteTalk(yokai: string, travel: Travel): void {
    const y = this.yokaiOf(yokai)
    y.talks = (y.talks ?? 0) + 1
    y.lastMet = this.gained(travel)
    if (travel === 'yume') y.dreamMet ??= y.lastMet
    this.commit()
  }

  talksWith(yokai: string): number {
    return this.state.yokai[yokai]?.talks ?? 0
  }

  /** 会った（夢の姿でも現地でも）。はじめてなら true。夢で初めて会った印（dreamMet）も、まだ無ければ残す */
  meet(yokai: string, travel: Travel): boolean {
    const y = this.yokaiOf(yokai)
    const dream = travel === 'yume' && !y.dreamMet
    if (y.met && (y.met.onsite || travel === 'yume')) {
      // 現地で先に会っていても、夢で会った印は残す
      if (dream) {
        y.dreamMet = this.gained(travel)
        this.commit()
      }
      return false
    }
    // 夢で会った後に現地で会ったら、現地の印に書き換える（格が上がる。夢で会った印は dreamMet に残る）
    const first = !y.met
    y.met = this.gained(travel)
    if (dream) y.dreamMet = y.met
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
    if (travel === 'yume') y.dreamMet ??= y.bondGained
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

  /**
   * ピースの状態を上げる（台本の効果）。下げない。夢の旅では白描まで、現地では彩色まで。
   * opts.time かつ TIME_PIECES のピースなら、旅に関係なく彩色まで。夢の旅で彩色になったら colored = { ...g, time: true }
   */
  setPiece(id: string, state: PieceState, travel: Travel, opts?: { time?: boolean }): { state: PieceState; changed: boolean; capped: boolean } {
    const time = !!opts?.time && TIME_PIECES.has(id)
    const cap: PieceState = time ? 'saishiki' : PIECE_CAP[travel]
    const capped = pieceRank(state) > pieceRank(cap)
    const want = capped ? cap : state
    const cur = this.pieceOf(id)
    if (pieceRank(want) <= pieceRank(cur)) return { state: cur, changed: false, capped }
    const g = this.gained(travel)
    const colored: ColoredGained | undefined = want !== 'saishiki' ? undefined : time && travel === 'yume' ? { ...g, time: true } : g
    this.state.pieces[id] = { ...g, state: want, ...(colored ? { colored } : {}) }
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

  letter(id: string): Readonly<LetterRecord> | undefined {
    return this.state.letters[id]
  }

  /** まだ無ければ { got: いま, parts }。届けたら true */
  deliverLetter(id: string, parts: string[]): boolean {
    if (this.state.letters[id]) return false
    this.state.letters[id] = { got: this.now().toISOString(), parts: [...parts] }
    this.commit()
    return true
  }

  /** read ??= いま。はじめて読んだら true */
  readLetter(id: string): boolean {
    const l = this.state.letters[id]
    if (!l || l.read) return false
    l.read = this.now().toISOString()
    this.commit()
    return true
  }

  night(day: DayKey): Readonly<NightRecord> | undefined {
    return this.state.nights[day]
  }

  /** その夜の記録が無ければ { yokai, entry, at: いま } を書く（あれば何もしない＝選び直さない） */
  startNight(day: DayKey, yokai: string, entry: string): void {
    if (this.state.nights[day]) return
    this.state.nights[day] = { yokai, entry, at: this.now().toISOString() }
    this.state.nights = keepLatest(this.state.nights)
    this.commit()
  }

  /**
   * done = true、flag `yb:<yokai>:<entry>` = true（flagAt つき）を1回の書き込みで。
   * flagAt は、もう立っている印（again を聞くたび）でも、いまに書き直す（夜話の順番は「いちばん長く聞いていない妖怪」。yobanashi.ts）
   */
  finishNight(day: DayKey): void {
    const n = this.state.nights[day]
    if (!n || n.done) return
    n.done = true
    const key = `yb:${n.yokai}:${n.entry}`
    this.state.flags[key] = true
    this.state.flagAt[key] = this.now().toISOString()
    this.commit()
  }

  etokiOf(day: DayKey): Readonly<EtokiRecord> | undefined {
    return this.state.etoki[day]
  }

  /** その日の絵解きを残す（同じ日につくり直したら入れ替える） */
  saveEtoki(day: DayKey, rec: { cards: string[]; phrase?: string; caption: string }, travel: Travel): void {
    this.state.etoki[day] = {
      at: this.now().toISOString(),
      travel,
      cards: [...rec.cards],
      ...(rec.phrase !== undefined ? { phrase: rec.phrase } : {}),
      caption: rec.caption,
    }
    this.state.etoki = keepLatest(this.state.etoki)
    this.commit()
  }

  /** ほかの端末の保存を合わせる（引き継ぎ）。上がるもの（縁・札・ピース・持ち物・旅印）は高いほう、フラグは新しく書いたほう */
  mergeFrom(other: Progress): void {
    this.state = mergeProgress(this.state, other)
    this.commit()
  }

  /**
   * 最初からやり直す（保存も消す）。前の名前の保存がある鍵では、消したあとに「もう写さない」印を残す
   * （印が無いと、次に開いたときに前の名前の保存から写し直して、やり直しが戻ってしまう。migrateLegacySave。4a review R1）。
   * 印は、保存を消してから書く（端末の空きが足りずに書けないときも、保存を消した分の空きで書ける。書けなければ、もう一度だけ試す。4a review F3）。
   * 空の保存は書かない（保存があるかを見る所が、やり直した端末を「進み具合あり」と取り違えないように）
   */
  reset(): void {
    this.state = emptyProgress()
    if (this.storage) {
      try {
        this.storage.removeItem(this.key)
      } catch {
        // 消せなくても、次の保存で上書きされる
      }
      if (LEGACY_SAVE_CHAINS[this.key]) {
        for (let i = 0; i < 2; i++) {
          try {
            this.storage.setItem(legacyDoneKey(this.key), '1')
            break
          } catch {
            // もう一度だけ試す
          }
        }
      }
    }
    for (const fn of this.listeners) fn(this.state)
  }
}

/** localStorage を安全に包む（使えない環境では null）。ほかのタブが書いたら storage イベントで知らせる（subscribe。書いたタブには来ない） */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage
    const k = '__probe__'
    s.setItem(k, '1')
    s.removeItem(k)
    return {
      getItem: (key) => s.getItem(key),
      setItem: (key, value) => s.setItem(key, value),
      removeItem: (key) => s.removeItem(key),
      subscribe: (key, fn) => {
        // key が null なのは、ほかのタブが全部を消したとき（clear）
        const on = (e: StorageEvent) => {
          if (e.storageArea === s && (e.key === key || e.key === null)) fn(e.key === null ? null : e.newValue)
        }
        window.addEventListener('storage', on)
        return () => window.removeEventListener('storage', on)
      },
    }
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
/** 彩色の印: 現地の彩色を先に、同じ格なら早いほう（印の形はそのまま残すので、time も残る） */
const betterColored = (a: ColoredGained | undefined, b: ColoredGained | undefined): ColoredGained | undefined => {
  if (!a || !b) return a ?? b
  if (a.onsite !== b.onsite) return a.onsite ? a : b
  return a.at <= b.at ? a : b
}
const earlierIso = (a: string | undefined, b: string | undefined): string | undefined => (!a ? b : !b ? a : a <= b ? a : b)

/**
 * 2つの保存を合わせる（引き継ぎ。F-51）。どちらも読める形（sanitize 済み）であること。
 * - 縁・ピースは高いほう（同じなら早く得たほう）。札・旅印・持ち物は両方を合わせる（早く得たほう、渡した印は残す）
 * - フラグは、書いた時（flagAt）が新しいほう。時の分からないフラグは、時の分かるほうに負ける
 * - 会話の回数は多いほう、最後に会った時は新しいほう、夢で初めて会った時は早いほう
 * - 彩色の印は、現地の彩色を先に、同じ格なら早いほう（時間のピースの time の印も残る）
 * - 便りは両方を合わせる（届いた時は早いほう、部品は早く届いたほうのもの、読んだ時は早いほう。どちらかで読んでいれば読んだ）
 * - 夜話は日ごとに合わせる（同じ日なら、最後まで聞いたほう、次に早く始めたほう）。絵解きは日ごとに、あとでつくったほう
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
      dreamMet: earlier(x.dreamMet, y.dreamMet),
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
    const colored = betterColored(x?.colored, y?.colored)
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
  for (const id of new Set([...Object.keys(a.letters), ...Object.keys(b.letters)])) {
    const x = a.letters[id]
    const y = b.letters[id]
    const first = !x || !y ? (x ?? y) : x.got <= y.got ? x : y
    const read = earlierIso(x?.read, y?.read)
    out.letters[id] = { got: first.got, parts: [...first.parts], ...(read ? { read } : {}) }
  }
  const nights: Record<string, NightRecord> = {}
  for (const day of new Set([...Object.keys(a.nights), ...Object.keys(b.nights)])) {
    const x = a.nights[day]
    const y = b.nights[day]
    const pick = !x || !y ? (x ?? y) : !!x.done !== !!y.done ? (x.done ? x : y) : x.at <= y.at ? x : y
    nights[day] = { ...pick }
  }
  out.nights = keepLatest(nights)
  const etoki: Record<string, EtokiRecord> = {}
  for (const day of new Set([...Object.keys(a.etoki), ...Object.keys(b.etoki)])) {
    const x = a.etoki[day]
    const y = b.etoki[day]
    const pick = !x || !y ? (x ?? y) : y.at > x.at ? y : x
    etoki[day] = { ...pick, cards: [...pick.cards] }
  }
  out.etoki = keepLatest(etoki)
  out.updatedAt = [a.updatedAt, b.updatedAt].filter(Boolean).sort().pop()
  return out
}
