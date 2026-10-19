// テスト用の時計（04 §3.9「テスト用に時刻の手動切り替え」。段階4b）。ブラウザでもそのまま動く（DOM は読まない。location・history（popstate）と sessionStorage だけ）。
//
// - ?debug のときだけ効く。?debug&clock=2027-01-16T16:40（JST）で、その時刻に合わせる。?debug&clock=+90m・-2h・+1d で、実時刻から前後へ。
//   ?debug&clock=off で実時刻に戻す。?debug が無ければ、いつも実時刻（セッションに残した差も読まない）。
// - 合わせた差（ms）は、そのタブの sessionStorage に残す（CLOCK_SESSION_KEY）。同じタブで別のページへ移っても続く。入口の pass() は、
//   いまの差を相対の clock=+…m で渡す（clockParam。分に切り上げるので、次のページで時刻が巻き戻らない。新しいタブでも続く）。
// - 便りの「時計」のボタン（setTarget）で合わせ直したら、ページの URL の clock も書き換える（読み込み直しても、合わせた時刻のまま。
//   そのあと「戻る」で前の URL に戻ったときも書き直す）。「いま」（実時刻）も、差 0 としてセッションに残す。
// - ブラウザの「戻る」「進む」で別のページへ移ったとき（履歴で読み込んだとき・ページがそのまま残っていたとき）は、URL の clock より
//   セッションの差を使い、URL も書き直す（ほかのページで合わせ直した時刻が、前の URL の clock で巻き戻らないように）。
// - 相対の指定（+1d など）は、いつも実時刻からの差（読み込み直しても、同じ時刻のまま。重ねて進めない）。
// - 物語の時計（core/story/clock.ts）と進み具合の時刻（ProgressStore の now）は、この時計の now() で動く。
//   テストの時刻は保存にも書かれるので、テストは使い捨てのブラウザのプロフィールで（README）。

import { JST_MS, jstDateLabel, jstTimeLabel } from './story/clock'

export const CLOCK_SESSION_KEY = 'yume.debug.clock.v1'

export interface SessionLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export interface AppClock {
  now(): number
  readonly offsetMs: number
  /** 合わせたい時刻（ms）。null で実時刻へ。sessionStorage に差を残し、onChange を呼ぶ */
  setTarget(targetMs: number | null): void
  /** セッションの差を読み直す（「戻る」で、そのまま残っていたページに帰ったとき）。変わったら onChange を呼び、true */
  resync(): boolean
  onChange(fn: () => void): () => void
}

export interface AppClockOptions {
  /** 履歴で読み込んだとき（ブラウザの「戻る」「進む」）: セッションに差が残っていれば、URL の clock よりそちらを使う */
  preferSession?: boolean
}

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }
/** 合わせられるのは、実時刻から前後100年まで（書き違いで遠い年にしない） */
const MAX_SPAN_MS = 100 * 365.25 * 86_400_000

/** 'YYYY-MM-DDTHH:MM'（JST）→ {targetMs}、'+90m' '-2h' '+1d' → {offsetMs}、'off' → 'off'、読めなければ null */
export function parseClockParam(value: string, realNow: number): { targetMs: number } | { offsetMs: number } | 'off' | null {
  if (typeof value !== 'string') return null
  // URL の「+」は、読むと空白になる（clock=+90m → ' 90m'）。頭の空白は「+」として読む
  const v = value.replace(/^\s+(?=\d)/, '+').trim()
  if (v === 'off') return 'off'
  const rel = /^([+-])(\d{1,8})([mhd])$/.exec(v)
  if (rel) {
    const offsetMs = (rel[1] === '-' ? -1 : 1) * Number(rel[2]) * UNIT_MS[rel[3]]
    return Math.abs(offsetMs) > MAX_SPAN_MS ? null : { offsetMs }
  }
  const abs = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v)
  if (!abs) return null
  const [y, mo, d, h, mi, s] = abs.slice(1).map((x) => Number(x ?? 0))
  const utc = Date.UTC(y, mo - 1, d, h, mi, s)
  // 2月30日・25時などは断る（Date.UTC は繰り上げてしまう）
  const back = new Date(utc)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi) return null
  const targetMs = utc - JST_MS
  if (Math.abs(targetMs - realNow) > MAX_SPAN_MS) return null
  return { targetMs }
}

