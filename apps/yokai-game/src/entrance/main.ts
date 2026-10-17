// 入口（04 §2.1 序の口、docs/product/01-app-ux.md A1・B2 の軽い版）。夢の旅と現の旅のどちらにも、ここから入る。
//
// - 二つの旅を選ぶ: 夢の旅（yume.html。家で箱庭を歩く。位置もカメラも使わない）と、現の旅（utsutsu.html。現地を歩く。位置を使う）。
// - 三つの約束（F-60。文は core/promises.ts）: 初回だけ、どちらを選んでも旅に入る前に1画面ずつ見せる。飛ばせない。
//   読み終えたら PROMISE_KEY を保存する（現の旅も同じ保存を見るので、もう一度は聞かない）。
// - つづき: 進み具合（STORY_KEY。二つの旅で共通）に会った妖怪や開いた札があれば、数を小さく添える。
// - チームのテスト用: 白描の絵地図（ezu.html）と、この端末にテスト用の土地があるか（日付だけ。位置は出さない）。
//   ?debug のときだけ GPS の検証へも。
// - three.js も箱庭の板（yume/hud.ts）も読み込まない（最初の読み込みを軽くする。ページはふつうにスクロール・拡大できる）。
// URL: ?debug と ?sim は、旅のページへそのまま渡す。

import './style.css'
import { PROMISES } from '../core/promises'
import { PROMISE_KEY, STORY_KEY } from '../core/storage-keys'
import { browserStorage, ProgressStore } from '../core/story/progress'
import { mashiroSvg } from '../utsutsu/mashiro'
import { loadTestLand, testLandIsOld } from '../utsutsu/test-land'
import { stampDate } from '../yume/encounter/stamp'

const params = new URLSearchParams(window.location.search)
const DEBUG = params.has('debug')

/** 旅のページへ、URL の印（?debug・?sim）をそのまま渡す */
function pass(href: string, keys: string[] = ['debug', 'sim']): string {
  const q = keys.filter((k) => params.has(k)).map((k) => (params.get(k) ? `${k}=${encodeURIComponent(params.get(k)!)}` : k))
  return q.length ? `${href}?${q.join('&')}` : href
}

interface Journey {
  id: 'yume' | 'utsutsu'
  name: string
  lead: string
  note: string
  href: string
  /** 小さな印の絵（夢は白描と金の霞、現は色。01-app-ux §0-3） */
  art: string
}

const JOURNEYS: Journey[] = [
  {
    id: 'yume',
    name: '夢の旅',
    lead: '家で、箱庭を歩く',
    note: '位置もカメラも使いません',
    href: pass('./yume.html'),
    art: `<svg class="en-art" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="46" rx="30" ry="10" fill="#efd9a0" opacity="0.5"/>
      <path d="M8,40 L32,30 L56,40 L32,50 Z" fill="#fffdf7" stroke="#3a332d" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M8,40 L8,45 L32,55 L56,45 L56,40 M32,50 L32,55" fill="none" stroke="#3a332d" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M15,39 L27,19 L34,29 L40,24 L50,39 C40,42.5 25,42.5 15,39 Z" fill="#fffdf7" stroke="#3a332d" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M23.5,25 L27,19 L30.5,24 L28,23 L26,25.5 Z" fill="#f1ece0" stroke="#3a332d" stroke-width="0.9" stroke-linejoin="round"/>
      <rect x="4" y="12" width="30" height="5" rx="2.5" fill="#e3c27a" opacity="0.55"/>
      <rect x="30" y="20" width="30" height="4.5" rx="2.25" fill="#e3c27a" opacity="0.45"/>
    </svg>`,
  },
  {
    id: 'utsutsu',
    name: '現の旅',
    lead: '現地を、自分の足で歩く',
    note: '位置を使います。歩いた道は記録しません',
    href: pass('./utsutsu.html'),
    art: `<svg class="en-art" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="46" cy="18" r="6" fill="#e3a55a"/>
      <path d="M4,46 C14,30 22,26 30,32 C36,24 44,22 60,36 L60,54 L4,54 Z" fill="#8fae78"/>
      <path d="M4,50 C16,42 26,44 36,46 C46,48 54,44 60,42 L60,54 L4,54 Z" fill="#6f8f5c"/>
      <path d="M14,56 C20,50 28,48 34,44 C38,41 40,38 42,35" fill="none" stroke="#3a332d" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1 4"/>
    </svg>`,
  },
]

const app = document.getElementById('app')!
/** 約束の「わかった」を、出したばかりの間は受けない（続けて2回押して、読まずに進まないように） */
let readyAt = 0

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 句読点のあとで折り返す（「しま／せん」のように語の途中で行が分かれないように。長い句は、その中で折り返す） */
function phrases(s: string): string {
  return (s.match(/[^、。]+[、。]*/g) ?? [s]).map((p) => `<span class="ph">${escapeHtml(p)}</span>`).join('')
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    // 保存できなくても進める（次に開いたときは、また約束を見せる）
  }
}

/** 進み具合の数（会った妖怪・開いた札・旅印）。描画に依存しない ProgressStore で読むだけ（書かない） */
function progressCounts(): { met: number; cards: number; stamps: number } {
  const p = new ProgressStore(browserStorage(), STORY_KEY).get()
  return {
    met: Object.values(p.yokai).filter((y) => y.met).length,
    cards: Object.keys(p.cards).length,
    stamps: Object.keys(p.stamps).length,
  }
}

