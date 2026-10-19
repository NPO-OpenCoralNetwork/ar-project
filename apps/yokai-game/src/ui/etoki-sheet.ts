// 今日の絵解きの札（04 §2.4・§3.6・§7 10/18、段階4b）。決まりと文の組み立ては core/story/etoki-card.ts。
// 「今日はここまで」（夢の旅の板・白描の絵地図・現の旅の止まっているとき・旅印の札）と、便りの画面の［つくる］［見る］から開く。
//
// 1. 振り返り: ましろの言葉（etokiRecap。【創作】）を［つぎへ］で一つずつ。開いた札が無ければ［とじる］で終わる（札はつくらない）。
// 2. 札を1〜3枚えらぶ: 今日開いた札を先に。「これまでの札も見る」で、前に開いた札も。えらんだ札は枠と「えらんだ」の字で分かる（色だけにしない）。
//    並べてはいけない組み合わせ（雷鳥と神仏。etokiPairAllowed）になる札は押せず、ましろの一言（lines.pairBlocked）を添える。えらんだ順が、札の並び。
// 3. ひと言: 決まった言葉から選ぶだけ（自由な字は書かない。04 §3.2）。「そえない」も選べる。
// 4. 見本: 横長の和紙（絵巻の一場面のような形）。お札・御朱印・お守りに見せない: 印・朱・縦長の札・穴・紐は描かず、面に日付も書かない
//    （日付と旅は、札の上の小さな字で）。添え書き（ましろ。明朝・【創作】の印）と、ひと言（丸ゴシック・茜の下線・頭に「― 」）で、書体を分ける。
// 5. つくる: 残す（saveTodayEtoki。同じ日は入れ替え）。はじめての絵解き（絵解きのピースが空白、または現地で白描）なら、ましろだけの台本
//    etoki-first を便りの画面の出会いで話す（札 mandala-2 が開き、絵解きのピースに線が入る。現地でつくれば彩色）。そのあと、ましろの言葉で閉じる。
// 共有・書き出しはしない（F-12）。節・旅印は終えない（02 F-45）。three.js は読み込まない。

import { jstDateLabel, storyClock } from '../core/story/clock'
import { captionKey, captionText, ETOKI_PICK_MAX, ETOKI_SCRIPT, type EtokiEnv, etokiPairAllowed, etokiPool, etokiRecap, needsEtokiScript, saveTodayEtoki } from '../core/story/etoki-card'
import { isPendingConsent } from '../core/story/dialogue'
import type { MemoStore } from '../core/story/memo'
import type { EtokiRecord, ProgressStore } from '../core/story/progress'
import { fillTokens } from '../core/story/text'
import type { Travel } from '../core/story/types'
import type { StoryPack } from '../data/story-pack'
import type { GenOpenOptions } from '../utsutsu/encounter'
import { escapeHtml, focusCard, openLayer, sayHtml } from './memo-sheet'

