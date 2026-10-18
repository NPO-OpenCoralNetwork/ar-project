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
// - 時間（昼・夕・夜）は「時間」で切り替え、端末に覚える。夜は気配だけ（04 §2.5「箱庭も夜は気配だけ」。決まりは core の canListenAtHome。箱庭と同じ）。
//   夕は、決まった妖怪と調べる地点には会える。寄り道の地点は表のとおり（くらがりは段階4なので、まだ気配だけ）。
// - お休みの範囲（境内・墓地）は霧。名前は出さず、中では会わない。
// - 位置は使わない。土地はどこにも送らない（F-52）。出典表示（OSM）は常に出す（F-44）。
// - テスターには、はじめに「伝承の土地ではない」「監修前の試作」と伝える（04 §6.2）。はじめの札は、開くたびに出す。
// - 三つの約束（F-60）は、入口・現の旅で読んでいなければ、ここで見せる（札は ui/promise-sheet.ts。どのページでも同じもの）。

import './style.css'
import type { LocalXZ } from '../core/geo'
import type { XZ } from '../core/map-layers'
import { TEST_KEY } from '../core/storage-keys'
import { canListenAtHome, clueActive, HOME_NIGHT_KEHAI, resolveAppearance, type SpotRole, spotRole, timeSlotOfDiorama } from '../core/story/appearance'
import { ListenGauge } from '../core/story/listen'
import { browserStorage, ProgressStore } from '../core/story/progress'
import type { DayPhase } from '../core/utsutsu/sun'
import { loadStoryPack } from '../data/story-pack'
import { createCho } from '../ui/cho'
import { focusSheet } from '../ui/focus'
import { withPromises } from '../ui/promise-sheet'
import { GenEncounter } from '../utsutsu/encounter'
import { type MapKehai, type MapPad, MapView } from '../utsutsu/map-view'
import { loadTestLand, type TestLand, testLandIsOld } from '../utsutsu/test-land'
import { Sound } from '../yume/encounter/sound'
import { stampDate } from '../yume/encounter/stamp'
import { escapeHtml, ListenButton } from '../yume/encounter/ui'

type Time = 'day' | 'dusk' | 'night'
const TIMES: Time[] = ['day', 'dusk', 'night']
const TIME_LABEL: Record<Time, string> = { day: '昼', dusk: '夕', night: '夜' }
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

/** この端末に覚えること（時間と、はじめての一言を見せ終えたか）。土地や位置は入れない */
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
  const progress = new ProgressStore(browserStorage(), TEST_KEY)
  const prefs = loadPrefs()
  let time: Time = prefs.time
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
  const timeBtn = el('button', 'ez-btn') as HTMLButtonElement
  const soundBtn = el('button', 'ez-btn', '音') as HTMLButtonElement
  soundBtn.setAttribute('aria-pressed', 'true')
  soundBtn.setAttribute('aria-label', '音（鈴）')
  const choBtn = el('button', 'ez-btn title mandala cho-btn', '帳<span class="ym-badge" aria-hidden="true">新</span>') as HTMLButtonElement
  choBtn.title = '帳（曼荼羅帳・縁帳）'
  tr.append(timeBtn, soundBtn, choBtn)
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
  for (const b of [timeBtn, soundBtn, choBtn, zin, zout, fitBtn]) b.type = 'button'
  const spotLayer = el('div', 'ez-spots')
  const hint = el('div', 'ez-hint', '名所に指を置いて、耳を澄ます<small>マウスは名所の上で長押し。キーボードは Tab で名所を選び、Space を押し続ける</small>')
  hint.setAttribute('role', 'note')
  hint.hidden = prefs.listened
  const toastEl = el('div', 'ez-toast')
  toastEl.setAttribute('role', 'status')
  const credit = el('div', 'yh-credit', '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>')
  // 名所のボタンは板のあと（Tab で、板 → 名所の順に回る）
  root.append(tl, tr, tools, spotLayer, hint, toastEl, credit)
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
  // 名所の出方を見直す（はじめ・会話のあと・やり直したとき）。札は、会った妖怪は名前、まだなら「？」、調べる地点は「古い話」
  const refreshSpots = () => {
    const vis = spots.filter(visible)
    map.setSpots(
      vis.map((sp) => ({ id: sp.id, x: sp.x, z: sp.z, label: sp.role === 'clue' ? '古い話' : (metName(sp) ?? '？'), onsite: false })),
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
        sp.role === 'clue' ? '名所・古い話の気配' : sp.role === 'wander' ? '名所・水辺の道（寄り道）' : name ? `名所・${name}` : '名所・まだ会っていない誰か'
      b.setAttribute('aria-label', b.textContent)
    }
    placeSpotButtons()
    if (selected && !vis.some((s) => s.id === selected)) select(null)
  }

  // 帳（テスト用の土地の保存。旅印は現地で節を終えたときだけなので、家では枠だけ）。まだ見ていないピース・縁があれば、ボタンに「新」の字
  const cho = createCho({
    root,
    story,
    progress,
    travel: 'yume',
    stampRegion: 'test',
    sound,
    onNew: (on) => {
      choBtn.classList.toggle('has-new', on)
      choBtn.setAttribute('aria-label', on ? '帳をひらく（新しいピースや縁がある）' : '帳をひらく（曼荼羅帳・縁帳）')
    },
    onReset: () => refreshSpots(),
  })
  choBtn.addEventListener('click', () => {
    if (!encounter.isOpen) cho.open()
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
      // キーボードで遊んでいたら、名所のボタンへ戻す（札を拾って消えた調べる地点なら、見えている名所の先頭へ）
      if (root.classList.contains('yd-keys')) {
        const b = spotBtns.get(selected ?? spotId)
        ;(b && !b.hidden ? b : spotLayer.querySelector<HTMLButtonElement>('.ez-spot:not([hidden])'))?.focus({ preventScroll: true })
      }
    },
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

  // 時間（昼 → 夕 → 夜）。端末に覚える
  const setTime = (next: Time) => {
    time = next
    prefs.time = next
    safeSet(PREF_KEY, JSON.stringify(prefs))
    root.dataset.time = next
    map.setPhase(PHASE_OF[next])
    timeBtn.innerHTML = `<small>時間</small>${TIME_LABEL[next]}`
    timeBtn.setAttribute('aria-label', `時間を切り替える（いまは${TIME_LABEL[next]}）`)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER[next])
  }
  setTime(time)
  timeBtn.addEventListener('click', () => {
    const next = TIMES[(TIMES.indexOf(time) + 1) % TIMES.length]
    setTime(next)
    log(`time ${next}`)
    if (!canListenAtHome(next)) toast(HOME_NIGHT_KEHAI)
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
    if (sp.role === 'clue') return '長押し・古い話の気配'
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
  ;(window as unknown as { __ezu: unknown }).__ezu = {
    map,
    progress,
    story,
    spots,
    log: logLines,
    state: () => ({ time, selected, holdSpot, gaugeSpot, gauge: gauge.progress, talking: encounter.isOpen }),
  }
}

showStart()
