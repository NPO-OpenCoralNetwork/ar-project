// 入口（04 §2.1 序の口、docs/product/01-app-ux.md A1・B2 の軽い版）。夢の旅と現の旅のどちらにも、ここから入る。
//
// - 二つの旅を選ぶ: 夢の旅（yume.html。家で箱庭を歩く。位置もカメラも使わない）と、現の旅（utsutsu.html。現地を歩く。位置を使う）。
// - 三つの約束（F-60。文は core/promises.ts、札は ui/promise-sheet.ts）: 初回だけ、どちらを選んでも旅に入る前に1画面ずつ見せる。飛ばせない。
//   読み終えたら PROMISE_KEY を保存する（旅のページも同じ保存を見るので、もう一度は聞かない。旅のページから始めた人には、そのページで見せる）。
// - つづき: 進み具合（STORY_KEY。二つの旅で共通）に会った妖怪や開いた札があれば、数を小さく添える。
// - 引き継ぎ（試作。02 F-51）: 旅の下に小さな入り口だけを置き、#hikitsugi で札（ui/transfer-sheet.ts）を開く。
//   入口の地のまま中身を入れ替える（覆いにしない）。ブラウザの「戻る」でも入口へ戻れる。テスト用の土地の場所は運ばない。
// - 端末の保存を長く残すよう、一度だけ静かに頼む（ui/persist.ts。進み具合があるときだけ）。開いただけでは頼まない（Firefox は
//   許可を尋ねる画面を出すので、押したあとに）。旅のボタンは押すとすぐ旅のページへ移り、尋ねる画面が消えるので、ここで頼むのは
//   約束の札を出したとき（ページはそのまま）と、引き継ぎの札で読み込めたときだけ。ふだんは旅のページで、遊びはじめてから頼む。
// - チームのテスト用: 白描の絵地図（ezu.html）と、この端末にテスト用の土地があるか（日付だけ。位置は出さない）。
//   ?debug のときだけ GPS の検証へも。
// - three.js も箱庭の板（yume/hud.ts）も読み込まない（最初の読み込みを軽くする。ページはふつうにスクロール・拡大できる）。
// - 便り（段階4b。04 §3.8）: 旅と引き継ぎのあいだに「便り」の入り口。#tayori で便りの画面（ui/tayori.ts。立山のふもとの保存）を、
//   引き継ぎと同じく入口の地のまま開く（夜、箱庭も位置も使わずに夜話を聞ける所）。便りの画面と物語のデータは、はじめの絵が出たあとに
//   import() で読む（入口を軽く保つ）。そのとき立山のふもとの便りを届け（deliverDue）、「新」の字と、ましろのあいさつを決める
//   （逢魔が時 → 夜話が来ている → 夜 → 読んでいない便り → ふだん）。1分ごとに見直す。「新」は字だけ（数は出さない）。
// - 立山の時刻（core/story/clock.ts）と、テスト用の時計（?debug&clock=。core/debug-clock.ts）。時計は旅のページへも渡し、
//   ?debug のときは左下に「時計: …（テスト）」を出す。
// URL: ?debug と ?sim は、旅のページへそのまま渡す。テストの時計は、いまの差を相対の clock= で渡す（URL の clock をそのまま渡すと、
//   便りで合わせ直した時刻や、入口で過ぎた時間が、次のページで巻き戻る）。#hikitsugi は引き継ぎの札、#tayori は便りの画面。

import './style.css'
import { appClock, appNow, clockParam, clockTag } from '../core/debug-clock'
import { STORY_KEY } from '../core/storage-keys'
import { storyClock } from '../core/story/clock'
import type { MemoStore } from '../core/story/memo'
import { browserStorage, type KeyValueStore, ProgressStore } from '../core/story/progress'
import type { StoryPack } from '../data/story-pack'
import { phrases, promisesRead, withPromises } from '../ui/promise-sheet'
import { persistOnce } from '../ui/persist'
import { showTransfer } from '../ui/transfer-sheet'
import { mashiroSvg } from '../utsutsu/mashiro'
import { loadTestLand, testLandIsOld } from '../utsutsu/test-land'
import type { TayoriPanel } from '../ui/tayori'
import { Sound } from '../yume/encounter/sound'
import { stampDate } from '../yume/encounter/stamp'