const STYLE = /* css */ `
/* 今日の絵解き（札の重ねは memo-sheet.ts の .ts-layer）。札の面は横長の和紙。印・朱・縦長の形・穴・紐は描かない */
.et { --note-font: "Hiragino Maru Gothic ProN", "Zen Maru Gothic", "BIZ UDPGothic", sans-serif; }
/* 札の重ねは、横長の札が収まる幅に（広い画面で、札の題が細い列にならないように） */
.ts-card.et { width: min(760px, 100%); }
/* 見出しは右上の［やめる］と重ねない。文節で折り返す */
.ts-card.et > .ts-h { padding-right: 64px; text-wrap: balance; word-break: auto-phrase; }
.et-say .ts-line + .ts-line { margin-top: 4px; }
.et-say .ts-line.old { color: var(--ts-soft); font-size: 14.5px; }
.et-picks { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.et-pick { position: relative; display: flex; flex-direction: column; gap: 2px; width: 100%; min-height: 64px; padding: 9px 12px 10px; text-align: left; font: inherit; color: var(--ts-ink);
  background: linear-gradient(170deg, #fbf6e9, #f3ead6); border: 1px solid rgba(43, 36, 32, 0.3); border-radius: 6px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.et-pick b { font-family: var(--ts-title); font-size: 15.5px; line-height: 1.45; letter-spacing: 0.04em; text-wrap: pretty; word-break: auto-phrase; }
/* 出典は2行まで（1行で切ると、どの札も「観光庁 …」で終わる） */
.et-src { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; font-size: 12px; line-height: 1.5; color: var(--ts-soft); }
/* 「今日」は題の上の行に（題の右を空けると、広い画面でも題が「描かれた／もの」と割れる） */
.et-today { align-self: flex-start; margin-bottom: 1px; font-size: 11px; line-height: 1.4; padding: 0 6px; border: 1px solid rgba(43, 36, 32, 0.4); border-radius: 3px; background: #fffdf7; }
/* えらんだ札: 太い墨の枠と「えらんだ」の字（色だけにしない） */
.et-pick[aria-pressed="true"] { border: 2.5px solid #2a2622; padding: 7.5px 10.5px 8.5px; background: #fffdf7; }
.et-sel { display: none; align-self: flex-start; margin-top: 3px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; padding: 0 8px; border: 1px solid #2a2622; border-radius: 999px; }
.et-pick[aria-pressed="true"] .et-sel { display: inline-block; }
.et-pick[aria-disabled="true"] { cursor: default; background: #fff; border-style: dashed; color: rgba(42, 38, 34, 0.75); }
.et-block { margin-top: 3px; font-size: 12px; line-height: 1.5; color: var(--ts-ink); }
.et-more { margin-top: 10px; }
.et-chips { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.et-chip { min-height: 44px; padding: 0 14px; font-family: var(--note-font); font-size: 15px; color: var(--ts-ink); background: #fff; border: 1px solid rgba(42, 38, 34, 0.36); border-radius: 999px; cursor: pointer; }
.et-chip[aria-pressed="true"] { border: 2.5px solid #2a2622; padding: 0 12.5px; background: #fffdf7; font-weight: 600; }
.et-chip[aria-pressed="true"]::after { content: "（えらんだ）"; font-family: var(--ts-ui); font-size: 11.5px; font-weight: 400; margin-left: 2px; }
.et-chip.none { font-family: var(--ts-ui); font-size: 14px; }
.et-label { margin: 10px 0 0; font-size: 13px; color: var(--ts-soft); }
/* 札の面の上の小さな字（日付と旅。面には日付を書かない） */
.et-when { margin: 12px 2px 6px; font-size: 13px; letter-spacing: 0.06em; color: var(--ts-soft); }
/* 札の面: 横長の和紙（絵巻の一場面）。上下にすやり霞、細い墨の界線。印・朱・穴・紐は描かない */
.et-face { position: relative; margin: 0; padding: 26px 18px 18px; color: #2b2420; border-radius: 3px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0) 18px) top / 100% 18px no-repeat,
    linear-gradient(0deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0) 18px) bottom / 100% 18px no-repeat,
    radial-gradient(circle at 18% 22%, rgba(190, 170, 130, 0.12) 0 1.2px, transparent 1.6px) 0 0 / 23px 19px,
    radial-gradient(circle at 70% 60%, rgba(150, 130, 100, 0.10) 0 0.9px, transparent 1.3px) 0 0 / 17px 29px,
    linear-gradient(170deg, #fbf6e9, #f1e6cf);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 8px 22px rgba(30, 20, 10, 0.18); }
.et-face::before { content: ""; position: absolute; left: 8px; right: 8px; top: 12px; bottom: 12px; border-top: 1px solid rgba(43, 36, 32, 0.32); border-bottom: 1px solid rgba(43, 36, 32, 0.32); pointer-events: none; }
.et-head { margin: 0 0 12px; font-family: var(--ts-title); font-size: 15px; font-weight: 600; letter-spacing: 0.3em; }
.et-cards { list-style: none; margin: 0; padding: 0; display: flex; gap: 10px; }
.et-c { flex: 1 1 0; min-width: 0; padding: 10px 12px 11px; background: rgba(255, 253, 247, 0.85); border: 1px solid rgba(43, 36, 32, 0.38); border-radius: 3px; }
.et-c b { display: block; font-family: var(--ts-title); font-size: 15px; line-height: 1.5; letter-spacing: 0.04em; text-wrap: pretty; word-break: auto-phrase; }
.et-c span { display: block; margin-top: 4px; font-size: 11.5px; line-height: 1.5; color: rgba(43, 36, 32, 0.72); text-wrap: pretty; word-break: auto-phrase; }
.et-foot { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px 16px; margin-top: 14px; }
.et-cap { margin: 0; font-family: var(--ts-title); font-size: 15.5px; line-height: 1.7; text-wrap: pretty; word-break: auto-phrase; }
.et-cap small { margin-right: 6px; font-family: var(--ts-ui); font-size: 10.5px; letter-spacing: 0.04em; color: rgba(43, 36, 32, 0.7); border: 1px solid rgba(43, 36, 32, 0.28); border-radius: 999px; padding: 0 7px; vertical-align: 0.1em; }
/* ひと言の紙片: 三つ目の書体（丸ゴシック）と、茜の下線と「― 」（字の形が代わっても分かる） */
.et-note { margin: 0 0 0 auto; padding: 4px 10px 6px; background: #fffdf8; border: 1px solid rgba(43, 36, 32, 0.22); border-radius: 2px; transform: rotate(-0.6deg); }
.et-note small { display: block; font-size: 10.5px; letter-spacing: 0.06em; color: rgba(43, 36, 32, 0.7); }
.et-note span { font-family: var(--note-font); font-size: 15.5px; line-height: 1.6; text-decoration: underline; text-decoration-color: #a8473a; text-decoration-thickness: 1.5px; text-underline-offset: 4px; }
@media (max-width: 420px) {
  .et-cards { flex-direction: column; gap: 6px; }
  .et-c { padding: 7px 10px 8px; }
  .et-face { padding: 24px 14px 16px; }
}
`

