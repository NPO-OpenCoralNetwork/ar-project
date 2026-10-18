// 三つの約束の札（04 §2.1、02 F-60。文は core/promises.ts）。入口・夢の旅（箱庭）・現の旅・白描の絵地図で、この1つを使う。
//
// - 初回だけ、旅に入る前に1画面ずつ見せる。どのページから始めても見せる（家で始めた人にも）。
// - 飛ばせない: 1つずつ「わかった」を押す。出したばかりの画面の「わかった」は少しの間（READY_MS）受けない
//   （続けて2回押して、次の約束を読まずに進まないように）。
// - 読み終えたら PROMISE_KEY を保存する（どのページで読んでも、ほかのページでもう一度は聞かない）。
// - 画面が変わるたびに、見出しへキーボードの位置を移す（読み上げは「三つの約束 1 / 3」から。Tab で「わかった」）。
// - 「もどる」（旅をえらびなおす・入口へ）は、読んだことにしない。
// ましろの台詞は【創作】なので「台本・創作」の印をつける（会話の枠の印と同じ形）。three.js は読み込まない。

import './promise-sheet.css'
import { PROMISES } from '../core/promises'
import { PROMISE_KEY } from '../core/storage-keys'
import { mashiroSvg } from '../utsutsu/mashiro'
import { focusSheet } from './focus'

/** 出したばかりの画面の「わかった」を受けない間（ms） */
const READY_MS = 400

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 句読点のあとで折り返す（「しま／せん」のように語の途中で行が分かれないように。長い句は、その中で折り返す）。CSS は .ph */
export function phrases(s: string): string {
  return (s.match(/[^、。]+[、。]*/g) ?? [s]).map((p) => `<span class="ph">${escapeHtml(p)}</span>`).join('')
}

/** 三つの約束を、この端末で読み終えているか */
export function promisesRead(): boolean {
  try {
    return localStorage.getItem(PROMISE_KEY) === '1'
  } catch {
    return false
  }
}

function markRead(): void {
  try {
    localStorage.setItem(PROMISE_KEY, '1')
  } catch {
    // 保存できなくても進める（次に開いたときは、また約束を見せる）
  }
}

export interface PromiseFlow {
  /** 札を置く所（1画面ごとに中身を入れ替える）。全面の札の地（入口のページ・現の旅の札・夢の旅の覆い）はページが用意する */
  host: HTMLElement
  /** これから入る旅の名前（見出しの上に「〜の前に」と出す） */
  journey: string
  /** 家で遊ぶ旅（夢の旅・白描の絵地図）。下の小さな字に「家で遊ぶ人にも」を足す */
  home?: boolean
  /** もどる（読んだことにしない）。href ならリンク、go なら押したときに呼ぶ */
  back?: { label: string; href?: string; go?: () => void }
  /** 読み終えた（PROMISE_KEY を保存したあと）。もう読んでいれば、すぐに呼ぶ */
  done(): void
}

/** 三つの約束を見せてから done へ。読んでいれば、すぐ done */
export function withPromises(flow: PromiseFlow): void {
  if (promisesRead()) {
    flow.done()
    return
  }
  showPromise(flow, 0)
}

function showPromise(flow: PromiseFlow, i: number): void {
  const p = PROMISES[i]
  const note = `はじめての時だけ、1つずつ読んでから旅に入ります。${flow.home ? '家で遊ぶ人にも、いつか現地へ行く日のために。' : ''}`
  const back = flow.back
    ? flow.back.href
      ? `<a class="pr-back" href="${escapeHtml(flow.back.href)}">${escapeHtml(flow.back.label)}</a>`
      : `<button class="pr-back" type="button" data-act="back">${escapeHtml(flow.back.label)}</button>`
    : ''
  const card = document.createElement('section')
  card.className = 'pr-card'
  card.setAttribute('aria-labelledby', 'pr-h')
  card.innerHTML = `
    <p class="pr-count">${escapeHtml(flow.journey)}の前に</p>
    <h1 id="pr-h" tabindex="-1">三つの約束<span class="n">${i + 1} / ${PROMISES.length}</span></h1>
    <div class="pr-steps" aria-hidden="true">${PROMISES.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
    ${mashiroSvg(false)}
    <p class="pr-speaker"><span class="pr-who">ましろ<span class="pr-tag" title="本作の創作の台詞（伝承の事実は「伝承の札」で示します）">台本・創作</span></span>${phrases(p.mashiro)}</p>
    <p class="pr-plain">${phrases(p.plain)}</p>
    <button class="pr-big" type="button" data-act="ok">わかった</button>
    <p class="pr-note">${phrases(note)}</p>
    ${back}`
  flow.host.replaceChildren(card)
  // 長い札で下まで読んでいても、次の約束は頭から
  flow.host.scrollTop = 0
  window.scrollTo(0, 0)
  const readyAt = performance.now() + READY_MS
  let used = false
  focusSheet(card)
  card.querySelector('[data-act="ok"]')!.addEventListener('click', () => {
    if (used || performance.now() < readyAt) return
    used = true
    if (i + 1 < PROMISES.length) {
      showPromise(flow, i + 1)
      return
    }
    markRead()
    flow.done()
  })
  card.querySelector('[data-act="back"]')?.addEventListener('click', () => flow.back?.go?.())
}
