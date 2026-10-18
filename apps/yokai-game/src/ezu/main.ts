// 白描の絵地図（家の側。段階3の地元のテスト用パック）。02 F-07「家の側は、地元パックでは白描の2D だけ」、04 §3.8 の提案、F-27。
//
// - テスト用の土地（utsutsu/test-land.ts。この端末の中だけにある）を、和紙に墨の線の 2D の絵地図で見せる。箱庭（three.js）は使わない。
// - 名所（地点）に指を置いて約2秒そのままにすると、耳が澄んで白描の夢の姿が浮かぶ（現地の「立ち止まる」の家版）。
//   指を離すか、指が動くと（約8px）やめて、地図はふだんどおり動く。指を置いている間だけ満ち、ひとりでには満ちない。
//   ほかのやり方: 名所をタップする（キーボードは Tab で名所を選ぶ）と「耳を澄ます」が出る。その長押しか、Space を押し続ける。
// - 進み具合は、現地のテスト用の土地と同じ保存（TEST_KEY）。旅は夢（yume）なので、ピースは白描まで・縁はなじみまで（core が止める）。
//   ここで会った妖怪とは、現地のテスト用の土地で「再会」になる。旅印は現地だけ（帳の巻末は枠だけ）。
//   帳（曼荼羅帳・縁帳。ui/cho.ts）は三つのページで同じもの。彩色済みのピースは、ここでも稽古で語り返すと金の縁取りになる。
// - 名所の役目は現の旅と同じ（04 §3.1・§3.4）:
//   決まった妖怪（夢の姿）、調べる地点（頼まれてから札を拾うまで。姿は無く、ましろだけが話す）、
//   寄り道の地点（水辺。出現の表を時間で引く。会ったことのある妖怪が雑談で現れる。悩みは始めない・縁も上げない）。
// - 時間は、箱庭と同じ立山の時刻（段階4b。ui/home-time.ts）: はじめての回（まだ耳を澄ましていない）だけ手で昼、2回目からは「いま」。
//   「時間」で いま → 昼 → 夕 → 夜 → いま と回し、手で選んだ時間帯はこのページの間だけ（prefs.time は書くが、もう読まない）。
//   いまのときは1分ごとに見直す（会話・帳・札の間は待つ）。立山の時刻が逢魔が時に入ったら、お知らせと風の音。
//   いまの夜に入ったら一度だけ、ましろの申し出（ui/offer.ts。［昼の夢にする］、夜話が来ていれば［帳の「便り」をひらく］）。
//   夜は気配だけ（04 §2.5「箱庭も夜は気配だけ」。決まりは core の canListenAtHome。箱庭と同じ）。
//   夕は、決まった妖怪と調べる地点には会える。寄り道の地点は表のとおり。くらがりは、見た目の夕ではなく、立山の逢魔が時に帳の「便り」へ来る。
// - 帳には「便り」のタブ（テスト用の土地の保存の便り・夜話・今日の絵解き）。右上の「今日はここまで」で今日の絵解き。
// - お休みの範囲（境内・墓地）は霧。名前は出さず、中では会わない。
// - 位置は使わない。土地はどこにも送らない（F-52）。出典表示（OSM）は常に出す（F-44）。
// - テスターには、はじめに「伝承の土地ではない」「監修前の試作」と伝える（04 §6.2）。はじめの札は、開くたびに出す。
// - 三つの約束（F-60）は、入口・現の旅で読んでいなければ、ここで見せる（札は ui/promise-sheet.ts。どのページでも同じもの）。

import './style.css'
import { appClock, appNow, clockTag } from '../core/debug-clock'
import type { LocalXZ } from '../core/geo'
import type { XZ } from '../core/map-layers'
import { TEST_KEY } from '../core/storage-keys'
import { canListenAtHome, clueActive, clueWords, HOME_NIGHT_KEHAI, resolveAppearance, type SpotRole, spotRole, timeSlotOfDiorama } from '../core/story/appearance'
import { type DayKey, storyClock } from '../core/story/clock'
import { ListenGauge } from '../core/story/listen'
import { MemoStore } from '../core/story/memo'
import { browserStorage, ProgressStore } from '../core/story/progress'
import { type Tonight, tonight, yobanashiNews } from '../core/story/yobanashi'
import type { DayPhase } from '../core/utsutsu/sun'
import { loadStoryPack } from '../data/story-pack'
import { createCho } from '../ui/cho'
import { focusSheet } from '../ui/focus'
import { createHomeTime } from '../ui/home-time'
import { showOffer } from '../ui/offer'
import { persistOnTap } from '../ui/persist'
import { withPromises } from '../ui/promise-sheet'
import { GenEncounter } from '../utsutsu/encounter'
import { type MapKehai, type MapPad, MapView } from '../utsutsu/map-view'
import { loadTestLand, type TestLand, testLandIsOld } from '../utsutsu/test-land'
import { Sound } from '../yume/encounter/sound'
import { stampDate } from '../yume/encounter/stamp'
import { escapeHtml, ListenButton } from '../yume/encounter/ui'

