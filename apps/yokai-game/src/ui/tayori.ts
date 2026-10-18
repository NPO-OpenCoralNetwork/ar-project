// 便りの画面（04 §3.8・§3.9・§7 10/18、段階4b）。届く決まりは core/story/letters.ts、夜話は core/story/yobanashi.ts、
// 今日の絵解きは core/story/etoki-card.ts。ここは画面だけ（DOM。three.js は読み込まない。CSS は下の STYLE を1回だけ差し込む）。
//
// 置き場所は二つ（どちらも、そのページの保存だけを読む。P00・F-52）:
// - 帳の3つ目のタブ「便り」（ui/cho.ts）。夢の旅は立山のふもと、白描の絵地図はテスト用の土地、現の旅はいまの土地の保存。
// - 入口の #tayori（entrance/main.ts。立山のふもとの保存）。夜、箱庭も位置も使わずに開ける所。
//
// 上から（中身のある欄だけ出す）:
// 1. ましろの一言（いつも。【創作】の印）。立山の時刻の時間帯で変わる。夜は「外を歩かずに」の普通の字を添える（P01）。
// 2. 逢魔が時（家で、ほんとうの逢魔が時のあいだだけ）: 墨のにじんだ札「逢魔が時」と［話を聞く］（帳の影＝くらがり。夕暮れの和紙で話す）。
//    現の旅では、家に着いてから、とだけ言う（ボタンは出さない。外にいることへのご褒美にしない。04 §3.6）。
// 3. 今夜の夜話（家で）: 一晩に一人（tonight）。ほかに来られる妖怪は、ボタンの無い気配の一行だけ。開かなかった夜には触れない。
//    現の旅では始めない（「宿や家で。入口の「便り」から」とだけ言う。02 F-62）。
// 4. きょうの絵解き: ［つくる］か［見る］。「これまでの絵解き」（新しい14日分。たたんである）。
// 5. 届いた便り: 新しい順に、たたんだ和紙。まだ読んでいない便りだけ、墨の「〆」と細い茜の帯、「新」の字（数は出さない）。
//    押すと、その場でひらく（紙をめくる動き。動きを減らす設定では切り替えるだけ）。読んだ便りも残り、何度でも読める。
// 6. 何も無ければ「まだ、なにも届いていない。」
// 7. ?debug のときだけ: テスト用の時計のボタンと、時計・夜話・便りの様子。
//
// - 便りを届ける（deliverDue）のは、描くとき・tick（ページが1分ごと・ページに戻ったとき・会話のあとに呼ぶ）。冪等。
// - 「新」（news）: まだ読んでいない便り、家で夜話が来ている（つづきがある）、家で逢魔が時にくらがりと今日まだ会っていない。数は出さない。
// - 会話（夜話・くらがり・はじめての絵解き）は、この画面の出会い（GenEncounter。カメラなし）で話す。始める前に帳を閉じ（beforeTalk）、
//   終わったら便りのタブで開き直す（afterTalk）。会話・札の間は busy（帳の isOpen に入る。ページは時間の切り替えやお知らせを待つ）。
// - 呼び名は遊ぶ人が書いた字なので、textContent か escapeHtml でだけ出す（letterView の文も escapeHtml して入れる）。

import { appClock } from '../core/debug-clock'
import { addDays, dayOfIso, isoInToday, jstDateLabel, jstTimeLabel, type StoryClock, storyClock } from '../core/story/clock'
import { etokiPool } from '../core/story/etoki-card'
import { deliverDue, hasUnreadLetter, type LetterBlock, letterList, letterView, openLetter } from '../core/story/letters'
import type { MemoStore } from '../core/story/memo'
import { bondRank, type ProgressStore } from '../core/story/progress'
import type { Travel } from '../core/story/types'
import { eligibleTonight, kehaiLine, type Tonight, tonight, yobanashiNews } from '../core/story/yobanashi'
import type { StoryPack } from '../data/story-pack'
import { GenEncounter, type GenOpenOptions } from '../utsutsu/encounter'
import { mashiroSvg } from '../utsutsu/mashiro'
import { ARTS, artToSvg } from '../yume/encounter/art'
import type { Sound } from '../yume/encounter/sound'
import { cardHtml, escapeHtml, injectStyle as injectCardStyle } from '../yume/encounter/ui'
import { etokiCardHtml, etokiWhen, openEtokiSheet } from './etoki-sheet'
import { openMemoSheet } from './memo-sheet'

/** 帳の影（逢魔が時に便りの画面へ来る。くらがり） */
const KURAGARI = 'kuragari'
/** これまでの絵解きを出す数（新しいほうから） */
const ETOKI_LIST_MAX = 14
const INK = '#3a332d'
const DEBUG = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug')
  } catch {
    return false
  }
})()

