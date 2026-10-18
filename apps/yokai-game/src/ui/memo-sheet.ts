// ましろの覚え書き（呼び名）の札（04 §3.3・§7 10/18、段階4b）。覚え書きの決まりは core/story/memo.ts。
// 便り（ui/tayori.ts）のはじめの「ましろの便り」の［呼び名を教える］と、縁帳の覚え書きの行（ui/cho.ts）から開く。
//
// - 会話の外の、一度きりの欄（会話は選ぶだけ。04 §3.2）。書かなくてもよい（［書かない］は何も残さない。消すのは縁帳の［消す］だけ）。
// - 字の決まり（NFKC・8字まで・ひらがな/カタカナ/漢字/ローマ字/ー・・・々）と断りの文は validateYobina のまま出す。
// - 呼び名は遊ぶ人が書いた字なので、画面には textContent か escapeHtml で出す（innerHTML にそのまま入れない）。
// - 札の作りは引き継ぎの札（transfer-sheet.ts）にならう: 開いたら見出しへキーボードの位置を移し、知らせは polite の欄で読み上げ、閉じたら開いたボタンへ戻す。
//
// このファイルには、便りの画面の札（覚え書き・今日の絵解き）が共に使う「重ね」（openLayer）も置く。
// 重ねはページの層（帳・会話の層）の上に置き、開いている間は、同じ root のほかの層を inert にする（Tab が札の中に留まる）。
// Escape は捕まえる段階で受けて、帳（MandalaView）の Escape より先に札を閉じる（帳は defaultPrevented の Escape を受けない）。
// three.js は読み込まない。

import type { MemoStore } from '../core/story/memo'
import { mashiroSvg } from '../utsutsu/mashiro'

const STYLE = /* css */ `
/* 便りの画面の札（覚え書き・今日の絵解き）の重ね。色と書体は札の中で決める（どのページでも、夜・夕の板の色でも同じ和紙と墨） */
.ts-layer { --ts-paper: #faf7f0; --ts-ink: #2a2622; --ts-soft: rgba(42, 38, 34, 0.7); --ts-line: rgba(42, 38, 34, 0.22); --ts-ai: #2f4a7a; --ts-akane: #a8473a;
  --ts-ui: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif;
  --ts-title: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  position: absolute; inset: 0; z-index: 47; display: flex; align-items: center; justify-content: center; overflow-y: auto; overscroll-behavior: contain;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px)); background: rgba(24, 22, 30, 0.55);
  pointer-events: auto; color: var(--ts-ink); font-family: var(--ts-ui); text-align: left; -webkit-font-smoothing: antialiased; }
.ts-layer[hidden] { display: none; }
.ts-layer * { box-sizing: border-box; }
.ts-card { position: relative; width: min(520px, 100%); max-height: 100%; margin: auto; overflow-y: auto; padding: 18px 18px 14px; background: var(--ts-paper);
  border: 1px solid var(--ts-line); border-radius: 16px; box-shadow: 0 14px 40px rgba(20, 16, 24, 0.3); }
.ts-card :focus-visible { outline: 2px solid var(--ts-ai); outline-offset: 2px; }
.ts-h { margin: 0; font-family: var(--ts-title); font-weight: 600; font-size: 19px; letter-spacing: 0.12em; line-height: 1.5; }
.ts-h:focus, .ts-h:focus-visible { outline: none; }
.ts-sub { margin: 2px 0 0; font-size: 12.5px; color: var(--ts-soft); }
/* ましろの言葉（会話の枠と同じ「台本・創作」の印） */
.ts-say { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; }
.ts-say svg.mashiro { flex: none; width: 64px; height: 48px; }
.ts-bubble { flex: 1; min-width: 0; margin: 0; padding: 8px 12px 9px; background: #fffdf8; border: 1px solid var(--ts-line); border-radius: 14px; }
.ts-who { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; letter-spacing: 0.1em; color: var(--ts-soft); }
.ts-tag { margin-left: auto; font-size: 10.5px; letter-spacing: 0.04em; border: 1px solid var(--ts-line); border-radius: 999px; padding: 0 7px; white-space: nowrap; }
.ts-line { margin: 2px 0 0; font-family: var(--ts-title); font-size: 16px; line-height: 1.75; text-wrap: pretty; word-break: auto-phrase; }
.ts-label { display: block; margin: 16px 0 6px; font-size: 14px; font-weight: 600; letter-spacing: 0.08em; }
.ts-soft { margin: 6px 0 0; font-size: 13px; line-height: 1.7; color: var(--ts-soft); text-wrap: pretty; word-break: auto-phrase; }
/* 断りの文（色だけにしない: 文そのものが断りの言葉。左に茜の線を添える） */
.ts-err { margin: 8px 0 0; padding: 6px 10px; font-size: 14px; line-height: 1.6; background: #fff; border: 1px solid var(--ts-line); border-left: 4px solid var(--ts-akane); border-radius: 8px; }
.ts-err:empty { display: none; }
.ts-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.ts-btn { min-width: 44px; min-height: 44px; padding: 0 18px; font: inherit; font-size: 15px; letter-spacing: 0.06em; color: var(--ts-ink); background: #fff;
  border: 1px solid rgba(42, 38, 34, 0.36); border-radius: 12px; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.ts-btn:hover { background: #f5f1e7; }
.ts-btn.main { color: #faf7f0; background: var(--ts-ai); border-color: var(--ts-ai); font-family: var(--ts-title); letter-spacing: 0.1em; }
.ts-btn.main:hover { background: #263e68; }
.ts-btn[aria-disabled="true"] { opacity: 0.5; cursor: default; }
.ts-x { position: absolute; top: 8px; right: 8px; min-width: 44px; min-height: 44px; padding: 0 10px; font: inherit; font-size: 13px; color: var(--ts-soft); background: none; border: 0; border-radius: 10px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
/* 覚え書きの欄 */
.ms-in { display: block; width: 100%; min-height: 48px; padding: 8px 12px; font: inherit; font-size: 18px; letter-spacing: 0.06em; color: var(--ts-ink); background: #fff;
  border: 1px solid rgba(42, 38, 34, 0.4); border-radius: 10px; }
.ms-in[aria-invalid="true"] { border-width: 2px; border-color: var(--ts-akane); }
.ms-in::placeholder { color: rgba(42, 38, 34, 0.5); }
/* 読み上げだけの言葉 */
.ts-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (min-width: 640px) { .ts-card { padding: 22px 26px 16px; } }
`

