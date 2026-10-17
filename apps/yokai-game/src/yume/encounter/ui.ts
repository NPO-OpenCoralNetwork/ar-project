// 出会いと会話の画面（HTML のオーバーレイ）。描画だけを受け持ち、会話の進め方は core/story/dialogue.ts。
//
// - 耳を澄ますボタン（長押し。満ちていく輪）
// - 会話の枠（画面の下。名前・本文・選択肢2〜3）。台本の台詞は「台本・創作」の印つきのふつうの枠
// - 伝承の札（和紙のカード。プレイヤーには題・本文・出典だけ。確度・調べ・監修の状態は ?debug のときだけ。台本の枠とは形も書体も分ける。04 §3.2 F-43）
// - 曼荼羅帳（縦長の掛軸。里・麓・山の三段の枠は【創作】の構図）と、最初からやり直す（確認つき）
//
// 出典表示（右下）は、どの画面を開いても隠さない（.yh-credit を上に重ねる）。

import type { Beat, Notice } from '../../core/story/dialogue'
import type { LoreCard, MandalaDef, MandalaPieceDef, PieceState } from '../../core/story/types'
import { PIECE_LABEL } from '../../core/story/types'
import { ARTS, artToSvg } from './art'
import { stampDate, stampFrameSvg, stampSvg } from './stamp'

