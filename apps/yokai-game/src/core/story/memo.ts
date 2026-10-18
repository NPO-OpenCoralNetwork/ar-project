// ましろの覚え書き（04 §3.3「縁と覚え書きは端末の持ち主のもの」）。段階4b は呼び名だけ（出身・好きな食べ物は集めない）。描画に依存しない。
//
// - 端末に1つ（MEMO_KEY）。土地ごとの進み具合（Progress）の外に置き、土地のやり直しでは消えない。
// - 書くのは会話の外の欄だけ（会話は選ぶだけ。04 §3.2）。ましろが便りで聞き、縁帳の覚え書きの行で見て・書き直して・消せる。
// - 消すと「消した印」（value: null）を残す。引き継ぎで2台を合わせても、消したことが戻らないように（項目ごとに at の新しいほう）。
// - 呼び名を使うのは、ましろだけ（便り・振り返り・ましろの台詞）。妖怪は使わない（台本の点検で止める）。
// - 呼び名は遊ぶ人が書いた字なので、画面には textContent か escapeHtml で出す。
// - 字の決まり: NFKC にそろえ、前後の空白を除いて、1〜8字（コードポイント）。ひらがな・カタカナ・漢字・A–Z/a–z・ー・・・々 だけ
//   （数字・空白・記号は入れない。電話番号・住所・メールの形を止める）。書かない名前（FORBIDDEN_NAMES）を含むものも断る。

import { MEMO_KEY } from '../storage-keys'
import type { KeyValueStore } from './progress'
import { FORBIDDEN_NAMES } from './text'

export interface MemoField {
  value: string | null
  at: string
}
/** 端末の持ち主の覚え書き（04 §3.3）。4b は呼び名だけ。value: null は消した印（合わせても戻らない） */
export interface MemoDoc {
  v: 1
  yobina?: MemoField
}
export interface MemoReader {
  /** いまの呼び名（無い・消したなら null） */
  readonly yobina: string | null
  /** 一度でも書いたか消したか（ましろが便りで呼び名を聞くのは、どちらもまだのときだけ） */
  readonly hasYobinaField: boolean
}

export const YOBINA_MAX = 8

const BAD_CHARS = 'ひらがな・カタカナ・漢字・ローマ字で、8文字までにしてください。'
const FORBIDDEN = 'この呼び名は使えません。'
/** 使える字（ひらがな・カタカナ・漢字・ローマ字・ー・・・々） */
const YOBINA_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-zー・々]+$/u

/** NFKC・前後の空白を除く・1〜8字（コードポイント）・ひらがな/カタカナ/漢字/A–Za–z/ー/・/々 だけ・禁じた名を含まない */
export function validateYobina(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof text === 'string' ? text.normalize('NFKC').trim() : ''
  const n = [...s].length
  if (n < 1 || n > YOBINA_MAX || !YOBINA_RE.test(s)) return { ok: false, error: BAD_CHARS }
  if (FORBIDDEN_NAMES.some((w) => s.includes(w))) return { ok: false, error: FORBIDDEN }
  return { ok: true, value: s }
}

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

/** 読める形に直す（読めない項目は捨てる。呼び名は字の決まりを満たすものだけ） */
export function sanitizeMemo(raw: unknown): MemoDoc {
  const out: MemoDoc = { v: 1 }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const y = (raw as { yobina?: unknown }).yobina
  if (y && typeof y === 'object' && !Array.isArray(y)) {
    const { value, at } = y as { value?: unknown; at?: unknown }
    if (isIso(at)) {
      if (value === null) out.yobina = { value: null, at }
      else if (typeof value === 'string') {
        const r = validateYobina(value)
        if (r.ok && r.value === value) out.yobina = { value, at }
      }
    }
  }
  return out
}

/** 項目ごとに at の新しいほう（消した印も同じ。同じ時なら消した印を取る） */
export function mergeMemo(a: MemoDoc, b: MemoDoc): MemoDoc {
  const out: MemoDoc = { v: 1 }
  const x = a.yobina
  const y = b.yobina
  const pick = !x ? y : !y ? x : y.at > x.at || (y.at === x.at && y.value === null) ? y : x
  if (pick) out.yobina = { value: pick.value, at: pick.at }
  return out
}

export class MemoStore implements MemoReader {
  private state: MemoDoc
  private readonly listeners = new Set<(d: Readonly<MemoDoc>) => void>()

  constructor(
    private readonly storage: KeyValueStore | null,
    /** 時刻（テストで差し替える。ページは物語の時計 appNow を渡す） */
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load()
  }

  get yobina(): string | null {
    return this.state.yobina?.value ?? null
  }

  get hasYobinaField(): boolean {
    return !!this.state.yobina
  }

  doc(): MemoDoc {
    return structuredClone(this.state)
  }

  setYobina(text: string): { ok: true; value: string } | { ok: false; error: string } {
    const r = validateYobina(text)
    if (!r.ok) return r
    this.state = { ...this.state, yobina: { value: r.value, at: this.now().toISOString() } }
    this.commit()
    return r
  }

  /** 消す（消した印を残す。ましろは「きみ」と呼び、もう聞かない） */
  eraseYobina(): void {
    this.state = { ...this.state, yobina: { value: null, at: this.now().toISOString() } }
    this.commit()
  }

  /** ほかの端末の覚え書きを合わせる（引き継ぎ） */
  mergeFrom(doc: MemoDoc): void {
    this.state = mergeMemo(this.state, sanitizeMemo(doc))
    this.commit()
  }

  onChange(fn: (d: Readonly<MemoDoc>) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** ほかのタブが覚え書きを書いた・消したら、それに入れ替えて知らせる（読めない値なら、いまのまま）。やめる関数を返す */
  follow(): () => void {
    const stop = this.storage?.subscribe?.(MEMO_KEY, (raw) => {
      let next: MemoDoc
      try {
        next = raw === null ? { v: 1 } : sanitizeMemo(JSON.parse(raw))
      } catch {
        return
      }
      this.state = next
      for (const fn of this.listeners) fn(this.state)
    })
    return stop ?? (() => {})
  }

  private load(): MemoDoc {
    if (!this.storage) return { v: 1 }
    try {
      const s = this.storage.getItem(MEMO_KEY)
      return s ? sanitizeMemo(JSON.parse(s)) : { v: 1 }
    } catch {
      return { v: 1 }
    }
  }

  private commit(): void {
    if (this.storage) {
      try {
        this.storage.setItem(MEMO_KEY, JSON.stringify(this.state))
      } catch {
        // 保存できなくても遊べる（このページの間は覚えている）
      }
    }
    for (const fn of this.listeners) fn(this.state)
  }
}