const params = new URLSearchParams(window.location.search)
const DEBUG = params.has('debug')
/** 引き継ぎの札の印（URL の #） */
const HIKITSUGI = '#hikitsugi'
/** 便りの画面の印（URL の #） */
const TAYORI = '#tayori'

/** 旅のページへ、URL の印（?debug・?sim）をそのまま渡す。テストの時計は、いまの差を相対で（clock=+…m。描くとき・移るときに） */
function pass(href: string, keys: string[] = ['debug', 'sim']): string {
  const q = keys.filter((k) => params.has(k)).map((k) => (params.get(k) ? `${k}=${encodeURIComponent(params.get(k)!)}` : k))
  const clock = DEBUG ? clockParam(appClock().offsetMs) : null
  if (clock) q.push(`clock=${encodeURIComponent(clock)}`)
  return q.length ? `${href}?${q.join('&')}` : href
}

interface Journey {
  id: 'yume' | 'utsutsu'
  name: string
  lead: string
  note: string
  /** 旅のページ（URL の印は、描くとき・移るときに pass() で付ける） */
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
    href: './yume.html',
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
    href: './utsutsu.html',
    art: `<svg class="en-art" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="46" cy="18" r="6" fill="#e3a55a"/>
      <path d="M4,46 C14,30 22,26 30,32 C36,24 44,22 60,36 L60,54 L4,54 Z" fill="#8fae78"/>
      <path d="M4,50 C16,42 26,44 36,46 C46,48 54,44 60,42 L60,54 L4,54 Z" fill="#6f8f5c"/>
      <path d="M14,56 C20,50 28,48 34,44 C38,41 40,38 42,35" fill="none" stroke="#3a332d" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1 4"/>
    </svg>`,
  },
]

const app = document.getElementById('app')!