let styled = false
function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = STYLE
  document.head.appendChild(s)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 開いている重ね（上にあるものほど後ろ）。Escape は、いちばん上の重ねだけが受ける */
const stack: Layer[] = []

export interface Layer {
  /** 重ね（地） */
  readonly el: HTMLDivElement
  /** 札（中身を入れ替える所） */
  readonly card: HTMLDivElement
  /** 閉じる（開いたときのキーボードの位置へ戻す。何度呼んでもよい） */
  close(): void
  /** 一時だけ隠す（札の途中で会話を出す間。隠している間は inert） */
  hide(on: boolean): void
  readonly closed: boolean
}

/**
 * 便りの画面の札の重ねを開く。root はページの層の親（夢の旅・白描の絵地図・現の旅は板の root、入口は全面の舞台）。
 * 開いている間、root のほかの層を inert にする（出典表示 .yh-credit は残す。自分が inert にした層だけを戻す）。
 * onEscape: Escape を押したとき（省くと閉じる）
 */
export function openLayer(root: HTMLElement, o: { label: string; onEscape?(): void; onClosed?(): void }): Layer {
  injectStyle()
  const back = document.activeElement as HTMLElement | null
  const el = document.createElement('div')
  el.className = 'ts-layer'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', o.label)
  const card = document.createElement('div')
  card.className = 'ts-card'
  el.appendChild(card)
  const changed: HTMLElement[] = []
  for (const c of Array.from(root.children) as HTMLElement[]) {
    if (c.inert || c.classList.contains('yh-credit')) continue
    c.inert = true
    changed.push(c)
  }
  root.appendChild(el)
  let closed = false
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || el.hidden || stack[stack.length - 1] !== layer) return
    e.preventDefault()
    e.stopPropagation()
    if (o.onEscape) o.onEscape()
    else layer.close()
  }
  window.addEventListener('keydown', onKey, true)
  const layer: Layer = {
    el,
    card,
    get closed() {
      return closed
    },
    close() {
      if (closed) return
      closed = true
      window.removeEventListener('keydown', onKey, true)
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
      for (const c of changed) c.inert = false
      el.remove()
      if (back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true })
      o.onClosed?.()
    },
    hide(on) {
      el.hidden = on
      el.inert = on
    },
  }
  stack.push(layer)
  return layer
}