const STYLE = /* css */ `
/* 便りの画面（帳のタブと、入口の #tayori）。和紙の帳面に、ましろの一言と、たたんだ便り */
.ty-wrap { position: relative; flex: 1; min-height: 0; width: min(560px, 100%); display: flex; flex-direction: column; align-items: stretch; }
.ty { position: relative; flex: 1; min-height: 0; width: 100%; margin-top: 6px; overflow-y: auto; overscroll-behavior: contain; color: #2a2622; text-align: left;
  font-family: var(--ui-font, system-ui, sans-serif); background: linear-gradient(170deg, #fbf6e9, #f1e8d4); border-radius: 10px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35); padding: 12px 16px 20px; }
.ty * { box-sizing: border-box; }
/* 入口では、ページとして（帳の中のように箱の中で送らない） */
.ty-wrap.page { flex: none; width: 100%; }
.ty-wrap.page .ty { margin-top: 0; overflow: visible; box-shadow: 0 6px 22px rgba(60, 50, 40, 0.1); border: 1px solid rgba(42, 38, 34, 0.18); border-radius: 16px; }
.ty :focus-visible { outline: 2px solid #2f4a7a; outline-offset: 2px; }
.ty h3, .ty h4 { margin: 0; font-family: var(--title-font, serif); font-weight: 600; }
.ty-sec { margin-top: 16px; }
.ty-sec:first-child { margin-top: 2px; }
.ty-h { font-size: 13px; color: rgba(42, 38, 34, 0.74); letter-spacing: 0.2em; margin: 0 0 8px; }
.ty-h:focus { outline: none; }
.ty-small { margin: 6px 0 0; font-size: 13px; line-height: 1.7; color: rgba(42, 38, 34, 0.74); text-wrap: pretty; word-break: auto-phrase; }
.ty-plain { margin: 8px 0 0; font-size: 14px; line-height: 1.7; text-wrap: pretty; word-break: auto-phrase; }
.ty-ph { display: inline-block; }
.ty-btn { flex: none; min-width: 44px; min-height: 44px; padding: 0 16px; font: inherit; font-size: 14.5px; letter-spacing: 0.06em; color: #2a2622; background: #fffdf7;
  border: 1px solid rgba(42, 38, 34, 0.4); border-radius: 10px; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.ty-btn:hover { background: #fff; border-color: rgba(42, 38, 34, 0.6); }
.ty-btn.main { color: #faf7f0; background: #2f4a7a; border-color: #2f4a7a; font-family: var(--title-font, serif); letter-spacing: 0.1em; }
.ty-btn.main:hover { background: #263e68; }
.ty-new { flex: none; display: inline-block; min-width: 18px; padding: 0 5px; font-size: 11px; line-height: 18px; text-align: center; color: #fff; background: #b5523b; border-radius: 9px; font-family: var(--ui-font, sans-serif); font-weight: 400; letter-spacing: 0; }
.ty-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* 1. ましろ */
.ty-say { display: flex; align-items: center; gap: 4px; }
.ty-say svg.mashiro { flex: none; width: 64px; height: 48px; }
.ty-line { position: relative; flex: 1; min-width: 0; margin: 0; padding: 8px 12px 9px; background: #fffdf8; border: 1px solid rgba(42, 38, 34, 0.2); border-radius: 14px; font-family: var(--title-font, serif); font-size: 15.5px; line-height: 1.7; }
.ty-who { display: flex; align-items: baseline; gap: 8px; font-family: var(--ui-font, sans-serif); font-size: 11.5px; letter-spacing: 0.1em; color: rgba(42, 38, 34, 0.7); }
.ty-tag { margin-left: auto; font-size: 10.5px; letter-spacing: 0.04em; border: 1px solid rgba(42, 38, 34, 0.25); border-radius: 999px; padding: 0 7px; white-space: nowrap; }
.ty-notice { margin: 8px 0 0; padding: 6px 10px; font-size: 14px; line-height: 1.6; background: rgba(255, 253, 247, 0.8); border-left: 3px solid rgba(42, 38, 34, 0.5); }
/* 2. 逢魔が時（墨のにじんだ札。朱や印は使わない） */
.ty-ink { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 16px; border-radius: 6px; color: #23202a; overflow: hidden;
  background: radial-gradient(ellipse 70% 90% at 82% 60%, rgba(40, 34, 48, 0.32), rgba(40, 34, 48, 0) 70%), radial-gradient(ellipse 50% 60% at 10% 10%, rgba(60, 52, 70, 0.14), rgba(60, 52, 70, 0) 70%), linear-gradient(170deg, #ebe5df, #d9d2cd);
  border: 1px solid rgba(35, 32, 42, 0.32); }
.ty-ink-t { flex: 1; min-width: 0; }
.ty-ink h3 { display: flex; align-items: center; gap: 8px; font-size: 18px; letter-spacing: 0.24em; }
.ty-ink p { margin: 6px 0 10px; font-family: var(--title-font, serif); font-size: 15px; line-height: 1.7; }
.ty-ink svg { flex: none; width: 40px; height: 60px; opacity: 0.75; }
/* 3. 夜話 */
.ty-visit { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(255, 253, 247, 0.75); border: 1px solid rgba(42, 38, 34, 0.22); border-radius: 10px; }
.ty-thumb { flex: none; width: 40px; height: 60px; background: #fffdf7; border: 1px solid rgba(42, 38, 34, 0.2); border-radius: 3px; }
.ty-visit p { flex: 1; min-width: 0; margin: 0; font-family: var(--title-font, serif); font-size: 15px; line-height: 1.6; }
.ty-kehai { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
.ty-kehai li { font-family: var(--title-font, serif); font-size: 14px; line-height: 1.7; color: rgba(42, 38, 34, 0.82); padding-left: 1em; text-indent: -1em; }
.ty-kehai li::before { content: "・"; }
/* 4. 絵解き */
.ty-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.ty-row p { flex: 1; min-width: 12em; margin: 0; font-size: 13.5px; line-height: 1.6; color: rgba(42, 38, 34, 0.8); }
.ty-sub { margin: 14px 0 6px; font-size: 12.5px; letter-spacing: 0.16em; color: rgba(42, 38, 34, 0.72); font-family: var(--ui-font, sans-serif); font-weight: 600; }
.ty-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ty-fold-e { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 6px 12px; font: inherit; font-size: 14px; text-align: left; color: inherit; background: rgba(255, 253, 247, 0.7); border: 1px solid rgba(42, 38, 34, 0.22); border-radius: 8px; cursor: pointer; }
.ty-fold-e::after, .ty-fold::after { content: "▾"; content: "▾" / ""; margin-left: auto; font-size: 12px; color: rgba(42, 38, 34, 0.6); transition: transform 0.2s; }
.ty-fold-e[aria-expanded="true"]::after, .ty-fold[aria-expanded="true"]::after { transform: rotate(180deg); }
.ty-open-e { margin-top: 6px; }
/* 5. 便り（たたんだ和紙。まだ読んでいない便りは、墨の〆と細い茜の帯） */
.ty-fold { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 8px 14px 8px 14px; font: inherit; text-align: left; color: inherit; cursor: pointer;
  background: radial-gradient(circle at 18% 22%, rgba(190, 170, 130, 0.12) 0 1.2px, transparent 1.6px) 0 0 / 23px 19px, linear-gradient(175deg, #fffaf0, #f3e9d4);
  border: 1px solid rgba(43, 36, 32, 0.3); border-radius: 4px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 3px 8px rgba(30, 20, 10, 0.1); -webkit-tap-highlight-color: transparent; }
.ty-fold:hover { border-color: rgba(43, 36, 32, 0.55); }
.ty-letter.unread .ty-fold { padding-left: 22px; }
.ty-band { position: absolute; left: 9px; top: 6px; bottom: 6px; width: 3px; background: #a8473a; border-radius: 2px; }
.ty-shime { flex: none; font-family: var(--title-font, serif); font-size: 20px; line-height: 1; color: #2a2622; }
.ty-lt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ty-lt b { font-family: var(--title-font, serif); font-size: 16px; font-weight: 600; letter-spacing: 0.06em; line-height: 1.45; }
.ty-lt small { font-size: 12px; color: rgba(42, 38, 34, 0.72); }
.ty-paper { margin: -1px 0 0; padding: 14px 16px 12px; background: linear-gradient(178deg, #fffdf6, #f8f0de); border: 1px solid rgba(43, 36, 32, 0.3); border-top-style: dashed; border-radius: 0 0 4px 4px;
  font-family: var(--title-font, serif); font-size: 15.5px; line-height: 1.95; transform-origin: top center; }
.ty-paper.unfold { animation: ty-unfold 0.5s ease-out; }
@keyframes ty-unfold { from { opacity: 0; transform: perspective(700px) rotateX(-72deg); } to { opacity: 1; transform: none; } }
.ty-paper p { margin: 0 0 10px; text-wrap: pretty; word-break: auto-phrase; }
.ty-head { margin: 0 0 10px !important; font-family: var(--title-font, serif); font-size: 17px; font-weight: 600; letter-spacing: 0.08em; }
.ty-head:focus { outline: none; }
.ty-head:focus-visible { outline: 2px solid #2f4a7a; outline-offset: 2px; }
.ty-sign { text-align: right; letter-spacing: 0.2em; }
/* 白描の頁（妖怪の言葉）: 細い墨の枠と、白描の小さな姿・名前 */
.ty-quote { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0 12px; padding: 10px 12px; background: #fffdf7; border: 1px solid rgba(58, 51, 45, 0.55); border-radius: 2px; }
.ty-quote figcaption { flex: none; min-width: 46px; max-width: 76px; text-align: center; font-family: var(--ui-font, sans-serif); font-size: 10.5px; line-height: 1.3; white-space: nowrap; color: rgba(42, 38, 34, 0.75); }
.ty-quote figcaption svg { display: block; width: 40px; height: 60px; margin: 0 auto 2px; }
.ty-quote blockquote { flex: 1; min-width: 0; margin: 0; font-size: 15.5px; line-height: 1.9; text-wrap: pretty; word-break: auto-phrase; }
.ty-lead { margin: 4px 0 6px !important; font-family: var(--ui-font, sans-serif); font-size: 12.5px !important; line-height: 1.6; color: rgba(42, 38, 34, 0.78); }
.ty-paper .yc-card { width: 100%; max-height: none; overflow: visible; transform: none; margin: 0 0 12px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 4px 12px rgba(30, 20, 10, 0.16); font-family: var(--ui-font, sans-serif); }
.ty-paper .yc-card .yc-title { font-size: 17px; margin: 6px 0 8px; }
.ty-paper .yc-card .yc-body { font-size: 15px; }
.ty-ask { margin: 2px 0 12px; padding: 10px 12px; background: rgba(255, 253, 247, 0.85); border: 1px dashed rgba(42, 38, 34, 0.4); border-radius: 8px; font-family: var(--ui-font, sans-serif); }
.ty-ask .ty-small { margin-top: 6px; }
.ty-lfoot { margin: 4px 0 8px !important; font-family: var(--ui-font, sans-serif); font-size: 12px; line-height: 1.6; color: rgba(42, 38, 34, 0.72); }
.ty-empty { margin: 18px 0 4px; font-family: var(--title-font, serif); font-size: 15px; color: rgba(42, 38, 34, 0.8); }
/* 7. テスト用（?debug） */
.ty-debug { margin-top: 22px; padding: 10px 12px; border: 1px dashed rgba(42, 38, 34, 0.4); border-radius: 8px; background: rgba(255, 255, 255, 0.45); }
.ty-debug .ty-btn { min-height: 40px; padding: 0 10px; font-size: 12.5px; }
.ty-dump { margin: 8px 0 0; font: 11.5px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
@media (max-width: 420px) {
  .ty { padding: 10px 12px 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .ty-paper.unfold { animation: none; }
  .ty-fold-e::after, .ty-fold::after { transition: none; }
}
`