type Time = 'day' | 'dusk' | 'night'
const TIMES: Time[] = ['day', 'dusk', 'night']
const PHASE_OF: Record<Time, DayPhase> = { day: 'day', dusk: 'oumagatoki', night: 'night' }
/** 紙の色（ブラウザの帯の色を合わせる） */
const PAPER: Record<Time, string> = { day: '#f7f1e3', dusk: '#f2dfc8', night: '#2b3148' }

/** 名所。役目は yokai（決まった妖怪）・clue（調べる地点）・wander（寄り道。出現の表の行） */
interface EzuSpot {
  id: string
  x: number
  z: number
  role: SpotRole
  yokaiId?: string
  clueId?: string
  /** 場所の種類（寄り道の地点は、出現の表の行） */
  placeKind?: string
}

/** この端末に覚えること（時間と、はじめての一言を見せ終えたか）。土地や位置は入れない。time は段階4a のために書くが、もう読まない */
const PREF_KEY = 'yume.ezu.v1'
interface Prefs {
  time: Time
  listened: boolean
}

/** 寄り道の地点（水辺の道）で、まだ姿の見えない誰か（【創作】。現の旅と同じ言葉。水のほうへは誘わない） */
const WANDER_FAINT = '……誰かいる。でも、まだ声は遠い。'

const story = loadStoryPack()
if (story.problems.length) console.warn('物語のデータの問題', story.problems)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
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
    // 保存できなくても遊べる
  }
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(safeGet(PREF_KEY) ?? '{}') as Partial<Prefs>
    return { time: TIMES.includes(p.time as Time) ? (p.time as Time) : 'day', listened: p.listened === true }
  } catch {
    return { time: 'day', listened: false }
  }
}