/** テスト用の土地の様子（作った日だけ。位置はこの端末の中にあっても出さない） */
function testLandStatus(): string {
  const t = loadTestLand()
  if (t) return `この端末にあります（${stampDate(t.createdAt)} に作成）`
  if (testLandIsOld()) return '前に作った土地は古い形です。現の旅で、現地で作り直せます'
  return 'まだありません。現の旅で、現地で作れます'
}

// ---------------------------------------------------------------- 入口

function showHome(): void {
  const c = progressCounts()
  const back = c.met + c.cards > 0
  app.innerHTML = `
    <main class="en">
      <header class="en-head">
        <h1 class="en-title">ゆめうつつ<span class="kari">（仮）</span></h1>
        <p class="en-sub">${phrases('立山のふもとの、妖怪と伝承の旅（試作）')}</p>
      </header>
      <div class="en-mashiro">
        ${mashiroSvg(false)}
        <p class="en-say"><span class="who">ましろ<span class="tag">台本・創作</span></span>${phrases(back ? 'おかえり。きょうは、どちらの旅にする？' : 'どちらの旅にする？')}</p>
      </div>
      <nav class="en-choices" aria-label="旅をえらぶ">
        ${JOURNEYS.map(
          (j) => `<a class="en-choice ${j.id}" href="${j.href}" data-journey="${j.id}">
            ${j.art}
            <span class="txt"><span class="name">${j.name}</span><span class="lead">${phrases(j.lead)}</span><span class="note">${phrases(j.note)}</span></span>
          </a>`,
        ).join('')}
      </nav>
      ${
        back
          ? `<p class="en-cont"><b>つづき</b>会った妖怪 ${c.met}・開いた札 ${c.cards}${c.stamps ? `・旅印 ${c.stamps}` : ''}<small>この端末の中の記録です。二つの旅で共通です。</small></p>`
          : ''
      }
      <section class="en-test" aria-labelledby="en-test-h">
        <h2 id="en-test-h">チームのテスト用</h2>
        <a class="en-link" href="${pass('./ezu.html', ['debug'])}">白描の絵地図<small>テスト用の土地を、家で</small></a>
        <p class="en-status"><span class="k">テスト用の土地</span>${phrases(testLandStatus())}</p>
        ${DEBUG ? `<a class="en-link" href="./gps-test.html">GPS の検証<small>開発用</small></a>` : ''}
      </section>
      <footer class="en-foot"><p>試作です。伝承の札は監修前の下書きです。</p></footer>
    </main>`
  app.querySelectorAll<HTMLAnchorElement>('[data-journey]').forEach((a) => {
    // 約束を読んでいれば、そのまま旅へ。まだなら、新しいタブで開こうとしたとき（Ctrl・⌘・中ボタン）も先に約束を見せる
    const guard = (e: MouseEvent) => {
      if (safeGet(PROMISE_KEY) === '1') return
      e.preventDefault()
      const j = JOURNEYS.find((x) => x.id === a.dataset.journey)!
      showPromise(j, 0)
    }
    a.addEventListener('click', guard)
    // 中ボタンでは click が来ない（auxclick で新しいタブが開く）
    a.addEventListener('auxclick', (e) => {
      if (e.button === 1) guard(e)
    })
  })
}

// ---------------------------------------------------------------- 三つの約束（初回だけ・飛ばせない）

function showPromise(j: Journey, i: number): void {
  const p = PROMISES[i]
  app.innerHTML = `
    <main class="en en-promise">
      <section class="en-card" aria-labelledby="en-p-h">
        <p class="en-count">${j.name}の前に</p>
        <h1 id="en-p-h" tabindex="-1">三つの約束<span class="n">${i + 1} / ${PROMISES.length}</span></h1>
        <div class="en-steps" aria-hidden="true">${PROMISES.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
        ${mashiroSvg(false)}
        <p class="en-speaker"><span class="who">ましろ<span class="tag">台本・創作</span></span>${phrases(p.mashiro)}</p>
        <p class="en-plain">${phrases(p.plain)}</p>
        <button class="en-big" type="button" data-act="ok">わかった</button>
        <p class="en-note">${phrases(`はじめての時だけ、1つずつ読んでから旅に入ります。${j.id === 'yume' ? '家で遊ぶ人にも、いつか現地へ行く日のために。' : ''}`)}</p>
        <button class="en-back" type="button" data-act="back">旅をえらびなおす</button>
      </section>
    </main>`
  window.scrollTo(0, 0)
  readyAt = performance.now() + 400
  ;(app.querySelector('#en-p-h') as HTMLElement).focus({ preventScroll: true })
  app.querySelector('[data-act="ok"]')!.addEventListener('click', () => {
    if (performance.now() < readyAt) return
    if (i + 1 < PROMISES.length) {
      showPromise(j, i + 1)
      return
    }
    safeSet(PROMISE_KEY, '1')
    window.location.assign(j.href)
  })
  app.querySelector('[data-act="back"]')!.addEventListener('click', () => {
    showHome()
    ;(app.querySelector(`[data-journey="${j.id}"]`) as HTMLElement | null)?.focus()
  })
}

showHome()
// 旅のページから「戻る」で帰ってきたとき（ページがそのまま残っていた場合）は、入口を描き直す（約束の途中の画面や古い数を見せない）
window.addEventListener('pageshow', (e) => {
  if (e.persisted) showHome()
})