const CSS = /* css */ `
.yh-credit { z-index: 60; }
/* 耳を澄ます */
.ye-listen { position: absolute; left: 50%; bottom: calc(60px + var(--sab)); transform: translate(-50%, 8px); opacity: 0; pointer-events: none; transition: opacity 0.5s, transform 0.5s;
  display: flex; align-items: center; gap: 10px; padding: 8px 18px 8px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--washi); color: var(--ink);
  font: inherit; cursor: pointer; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; -webkit-tap-highlight-color: transparent; min-height: 52px; }
.ye-listen.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.ye-listen:focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 2px; }
.ye-listen svg { width: 36px; height: 36px; flex: none; transform: rotate(-90deg); }
.ye-listen .bg { fill: none; stroke: var(--line); stroke-width: 3; }
.ye-listen .fg { fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset 0.08s linear; }
.ye-listen .ear { fill: var(--ink); transform: rotate(90deg); transform-origin: 18px 18px; font: 600 13px var(--title-font); }
.ye-listen span { white-space: nowrap; }
.ye-listen b { font-family: var(--title-font); font-weight: 600; font-size: 15px; letter-spacing: 0.1em; display: block; text-align: left; }
.ye-listen small { display: block; font-size: 11px; color: var(--ink-soft); text-align: left; margin-top: 1px; }
.ye-listen.held { background: var(--washi-hover, var(--washi)); }
/* 霞が寄る（画面の縁から） */
.ye-mist { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
/* 会話の枠 */
.yd { position: absolute; left: 50%; bottom: calc(14px + var(--sab)); transform: translate(-50%, 12px); width: min(660px, calc(100vw - 24px - var(--sal) - var(--sar))); opacity: 0; pointer-events: none; transition: opacity 0.4s, transform 0.4s; z-index: 30; }
.yd.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
@media (max-width: 1120px) { .yd { bottom: calc(50px + var(--sab)); } }
.yd-box { --dbg: rgba(251, 248, 241, 0.95); --dink: #2a2622; --dsoft: rgba(42, 38, 34, 0.6); --dline: rgba(42, 38, 34, 0.2); --dchoice: rgba(255, 253, 248, 0.9);
  position: relative; background: var(--dbg); color: var(--dink); border: 1px solid var(--dline); border-radius: 14px; padding: 12px 16px 12px; box-shadow: 0 10px 34px rgba(40, 30, 30, 0.16); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.yh[data-time="night"] .yd-box { --dbg: rgba(20, 24, 48, 0.92); --dink: #e8e4f2; --dsoft: rgba(232, 228, 242, 0.64); --dline: rgba(232, 228, 242, 0.2); --dchoice: rgba(40, 46, 82, 0.9); box-shadow: 0 10px 34px rgba(0, 0, 10, 0.4); }
.yh[data-time="dusk"] .yd-box { --dbg: rgba(252, 244, 241, 0.95); --dink: #3e3240; --dsoft: rgba(62, 50, 64, 0.62); --dline: rgba(62, 50, 64, 0.2); }
.yd-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; min-height: 22px; }
.yd-name { font-family: var(--title-font); font-weight: 600; font-size: 15px; letter-spacing: 0.12em; }
.yd-name.companion { font-weight: 500; }
.yd-tag { margin-left: auto; font-size: 10.5px; color: var(--dsoft); border: 1px solid var(--dline); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.yd-text { margin: 0; font-family: var(--title-font); font-size: 16.5px; line-height: 1.85; letter-spacing: 0.04em; min-height: 3.7em; }
.yd-text.notice { font-family: var(--ui-font); font-size: 14px; line-height: 1.7; min-height: 0; padding: 4px 2px 2px; }
.yd-text.notice b { font-family: var(--title-font); font-size: 15.5px; font-weight: 600; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
.yd-text.notice span { color: var(--dsoft); }
.yd-next { position: absolute; right: 14px; bottom: 8px; font-size: 11px; color: var(--dsoft); animation: yd-blink 1.6s ease-in-out infinite; }
@keyframes yd-blink { 50% { opacity: 0.3; } }
.yd-choices { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.yd-choice { font: inherit; font-family: var(--title-font); font-size: 15px; text-align: left; color: var(--dink); background: var(--dchoice); border: 1px solid var(--dline); border-radius: 10px; padding: 9px 12px 9px 30px; min-height: 44px; cursor: pointer; position: relative; -webkit-tap-highlight-color: transparent; }
.yd-choice::before { content: "◇"; position: absolute; left: 11px; top: 50%; transform: translateY(-52%); font-size: 11px; color: var(--dsoft); }
.yd-choice:hover, .yd-choice:focus-visible { border-color: var(--dsoft); outline: none; }
.yd-choice kbd { font: 10px var(--ui-font); color: var(--dsoft); margin-left: 8px; }
/* タッチの端末では、キーボードの番号は出さない */
@media (pointer: coarse) { .yd-choice kbd { display: none; } }
.yd-close { position: absolute; top: -40px; right: 0; font: inherit; font-size: 12px; color: var(--ink); background: var(--washi); border: 1px solid var(--line); border-radius: 999px; padding: 0 12px; min-height: 32px; cursor: pointer; }
/* 伝承の札（和紙のカード） */
.yc-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px 16px calc(56px + var(--sab)); background: rgba(30, 26, 22, 0.28); opacity: 0; pointer-events: none; transition: opacity 0.45s; z-index: 40; }
.yc-wrap.on { opacity: 1; pointer-events: auto; }
.yc-card { --cink: #2b2420; --csoft: rgba(43, 36, 32, 0.62); --cline: rgba(43, 36, 32, 0.28); position: relative; width: min(360px, 100%); max-height: 100%; overflow: auto; color: var(--cink);
  background:
    radial-gradient(circle at 18% 22%, rgba(190, 170, 130, 0.12) 0 1.2px, transparent 1.6px) 0 0 / 23px 19px,
    radial-gradient(circle at 70% 60%, rgba(150, 130, 100, 0.10) 0 0.9px, transparent 1.3px) 0 0 / 17px 29px,
    linear-gradient(170deg, #fbf6e9, #f3ead6);
  border-radius: 4px; padding: 20px 22px 16px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 14px 40px rgba(30, 20, 10, 0.3);
  transform: translateY(10px) rotate(-0.4deg); transition: transform 0.5s; }
.yc-wrap.on .yc-card { transform: none; }
.yc-card::before { content: ""; position: absolute; inset: 7px; border: 1.5px solid var(--cline); border-radius: 2px; pointer-events: none; }
.yc-card::after { content: ""; position: absolute; inset: 11px; border: 0.8px solid var(--cline); border-radius: 1px; pointer-events: none; }
.yc-kind { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.18em; color: var(--csoft); }
.yc-kind .new { margin-left: auto; letter-spacing: 0.05em; color: #7a4a2a; }
.yc-title { margin: 8px 0 10px; font-family: var(--title-font); font-weight: 700; font-size: 19px; line-height: 1.5; letter-spacing: 0.06em; }
.yc-title small { display: block; font-size: 12px; font-weight: 500; color: var(--csoft); letter-spacing: 0.12em; margin-bottom: 2px; }
.yc-body { margin: 0 0 14px; font-family: var(--title-font); font-size: 16px; line-height: 1.9; padding: 10px 12px; border-top: 1px solid var(--cline); border-bottom: 1px solid var(--cline); text-wrap: pretty; word-break: auto-phrase; }
.yc-meta { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; font-size: 12.5px; line-height: 1.5; }
.yc-meta dt { color: var(--csoft); white-space: nowrap; }
.yc-meta dd { margin: 0; }
.yc-meta a { color: inherit; }
.yc-source { margin: 2px 0 0; font-size: 12.5px; color: var(--csoft); letter-spacing: 0.02em; }
.yc-badge { display: inline-block; font-size: 11.5px; padding: 0 7px; border: 1px solid currentColor; border-radius: 3px; }
.yc-badge.ok { color: #2f5a3a; }
.yc-badge.draft { color: #8a5a2a; }
.yc-foot { margin: 12px 0 0; font-size: 11.5px; color: var(--csoft); line-height: 1.6; }
.yc-btn { display: block; width: 100%; margin-top: 12px; font: inherit; font-size: 14px; min-height: 44px; color: var(--cink); background: rgba(255, 255, 255, 0.55); border: 1px solid var(--cline); border-radius: 8px; cursor: pointer; }
.yc-btn:hover, .yc-btn:focus-visible { background: rgba(255, 255, 255, 0.85); outline: none; }
/* 曼荼羅帳 */
.ym { position: absolute; inset: 0; z-index: 35; display: flex; flex-direction: column; align-items: center; padding: calc(10px + var(--sat)) 12px calc(52px + var(--sab)); background: rgba(24, 22, 30, 0.84); opacity: 0; pointer-events: none; transition: opacity 0.4s; color: #f4efe4; }
.ym.on { opacity: 1; pointer-events: auto; }
/* 曼荼羅帳を開いている間は、題と右上の板を隠す（出典表示は隠さない） */
.yh.modal-open .yh-title, .yh.modal-open .yh-panel, .yh.modal-open .yh-toast { visibility: hidden; }
.ym-head { width: min(560px, 100%); display: flex; align-items: center; gap: 10px; min-height: 40px; }
.ym-head h2 { margin: 0; font-family: var(--title-font); font-size: 17px; font-weight: 600; letter-spacing: 0.2em; }
.ym-head .sub { font-size: 11px; opacity: 0.75; }
.ym-btn { font: inherit; font-size: 13px; color: #2a2622; background: rgba(250, 247, 240, 0.92); border: 1px solid rgba(42, 38, 34, 0.25); border-radius: 9px; min-height: 36px; padding: 0 12px; cursor: pointer; }
.ym-btn.close { margin-left: auto; }
.ym-body { flex: 1; min-height: 0; width: min(560px, 100%); display: flex; gap: 14px; align-items: stretch; justify-content: center; margin-top: 6px; }
.ym-scroll { height: 100%; max-width: 100%; aspect-ratio: 300 / 760; flex: none; filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.35)); }
.ym-scroll svg { width: 100%; height: 100%; display: block; }
.ym-side { flex: 1; min-width: 0; max-width: 220px; display: flex; flex-direction: column; gap: 10px; font-size: 12px; line-height: 1.6; }
.ym-legend { background: rgba(250, 247, 240, 0.92); color: #2a2622; border-radius: 10px; padding: 10px 12px; }
.ym-legend p { margin: 0 0 6px; }
.ym-legend ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ym-legend li { display: flex; align-items: center; gap: 8px; }
.ym-legend i { width: 18px; height: 14px; border-radius: 3px; flex: none; border: 1px dashed #8a7f70; background: rgba(249, 245, 234, 0.6); }
.ym-legend i.hakubyo { border: 1.2px solid #3a332d; background: #fffdf7; }
.ym-legend i.saishiki { border: 1.2px solid #3a332d; background: linear-gradient(135deg, #e7b98a, #9cc0a8); }
.ym-legend i.kin { border: 2px solid #c9a24a; background: linear-gradient(135deg, #e7b98a, #9cc0a8); }
.ym-note { font-size: 11px; opacity: 0.85; }
/* スマホ幅で出す短い断り書き（【創作】の構図であることは、どの幅でも隠さない） */
.ym-note-sp { display: none; margin: 2px 0 0; width: min(560px, 100%); font-size: 11px; line-height: 1.5; opacity: 0.9; }
.ym-reset { margin-top: auto; }
.ym-back { align-self: stretch; }
.ym-stamps { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin: 6px 0 10px; }
.ym-stamp { margin: 0; text-align: center; font-size: 12px; color: var(--csoft); }
.ym-stamp svg { width: 100%; max-width: 150px; height: auto; display: block; margin: 0 auto 2px; }
.ym-stamp small { font-size: 11px; }
.ym-piece { cursor: pointer; }
.ym-piece:focus-visible rect.frame { stroke: #b0603a; stroke-width: 2; }
.ym-piece.new rect.ring { animation: ym-pulse 1.8s ease-in-out infinite; }
@keyframes ym-pulse { 50% { stroke-opacity: 0.15; } }
@media (max-width: 620px) {
  .ym-body { flex-direction: column; align-items: center; gap: 8px; }
  .ym-scroll { height: auto; flex: 1; min-height: 0; width: auto; }
  .ym-side { max-width: none; width: 100%; flex: none; display: grid; grid-template-columns: 1fr auto; gap: 6px 8px; align-items: stretch; }
  .ym-side .ym-legend { grid-row: span 2; }
  .ym-legend { flex: 1; padding: 6px 10px; font-size: 11px; }
  .ym-legend p { display: none; }
  .ym-legend ul { grid-template-columns: 1fr 1fr; gap: 2px 8px; }
  .ym-note { display: none; }
  .ym-note-sp { display: block; }
  .ym-reset, .ym-back { margin-top: 0; align-self: stretch; font-size: 12px; padding: 0 10px; }
}
/* ピースの詳しい表示・確認 */
.ym-pop { position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; padding: 16px 16px calc(56px + var(--sab)); background: rgba(24, 22, 30, 0.4); opacity: 0; pointer-events: none; transition: opacity 0.3s; }
.ym-pop.on { opacity: 1; pointer-events: auto; }
.ym-pop .yc-card { transform: none; }
.ym-pop .art { display: block; margin: 4px auto 8px; width: 120px; height: 160px; }
.ym-pop .row { display: flex; gap: 8px; }
.ym-pop .row .yc-btn { flex: 1; }
.ym-badge { display: none; position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; border-radius: 8px; background: #b5523b; color: #fff; font-size: 10px; line-height: 16px; text-align: center; padding: 0 4px; }
.yh-btn.has-new .ym-badge { display: block; }
.yh-btn.mandala { position: relative; font-family: var(--title-font); letter-spacing: 0.08em; }
`