/** ?debug が無ければ、いつも実時刻（セッションの差も読まない） */
export function createAppClock(search: string, session: SessionLike | null, real: () => number = () => Date.now(), opts: AppClockOptions = {}): AppClock {
  const params = new URLSearchParams(search)
  const debug = params.has('debug')
  const listeners = new Set<() => void>()
  let offset = 0
  // 実時刻に戻したときも 0 を残す（消すと、「戻る」で前の URL の clock が勝ってしまう）
  const save = () => {
    try {
      session?.setItem(CLOCK_SESSION_KEY, String(offset))
    } catch {
      // 残せなくても、このページの間は合わせたまま
    }
  }
  /** セッションに残した差（無い・読めなければ null） */
  const stored = (): number | null => {
    try {
      const raw = session?.getItem(CLOCK_SESSION_KEY)
      const n = raw === null || raw === undefined ? NaN : Number(raw)
      return Number.isFinite(n) && Math.abs(n) <= MAX_SPAN_MS ? Math.round(n) : null
    } catch {
      return null
    }
  }
  if (debug) {
    const p = params.has('clock') ? parseClockParam(params.get('clock') ?? '', real()) : null
    const kept = opts.preferSession ? stored() : null
    if (kept !== null) {
      offset = kept
    } else if (p === 'off') {
      offset = 0
      save()
    } else if (p && 'targetMs' in p) {
      offset = p.targetMs - real()
      save()
    } else if (p) {
      offset = p.offsetMs
      save()
    } else {
      // 読めなければ実時刻
      offset = stored() ?? 0
    }
  }
  return {
    now: () => real() + offset,
    get offsetMs() {
      return offset
    },
    setTarget(targetMs) {
      if (!debug) return
      offset = targetMs === null || !Number.isFinite(targetMs) ? 0 : Math.round(targetMs - real())
      save()
      for (const fn of listeners) fn()
    },
    resync() {
      const kept = debug ? stored() : null
      if (kept === null || kept === offset) return false
      offset = kept
      for (const fn of listeners) fn()
      return true
    },
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

/** 差を、URL の相対の clock（'+90m'・'-120m' の形。分に切り上げ: 渡した先の時刻が、いまより前にならない）。差が無ければ null */
export function clockParam(offsetMs: number): string | null {
  const m = Math.ceil(offsetMs / 60_000)
  if (!Number.isFinite(m) || !m) return null
  return `${m < 0 ? '-' : '+'}${Math.abs(m)}m`
}

/** 合わせ直した差を、ページの URL の clock に書く（差が無ければ消す。ほかの印と # はそのまま。履歴は増やさない） */
function keepInUrl(c: AppClock): void {
  try {
    if (typeof location === 'undefined' || typeof history === 'undefined') return
    const rest = location.search
      .replace(/^\?/, '')
      .split('&')
      .filter((x) => x && !/^clock(=|$)/.test(x))
    const v = clockParam(c.offsetMs)
    if (v) rest.push(`clock=${encodeURIComponent(v)}`)
    history.replaceState(history.state, '', `${location.pathname}${rest.length ? `?${rest.join('&')}` : ''}${location.hash}`)
  } catch {
    // 書けなくても、このタブのセッションの差で続く
  }
}

let shared: AppClock | null = null

/** ブラウザの1つだけの時計（location.search と sessionStorage から。Node では実時刻） */
export function appClock(): AppClock {
  if (shared) return shared
  let search = ''
  let session: SessionLike | null = null
  try {
    if (typeof location !== 'undefined') search = location.search
  } catch {
    search = ''
  }
  try {
    if (typeof sessionStorage !== 'undefined') session = sessionStorage
  } catch {
    session = null
  }
  // ブラウザの「戻る」「進む」で読み込んだか（それなら、ほかのページで合わせ直したセッションの差を、URL の clock より先に）
  let traversed = false
  try {
    traversed = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'back_forward'
  } catch {
    traversed = false
  }
  const c = createAppClock(search, session, undefined, { preferSession: traversed })
  let moved = false
  c.onChange(() => {
    moved = true
    keepInUrl(c)
  })
  // 履歴で読み込んだら、URL の clock も、いまの差に書き直す（読み込み直しても、巻き戻らないように）
  if (traversed && new URLSearchParams(search).has('debug')) {
    moved = true
    keepInUrl(c)
  }
  // 合わせ直したあと「戻る」で、前の URL（古い clock）に戻ったときも、いまの差に書き直す（読み込み直して巻き戻らないように）。
  // URL の clock が変わると、# だけの「戻る」でも hashchange は来ない（# で画面を切り替える入口は popstate も聞く）
  try {
    if (typeof window !== 'undefined') window.addEventListener('popstate', () => moved && keepInUrl(c))
  } catch {
    // 聞けなくても、このタブのセッションの差で続く
  }
  shared = c
  return shared
}

export const appNow = (): number => appClock().now()

/** 差があるときだけ「時計: 1月16日 16:40（テスト）」 */
export function clockTag(c: AppClock = appClock()): string | null {
  if (!c.offsetMs) return null
  const now = c.now()
  return `時計: ${jstDateLabel(now)} ${jstTimeLabel(now)}（テスト）`
}