let styled = false
function injectStyle(): void {
  if (styled) return
  styled = true
  injectCardStyle()
  const s = document.createElement('style')
  s.textContent = STYLE
  document.head.appendChild(s)
}

/** 句読点のあとで折り返す（語の途中で行を分けない。長い句は、その中で折り返す） */
const phrases = (s: string): string => (s.match(/[^、。]+[、。]*/g) ?? [s]).map((p) => `<span class="ty-ph">${escapeHtml(p)}</span>`).join('')

/** ましろの一言（時間帯ごと。【創作】）と、夜に添える普通の字 */
const MASHIRO: Record<'home' | 'site', Record<StoryClock['phase'], string>> = {
  home: {
    day: '風が運んできたものは、ここに、はさんでおくね。',
    oumagatoki: '逢魔が時。……帳のすみが、暗い。',
    night: '夜は、外に出ないで。話しに来るものは、ここに来るよ。',
  },
  site: {
    day: '風が運んできたものは、ここに、はさんでおくね。',
    oumagatoki: '暗くなる前に、帰ろう。',
    night: '夜は、気配だけ。話は、宿や家で。',
  },
}
const NIGHT_PLAIN: Record<'home' | 'site', string> = { home: '夜は、外を歩かずに遊んでください。', site: '暗くなってから出歩かないでください。' }