let styled = false
function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = STYLE
  document.head.appendChild(s)
}

const TRAVEL_LABEL: Record<Travel, string> = { yume: '夢の旅', utsutsu: '現の旅' }

/** 札の上の小さな字（「1月16日・夢の旅」。札の面には日付を書かない） */
export const etokiWhen = (day: string, travel: Travel): string => `${jstDateLabel(day)}・${TRAVEL_LABEL[travel] ?? ''}`

/**
 * 絵解きの札の面（HTML）。cards は札の id（並べた順）、phrase は一言の id、caption は添え書きの鍵。
 * 呼び名（一言の見出し）は escapeHtml して入れる。了承待ちになった札・データから消えた札は出さない
 */
function faceHtml(story: StoryPack, memo: MemoStore | null, cards: string[], phrase: string | undefined, caption: string): string {
  const list = cards
    .map((id) => story.cards[id])
    .filter((c) => !!c && !isPendingConsent(c))
    .map((c) => `<li class="et-c"><b>${escapeHtml(c.title)}</b><span>出典 ${escapeHtml(c.source.work)}</span></li>`)
    .join('')
  const ph = phrase ? story.etoki.phrases.find((x) => x.id === phrase)?.text : undefined
  const note = ph ? `<p class="et-note"><small>${escapeHtml(fillTokens(story.etoki.phraseLabel, memo))}</small><span>― ${escapeHtml(ph)}</span></p>` : ''
  return `<figure class="et-face" aria-label="きょうの絵解き">
      <p class="et-head" aria-hidden="true">きょうの絵解き</p>
      <ol class="et-cards">${list}</ol>
      <figcaption class="et-foot"><p class="et-cap"><small title="本作の創作">【創作】</small>${escapeHtml(captionText(caption, story))}</p>${note}</figcaption>
    </figure>`
}