let styled = false
export function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = CSS
  document.head.appendChild(s)
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// ---------------------------------------------------------------- 耳を澄ます

export class ListenButton {
  readonly el: HTMLButtonElement
  private readonly fg: SVGCircleElement
  private readonly sub: HTMLElement
  private heldFlag = false
  private keyHeld = false
  private shown = false
  private static readonly C = 2 * Math.PI * 15

  constructor(root: HTMLElement, onFirstPress: () => void) {
    injectStyle()
    const b = el('button', 'ye-listen')
    b.type = 'button'
    b.setAttribute('aria-label', '耳を澄ます（長押し。その場で止まっていても澄む）')
    b.innerHTML = `
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15"
        stroke-dasharray="${ListenButton.C.toFixed(2)}" stroke-dashoffset="${ListenButton.C.toFixed(2)}"/><text class="ear" x="18" y="22.5" text-anchor="middle">聴</text></svg>
      <span><b>耳を澄ます</b><small>長押し・その場で止まる</small></span>`
    this.fg = b.querySelector('.fg') as SVGCircleElement
    this.sub = b.querySelector('small') as HTMLElement
    const down = (e: PointerEvent) => {
      e.preventDefault()
      b.setPointerCapture?.(e.pointerId)
      this.heldFlag = true
      b.classList.add('held')
      onFirstPress()
    }
    const up = () => {
      this.heldFlag = false
      b.classList.remove('held')
    }
    b.addEventListener('pointerdown', down)
    b.addEventListener('pointerup', up)
    b.addEventListener('pointercancel', up)
    b.addEventListener('lostpointercapture', up)
    b.addEventListener('contextmenu', (e) => e.preventDefault())
    // キーボード: ボタンにフォーカスして Enter・Space を押し続ける
    b.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        this.keyHeld = true
        onFirstPress()
      }
    })
    b.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') this.keyHeld = false
    })
    b.addEventListener('blur', () => (this.keyHeld = false))
    root.appendChild(b)
    this.el = b
  }

  /** ボタンか、キーボードの Space（画面のどこでも）を押している */
  held(globalSpace: boolean): boolean {
    return this.shown && (this.heldFlag || this.keyHeld || globalSpace)
  }

  show(on: boolean, sub?: string): void {
    if (on !== this.shown) {
      this.shown = on
      this.el.classList.toggle('on', on)
      if (!on) {
        this.heldFlag = false
        this.keyHeld = false
        this.el.classList.remove('held')
      }
    }
    if (sub !== undefined && this.sub.textContent !== sub) this.sub.textContent = sub
  }

  setProgress(p: number): void {
    const off = (ListenButton.C * (1 - Math.max(0, Math.min(1, p)))).toFixed(2)
    if (this.fg.getAttribute('stroke-dashoffset') !== off) this.fg.setAttribute('stroke-dashoffset', off)
  }
}