/** 進み具合の数（会った妖怪・開いた札・旅印）。描画に依存しない ProgressStore で読むだけ（書かない。便りを届けるのは下の tayoriKit） */
function progressCounts(): { met: number; cards: number; stamps: number } {
  const p = new ProgressStore(browserStorage(), STORY_KEY, () => new Date(appNow())).get()
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

/** ましろのあいさつ（【創作】）。逢魔が時 → 夜話が来ている → 夜 → 読んでいない便り → ふだん。st は便りの様子（読み込む前は無し） */
function greeting(back: boolean, st?: { waiting: boolean; unread: boolean }): string {
  const phase = storyClock(appNow()).phase
  if (phase === 'oumagatoki') return '逢魔が時。……帳のすみが、暗い。'
  if (st?.waiting) return 'こんばんは。夜話に、だれか来ているよ。'
  if (phase === 'night') return 'こんばんは。夜は、外を歩かずに遊ぼうね。'
  if (st?.unread) return '便りが、届いているよ。'
  return back ? 'おかえり。きょうは、どちらの旅にする？' : 'どちらの旅にする？'
}

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
        <p class="en-say"><span class="who">ましろ<span class="tag">台本・創作</span></span><span class="en-say-t" data-back="${back ? '1' : ''}">${phrases(greeting(back))}</span></p>
      </div>
      <nav class="en-choices" aria-label="旅をえらぶ">
        ${JOURNEYS.map(
          (j) => `<a class="en-choice ${j.id}" href="${pass(j.href)}" data-journey="${j.id}">
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
      <a class="en-link en-tayori" href="${TAYORI}" data-tayori><span class="en-tayori-t">便り<span class="en-new" aria-hidden="true" hidden>新</span><span class="en-vh"></span></span><small>${phrases('ましろの便りと、夜話')}</small></a>
      <a class="en-link en-hiki" href="${HIKITSUGI}" data-hikitsugi>引き継ぎ（試作）<small>${phrases('別の端末で、続きを遊ぶ')}</small></a>
      <section class="en-test" aria-labelledby="en-test-h">
        <h2 id="en-test-h">チームのテスト用</h2>
        <a class="en-link" href="${pass('./ezu.html', ['debug'])}">白描の絵地図<small>テスト用の土地を、家で</small></a>
        <p class="en-status"><span class="k">テスト用の土地</span>${phrases(testLandStatus())}</p>
        ${DEBUG ? `<a class="en-link" href="./gps-test.html">GPS の検証<small>開発用</small></a>` : ''}
      </section>
      <footer class="en-foot"><p>試作です。伝承の札は監修前の下書きです。</p></footer>
    </main>`
  app.querySelectorAll<HTMLAnchorElement>('[data-journey]').forEach((a) => {
    // 約束を読んでいれば、そのまま旅へ。まだなら、新しいタブで開こうとしたとき（Ctrl・⌘・中ボタン）も先に約束を見せる。
    // 保存を長く残す頼み（persistOnce）は、約束の札を出してページに残るときだけ（旅へ移るときに頼むと、届かないまま印だけ残る）
    const guard = (e: MouseEvent) => {
      if (promisesRead()) return
      e.preventDefault()
      persistOnce()
      const j = JOURNEYS.find((x) => x.id === a.dataset.journey)!
      showPromises(j)
    }
    a.addEventListener('click', guard)
    // 中ボタンでは click が来ない（auxclick で新しいタブが開く）
    a.addEventListener('auxclick', (e) => {
      if (e.button === 1) guard(e)
    })
  })
  // 便りの様子（あいさつ・「新」）は、はじめの絵が出たあとで
  void refreshHome()
}

// ---------------------------------------------------------------- 三つの約束（初回だけ・飛ばせない。札は ui/promise-sheet.ts）

function showPromises(j: Journey): void {
  app.innerHTML = '<main class="en en-promise"></main>'
  withPromises({
    host: app.querySelector('main') as HTMLElement,
    journey: j.name,
    home: j.id === 'yume',
    back: {
      label: '旅をえらびなおす',
      go: () => {
        showHome()
        ;(app.querySelector(`[data-journey="${j.id}"]`) as HTMLElement | null)?.focus()
      },
    },
    done: () => window.location.assign(pass(j.href)),
  })
}

// ---------------------------------------------------------------- 便り（段階4b。画面は ui/tayori.ts）

/**
 * 便りの画面の道具（はじめて要るときに import() で読む。入口を軽く保つ）。立山のふもとの保存と覚え書きは、このページに1つずつ
 * （開き直すたびに作ると、古い写しが保存を書き戻してしまう）。ほかのタブで進めた・読み込んだ分は follow で入れ替える。
 * このタブの引き継ぎで読み込んだ分と、「戻る」でページがそのまま戻ったとき（その間の storage イベントは来ない）は、reread で入れ替える
 */
interface TayoriKit {
  mod: typeof import('../ui/tayori')
  story: StoryPack
  progress: ProgressStore
  memo: MemoStore
  panel: TayoriPanel | null
  /** 保存を読み直す（ほかのタブで書かれたときと同じく、合わせずに入れ替える） */
  reread(): void
}
let kitLoading: Promise<TayoriKit> | null = null
function tayoriKit(): Promise<TayoriKit> {
  kitLoading ??= (async () => {
    const [mod, pack, memoMod] = await Promise.all([import('../ui/tayori'), import('../data/story-pack'), import('../core/story/memo')])
    const base = browserStorage()
    // follow が聞く鍵と知らせ先を覚えておき、reread で、いまの保存の値をそのまま渡す
    const followers = new Set<{ key: string; fn: (value: string | null) => void }>()
    const storage: KeyValueStore | null = base && {
      ...base,
      subscribe: (key, fn) => {
        const f = { key, fn }
        followers.add(f)
        const stop = base.subscribe?.(key, fn)
        return () => {
          followers.delete(f)
          stop?.()
        }
      },
    }
    const progress = new ProgressStore(storage, STORY_KEY, () => new Date(appNow()))
    progress.follow()
    const memo = new memoMod.MemoStore(storage, () => new Date(appNow()))
    memo.follow()
    const reread = () => {
      for (const f of followers) f.fn(base?.getItem(f.key) ?? null)
    }
    return { mod, story: pack.loadStoryPack(), progress, memo, panel: null, reread }
  })()
  return kitLoading
}

/** 便りの道具を作ってあれば、保存を読み直させる（引き継ぎで読み込んだあと・「戻る」でページが戻ったとき） */
function rereadKit(): void {
  void kitLoading?.then(
    (kit) => kit.reread(),
    () => {},
  )
}

/** 会話・札の重ね（入口の上に全面で。ページは送らない） */
let stage: HTMLDivElement | null = null
function stageEl(): HTMLDivElement {
  if (stage) return stage
  stage = document.createElement('div')
  stage.className = 'en-stage'
  document.body.appendChild(stage)
  return stage
}

/** 入口の、ましろのあいさつと「便り」の「新」を、便りの様子で見直す（届けてから） */
async function refreshHome(): Promise<void> {
  let kit: TayoriKit
  try {
    kit = await tayoriKit()
  } catch {
    // 読めなければ、ふだんのあいさつのまま
    return
  }
  const say = app.querySelector<HTMLElement>('.en-say-t')
  const link = app.querySelector<HTMLElement>('[data-tayori]')
  if (!say || !link) return
  const st = kit.mod.homeTayoriStatus({ story: kit.story, progress: kit.progress, memo: kit.memo, now: appNow })
  say.innerHTML = phrases(greeting(!!say.dataset.back, st))
  ;(link.querySelector('.en-new') as HTMLElement).hidden = !st.news
  ;(link.querySelector('.en-vh') as HTMLElement).textContent = st.news ? '（新しい便りがある）' : ''
}

function showTayori(): void {
  app.innerHTML = `
    <main class="en en-sheet en-ty" data-route="tayori">
      <button class="en-back en-back-top" type="button" data-act="back">入口へもどる</button>
      <h1 class="en-ty-h" tabindex="-1">便り</h1>
      <div class="en-ty-host" aria-busy="true"></div>
      <button class="en-back" type="button" data-act="back">入口へもどる</button>
    </main>`
  window.scrollTo(0, 0)
  app.querySelectorAll<HTMLButtonElement>('[data-act="back"]').forEach((b) => b.addEventListener('click', () => leaveSheet()))
  ;(app.querySelector('.en-ty-h') as HTMLElement).focus({ preventScroll: true })
  void tayoriKit().then((kit) => {
    const host = app.querySelector<HTMLElement>('.en-ty-host')
    if (!host) return
    kit.panel ??= kit.mod.createTayoriPanel({
      root: stageEl(),
      story: kit.story,
      progress: kit.progress,
      memo: kit.memo,
      sound: new Sound(true, false),
      mode: 'home',
      travel: 'yume',
      now: appNow,
      // 入口には帳のボタンが無い（ピースは、夢の旅の帳で見る）
      choHint: '夢の旅の「帳」で見られる。',
      onBusy: (busy) => {
        // 会話・札の間は、入口の地を止める（Tab で入らない・送らない）
        app.inert = busy
        document.documentElement.classList.toggle('en-lock', busy)
      },
    })
    kit.panel.el.classList.add('page')
    host.replaceChildren(kit.panel.el)
    host.removeAttribute('aria-busy')
    kit.panel.render()
  })
}

/** 便りの画面から出る（会話・札は閉じる） */
function closeTayori(): void {
  void kitLoading?.then((kit) => {
    kit.panel?.stop()
    kit.panel?.el.remove()
  })
}

// ---------------------------------------------------------------- 引き継ぎ（試作。札は ui/transfer-sheet.ts）

/** 入口から #hikitsugi・#tayori へ来たか（それなら「入口へもどる」は、ブラウザの「戻る」と同じにする） */
let fromHome = false

function showHikitsugi(): void {
  app.innerHTML = '<main class="en en-sheet" data-route="hikitsugi"></main>'
  window.scrollTo(0, 0)
  // 読み込んだら、便りの道具の保存の写しを読み直させる（このタブで書いたので storage イベントは来ない。古い写しで書き戻さない）
  showTransfer({ host: app.querySelector('main') as HTMLElement, back: { label: '入口へもどる', go: leaveSheet }, onImport: rereadKit })
}

function leaveSheet(): void {
  if (fromHome) {
    // hashchange（か popstate）で入口を描き直す
    window.history.back()
    return
  }
  const from = sheetRoute()
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  backHome(from)
}

/** いま開いている札（引き継ぎ・便り。無ければ null） */
const sheetRoute = (): string | null => app.querySelector<HTMLElement>('.en-sheet')?.dataset.route ?? null

/** 札から入口へ戻ったとき（キーボードの位置を、その札の入り口へ） */
function backHome(from: string | null): void {
  if (from === 'tayori') closeTayori()
  showHome()
  ;(app.querySelector(from === 'tayori' ? '[data-tayori]' : '[data-hikitsugi]') as HTMLElement | null)?.focus()
}

function route(): void {
  if (sheetRoute() === 'tayori' && window.location.hash !== TAYORI) closeTayori()
  if (window.location.hash === HIKITSUGI) showHikitsugi()
  else if (window.location.hash === TAYORI) showTayori()
  else showHome()
}

/**
 * # が変わったとき（いまの画面と同じなら何もしない）。hashchange と popstate の両方で呼ぶ: テスト用の時計を便りで合わせ直すと
 * URL の clock が書き換わり、「戻る」で # だけ戻っても hashchange が来ないため（core/debug-clock.ts）
 */
function onHash(): void {
  const from = sheetRoute()
  const hash = window.location.hash
  if (hash === HIKITSUGI || hash === TAYORI) {
    const want = hash === HIKITSUGI ? 'hikitsugi' : 'tayori'
    if (from === want) return
    fromHome = !from
    if (from === 'tayori') closeTayori()
    if (want === 'hikitsugi') showHikitsugi()
    else showTayori()
  } else if (from) {
    fromHome = false
    backHome(from)
  }
}
window.addEventListener('hashchange', onHash)
window.addEventListener('popstate', onHash)

// ---------------------------------------------------------------- 時計

/** ?debug のときだけ、左下に「時計: 1月16日 16:40（テスト）」（合わせていなければ出さない） */
function showClockTag(): void {
  if (!DEBUG) return
  const text = clockTag()
  let tag = document.querySelector<HTMLElement>('.en-clock')
  if (!text) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('p')
    tag.className = 'en-clock'
    document.body.appendChild(tag)
  }
  tag.textContent = text
}

/** 1分ごと・ページに戻ったとき・時計を合わせたとき: 入口なら、あいさつと「新」を、便りの画面なら便りを見直す */
function tick(): void {
  showClockTag()
  if (sheetRoute() === 'tayori') void kitLoading?.then((kit) => kit.panel?.tick())
  else if (!sheetRoute() && app.querySelector('.en-say-t')) {
    const say = app.querySelector<HTMLElement>('.en-say-t')!
    say.innerHTML = phrases(greeting(!!say.dataset.back))
    void refreshHome()
  }
}
window.setInterval(tick, 60_000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick()
})
appClock().onChange(tick)

route()
showClockTag()
// 旅のページから「戻る」で帰ってきたとき（ページがそのまま残っていた場合）は、入口を描き直す（約束の途中の画面や古い数を見せない）。
// 残っていた間に旅のページが書いた保存は storage イベントで届かないので、便りの道具に読み直させる（道具を使う所は、どれも
// kitLoading の then で待つので、読み直しが先に済む）。テスト用の時計も、旅のページで合わせ直した差を読み直してから、旅への道を描く
// （時計が変わると tick が便りの道具を使うので、道具の読み直しのあとで）
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return
  rereadKit()
  appClock().resync()
  route()
})