/** 残した絵解きの札（便りの画面の「これまでの絵解き」と［見る］）。上に日付と旅の小さな字 */
export function etokiCardHtml(rec: Readonly<EtokiRecord>, day: string, story: StoryPack, memo: MemoStore | null): string {
  injectStyle()
  return `<div class="et"><p class="et-when">${escapeHtml(etokiWhen(day, rec.travel))}</p>${faceHtml(story, memo, rec.cards, rec.phrase, rec.caption)}</div>`
}

export interface EtokiSheetOptions {
  root: HTMLElement
  story: StoryPack
  progress: ProgressStore
  memo: MemoStore
  /** つくるページの旅（夢の旅・白描の絵地図は yume、現地は utsutsu） */
  travel: Travel
  now: () => number
  /** 会話を始める（便りの画面の出会い。はじめての絵解きの etoki-first）。始められなければ false。終わったら onEnd */
  talk(spotId: string, opts: GenOpenOptions, onEnd: () => void): boolean
  /** make（既定）: 振り返りから。view: 今日の絵解きを見る（［つくりなおす］つき） */
  start?: 'make' | 'view'
  /** 閉じた（キーボードの位置は、開いたボタンへ戻してある） */
  onClose(): void
}

/** 今日の絵解きの札を開く。閉じる手（close）を返す（帳を閉じたとき・道中に入ったときなど、外から閉じる） */
export function openEtokiSheet(o: EtokiSheetOptions): { close(): void } {
  injectStyle()
  const { story, progress, memo, travel } = o
  const env = (): EtokiEnv => ({ progress, story, clock: storyClock(o.now()), memo })
  let byeTimer = 0
  const layer = openLayer(o.root, {
    label: 'きょうの絵解き',
    onClosed: () => {
      window.clearTimeout(byeTimer)
      o.onClose()
    },
  })
  const { card } = layer
  card.classList.add('et')

  // えらんだ札（順）と一言
  const today = progress.etokiOf(storyClock(o.now()).day)
  let picks: string[] = today ? [...today.cards] : []
  let phrase: string | undefined = today?.phrase
  let showEarlier = false

  /** 札の中身を入れ替える。again: 同じ手順の描き直し（送りの位置を保ち、見出しへは移らない） */
  const render = (html: string, again = false) => {
    const top = card.scrollTop
    card.innerHTML = `<button class="ts-x" type="button" data-act="quit">やめる</button>${html}`
    card.querySelector('[data-act="quit"]')?.addEventListener('click', () => layer.close())
    card.scrollTop = again ? top : 0
    if (!again) focusCard(card)
  }
  const on = (sel: string, fn: (b: HTMLElement) => void) => card.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)))

  // ---- 1. 振り返り（ましろ。一つずつ）
  const recap = () => {
    const r = etokiRecap(env())
    let i = 0
    render(`<h2 class="ts-h">今日はここまで</h2><p class="ts-sub">きょうの話を、絵解きにして残す</p>
      <div class="et-say">${sayHtml()}</div>
      <div class="ts-row"><button class="ts-btn main" type="button" data-act="next">つぎへ</button></div>`)
    const bubble = card.querySelector('.ts-bubble') as HTMLElement
    const first = card.querySelector('.ts-line') as HTMLElement
    const btn = card.querySelector('[data-act="next"]') as HTMLButtonElement
    const show = () => {
      // 前の言葉は薄く残し、新しい言葉だけを読み上げる（重ねの読み上げの欄で。キーボードの位置は［つぎへ］のまま）
      bubble.querySelectorAll('.ts-line').forEach((p) => p.classList.add('old'))
      const p = i === 0 ? first : document.createElement('p')
      p.className = 'ts-line'
      p.textContent = r.lines[i]
      if (i > 0) bubble.appendChild(p)
      layer.say(r.lines[i])
      const last = i >= r.lines.length - 1
      btn.textContent = !last ? 'つぎへ' : r.canMake ? '札をえらぶ' : 'とじる'
    }
    show()
    btn.addEventListener('click', () => {
      if (i < r.lines.length - 1) {
        i++
        show()
      } else if (r.canMake) pick()
      else layer.close()
    })
  }

  // ---- 2. 札をえらぶ（1〜3枚）。again: えらび直しの描き直し（キーボードの位置は、押した札へ戻す）
  const pick = (again = false) => {
    const pool = etokiPool(env())
    const all = [...pool.today, ...pool.earlier]
    // もう開いていない札（やり直し・了承待ち）は、えらんだ札から外す
    picks = picks.filter((id) => all.includes(id))
    // つくりなおすとき、前にえらんだ札が「これまでの札」にあれば、はじめから広げておく（えらんだ札を隠さない）
    if (!again && picks.some((id) => pool.earlier.includes(id))) showEarlier = true
    const todaySet = new Set(pool.today)
    const earlierOpen = showEarlier || !pool.today.length
    const lines = story.etoki.lines
    const tile = (id: string) => {
      const c = story.cards[id]
      const sel = picks.includes(id)
      const blocked = !sel && !etokiPairAllowed([...picks, id], story.cards)
      const full = !sel && picks.length >= ETOKI_PICK_MAX
      const off = blocked || full
      return `<li><button class="et-pick" type="button" data-id="${escapeHtml(id)}" aria-pressed="${sel}"${off ? ' aria-disabled="true"' : ''}>
        ${todaySet.has(id) ? '<span class="et-today">今日</span>' : ''}
        <b>${escapeHtml(c.title)}</b><span class="et-src">出典 ${escapeHtml(c.source.work)}</span>
        <span class="et-sel">えらんだ</span>
        ${blocked ? `<span class="et-block">${escapeHtml(lines.pairBlocked)}</span>` : ''}
      </button></li>`
    }
    render(`<h2 class="ts-h">話したくなった札を、三枚まで選んで</h2>
      <p class="ts-soft">えらんだ順に、絵解きに並ぶ。</p>
      ${pool.today.length ? `<ul class="et-picks" aria-label="今日開いた札">${pool.today.map(tile).join('')}</ul>` : ''}
      ${
        pool.earlier.length
          ? pool.today.length
            ? `<button class="ts-btn et-more" type="button" data-act="more" aria-expanded="${earlierOpen}">これまでの札も見る</button>${earlierOpen ? `<ul class="et-picks" aria-label="これまでに開いた札">${pool.earlier.map(tile).join('')}</ul>` : ''}`
            : `<ul class="et-picks" aria-label="これまでに開いた札">${pool.earlier.map(tile).join('')}</ul>`
          : ''
      }
      <p class="ts-soft" aria-live="polite" data-msg>${picks.length >= ETOKI_PICK_MAX ? '三枚えらんだ。札を外すと、ほかの札をえらべる。' : ''}</p>
      <div class="ts-row">
        <button class="ts-btn main" type="button" data-act="next"${picks.length ? '' : ' aria-disabled="true"'}>つぎへ</button>
      </div>`,
      again,
    )
    on('.et-pick', (b) => {
      if (b.getAttribute('aria-disabled') === 'true') return
      const id = b.dataset.id!
      picks = picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id]
      pick(true)
      ;(card.querySelector(`.et-pick[data-id="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus({ preventScroll: true })
    })
    on('[data-act="more"]', () => {
      showEarlier = !showEarlier
      pick(true)
      ;(card.querySelector('[data-act="more"]') as HTMLElement | null)?.focus({ preventScroll: true })
    })
    on('[data-act="next"]', (b) => {
      if (b.getAttribute('aria-disabled') !== 'true') choosePhrase()
    })
  }

  // ---- 3. ひと言（決まった言葉から選ぶだけ）
  const choosePhrase = () => {
    const chip = (id: string | undefined, text: string) =>
      `<li><button class="et-chip${id ? '' : ' none'}" type="button" data-ph="${escapeHtml(id ?? '')}" aria-pressed="${phrase === id}">${escapeHtml(text)}</button></li>`
    render(`<h2 class="ts-h">ひと言、そえる</h2>
      <p class="et-label">${escapeHtml(fillTokens(story.etoki.phraseLabel, memo))}</p>
      <ul class="et-chips">${story.etoki.phrases.map((p) => chip(p.id, p.text)).join('')}${chip(undefined, 'そえない')}</ul>
      <div class="ts-row">
        <button class="ts-btn main" type="button" data-act="next">つぎへ</button>
        <button class="ts-btn" type="button" data-act="back">もどる</button>
      </div>`)
    on('.et-chip', (b) => {
      phrase = b.dataset.ph || undefined
      card.querySelectorAll<HTMLElement>('.et-chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)))
    })
    on('[data-act="next"]', () => preview())
    on('[data-act="back"]', () => pick())
  }

  // ---- 4. 見本（横長の和紙。面に日付を書かない）
  const preview = () => {
    const e = env()
    // 見本は、残すときと同じ並べ方（開いている札・並べてよい組み合わせ・3枚まで）で見せる
    const shown = picks.filter((id) => progress.isCardOpened(id) && story.cards[id] && !isPendingConsent(story.cards[id])).slice(0, ETOKI_PICK_MAX)
    render(`<h2 class="ts-h">きょうの絵解き</h2>
      <p class="et-when">${escapeHtml(etokiWhen(e.clock.day, travel))}</p>
      ${faceHtml(story, memo, shown, phrase, captionKey(e))}
      <div class="ts-row">
        <button class="ts-btn main" type="button" data-act="make">これでつくる</button>
        <button class="ts-btn" type="button" data-act="redo">えらびなおす</button>
      </div>`)
    on('[data-act="make"]', () => make())
    on('[data-act="redo"]', () => pick())
  }

  // ---- 5. つくる（残す。はじめてなら etoki-first）
  const make = () => {
    const e = env()
    saveTodayEtoki(e, picks, phrase, travel)
    if (!progress.etokiOf(e.clock.day)) {
      // 残せなかった（えらんだ札が、もう開いていないなど）: えらびなおす
      pick()
      return
    }
    if (needsEtokiScript(progress, travel)) {
      layer.hide(true)
      const ok = o.talk('etoki', { script: ETOKI_SCRIPT, form: 'none', travel, tone: 'paper', memo }, () => {
        if (layer.closed) return
        layer.hide(false)
        saved()
      })
      if (ok) return
      layer.hide(false)
    }
    saved()
  }

  // ---- できた札と、ましろの言葉
  const saved = () => {
    const day = storyClock(o.now()).day
    const rec = progress.etokiOf(day)
    render(`<h2 class="ts-h">きょうの絵解き</h2>
      ${rec ? etokiCardHtml(rec, day, story, memo) : ''}
      ${sayHtml()}
      <div class="ts-row"><button class="ts-btn main" type="button" data-act="close">とじる</button></div>`)
    ;(card.querySelector('.ts-line') as HTMLElement).textContent = story.etoki.lines.saved
    layer.say(story.etoki.lines.saved)
    on('[data-act="close"]', () => bye())
  }
  const bye = () => {
    render(`<h2 class="ts-h">今日はここまで</h2>${sayHtml()}`)
    ;(card.querySelector('.ts-line') as HTMLElement).textContent = story.etoki.lines.bye
    layer.say(story.etoki.lines.bye)
    // ひと言だけ見せて閉じる（Escape・［やめる］でもすぐ閉じる）
    byeTimer = window.setTimeout(() => layer.close(), 1800)
  }

  // ---- 見る（今日の絵解き。つくりなおせる）
  const view = () => {
    const day = storyClock(o.now()).day
    const rec = progress.etokiOf(day)
    if (!rec) {
      recap()
      return
    }
    render(`<h2 class="ts-h">きょうの絵解き</h2>
      ${etokiCardHtml(rec, day, story, memo)}
      <p class="ts-soft">便りの頁に、はさんである。同じ日につくりなおすと、入れ替わる。</p>
      <div class="ts-row">
        <button class="ts-btn" type="button" data-act="redo">つくりなおす</button>
        <button class="ts-btn main" type="button" data-act="close">とじる</button>
      </div>`)
    on('[data-act="redo"]', () => pick())
    on('[data-act="close"]', () => layer.close())
  }

  if (o.start === 'view') view()
  else recap()
  return { close: () => layer.close() }
}