function pointInPoly(p: XZ, poly: readonly XZ[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

// ---------------------------------------------------------------- 画面の骨組み

const app = document.getElementById('app')!
const mapHost = el('div', 'ez-map')
const root = el('div', 'yh')
root.dataset.time = 'day'
app.append(mapHost, root)
const sheet = el('div', 'ez-sheet')
sheet.hidden = true
root.appendChild(sheet)
// 鈴だけ（家の絵地図には、まわりの風の音は入れない）
const sound = new Sound(true, false)
const logLines: string[] = []
const log = (s: string) => {
  logLines.push(`${new Date().toISOString().slice(11, 19)} ${s}`)
  if (logLines.length > 200) logLines.shift()
}

/** 全面の札の地を空けて出す（三つの約束の札は ui/promise-sheet.ts が置く） */
function openSheet(): HTMLDivElement {
  sheet.replaceChildren()
  sheet.hidden = false
  return sheet
}
function showSheet(html: string): HTMLDivElement {
  openSheet().innerHTML = `<div class="ez-card">${html}</div>`
  const card = sheet.querySelector('.ez-card') as HTMLDivElement
  // 押したボタンが消えて、キーボードの位置が <body> に落ちないように、札の頭（見出しか最初のボタン）へ
  focusSheet(card)
  return card
}
function hideSheet(): void {
  sheet.hidden = true
  sheet.innerHTML = ''
}

// ---------------------------------------------------------------- はじめ

/** はじめの札（開くたびに出す。04 §6.2: 伝承の土地ではない・監修前の試作）。土地が無ければ、作り方を伝える */
function showStart(): void {
  const t = loadTestLand()
  if (!t) {
    showSheet(`
      <p class="count">白描の絵地図（試作）</p>
      <h2>テスト用の土地がありません</h2>
      <p>この端末に、テスト用の土地がありません。現の旅の『いまいる所で試す』を、現地で開くと作れます。</p>
      ${testLandIsOld() ? '<p class="soft">前に作ったテスト用の土地は古い形なので、ここでは開けません。現の旅で、もう一度作ってください。</p>' : ''}
      <a class="big" href="./utsutsu.html">現の旅へ</a>
      <a class="sub" href="./">入口へ</a>`)
    return
  }
  const card = showSheet(`
    <p class="count">白描の絵地図（試作）</p>
    <h1>テスト用の土地</h1>
    <p>家で、テスト用の土地を白描の絵地図で遊びます。名所に指を置いて耳を澄ますと、妖怪が白描の夢の姿で浮かびます。</p>
    <ul class="notes"><li>伝承の土地ではありません。</li><li>監修前の試作です。</li></ul>
    <p class="soft">ここで会った妖怪とは、現地のテスト用の土地で再会できます（進み具合は同じです）。土地（${escapeHtml(stampDate(t.createdAt))}に作ったもの）は、この端末の中だけにあり、どこにも送りません。</p>
    <button class="big" type="button">はじめる</button>
    <a class="sub" href="./">入口へ</a>`)
  card.querySelector('button')!.addEventListener('click', () => {
    sound.unlock()
    withPromises({ host: openSheet(), journey: '白描の絵地図', home: true, back: { label: 'もどる', go: () => showStart() }, done: () => startMap(t) })
  })
}

// ---------------------------------------------------------------- 遊ぶ（絵地図）

function startMap(t: TestLand): void {
  hideSheet()
  // 進み具合の時刻は、物語の時計（テストの時計で動く）
  const progress = new ProgressStore(browserStorage(), TEST_KEY, () => new Date(appNow()))
  // ほかのタブで書いた進み具合（引き継ぎの読み込みなど）に入れ替える（古い進み具合で書き戻さない）
  progress.follow()
  // ましろの覚え書き（呼び名。端末の持ち主のもの。便りで使う）
  const memo = new MemoStore(browserStorage(), () => new Date(appNow()))
  memo.follow()
  // 遊びはじめてから押したときに、保存を長く残すよう一度だけ頼む（入口の旅のボタンでは、ページを移るので頼まない）
  persistOnTap()
  const prefs = loadPrefs()
  // 時間: はじめての回（まだ耳を澄ましていない）は手で昼、ほかは「いま」（立山の時刻）
  const homeTime = createHomeTime({ first: !prefs.listened, now: appNow })
  let time: Time = homeTime.look
  const rest: LocalXZ[][] = t.restZones.map((z) => z.map(([x, zz]) => ({ x, z: zz })))
  // 名所の役目（core の spotRole。現の旅・箱庭と同じ順。どの役目でもない地点は置かない）
  const spots: EzuSpot[] = []
  for (const s of t.spots) {
    const role = spotRole(s, story.appearance)
    if (role) spots.push({ id: s.id, x: s.x, z: s.z, role, yokaiId: s.yokaiId, clueId: s.clueId, placeKind: s.placeKind })
  }
  const spotOf = (id: string | null): EzuSpot | undefined => (id ? spots.find((s) => s.id === id) : undefined)
  // お休みの範囲の中の名所では、耳を澄まさない（地点はお休みの範囲から離して作るが、念のため）
  const inRest = (sp: EzuSpot): boolean => t.restZones.some((z) => pointInPoly([sp.x, sp.z], z))
  log(`start test key=${TEST_KEY} spots=${spots.length}`)

  // 板
  const tl = el('div', 'ez-tl')
  const back = el('a', 'ez-btn', '入口へ')
  back.href = './'
  const title = el('div', 'ez-title', '白描の絵地図<small>テスト用の土地（試作）</small>')
  tl.append(back, title)
  const tr = el('div', 'ez-tr')
  const timeBtn = el('button', 'ez-btn time') as HTMLButtonElement
  const soundBtn = el('button', 'ez-btn', '音') as HTMLButtonElement
  soundBtn.setAttribute('aria-pressed', 'true')
  soundBtn.setAttribute('aria-label', '音（鈴）')
  // 今日の絵解き（押したときだけ。04 §3.6）
  const etokiBtn = el('button', 'ez-btn etoki', '今日はここまで') as HTMLButtonElement
  etokiBtn.setAttribute('aria-label', '今日はここまで（今日の絵解きをつくる）')
  const choBtn = el('button', 'ez-btn title mandala cho-btn', '帳<span class="ym-badge" aria-hidden="true">新</span>') as HTMLButtonElement
  choBtn.title = '帳（曼荼羅帳・縁帳・便り）'
  tr.append(timeBtn, soundBtn, etokiBtn, choBtn)
  const tools = el('div', 'ez-tools')
  const zin = el('button', 'ez-btn', '＋') as HTMLButtonElement
  const zout = el('button', 'ez-btn', '－') as HTMLButtonElement
  const fitBtn = el('button', 'ez-btn fit', '全体') as HTMLButtonElement
  zin.setAttribute('aria-label', '拡大')
  zout.setAttribute('aria-label', '縮小')
  fitBtn.setAttribute('aria-label', '土地の全体を見る')
  const north = el('div', 'ez-north', '北')
  north.setAttribute('aria-label', '地図は北が上')
  tools.append(north, zin, zout, fitBtn)
  for (const b of [timeBtn, soundBtn, etokiBtn, choBtn, zin, zout, fitBtn]) b.type = 'button'
  const spotLayer = el('div', 'ez-spots')
  const hint = el('div', 'ez-hint', '名所に指を置いて、耳を澄ます<small>マウスは名所の上で長押し。キーボードは Tab で名所を選び、Space を押し続ける</small>')
  hint.setAttribute('role', 'note')
  hint.hidden = prefs.listened
  const toastEl = el('div', 'ez-toast')
  toastEl.setAttribute('role', 'status')
  const credit = el('div', 'yh-credit', '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>')
  // テストの時計の札（?debug&clock= で時計を動かしているときだけ。左下）
  const clockEl = el('div', 'ez-clock')
  clockEl.hidden = true
  // 名所のボタンは板のあと（Tab で、板 → 名所の順に回る）
  root.append(tl, tr, tools, spotLayer, hint, toastEl, credit, clockEl)
  // 札（約束・はじめ）を閉じると、押したボタンが消える。キーボードの位置は題へ（Tab で、右上の板 → 名所の順）
  title.tabIndex = -1
  title.focus({ preventScroll: true })

  let toastTimer = 0
  // ましろの言葉は【創作】なので、会話の枠の外でも「台本・創作」の印をつける（who を空にすると、地の文）。
  // 文ごとに区切り、2行になるときは文の切れ目（。）で折り返す
  const toast = (text: string, who = 'ましろ', ms = 4200) => {
    const body = (text.match(/[^。]+。?|。/g) ?? [text]).map((s) => `<span class="s">${escapeHtml(s)}</span>`).join('')
    toastEl.innerHTML = `${who ? `<small>${escapeHtml(who)}<i class="tag" title="本作の創作の台詞（伝承の事実は「伝承の札」で示します）">台本・創作</i></small>` : ''}${body}`
    toastEl.classList.add('on')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), ms)
  }

  // 名所の選び方: タップ（キーボードは名所のボタン）で選ぶ。長押しは、指を置いている名所
  let selected: string | null = null
  let holdSpot: string | null = null
  const select = (id: string | null) => {
    selected = id
    map.setSelected(id)
  }

  // 絵地図（現在地は出さず、追わない。はじめは土地の全体を画面に合わせる）
  const map = new MapView(
    mapHost,
    t.map,
    rest,
    {
      tap: (_p, spotId) => select(spotId),
      followChange: () => {},
      hold: (spotId) => {
        holdSpot = spotId
        if (spotId) sound.unlock()
      },
      viewChange: () => placeSpotButtons(),
    },
    { look: 'hakubyo' },
  )
  map.follow = false
  const pad = (): MapPad => ({
    top: Math.max(tl.getBoundingClientRect().bottom, tr.getBoundingClientRect().bottom) + 10,
    right: 12,
    bottom: 40,
    left: 12,
  })
  map.fit(pad())
  zin.addEventListener('click', () => map.zoomBy(1.4))
  zout.addEventListener('click', () => map.zoomBy(1 / 1.4))
  fitBtn.addEventListener('click', () => map.fit(pad()))
  // 会話・帳のあいだ、地図は隠れているので描き直さない
  new MutationObserver(() => map.setPaused(root.classList.contains('talking') || root.classList.contains('modal-open'))).observe(root, {
    attributes: true,
    attributeFilter: ['class'],
  })

  // 名所のボタン（キーボードと読み上げのため。指の操作は地図が受ける）。フォーカスすると、その名所を選ぶ
  const spotBtns = new Map<string, HTMLButtonElement>()
  for (const sp of spots) {
    const b = el('button', 'ez-spot') as HTMLButtonElement
    b.type = 'button'
    b.addEventListener('focus', () => {
      select(sp.id)
      map.reveal(sp.x, sp.z)
    })
    b.addEventListener('click', () => select(sp.id))
    spotLayer.appendChild(b)
    spotBtns.set(sp.id, b)
  }
  function placeSpotButtons(): void {
    for (const sp of spots) {
      const b = spotBtns.get(sp.id)!
      if (b.hidden) continue
      // 札（地点の 16px 上）を囲む
      const [sx, sy] = map.screenOf(sp.x, sp.z)
      b.style.transform = `translate(${(sx - 28).toFixed(1)}px, ${(sy - 40).toFixed(1)}px)`
    }
  }

  const metName = (sp: EzuSpot): string | null => (sp.yokaiId && progress.hasMet(sp.yokaiId) ? (story.yokai[sp.yokaiId]?.name ?? null) : null)
  /** 調べる地点は、頼まれていて札をまだ拾っていない間だけ出す */
  const visible = (sp: EzuSpot): boolean => {
    if (sp.role !== 'clue') return true
    const clue = sp.clueId ? story.clues[sp.clueId] : undefined
    return !!clue && clueActive(clue, progress, 'yume')
  }
  let kehai: MapKehai[] = []
  let lastClear = ''
  /** 調べる地点（持ち物を受け取る地点も）の札と気配の言い方 */
  const wordsOf = (sp: EzuSpot) => clueWords(sp.clueId ? story.clues[sp.clueId] : undefined)
  // 名所の出方を見直す（はじめ・会話のあと・やり直したとき・ほかのタブの保存に入れ替えたとき）。札は、会った妖怪は名前、まだなら「？」、調べる地点は clues.json の言い方（既定「古い話」）
  const refreshSpots = () => {
    const vis = spots.filter(visible)
    map.setSpots(
      vis.map((sp) => ({ id: sp.id, x: sp.x, z: sp.z, label: sp.role === 'clue' ? wordsOf(sp).label : (metName(sp) ?? '？'), onsite: false })),
    )
    // 気配のにじみ（会った妖怪は淡く、調べる地点は小さく）
    kehai = vis.map((sp) => ({
      spotId: sp.id,
      x: sp.x,
      z: sp.z,
      strength: sp.role === 'clue' ? 0.4 : sp.role === 'wander' ? 0.6 : metName(sp) ? 0.5 : 0.8,
    }))
    lastClear = '-'
    for (const sp of spots) {
      const b = spotBtns.get(sp.id)!
      b.hidden = !vis.includes(sp)
      const name = metName(sp)
      // 寄り道の地点は、出る妖怪が時間と進み具合で変わるので、場所だけを言う
      b.textContent =
        sp.role === 'clue' ? `名所・${wordsOf(sp).kehai}` : sp.role === 'wander' ? '名所・水辺の道（寄り道）' : name ? `名所・${name}` : '名所・まだ会っていない誰か'
      b.setAttribute('aria-label', b.textContent)
    }
    placeSpotButtons()
    if (selected && !vis.some((s) => s.id === selected)) select(null)
  }

  // 帳（テスト用の土地の保存。旅印は現地で節を終えたときだけなので、家では枠だけ）。まだ見ていないピース・縁・便りがあれば、ボタンに「新」の字。
  // 便りは家（home）: 夜話と帳の影もある（この土地の保存の便り。入口の便りは立山のふもとだけ）
  const cho = createCho({
    root,
    story,
    progress,
    travel: 'yume',
    stampRegion: 'test',
    sound,
    onNew: (on) => {
      choBtn.classList.toggle('has-new', on)
      choBtn.setAttribute('aria-label', on ? '帳をひらく（新しいものがある。曼荼羅帳・縁帳・便り）' : '帳をひらく（曼荼羅帳・縁帳・便り）')
    },
    onReset: () => refreshSpots(),
    tayori: { memo, mode: 'home', now: appNow, sound },
  })
  choBtn.addEventListener('click', () => {
    if (!encounter.isOpen) cho.open()
  })
  etokiBtn.addEventListener('click', () => {
    if (!encounter.isOpen) cho.etoki()
  })

  // 出会い（白描の夢の姿・和紙の背景。カメラは出さない）
  const encounter = new GenEncounter({
    root,
    story,
    progress,
    sound,
    log,
    camera: false,
    backdrop: 'paper',
    onEnd: (spotId) => {
      root.classList.remove('talking')
      refreshSpots()
      // 会話のあと（途中で閉じても）: 便り（悩みの便りはすぐ届く）と帳の「新」を見直す
      cho.tick()
      // キーボードで遊んでいたら、名所のボタンへ戻す（札を拾って消えた調べる地点なら、見えている名所の先頭へ）
      if (root.classList.contains('yd-keys')) {
        const b = spotBtns.get(selected ?? spotId)
        ;(b && !b.hidden ? b : spotLayer.querySelector<HTMLButtonElement>('.ez-spot:not([hidden])'))?.focus({ preventScroll: true })
      }
    },
  })
  // ほかのタブの保存に入れ替えたら（引き継ぎの読み込み・やり直し）、名所の出方と札の名前も見直す。
  // 会話の間は見直さない（話している名所を消さない）。会話が終わると onEnd で見直す。
  // キーボードの位置があった名所が消えたら（調べる地点など）、見えている名所の先頭へ（<body> に落とさない。onEnd と同じ）
  progress.onReplace(() => {
    if (encounter.isOpen) return
    const had = document.activeElement
    refreshSpots()
    if (had instanceof HTMLElement && had.classList.contains('ez-spot') && had.hidden)
      spotLayer.querySelector<HTMLButtonElement>('.ez-spot:not([hidden])')?.focus({ preventScroll: true })
  })

  /** 名所の役目で、台本と姿の出し方が変わる。会えないときは、気配だけの言葉 */
  const openTalk = (sp: EzuSpot): boolean => {
    if (sp.role === 'yokai') {
      const script = sp.yokaiId ? story.yokai[sp.yokaiId]?.script : undefined
      if (script && encounter.open(sp.id, { script, yokaiId: sp.yokaiId, form: 'dream', travel: 'yume' })) return true
      toast('……誰かいる。でも、まだ姿は見えないね。')
      return false
    }
    if (sp.role === 'clue') {
      // 姿は無く、ましろだけが話す（霞と会話の枠。札はふだんどおり）
      const clue = sp.clueId ? story.clues[sp.clueId] : undefined
      return !!clue && clueActive(clue, progress, 'yume') && encounter.open(sp.id, { script: clue.script, form: 'none', travel: 'yume' })
    }
    // 寄り道: 出現の表の台本（雑談）で話す。決まった地点の台本は使わない（悩みを始めない・縁も上げない。04 §3.1）
    const a = sp.placeKind ? resolveAppearance(story.appearance, sp.placeKind, timeSlotOfDiorama(time), progress, 'yume') : null
    if (a?.mode === 'appear' && encounter.open(sp.id, { script: a.script, yokaiId: a.yokaiId, form: 'dream', travel: 'yume' })) return true
    toast(WANDER_FAINT)
    return false
  }
  /** 耳を澄まし終えた。夜は気配だけ */
  const listened = (sp: EzuSpot) => {
    if (encounter.isOpen) return
    if (!prefs.listened) {
      prefs.listened = true
      safeSet(PREF_KEY, JSON.stringify(prefs))
      hint.hidden = true
    }
    if (!canListenAtHome(time)) {
      toast(HOME_NIGHT_KEHAI)
      return
    }
    if (openTalk(sp)) root.classList.add('talking')
  }

  // 時間（いま → 昼 → 夕 → 夜 → いま。ui/home-time.ts）。見た目の時間帯を写す（prefs.time は段階4a のために書く）
  const setTime = (next: Time) => {
    time = next
    prefs.time = next
    safeSet(PREF_KEY, JSON.stringify(prefs))
    root.dataset.time = next
    map.setPhase(PHASE_OF[next])
    const l = homeTime.label()
    timeBtn.innerHTML = `<small>時間</small>${escapeHtml(l.value)}`
    timeBtn.setAttribute('aria-label', l.aria)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER[next])
  }
  setTime(time)
  timeBtn.addEventListener('click', () => {
    const next = homeTime.cycle()
    setTime(next)
    log(`time ${homeTime.mode} ${next}`)
    // いまの夜に入ったら申し出（このページで一度だけ）。出さなかったときは、夜は気配だけと添える
    if (!afterTimeChange() && !canListenAtHome(next)) toast(HOME_NIGHT_KEHAI)
  })
  soundBtn.addEventListener('click', () => {
    sound.unlock()
    const on = !sound.enabled
    sound.setEnabled(on)
    soundBtn.setAttribute('aria-pressed', String(on))
    if (on) sound.bell(0.5)
  })

  // 耳を澄ます（ボタンは、選んだ名所か、指を置いている名所のときに出す）
  const listenBtn = new ListenButton(root, () => sound.unlock())
  listenBtn.el.setAttribute('aria-label', '耳を澄ます（長押し。Space キーを押し続けても）')
  const subOf = (sp: EzuSpot): string => {
    if (!canListenAtHome(time)) return '長押し・夜は、気配だけ'
    if (sp.role === 'clue') return `長押し・${wordsOf(sp).kehai}`
    const name = metName(sp)
    return name ? `長押し・${name}にまた会いに` : '長押し・この名所で'
  }
  // キーボード: 名所を選んでいれば、Space を押し続けると耳を澄ます（名所のボタンの上でも。ほかのボタンの上では、そのボタンに任せる）。
  // 会話の枠が使った Space（最後の一言を送って会話を閉じたときも）では始めない
  let spaceHeld = false
  const busy = () => encounter.isOpen || cho.isOpen || !sheet.hidden
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || e.defaultPrevented) return
    const tg = e.target as HTMLElement | null
    const onSpot = !!tg?.classList?.contains('ez-spot')
    if (tg && !onSpot && /^(BUTTON|A|INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(tg.tagName)) return
    if (busy() || !selected) return
    spaceHeld = true
    sound.unlock()
    e.preventDefault()
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceHeld = false
  })
  window.addEventListener('blur', () => (spaceHeld = false))

  // ---- 立山の時刻（段階4b）。1分ごと・ページに戻ったとき・テストの時計を動かしたとき・会話や帳や札を閉じたときに見直す
  /** ましろの申し出（いまの夜に入ったとき、このページで一度だけ） */
  let offer: { close(): void } | null = null
  let offerShown = false
  /** 逢魔が時のお知らせを出した物語の日（日ごとに一度） */
  let duskDay: DayKey | null = null
  /** 夜話: 前に見た今夜の様子と、来たことを知らせた夜 */
  let lastTonight: Tonight['state'] = tonight(storyClock(appNow()), progress, story).state
  let yobanashiDay: DayKey | null = null
  let yobanashiPending = false
  /** ほかのお知らせが消えるのを待って、もう一度見る */
  let retry = 0
  const retrySoon = () => {
    if (!retry)
      retry = window.setTimeout(() => {
        retry = 0
        timeTick()
      }, 2000)
  }
  const toastShowing = () => toastEl.classList.contains('on')
  const closeOffer = () => {
    offer?.close()
    offer = null
  }
  /** 手で昼にする（夜の申し出の［昼の夢にする］） */
  const dayDream = () => {
    if (busy()) return
    while (homeTime.mode !== 'day') homeTime.cycle()
    setTime(homeTime.look)
    log('time day (offer)')
  }
  /** いまの夜に入った（読み込んだときも）: ましろの申し出。夜話が来ていれば便りへ、ほかは昼の夢へ（夜の絵地図は気配だけ）。出したら true */
  const nightOffer = (): boolean => {
    if (offerShown || homeTime.mode !== 'auto' || homeTime.look !== 'night' || busy()) return false
    offerShown = true
    const clock = storyClock(appNow())
    if (yobanashiNews(tonight(clock, progress, story))) {
      // 同じ夜に「来ている」のお知らせを重ねない
      yobanashiDay = clock.day
      offer = showOffer(root, { text: '夜話に、だれか来ている。', action: '帳の「便り」をひらく', onAction: () => cho.open('tayori') })
      log('offer yobanashi')
    } else {
      offer = showOffer(root, { text: '夜は、みんな気配だけ。', action: '昼の夢にする', onAction: () => dayDream() })
      log('offer day')
    }
    return true
  }
  /** 時間帯が変わった: 夜でなくなったら申し出を閉じ、いまの夜に入ったら申し出る（出したら true） */
  const afterTimeChange = (): boolean => {
    if (time !== 'night') closeOffer()
    return nightOffer()
  }
  function timeTick(): void {
    const b = busy()
    // いま: 立山の時刻の時間帯が変わっていたら切り替える（会話・帳・札の間は待ち、閉じたらすぐ見直す）
    if (!b) {
      const ch = homeTime.tick()
      if (ch) {
        setTime(ch)
        log(`time auto ${ch}`)
      }
      afterTimeChange()
    }
    const clock = storyClock(appNow())
    // 立山の逢魔が時: 物語の日ごとに一度、文字のお知らせ（地の文）と風の音（見た目の時間帯に関係なく。色だけにしない）
    if (clock.phase === 'oumagatoki' && duskDay !== clock.day && !b) {
      if (toastShowing()) retrySoon()
      else {
        duskDay = clock.day
        toast('逢魔が時。帳のすみに、影がさした。', '', 5200)
        sound.wind()
        log(`dusk ${clock.day} wind`)
      }
    }
    // 便りを届け、帳の「新」を見直す
    cho.tick()
    // 夜話: 会話のあとで、今夜だれかが来るようになったら、その夜に一度だけお知らせ（数は出さない）
    const st = tonight(clock, progress, story).state
    if (st === 'offer' && lastTonight !== 'offer' && lastTonight !== 'resume' && yobanashiDay !== clock.day) yobanashiPending = true
    if (st !== 'offer') yobanashiPending = false
    lastTonight = st
    if (yobanashiPending && !b) {
      if (toastShowing()) retrySoon()
      else {
        yobanashiPending = false
        yobanashiDay = clock.day
        toast('帳の「便り」に、だれか来ている。', '', 5200)
        log('yobanashi toast')
      }
    }
    const tag = clockTag()
    clockEl.hidden = !tag
    if (tag && clockEl.textContent !== tag) clockEl.textContent = tag
  }
  window.setInterval(timeTick, 60_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) timeTick()
  })
  appClock().onChange(() => timeTick())
  /** 会話・帳・札を閉じたら、待っていた切り替えとお知らせを、すぐ見直す。開いたら、申し出は閉じる */
  let wasBusy = busy()

  // 毎フレーム: 指・ボタン・キーを押している間だけ満ちる（near と held を同時に渡すので、ひとりでには満ちない）
  const gauge = new ListenGauge()
  let gaugeSpot: string | null = null
  /** 澄みきったあとは、指・ボタン・キーをいちど離すまで、次を始めない */
  let spent = false
  /** 満ちていたのは、地図に置いた指か（ほかは「耳を澄ます」のボタン・Space キー）。途切れたときの言葉を合わせる */
  let byFinger = true
  let lastT = performance.now()
  const frame = (now: number) => {
    requestAnimationFrame(frame)
    // 描くのが遅い端末でも、満ちる時間がのびすぎないように（タブを離れて戻ったときの跳びは抑える）
    const dt = Math.min(0.25, Math.max(0, (now - lastT) / 1000))
    lastT = now
    const b = busy()
    if (b !== wasBusy) {
      wasBusy = b
      if (b) closeOffer()
      else timeTick()
    }
    const want = holdSpot ?? (listenBtn.held(spaceHeld) ? selected : null)
    if (!want) spent = false
    const target = want && !spent && !b ? spotOf(want) : undefined
    if (target && target.id !== gaugeSpot) {
      gauge.reset()
      gaugeSpot = target.id
    }
    if (target) byFinger = !!holdSpot
    const ev = gauge.update(dt, { near: !!target, held: !!target, speed: 0, inRest: !!target && inRest(target), blocked: b })
    if (ev === 'start') {
      log(`listen:start ${target?.id}`)
      sound.bell(0.3)
    } else if (ev === 'interrupted') {
      log('listen:interrupted')
      toast(`……気配が、ふっと遠のいた。${byFinger ? '指を置いたまま' : '押したまま'}にすると、また聞こえる。`, '')
    } else if (ev === 'complete' && target) {
      spent = true
      log(`listen:complete ${target.id}`)
      listened(target)
    }
    const shown = b ? undefined : spotOf(holdSpot ?? selected)
    listenBtn.show(!!shown, shown ? subOf(shown) : undefined)
    listenBtn.setProgress(shown && shown.id === gaugeSpot ? gauge.progress : 0)
    // 地図の上の輪（満ちていく弧）
    const v = gaugeSpot && gauge.progress > 0.002 ? gauge.progress : 0
    const key = v ? `${gaugeSpot}:${v.toFixed(3)}` : ''
    if (key !== lastClear) {
      lastClear = key
      map.setKehai(kehai, true, v && gaugeSpot ? { spotId: gaugeSpot, v } : null)
    }
  }
  refreshSpots()
  requestAnimationFrame(frame)
  // 読み込んだとき: いまの夜なら申し出、逢魔が時ならお知らせと風
  timeTick()
  ;(window as unknown as { __ezu: unknown }).__ezu = {
    map,
    progress,
    memo,
    story,
    spots,
    sound,
    homeTime,
    timeTick,
    clock: appClock(),
    log: logLines,
    state: () => ({ time, mode: homeTime.mode, selected, holdSpot, gaugeSpot, gauge: gauge.progress, talking: encounter.isOpen }),
  }
}

showStart()