export interface TayoriDeps {
  /** 会話（出会いの層）と札（覚え書き・絵解き）を重ねる所。夢の旅・白描の絵地図・現の旅は板の root、入口は全面の舞台 */
  root: HTMLElement
  story: StoryPack
  progress: ProgressStore
  memo: MemoStore
  sound: Sound
  /** home: 夜話・帳の影あり。site（現の旅）: 便りと絵解きだけ */
  mode: 'home' | 'site'
  /** このページの旅（絵解きを残す旅。現の旅は utsutsu） */
  travel: Travel
  /** 物語の時計の「いま」（appNow） */
  now: () => number
  /** ピースのお知らせで、帳のある所を言う一言（入口では「夢の旅の「帳」で見られる。」） */
  choHint?: string
  /** 会話・絵解きの札を始める前（帳を閉じる）と、終わったあと（便りのタブで開き直す） */
  beforeTalk?(): void
  afterTalk?(): void
  /** 会話か札を開いた・閉じた */
  onBusy?(busy: boolean): void
  /** 「新」の印が変わったかもしれない */
  onNews?(on: boolean): void
}

export interface TayoriPanel {
  /** 画面（帳のタブの中身。入口ではページの中） */
  readonly el: HTMLElement
  /** 描く（便りを届けてから） */
  render(): void
  /** 1分ごと・ページに戻ったとき・会話のあと。便りを届け、変わっていれば描き直す */
  tick(): void
  /** 「新」（数は出さない） */
  news(): boolean
  /** 会話か札を開いている */
  readonly busy: boolean
  /** 今日の絵解きの札（「今日はここまで」） */
  openEtoki(): void
  /** 会話と札を閉じる（帳を閉じたとき・道中に入ったとき） */
  stop(): void
}