/** 札の見出しへキーボードの位置を移す（見出しが無ければ最初のボタン） */
export function focusCard(card: HTMLElement): void {
  const h = card.querySelector<HTMLElement>('h2, h3')
  if (h) {
    if (!h.hasAttribute('tabindex')) h.tabIndex = -1
    h.focus({ preventScroll: true })
    return
  }
  card.querySelector<HTMLElement>('button:not([aria-disabled="true"]), input')?.focus({ preventScroll: true })
}

/** ましろの言葉の枠（「台本・創作」の印つき。言葉は textContent で入れる。live なら読み上げる） */
export function sayHtml(live = false): string {
  return `<div class="ts-say">${mashiroSvg(false)}<div class="ts-bubble"><span class="ts-who">ましろ<span class="ts-tag" title="本作の創作の台詞">台本・創作</span></span><p class="ts-line"${live ? ' aria-live="polite"' : ''}></p></div></div>`
}

const ASK = 'なんて呼んだらいい？　書いておくと、ぼくが便りで、その名前で呼ぶよ。'
const HELP = '8文字まで。ひらがな・カタカナ・漢字・ローマ字で。本名でなくてかまいません。この端末と、引き継ぎコードの中にだけ残ります。'

/**
 * 覚え書きの札（呼び名を書く・書きなおす）。onDone: 閉じたあと（書いても書かなくても）。
 * 閉じる手（close）を返す（帳を閉じたときなど、外から閉じる）
 */
export function openMemoSheet(o: { root: HTMLElement; memo: MemoStore; onDone?(): void }): { close(): void } {
  const layer = openLayer(o.root, { label: 'ましろの覚え書き', onClosed: () => o.onDone?.() })
  const { card } = layer
  card.innerHTML = `
    <h2 class="ts-h">ましろの覚え書き</h2>
    ${sayHtml(true)}
    <form class="ms-form" novalidate>
      <label class="ts-label" for="ms-in">呼び名</label>
      <input id="ms-in" class="ms-in" type="text" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="例: さくら" aria-describedby="ms-help ms-err" />
      <p class="ts-soft" id="ms-help">${escapeHtml(HELP)}</p>
      <p class="ts-err" id="ms-err" aria-live="polite"></p>
      <div class="ts-row">
        <button class="ts-btn main" type="submit">これにする</button>
        <button class="ts-btn" type="button" data-act="skip">書かない</button>
      </div>
    </form>`
  const line = card.querySelector('.ts-line') as HTMLElement
  line.textContent = ASK
  const form = card.querySelector('form') as HTMLFormElement
  const input = card.querySelector('#ms-in') as HTMLInputElement
  const err = card.querySelector('#ms-err') as HTMLElement
  // 書きなおすときは、いまの呼び名から（遊ぶ人が書いた字。value に入れるだけ）
  input.value = o.memo.yobina ?? ''
  card.querySelector('[data-act="skip"]')?.addEventListener('click', () => layer.close())
  input.addEventListener('input', () => {
    if (!err.textContent) return
    err.textContent = ''
    input.removeAttribute('aria-invalid')
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const r = o.memo.setYobina(input.value)
    if (!r.ok) {
      err.textContent = r.error
      input.setAttribute('aria-invalid', 'true')
      input.focus({ preventScroll: true })
      return
    }
    // 書けた: ましろの言葉を入れ替え、欄を下げて［とじる］だけにする
    line.textContent = `${r.value}、だね。おぼえた。`
    form.remove()
    const row = document.createElement('div')
    row.className = 'ts-row'
    row.innerHTML = '<button class="ts-btn main" type="button" data-act="close">とじる</button>'
    card.appendChild(row)
    const close = row.querySelector('button') as HTMLButtonElement
    close.addEventListener('click', () => layer.close())
    close.focus({ preventScroll: true })
  })
  focusCard(card)
  return { close: () => layer.close() }
}