// ---------------------------------------------------------------- 霞

export class MistVeil {
  readonly el: HTMLDivElement
  private color = ''
  private amount = -1

  constructor(root: HTMLElement) {
    injectStyle()
    this.el = el('div', 'ye-mist')
    root.insertBefore(this.el, root.firstChild)
  }

  setColor(hex: string): void {
    if (hex === this.color) return
    this.color = hex
    this.el.style.background = `radial-gradient(ellipse 64% 60% at 50% 50%, ${hex}00 22%, ${hex}66 52%, ${hex}c8 78%, ${hex}f2 100%)`
  }

  set(amount: number): void {
    const a = Math.round(Math.max(0, Math.min(1, amount)) * 100) / 100
    if (a === this.amount) return
    this.amount = a
    this.el.style.opacity = String(a)
  }
}

// ---------------------------------------------------------------- 伝承の札

/** 確度・調べ・監修の状態は作る側の情報なので、URL に ?debug を付けたとき（開発・監修の確認）だけ出す */
const SHOW_PRODUCTION_META = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug')
  } catch {
    return false
  }
})()

export function cardHtml(card: LoreCard, opts: { first?: boolean; button?: string } = {}): string {
  const src = card.source
  const work = `${escapeHtml(src.work)}${src.year ? `（${src.year}）` : ''}`
  const checked = (src.checkedIn ?? [])
    .map((c) => (c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.label)}</a>` : escapeHtml(c.label)))
    .join('、')
  const meta = SHOW_PRODUCTION_META
    ? `
    <dl class="yc-meta">
      <dt>出典</dt><dd>${work}</dd>
      <dt>確度</dt><dd><span class="yc-badge ok">${escapeHtml(card.confidence)}</span></dd>
      <dt>調べ</dt><dd>${escapeHtml(card.researchRef)}${checked ? `（${checked}）` : ''}</dd>
      <dt>監修</dt><dd><span class="yc-badge draft">${escapeHtml(card.review)}</span></dd>
    </dl>`
    : `
    <p class="yc-source">出典 ${work}</p>`
  return `
    <div class="yc-kind"><span>伝承の札</span>${opts.first ? '<span class="new">札が開いた</span>' : ''}</div>
    <h3 class="yc-title"><small>${escapeHtml(card.number ?? '')}</small>${escapeHtml(card.title)}</h3>
    <p class="yc-body">${escapeHtml(card.body)}</p>${meta}
    ${opts.first ? '<p class="yc-foot">札は伝承の記録です。会話の台詞は、本作の創作です。</p>' : ''}
    ${opts.button ? `<button class="yc-btn" type="button">${escapeHtml(opts.button)}</button>` : ''}`
}

// ---------------------------------------------------------------- 会話の枠

export interface DialogueHooks {
  next(): void
  choose(index: number): void
  close(): void
}

export class DialogueView {
  private readonly wrap: HTMLDivElement
  private readonly box: HTMLDivElement
  private readonly nameEl: HTMLElement
  private readonly tagEl: HTMLElement
  private readonly textEl: HTMLElement
  private readonly choicesEl: HTMLElement
  private readonly nextEl: HTMLElement
  private readonly cardWrap: HTMLDivElement
  private readonly cardEl: HTMLDivElement
  private beat: Beat | null = null
  private openFlag = false
  /** 連打で2拍進まないように、表示してから少し待つ */
  private shownAt = 0

  constructor(
    root: HTMLElement,
    private readonly hooks: DialogueHooks,
    private readonly notices: { yokaiName(id: string): string },
  ) {
    injectStyle()
    this.wrap = el('div', 'yd')
    this.wrap.setAttribute('role', 'dialog')
    this.wrap.setAttribute('aria-live', 'polite')
    this.box = el('div', 'yd-box')
    this.nameEl = el('span', 'yd-name')
    this.tagEl = el('span', 'yd-tag')
    const head = el('div', 'yd-head')
    head.append(this.nameEl, this.tagEl)
    this.textEl = el('p', 'yd-text')
    this.choicesEl = el('div', 'yd-choices')
    this.nextEl = el('span', 'yd-next', 'タップで次へ ▼')
    this.box.append(head, this.textEl, this.choicesEl, this.nextEl)
    const close = el('button', 'yd-close', '会話をやめる')
    ;(close as HTMLButtonElement).type = 'button'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      this.hooks.close()
    })
    this.wrap.append(close, this.box)
    this.box.addEventListener('click', () => this.advance())
    root.appendChild(this.wrap)

    this.cardWrap = el('div', 'yc-wrap')
    this.cardEl = el('div', 'yc-card')
    this.cardEl.setAttribute('role', 'dialog')
    this.cardEl.setAttribute('aria-label', '伝承の札')
    this.cardWrap.appendChild(this.cardEl)
    root.appendChild(this.cardWrap)

    window.addEventListener('keydown', (e) => {
      if (!this.openFlag || e.repeat) return
      if (e.code === 'Enter' || e.code === 'Space') {
        if (this.beat?.kind === 'choices') return
        e.preventDefault()
        this.advance()
      } else if (/^Digit[1-3]$/.test(e.code) && this.beat?.kind === 'choices') {
        const i = Number(e.code.slice(5)) - 1
        const o = this.beat.options[i]
        if (o) this.hooks.choose(o.index)
      } else if (e.code === 'Escape') {
        if (this.beat?.kind === 'card') this.advance()
      }
    })
  }

  get isOpen(): boolean {
    return this.openFlag
  }

  open(label: string): void {
    this.openFlag = true
    this.wrap.setAttribute('aria-label', label)
    this.wrap.classList.add('on')
  }

  close(): void {
    this.openFlag = false
    this.beat = null
    this.wrap.classList.remove('on')
    this.cardWrap.classList.remove('on')
  }

  private advance(): void {
    if (!this.beat || this.beat.kind === 'choices' || this.beat.kind === 'end') return
    if (performance.now() - this.shownAt < 220) return
    this.hooks.next()
  }

  show(beat: Beat): void {
    this.beat = beat
    this.shownAt = performance.now()
    if (beat.kind === 'card') {
      this.cardEl.innerHTML = cardHtml(beat.card, { first: beat.first, button: '札をしまう' })
      const btn = this.cardEl.querySelector('.yc-btn') as HTMLButtonElement
      btn.addEventListener('click', () => this.advance())
      this.cardWrap.classList.add('on')
      this.wrap.style.visibility = 'hidden'
      window.setTimeout(() => btn.focus({ preventScroll: true }), 50)
      return
    }
    this.cardWrap.classList.remove('on')
    this.wrap.style.visibility = ''
    this.choicesEl.innerHTML = ''
    if (beat.kind === 'line' || beat.kind === 'choices') {
      const line = beat.kind === 'line' ? beat : beat.context
      if (line) {
        this.nameEl.textContent = line.speaker.name
        this.nameEl.className = `yd-name ${line.speaker.role}`
        this.tagEl.textContent = '台本・創作'
        this.tagEl.title = '本作の創作の台詞（伝承の事実は「伝承の札」で示します）'
        this.textEl.className = 'yd-text'
        this.textEl.textContent = line.text
      }
      if (beat.kind === 'choices') {
        beat.options.forEach((o, i) => {
          const b = el('button', 'yd-choice') as HTMLButtonElement
          b.type = 'button'
          b.innerHTML = `${escapeHtml(o.text)}<kbd>${i + 1}</kbd>`
          b.addEventListener('click', (e) => {
            e.stopPropagation()
            this.hooks.choose(o.index)
          })
          this.choicesEl.appendChild(b)
        })
        this.nextEl.style.display = 'none'
        window.setTimeout(() => (this.choicesEl.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true }), 50)
      } else this.nextEl.style.display = ''
      return
    }
    if (beat.kind === 'notice') {
      this.nameEl.textContent = ''
      this.tagEl.textContent = 'おしらせ'
      this.tagEl.title = ''
      this.textEl.className = 'yd-text notice'
      this.textEl.innerHTML = noticeHtml(beat.notice, this.notices.yokaiName)
      this.nextEl.style.display = ''
    }
  }
}

function noticeHtml(n: Notice, yokaiName: (id: string) => string): string {
  if (n.type === 'bond') {
    return `<b>${escapeHtml(yokaiName(n.yokai))}と「${escapeHtml(n.label)}」になった</b><span>縁の糸が一本、結ばれた。</span>`
  }
  const where = n.travel === 'yume' ? '夢の旅では線（白描）まで。色は、現地でこの地点に立つと入る。' : ''
  return `<b>曼荼羅帳に、${escapeHtml(n.label)}のピースが一つ入った</b><span>${where}右上の「曼荼羅帳」で見られる。</span>`
}

// ---------------------------------------------------------------- 曼荼羅帳

export interface MandalaHooks {
  close(): void
  reset(): void
  /** ピースを見た（「新」の印を消す） */
  seen(pieceId: string): void
}

export interface MandalaState {
  piece(id: string): PieceState
  isNew(id: string): boolean
  card(id: string): LoreCard | undefined
  /** 巻末の旅印（02 F-45）。at は押した日時（まだなら null） */
  stamps?(): { id: string; title: string; stampTitle: string; motif: string; at: string | null }[]
}

const INK = '#3a332d'

export class MandalaView {
  private readonly root: HTMLElement
  private readonly wrap: HTMLDivElement
  private readonly scroll: HTMLDivElement
  private readonly pop: HTMLDivElement
  private readonly popCard: HTMLDivElement
  private openFlag = false
  private lastFocus: HTMLElement | null = null

  constructor(
    root: HTMLElement,
    private readonly def: MandalaDef,
    private readonly state: MandalaState,
    private readonly hooks: MandalaHooks,
  ) {
    injectStyle()
    this.root = root
    this.wrap = el('div', 'ym')
    this.wrap.setAttribute('role', 'dialog')
    this.wrap.setAttribute('aria-label', '曼荼羅帳')
    const head = el('div', 'ym-head', `<h2>${escapeHtml(def.title)}</h2><span class="sub">自分の立山曼荼羅（夢の旅では白描）</span>`)
    const close = el('button', 'ym-btn close', 'とじる') as HTMLButtonElement
    close.type = 'button'
    close.addEventListener('click', () => this.hooks.close())
    head.appendChild(close)
    const noteSp = el('p', 'ym-note-sp', '【創作】の構図です。本物の立山曼荼羅を写したものではありません。')
    const body = el('div', 'ym-body')
    this.scroll = el('div', 'ym-scroll')
    const side = el('div', 'ym-side')
    side.innerHTML = `
      <div class="ym-legend">
        <p>ピースの状態</p>
        <ul>
          <li><i></i>空白（まだ）</li>
          <li><i class="hakubyo"></i>白描（話を聞いた）</li>
          <li><i class="saishiki"></i>彩色（現地で）</li>
          <li><i class="kin"></i>金の縁取り</li>
        </ul>
      </div>
      <p class="ym-note">${escapeHtml(def.note)}</p>`
    if (state.stamps) {
      const back = el('button', 'ym-btn ym-back', '巻末の旅印') as HTMLButtonElement
      back.type = 'button'
      back.addEventListener('click', () => this.openStamps())
      side.appendChild(back)
    }
    const reset = el('button', 'ym-btn ym-reset', '最初からやり直す') as HTMLButtonElement
    reset.type = 'button'
    reset.addEventListener('click', () => this.confirmReset())
    side.appendChild(reset)
    body.append(this.scroll, side)
    this.wrap.append(head, noteSp, body)
    root.appendChild(this.wrap)

    this.pop = el('div', 'ym-pop')
    this.popCard = el('div', 'yc-card')
    this.popCard.setAttribute('role', 'dialog')
    this.pop.appendChild(this.popCard)
    this.pop.addEventListener('click', (e) => {
      if (e.target === this.pop) this.closePop()
    })
    root.appendChild(this.pop)

    window.addEventListener('keydown', (e) => {
      if (!this.openFlag || e.code !== 'Escape') return
      if (this.pop.classList.contains('on')) this.closePop()
      else this.hooks.close()
    })
  }

  get isOpen(): boolean {
    return this.openFlag
  }

  open(): void {
    this.lastFocus = document.activeElement as HTMLElement | null
    this.render()
    this.openFlag = true
    this.wrap.classList.add('on')
    this.root.classList.add('modal-open')
    window.setTimeout(() => (this.wrap.querySelector('.ym-btn.close') as HTMLButtonElement | null)?.focus({ preventScroll: true }), 50)
  }

  close(): void {
    this.openFlag = false
    this.wrap.classList.remove('on')
    this.root.classList.remove('modal-open')
    this.closePop()
    this.lastFocus?.focus?.({ preventScroll: true })
  }

  render(): void {
    const [W, H] = this.def.viewBox
    const parts: string[] = []
    // 表装と軸
    parts.push(`<defs>
      <linearGradient id="ymPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8f3e6"/><stop offset="1" stop-color="#efe6d2"/></linearGradient>
      <linearGradient id="ymFog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    </defs>`)
    parts.push(`<rect x="3" y="12" width="${W - 6}" height="${H - 24}" rx="2" fill="#c9b994"/>`)
    parts.push(`<rect x="10" y="20" width="${W - 20}" height="${H - 40}" fill="#ddd0b0"/>`)
    parts.push(`<rect x="18" y="28" width="${W - 36}" height="${H - 56}" fill="url(#ymPaper)" stroke="#a89878" stroke-width="0.8"/>`)
    parts.push(`<rect x="0" y="2" width="${W}" height="12" rx="6" fill="#6b4f3a"/><rect x="0" y="${H - 14}" width="${W}" height="12" rx="6" fill="#6b4f3a"/>`)
    parts.push(`<circle cx="4" cy="${H - 8}" r="7" fill="#4e392a"/><circle cx="${W - 4}" cy="${H - 8}" r="7" fill="#4e392a"/>`)
    // 背景の線（【創作】の構図: 下から里の川、麓の道、山の稜線）
    const faint = `fill="none" stroke="${INK}" stroke-opacity="0.22" stroke-linecap="round"`
    parts.push(`<path d="M18,712 C80,698 120,724 180,708 C230,694 260,712 282,702" ${faint} stroke-width="1.2"/>`)
    parts.push(`<path d="M18,722 C80,708 120,734 180,718 C230,704 260,722 282,712" ${faint} stroke-width="0.8"/>`)
    parts.push(`<path d="M150,728 C92,692 208,640 150,600 C92,560 208,520 150,470 C92,420 208,380 150,330 C100,290 200,252 150,212 C120,176 170,146 150,104" ${faint} stroke-width="1.1" stroke-dasharray="2 5"/>`)
    parts.push(`<path d="M18,186 L58,140 L84,156 L126,92 L152,124 L192,70 L226,118 L254,104 L282,126" ${faint} stroke-width="1.3"/>`)
    parts.push(`<path d="M104,124 L126,92 L140,108" ${faint} stroke-width="0.8"/>`)
    // すやり霞（段の境目）
    for (const y of [212, 558]) {
      parts.push(
        `<path d="M18,${y} C40,${y - 9} 70,${y - 9} 92,${y} C112,${y - 8} 140,${y - 8} 160,${y} C186,${y - 9} 214,${y - 9} 236,${y} C252,${y - 6} 270,${y - 6} 282,${y} L282,${y + 6} L18,${y + 6} Z" fill="#ffffff" fill-opacity="0.75" stroke="${INK}" stroke-opacity="0.18" stroke-width="0.8"/>`,
      )
    }
    // 段の名前
    for (const t of this.def.tiers) {
      // 枠と重ならないよう、各段の右上の余白に置く
      parts.push(`<text x="${W - 26}" y="${t.y0 + 16}" text-anchor="end" font-size="12" fill="${INK}" fill-opacity="0.85" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">${escapeHtml(t.label)}</text>`)
    }
    // ピース
    for (const t of this.def.tiers) for (const p of t.pieces) parts.push(this.pieceSvg(p))
    // 山の段は霧の中
    const yama = this.def.tiers.find((t) => t.id === 'yama')
    if (yama) parts.push(`<rect x="18" y="${yama.y0 - 6}" width="${W - 36}" height="${yama.y1 - yama.y0}" fill="url(#ymFog)" pointer-events="none"/>`)
    this.scroll.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(this.def.title)}">${parts.join('')}</svg>`
    for (const g of Array.from(this.scroll.querySelectorAll<SVGGElement>('.ym-piece'))) {
      const id = g.dataset.id!
      const open = () => this.openPiece(id)
      g.addEventListener('click', open)
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      })
    }
  }

  private pieceSvg(p: MandalaPieceDef): string {
    const st = this.state.piece(p.id)
    const filled = st !== 'empty'
    const label = filled && p.label ? `${p.label}（${PIECE_LABEL[st]}）` : `空白のピース`
    let inner = ''
    if (!filled) {
      inner = `<rect class="frame" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="#fbf7ec" fill-opacity="0.55" stroke="#8a7f70" stroke-opacity="0.75" stroke-width="0.8" stroke-dasharray="3 2.4"/>`
    } else {
      const art = p.art ? ARTS[p.art] : undefined
      let artSvg = ''
      if (art) {
        const pad = 3
        const s = Math.min((p.w - pad * 2) / art.w, (p.h - pad * 2) / art.h)
        const ox = p.x + (p.w - art.w * s) / 2
        const oy = p.y + (p.h - art.h * s) / 2
        artSvg = `<g transform="translate(${ox.toFixed(2)},${oy.toFixed(2)}) scale(${s.toFixed(4)})">${artToSvg(art, '#fffdf7', INK, 1.6, 1, st === 'saishiki' || st === 'kin')}</g>`
      }
      const stroke = st === 'kin' ? '#c9a24a' : INK
      const sw = st === 'kin' ? 2.2 : 1.1
      inner =
        `<rect class="frame" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="#fffdf7" stroke="${stroke}" stroke-width="${sw}"/>` +
        artSvg +
        // 状態の印（色だけにしない: 形と文字）
        `<rect x="${p.x + p.w - 19}" y="${p.y + 2}" width="17" height="15" rx="2" fill="#fffdf7" stroke="${INK}" stroke-width="0.6"/>` +
        `<text x="${p.x + p.w - 10.5}" y="${p.y + 13.6}" font-size="11" text-anchor="middle" fill="${INK}" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">${st === 'hakubyo' ? '線' : st === 'saishiki' ? '彩' : '金'}</text>`
      if (this.state.isNew(p.id)) inner += `<rect class="ring" x="${p.x - 3}" y="${p.y - 3}" width="${p.w + 6}" height="${p.h + 6}" rx="7" fill="none" stroke="#b5523b" stroke-width="1.6"/>`
    }
    const cls = `ym-piece${filled && this.state.isNew(p.id) ? ' new' : ''}`
    return `<g class="${cls}" data-id="${p.id}" role="button" tabindex="0" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title>${inner}</g>`
  }

  /** 巻末の旅印の頁。家では枠だけ見える */
  openStamps(): void {
    const list = this.state.stamps?.() ?? []
    const items = list
      .map(
        (s) => `<figure class="ym-stamp">${s.at ? stampSvg({ title: s.stampTitle, date: stampDate(s.at), motif: s.motif }) : stampFrameSvg(s.stampTitle)}
          <figcaption>${escapeHtml(s.title)}${s.at ? `<br><small>${escapeHtml(stampDate(s.at))}</small>` : ''}</figcaption></figure>`,
      )
      .join('')
    this.showPop(`
      <div class="yc-kind"><span>巻末</span></div>
      <h3 class="yc-title">旅印</h3>
      <div class="ym-stamps">${items}</div>
      <p class="yc-foot" style="margin-top:4px">現地で節を終えた記念の印です。この印は売ったり譲ったりできません。</p>
      <button class="yc-btn" type="button" data-act="close">もどる</button>`)
  }

  private findPiece(id: string): MandalaPieceDef | undefined {
    for (const t of this.def.tiers) for (const p of t.pieces) if (p.id === id) return p
    return undefined
  }

  private openPiece(id: string): void {
    const p = this.findPiece(id)
    if (!p) return
    const st = this.state.piece(id)
    if (st === 'empty') {
      this.showPop(`
        <div class="yc-kind"><span>空白のピース</span></div>
        <h3 class="yc-title">まだ白紙</h3>
        <p class="yc-body" style="font-size:14px">誰かの話を聞くと、ここに線が入る。</p>
        <button class="yc-btn" type="button" data-act="close">もどる</button>`)
      return
    }
    this.hooks.seen(id)
    const art = p.art ? ARTS[p.art] : undefined
    const svg = art ? `<svg class="art" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.1, 1, st === 'saishiki' || st === 'kin')}</svg>` : ''
    const cards = (p.cardIds ?? []).map((c) => this.state.card(c)).filter((c): c is LoreCard => !!c)
    const hint =
      st === 'hakubyo'
        ? '夢で話を聞いて、線（白描）が入った。現地でこの地点に立つと、色が入る（現の旅）。'
        : st === 'saishiki'
          ? '現地で色が入った。'
          : '語り返して、金の縁取りが入った。'
    this.showPop(`
      <div class="yc-kind"><span>曼荼羅のピース</span><span class="new">${escapeHtml(PIECE_LABEL[st])}</span></div>
      <h3 class="yc-title">${escapeHtml(p.label ?? '')}</h3>
      ${svg}
      <p class="yc-foot" style="margin-top:0">${escapeHtml(hint)}</p>
      <div class="row">
        ${cards.length ? `<button class="yc-btn" type="button" data-act="card">札を読む</button>` : ''}
        <button class="yc-btn" type="button" data-act="close">もどる</button>
      </div>`)
    const cardBtn = this.popCard.querySelector('[data-act="card"]')
    cardBtn?.addEventListener('click', () => {
      this.showPop(cardHtml(cards[0], { button: 'もどる' }))
      this.popCard.querySelector('.yc-btn')?.addEventListener('click', () => this.openPiece(id))
      ;(this.popCard.querySelector('.yc-btn') as HTMLButtonElement | null)?.focus({ preventScroll: true })
    })
    this.render()
  }

  private showPop(html: string): void {
    this.popCard.innerHTML = html
    this.popCard.querySelector('[data-act="close"]')?.addEventListener('click', () => this.closePop())
    this.pop.classList.add('on')
    window.setTimeout(() => (this.popCard.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true }), 30)
  }

  private closePop(): void {
    this.pop.classList.remove('on')
  }

  private confirmReset(): void {
    this.showPop(`
      <div class="yc-kind"><span>確認</span></div>
      <h3 class="yc-title">最初からやり直しますか</h3>
      <p class="yc-body" style="font-size:14px">会った妖怪・開いた札・曼荼羅のピース・縁が、すべて消えます。元には戻せません。</p>
      <div class="row">
        <button class="yc-btn" type="button" data-act="close">やめる</button>
        <button class="yc-btn" type="button" data-act="reset">やり直す</button>
      </div>`)
    this.popCard.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
      this.closePop()
      this.hooks.reset()
      this.render()
    })
  }
}