export function createTayoriPanel(d: TayoriDeps): TayoriPanel {
  injectStyle()
  const { story, progress, memo } = d
  const el = document.createElement('div')
  el.className = 'ty-wrap'
  const box = document.createElement('div')
  box.className = 'ty'
  // 届いたことの読み上げ（描き直しても残るように、箱の外に置く）
  const live = document.createElement('p')
  live.className = 'ty-vh'
  live.setAttribute('aria-live', 'polite')
  el.append(box, live)

  // ---- 画面の様子
  let openId: string | null = null
  let justOpened: string | null = null
  const openDays = new Set<string>()
  let notice = ''
  let lastSig = ''
  let lastNews: boolean | null = null

  // ---- 会話（この画面の出会い。はじめて話すときに作る）と札
  let enc: GenEncounter | null = null
  let encLayers: Element[] = []
  let talkEnd: ((how: 'finished' | 'closed' | 'stopped') => void) | null = null
  let restoreInert: (() => void) | null = null
  let sheet: { close(): void } | null = null
  let busyLast = false
  const busy = () => !!talkEnd || !!sheet
  const setBusy = () => {
    const b = busy()
    if (b === busyLast) return
    busyLast = b
    d.onBusy?.(b)
  }

  const clockNow = () => storyClock(d.now())
  const env = (clock = clockNow()) => ({ progress, story, clock, memo })
  const kuragariReady = () => {
    const s = story.scripts[story.yokai[KURAGARI]?.script ?? '']
    return !!s && !s.needsConsent
  }

  const news = (): boolean => {
    if (hasUnreadLetter(progress, story)) return true
    if (d.mode !== 'home') return false
    const clock = clockNow()
    if (yobanashiNews(tonight(clock, progress, story))) return true
    return clock.phase === 'oumagatoki' && kuragariReady() && !isoInToday(progress.get().yokai[KURAGARI]?.lastMet?.at, clock)
  }
  const reportNews = () => {
    const n = news()
    if (n === lastNews) return
    lastNews = n
    d.onNews?.(n)
  }

  /** 届ける（新しく届いたら、読み上げる） */
  const deliver = (): void => {
    const got = deliverDue(env())
    if (got.length) {
      live.textContent = ''
      window.setTimeout(() => (live.textContent = '便りが届いています'), 60)
    }
  }

  /** 描き直すかの目安（変わっていなければ、tick で描き直さない。読んでいる便りやキーボードの位置を動かさない） */
  const signature = (): string => {
    const clock = clockNow()
    const p = progress.get()
    const t = d.mode === 'home' ? tonight(clock, progress, story) : null
    return JSON.stringify([
      clock.day,
      clock.phase,
      t,
      isoInToday(p.yokai[KURAGARI]?.lastMet?.at, clock),
      Object.entries(p.letters).map(([id, l]) => [id, !!l.read]),
      Object.entries(p.etoki).map(([k, e]) => [k, e.at]),
      Object.keys(p.cards).length,
      memo.yobina,
      memo.hasYobinaField,
      notice,
      openId,
      [...openDays],
      DEBUG ? Math.floor(clock.now / 60_000) : 0,
    ])
  }

  // ---------------------------------------------------------------- 描く

  const sectionMashiro = (clock: StoryClock): string => {
    const mode = d.mode
    const night = clock.phase === 'night'
    return `<section class="ty-sec" aria-label="ましろの一言">
      <div class="ty-say">${mashiroSvg(false)}<p class="ty-line"><span class="ty-who">ましろ<span class="ty-tag" title="本作の創作の台詞">台本・創作</span></span>${phrases(MASHIRO[mode][clock.phase])}</p></div>
      ${night ? `<p class="ty-plain">${phrases(NIGHT_PLAIN[mode])}</p>` : ''}
      ${notice ? `<p class="ty-notice" role="status">${phrases(notice)}</p>` : ''}
    </section>`
  }

  const sectionOuma = (clock: StoryClock): string => {
    if (clock.phase !== 'oumagatoki' || !kuragariReady()) return ''
    if (d.mode === 'site') {
      // 現の旅: 家に着いてから（ボタンは出さない）。まだ会っていなければ、名前を出さない（縁帳と同じ）
      const line = progress.hasMet(KURAGARI) ? 'くらがりとは、家に着いてから話そう。' : '帳のすみの影とは、家に着いてから話そう。'
      return `<section class="ty-sec" aria-labelledby="ty-ouma-h"><h3 class="ty-h" id="ty-ouma-h" tabindex="-1">逢魔が時</h3><p class="ty-plain">${phrases(line)}</p></section>`
    }
    const talked = isoInToday(progress.get().yokai[KURAGARI]?.lastMet?.at, clock)
    const art = ARTS[story.yokai[KURAGARI]?.art ?? '']
    const shadow = art ? `<svg viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.1)}</svg>` : ''
    return `<section class="ty-sec" aria-labelledby="ty-ouma-h">
      <div class="ty-ink">
        <div class="ty-ink-t">
          <h3 id="ty-ouma-h" tabindex="-1">逢魔が時${talked ? '' : '<span class="ty-new" aria-hidden="true">新</span><span class="ty-vh">（新しい）</span>'}</h3>
          <p>${phrases(talked ? '影は、静かにそこにいる。' : '影がひとつ、帳のすみに来ている。')}</p>
          <button class="ty-btn" type="button" data-act="kuragari" data-k="kuragari">話を聞く</button>
        </div>
        ${shadow}
      </div>
      <p class="ty-small">${phrases('外にいるときは、暗くなる前に帰ってから。')}</p>
    </section>`
  }

  const thumb = (yokai: string): string => {
    const art = ARTS[story.yokai[yokai]?.art ?? '']
    return art ? `<svg class="ty-thumb" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.1)}</svg>` : ''
  }
  const nameOf = (y: string) => story.yokai[y]?.name ?? ''

  const sectionNight = (clock: StoryClock, t: Tonight | null): string => {
    if (d.mode === 'site') {
      if (clock.phase !== 'night') return ''
      return `<section class="ty-sec" aria-labelledby="ty-night-h"><h3 class="ty-h" id="ty-night-h" tabindex="-1">今夜の夜話</h3><p class="ty-plain">${phrases('夜話は、宿や家で。入口の「便り」から聞けます。')}</p></section>`
    }
    if (!t || t.state === 'none') return ''
    let body = ''
    if (t.state === 'offer' || t.state === 'resume') {
      body = `<div class="ty-visit">${thumb(t.yokai)}<p>${phrases(`${nameOf(t.yokai)}が、話しに来ている。`)}</p>
        <button class="ty-btn main" type="button" data-act="yobanashi" data-k="yobanashi">${t.state === 'resume' ? 'つづきを聞く' : '聞く'}</button></div>`
    } else if (t.state === 'done') body = `<p class="ty-plain">${phrases(`${nameOf(t.yokai)}は、帰っていった。`)}</p>`
    else if (t.state === 'quiet') body = `<p class="ty-plain">${phrases('今夜は、静かな夜。')}</p>`
    else if (t.state === 'later') body = `<p class="ty-plain">${phrases(`日が暮れると（${jstTimeLabel(t.nightStart)}ごろから）、なじみのだれかが、話しに来るかもしれない。`)}</p>`
    // ほかに来られる妖怪は、ボタンの無い気配の一行だけ
    const others = 'others' in t ? t.others.map((y) => kehaiLine(story, y, clock.day)).filter((x): x is string => !!x) : []
    return `<section class="ty-sec" aria-labelledby="ty-night-h">
      <h3 class="ty-h" id="ty-night-h" tabindex="-1">今夜の夜話</h3>
      ${body}
      ${others.length ? `<ul class="ty-kehai" aria-label="気配">${others.map((l) => `<li>${phrases(l)}</li>`).join('')}</ul>` : ''}
    </section>`
  }

  const sectionEtoki = (clock: StoryClock): { html: string; has: boolean } => {
    const rec = progress.etokiOf(clock.day)
    const pool = etokiPool(env(clock))
    const canMake = pool.today.length + pool.earlier.length > 0
    const past = Object.keys(progress.get().etoki)
      .filter((k) => k !== clock.day)
      .sort()
      .reverse()
      .slice(0, ETOKI_LIST_MAX)
    if (!rec && !canMake && !past.length) return { html: '', has: false }
    const now = rec
      ? `<div class="ty-row"><p>${escapeHtml(etokiWhen(clock.day, rec.travel))}</p><button class="ty-btn" type="button" data-act="etoki-view" data-k="etoki">見る</button></div>`
      : canMake
        ? `<div class="ty-row"><p>${phrases('きょうの話を、札をならべて残す。')}</p><button class="ty-btn" type="button" data-act="etoki-make" data-k="etoki">つくる</button></div>`
        : ''
    const list = past
      .map((day) => {
        const e = progress.etokiOf(day)!
        const open = openDays.has(day)
        return `<li><button class="ty-fold-e" type="button" data-act="etoki-day" data-day="${escapeHtml(day)}" data-k="ed:${escapeHtml(day)}" aria-expanded="${open}">${escapeHtml(etokiWhen(day, e.travel))}</button>
          ${open ? `<div class="ty-open-e">${etokiCardHtml(e, day, story, memo)}</div>` : ''}</li>`
      })
      .join('')
    return {
      has: true,
      html: `<section class="ty-sec" aria-labelledby="ty-etoki-h">
        <h3 class="ty-h" id="ty-etoki-h" tabindex="-1">きょうの絵解き</h3>
        ${now}
        ${past.length ? `<h4 class="ty-sub">これまでの絵解き</h4><ul class="ty-list">${list}</ul>` : ''}
      </section>`,
    }
  }

  const blockHtml = (b: LetterBlock): string => {
    switch (b.kind) {
      case 'head':
        return `<h4 class="ty-head" tabindex="-1">${escapeHtml(b.text)}</h4>`
      case 'p':
        return `<p>${escapeHtml(b.text)}</p>`
      case 'quote': {
        const art = ARTS[story.yokai[b.yokai]?.art ?? '']
        const svg = art ? `<svg viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.1)}</svg>` : ''
        return `<figure class="ty-quote"><figcaption>${svg}${escapeHtml(b.name)}</figcaption><blockquote>${escapeHtml(b.text)}</blockquote></figure>`
      }
      case 'card':
        return `${b.lead ? `<p class="ty-lead">${escapeHtml(b.lead)}</p>` : ''}<article class="yc-card">${cardHtml(b.card, { heading: 'h5' })}</article>`
      case 'ask':
        return `<div class="ty-ask"><button class="ty-btn main" type="button" data-act="ask" data-k="ask">呼び名を教える</button><p class="ty-small">書かなくても、だいじょうぶ。</p></div>`
      case 'sign':
        return `<p class="ty-sign">${escapeHtml(b.text)}</p>`
    }
  }

  const sectionLetters = (): { html: string; has: boolean } => {
    const list = letterList(progress, story)
    if (!list.length) return { html: '', has: false }
    const rows = list
      .map((l, i) => {
        const open = openId === l.id
        const view = open ? letterView(l.id, progress, story, memo) : null
        const date = jstDateLabel(l.got)
        return `<li class="ty-letter${l.read ? '' : ' unread'}">
          <button class="ty-fold" type="button" data-act="letter" data-id="${escapeHtml(l.id)}" data-k="l:${escapeHtml(l.id)}" aria-expanded="${open}" aria-controls="ty-l-${i}">
            ${l.read ? '' : '<span class="ty-band" aria-hidden="true"></span><span class="ty-shime" aria-hidden="true">〆</span>'}
            <span class="ty-lt"><b>${escapeHtml(l.title)}</b><small>${escapeHtml(date)}</small></span>
            ${l.read ? '' : '<span class="ty-new" aria-hidden="true">新</span><span class="ty-vh">（まだ読んでいない便り）</span>'}
          </button>
          ${
            view
              ? `<div class="ty-paper${justOpened === l.id ? ' unfold' : ''}" id="ty-l-${i}">
              ${view.blocks.map(blockHtml).join('')}
              <p class="ty-lfoot">この便りは本作の創作です。札は伝承（出典つき）です。</p>
              <button class="ty-btn" type="button" data-act="fold" data-id="${escapeHtml(l.id)}" data-k="fold">たたむ</button>
            </div>`
              : ''
          }
        </li>`
      })
      .join('')
    return {
      has: true,
      html: `<section class="ty-sec" aria-labelledby="ty-letters-h"><h3 class="ty-h" id="ty-letters-h">届いた便り</h3><ul class="ty-list">${rows}</ul></section>`,
    }
  }

  const sectionDebug = (clock: StoryClock, t: Tonight | null): string => {
    if (!DEBUG) return ''
    const p = progress.get()
    const at = (day: string, hm: string) => Date.parse(`${day}T${hm}:00+09:00`)
    const btns: [string, number | null][] = [
      ['いま', null],
      ['昼 12:00', at(clock.day, '12:00')],
      ['逢魔が時', clock.sunset - 10 * 60_000],
      ['夜 20:00', at(clock.day, '20:00')],
      ['次の朝 08:00', at(addDays(clock.day, 1), '08:00')],
      ['+1日', clock.now + 86_400_000],
    ]
    const tm = (ms: number) => `${jstDateLabel(ms)} ${jstTimeLabel(ms)}`
    const elig = new Set(d.mode === 'home' ? eligibleTonight(clock, progress, story) : [])
    const why = (id: string): string => {
      const y = p.yokai[id]
      if (!y?.met) return 'まだ会っていない'
      if (bondRank(y.bond) < bondRank('najimi')) return `縁が ${y.bond}`
      if (!isoInToday(y.lastMet?.at, clock)) return '今日は会っていない'
      const s = story.scripts[story.yokai[id]?.yobanashi ?? '']
      if (!s) return '夜話の台本が無い'
      if (s.needsConsent) return '了承待ち'
      return elig.has(id) ? '来られる' : '入口が成り立たない'
    }
    const letters = story.tayori.letters.map((def) => {
      const rec = p.letters[def.id]
      if (rec) return `${def.id}: ${rec.read ? '読んだ' : '届いた'}（${tm(Date.parse(rec.got))}）`
      if (def.needsConsent) return `${def.id}: 了承待ち`
      if (!p.flags[def.after.flag]) return `${def.id}: フラグ ${def.after.flag} 待ち`
      const fd = p.flagAt[def.after.flag] ? dayOfIso(p.flagAt[def.after.flag]) : null
      return `${def.id}: ${fd ? `${addDays(fd, def.after.days)} に届く` : 'すぐ届く'}`
    })
    const dailies = Object.entries(p.letters)
      .filter(([id]) => id.startsWith('fumi:'))
      .map(([id, l]) => `${id}: ${l.read ? '読んだ' : '届いた'} [${l.parts.join(' ')}]`)
    const dump = [
      `物語の日 ${clock.day}（${clock.phase}）  いま ${tm(clock.now)}`,
      `日の出 ${jstTimeLabel(clock.sunrise)}  日の入り ${jstTimeLabel(clock.sunset)}  逢魔が時 ${jstTimeLabel(clock.oumaStart)}〜${jstTimeLabel(clock.nightStart)}  夜話 ${jstTimeLabel(clock.nightStart)}〜04:00`,
      `今夜: ${t ? JSON.stringify(t) : '（現の旅では夜話なし）'}`,
      ...Object.keys(story.yokai).map((id) => `  ${id}: ${why(id)}`),
      '便り:',
      ...letters.map((x) => `  ${x}`),
      ...dailies.map((x) => `  ${x}`),
    ].join('\n')
    return `<section class="ty-sec ty-debug" aria-label="テスト用">
      <h3 class="ty-h">テスト用の時計</h3>
      <div class="ty-row">${btns.map(([label, ms], i) => `<button class="ty-btn" type="button" data-act="clock" data-i="${i}" data-ms="${ms ?? ''}" data-k="clock:${i}">${escapeHtml(label)}</button>`).join('')}</div>
      <pre class="ty-dump">${escapeHtml(dump)}</pre>
    </section>`
  }

  /** 描く。deliver: 先に便りを届ける（描くときは届ける。進み具合が変わったときの描き直しでは届けない） */
  const render = (deliverFirst = true): void => {
    if (deliverFirst) deliver()
    const clock = clockNow()
    const t = d.mode === 'home' ? tonight(clock, progress, story) : null
    // キーボードの位置（描き直しても、同じボタンへ戻す）と、送りの位置
    const active = document.activeElement as HTMLElement | null
    const key = active && box.contains(active) ? active.closest<HTMLElement>('[data-k]')?.dataset.k : undefined
    const top = box.scrollTop
    const ouma = sectionOuma(clock)
    const night = sectionNight(clock, t)
    const etoki = sectionEtoki(clock)
    const letters = sectionLetters()
    const interactive = d.mode === 'home' && (!!ouma || (!!t && t.state !== 'none'))
    box.innerHTML = [
      sectionMashiro(clock),
      ouma,
      night,
      etoki.html,
      letters.html,
      interactive || etoki.has || letters.has ? '' : `<p class="ty-empty">${phrases('まだ、なにも届いていない。')}</p>`,
      sectionDebug(clock, t),
    ].join('')
    justOpened = null
    box.scrollTop = top
    if (key) box.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"]`)?.focus({ preventScroll: true })
    lastSig = signature()
    reportNews()
  }

  /** 進み具合・覚え書きが変わったとき（まとめて1回。描き直すのは、見えている中身が変わったときだけ） */
  let queued = false
  const refresh = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (signature() !== lastSig) render(false)
      else reportNews()
    })
  }
  progress.onChange(refresh)
  progress.onReplace(() => {
    // ほかのタブの保存に入れ替えた: 開いていた便りが無くなっていれば、たたむ
    if (openId && !progress.letter(openId)) openId = null
    refresh()
  })
  memo.onChange(refresh)
  if (DEBUG) appClock().onChange(() => tick())

  const focusLater = (sel: string) =>
    // 帳を開き直したあと（帳はタブへキーボードの位置を移す）に、この画面の中へ移す
    window.setTimeout(() => {
      const t = box.querySelector<HTMLElement>(sel)
      if (t && !t.closest('[inert]')) t.focus({ preventScroll: false })
    }, 120)

  // ---------------------------------------------------------------- 会話

  const encounter = (): GenEncounter => {
    if (enc) return enc
    const before = new Set(Array.from(d.root.children))
    enc = new GenEncounter({
      root: d.root,
      story,
      progress,
      sound: d.sound,
      camera: false,
      backdrop: 'paper',
      choHint: d.choHint,
      log: () => {},
      onEnd: (_spot, how) => {
        const f = talkEnd
        talkEnd = null
        restoreInert?.()
        restoreInert = null
        setBusy()
        f?.(how)
      },
    })
    encLayers = Array.from(d.root.children).filter((c) => !before.has(c))
    return enc
  }

  /** 会話を始める（帳の開け閉めはしない）。会話の層のほかは inert（Tab が会話の中に留まる。出典表示は残す） */
  const startTalk = (spotId: string, opts: GenOpenOptions, onEnd: (how: 'finished' | 'closed' | 'stopped') => void): boolean => {
    if (talkEnd) return false
    const e = encounter()
    d.sound.unlock()
    talkEnd = onEnd
    if (!e.open(spotId, opts)) {
      talkEnd = null
      return false
    }
    const changed: HTMLElement[] = []
    for (const c of Array.from(d.root.children) as HTMLElement[]) {
      if (encLayers.includes(c) || c.inert || c.classList.contains('yh-credit')) continue
      c.inert = true
      changed.push(c)
    }
    restoreInert = () => {
      for (const c of changed) c.inert = false
    }
    setBusy()
    return true
  }

  /** 夜話・帳の影の会話（帳を閉じて話し、終わったら便りのタブで開き直す） */
  const talkFromPanel = (spotId: string, opts: GenOpenOptions, focusSel: string): boolean => {
    d.beforeTalk?.()
    const ok = startTalk(spotId, opts, (how) => {
      // 会話のあと: 便りを届け直し（くらがりの頼みのあとの「影のこと」など）、便りのタブで開き直す
      if (how !== 'stopped') d.afterTalk?.()
      render()
      focusLater(focusSel)
    })
    if (!ok) {
      d.afterTalk?.()
      render()
    }
    return ok
  }

  const startKuragari = () => {
    if (d.mode !== 'home' || busy()) return
    // 会話を始めた時の時計で話す（17:12 に始めて 17:13 をまたいでも、時間のピースに色が入る）
    const clock = clockNow()
    if (clock.phase !== 'oumagatoki' || !kuragariReady()) {
      notice = '影は、もう薄くなった。'
      render()
      focusLater('.ty-notice')
      return
    }
    notice = ''
    talkFromPanel('tayori:kuragari', { script: story.yokai[KURAGARI]?.script ?? KURAGARI, yokaiId: KURAGARI, form: 'dream', travel: 'yume', tone: 'dusk', clock, memo }, '#ty-ouma-h')
  }

  const startYobanashi = () => {
    if (d.mode !== 'home' || busy()) return
    const clock = clockNow()
    const t = tonight(clock, progress, story)
    if (t.state !== 'offer' && t.state !== 'resume') {
      render()
      return
    }
    const day = clock.day
    const ok = talkFromPanel(
      `tayori:yobanashi:${t.yokai}`,
      {
        script: t.script,
        yokaiId: t.yokai,
        form: 'dream',
        travel: 'yume',
        tone: 'night',
        entry: t.entry,
        record: 'visit',
        clock,
        memo,
        onFinish: () => progress.finishNight(day),
      },
      '#ty-night-h',
    )
    // その夜の記録は、始めたときに書く（途中で閉じても、同じ妖怪・同じ場面で「つづきを聞く」。選び直さない）
    if (ok) progress.startNight(day, t.yokai, t.entry)
  }

  // ---------------------------------------------------------------- 札（覚え書き・絵解き）

  const askName = () => {
    if (busy()) return
    sheet = openMemoSheet({
      root: d.root,
      memo,
      onDone: () => {
        sheet = null
        setBusy()
        render()
        // 呼び名を書いたら、便りの頭（「〜へ」）へ。書かなければ［呼び名を教える］へ戻る（札がもう戻してある）
        if (memo.hasYobinaField) box.querySelector<HTMLElement>('.ty-paper .ty-head')?.focus({ preventScroll: true })
      },
    })
    setBusy()
  }

  const openEtoki = (start: 'make' | 'view' = 'make') => {
    if (busy()) return
    // 絵解きの札は、帳を閉じて開く（はじめての絵解きでは、札の途中で会話を出すため）。閉じたら便りのタブで開き直す
    d.beforeTalk?.()
    let closed = false
    sheet = openEtokiSheet({
      root: d.root,
      story,
      progress,
      memo,
      travel: d.travel,
      now: d.now,
      start,
      talk: (spotId, opts, onEnd) => startTalk(spotId, opts, () => onEnd()),
      onClose: () => {
        if (closed) return
        closed = true
        sheet = null
        setBusy()
        d.afterTalk?.()
        render()
        focusLater('[data-k="etoki"]')
      },
    })
    setBusy()
  }

  // ---------------------------------------------------------------- 押したとき

  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!b || !box.contains(b)) return
    const act = b.dataset.act
    if (act === 'letter') {
      const id = b.dataset.id!
      if (openId === id) {
        openId = null
        render(false)
        box.querySelector<HTMLElement>(`[data-k="${CSS.escape(`l:${id}`)}"]`)?.focus({ preventScroll: true })
        return
      }
      // ひらく（読んだ印・はじめて読んだときのフラグ・札の部品を開く。openLetter）
      openId = id
      justOpened = id
      openLetter(id, progress, story, memo)
      render(false)
      box.querySelector<HTMLElement>('.ty-paper .ty-head')?.focus({ preventScroll: false })
    } else if (act === 'fold') {
      const id = b.dataset.id!
      openId = null
      render(false)
      box.querySelector<HTMLElement>(`[data-k="${CSS.escape(`l:${id}`)}"]`)?.focus({ preventScroll: false })
    } else if (act === 'ask') askName()
    else if (act === 'kuragari') startKuragari()
    else if (act === 'yobanashi') startYobanashi()
    else if (act === 'etoki-make') openEtoki('make')
    else if (act === 'etoki-view') openEtoki('view')
    else if (act === 'etoki-day') {
      const day = b.dataset.day!
      if (openDays.has(day)) openDays.delete(day)
      else openDays.add(day)
      render(false)
    } else if (act === 'clock') {
      const ms = b.dataset.ms
      appClock().setTarget(ms ? Number(ms) : null)
    }
  })

  const tick = () => {
    deliver()
    if (notice && clockNow().phase === 'oumagatoki') notice = ''
    if (signature() !== lastSig && el.isConnected) render(false)
    reportNews()
  }

  // 開いたとき（ページを読み込んだとき）にも届ける（その日はじめて開いたときの「ましろの便り」）
  deliver()
  lastNews = news()

  return {
    el,
    render: () => render(),
    tick,
    news,
    get busy() {
      return busy()
    },
    openEtoki: () => openEtoki('make'),
    stop() {
      sheet?.close()
      if (talkEnd) enc?.stop()
    },
  }
}

/**
 * 入口のための、立山のふもとの便りの様子（届けてから）。入口のましろのあいさつと、「便り」の入り口の「新」に使う。
 * waiting: 夜話が来ている（つづきがある）。unread: まだ読んでいない便りがある
 */
export function homeTayoriStatus(o: { story: StoryPack; progress: ProgressStore; memo: MemoStore; now: () => number }): {
  phase: StoryClock['phase']
  waiting: boolean
  unread: boolean
  news: boolean
} {
  const clock = storyClock(o.now())
  deliverDue({ progress: o.progress, story: o.story, clock, memo: o.memo })
  const waiting = yobanashiNews(tonight(clock, o.progress, o.story))
  const unread = hasUnreadLetter(o.progress, o.story)
  const s = o.story.scripts[o.story.yokai[KURAGARI]?.script ?? '']
  const dusk = clock.phase === 'oumagatoki' && !!s && !s.needsConsent && !isoInToday(o.progress.get().yokai[KURAGARI]?.lastMet?.at, clock)
  return { phase: clock.phase, waiting, unread, news: unread || waiting || dusk }
}

