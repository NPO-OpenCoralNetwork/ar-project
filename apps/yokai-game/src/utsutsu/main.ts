// 現の旅（段階3）の入口。現地を歩き、立ち止まると妖怪が色のついた姿で現れる（04 §2.2・§3.1、02 F-01〜F-07・F-10・F-11・F-45・F-46・F-60〜F-64）。
//
// 流れ: はじめ（土地を選ぶ）→ 三つの約束（初回だけ・飛ばせない。F-60）→ 位置の許可の説明 → 地図（D1）
//   地図: 状態の帯（世界の言葉＋普通の言葉）、「足を止めた」ボタン（気配の近くでだけ）、曼荼羅帳、出典表示（常に）。
//   出会い（C2 の現地版）→ 会話 → 節を終えたら旅印（D4）。道中（D3）・お休みの範囲（D2）・逢魔が時・夜は出会いを止める。
//
// 土地:
// - 立山のふもと（岩峅寺。本番の地域パック）。進み具合は夢の旅と同じ保存（yume.story.v1）なので、夢で会った妖怪と再会できる。
// - テスト用の土地（チームの地元。test-land.ts）。この端末の中だけに作る。進み具合は別の保存（作ったときに夢の旅の保存を写す）。
// - 位置シミュレーター（?sim または ?debug。F-06）。進み具合は別の保存（始めるたびに夢の旅の保存を写す）。
// URL: ?debug で判定の中身を表示。

import './style.css'
import { type LatLon, type LocalXZ, toLocal } from '../core/geo'
import type { MapLayers } from '../core/map-layers'
import type { Fix } from '../core/location/types'
import { checkConditions } from '../core/story/dialogue'
import { browserStorage, ProgressStore } from '../core/story/progress'
import type { SectionDef } from '../core/story/types'
import { type EngineEvent, type EngineSpot, UtsutsuEngine } from '../core/utsutsu/engine'
import { sunTimes } from '../core/utsutsu/sun'
import { iwakurajiMap } from '../data/iwakuraji-map'
import { iwakurajiPack } from '../data/iwakuraji-pack'
import { loadStoryPack } from '../data/story-pack'
import { Sound } from '../yume/encounter/sound'
import { stampDate, stampSvg } from '../yume/encounter/stamp'
import { escapeHtml, MandalaView } from '../yume/encounter/ui'
import { GenEncounter } from './encounter'
import { GeoSource, type GeoProblem, type LocationSource, SimSource } from './location'
import { MapView } from './map-view'
import { buildTestLand, clearTestLand, loadTestLand, saveTestLand, type TestLand } from './test-land'

const params = new URLSearchParams(window.location.search)
const DEBUG = params.has('debug')
const SIM_ALLOWED = params.has('sim') || DEBUG
const STORY_KEY = 'yume.story.v1'
const TEST_KEY = 'yume.story.test.v1'
const SIM_KEY = 'yume.story.sim.v1'
const PROMISE_KEY = 'yume.promises.v1'
/** 地域パックの原点からこれより遠いと「現地で開いてください」 */
const FAR_M = 1500

interface Land {
  id: 'iwakuraji' | 'test'
  name: string
  origin: LatLon
  map: MapLayers
  rest: LocalXZ[][]
  spots: EngineSpot[]
  attributions: string[]
}

const story = loadStoryPack()
if (story.problems.length) console.warn('物語のデータの問題', story.problems)

const canAppear = (yokaiId?: string): boolean => {
  const y = yokaiId ? story.yokai[yokaiId] : undefined
  return !!(y?.script && y.art && story.scripts[y.script])
}

function iwakurajiLand(): Land {
  const o = iwakurajiPack.origin
  return {
    id: 'iwakuraji',
    name: iwakurajiPack.name,
    origin: o,
    map: iwakurajiMap,
    rest: iwakurajiPack.restZones.map((z) => z.polygon.map((p) => toLocal(p, o))),
    spots: iwakurajiPack.spots.map((s) => ({ id: s.id, ...toLocal(s.position, o), yokaiId: s.yokaiId, canAppear: canAppear(s.yokaiId) })),
    attributions: ['© OpenStreetMap contributors'],
  }
}

function testLand(t: TestLand): Land {
  return {
    id: 'test',
    name: 'テスト用の土地',
    origin: t.origin,
    map: t.map,
    rest: t.restZones.map((z) => z.map(([x, zz]) => ({ x, z: zz }))),
    spots: t.spots.map((s) => ({ id: s.id, x: s.x, z: s.z, yokaiId: s.yokaiId, canAppear: canAppear(s.yokaiId) })),
    attributions: ['© OpenStreetMap contributors'],
  }
}

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

/** 夢の旅の保存を、テスト用・シミュレーター用の保存へ写す（そちらで進めても、本番の保存は変わらない） */
function copyMainProgress(to: string): void {
  const s = safeGet(STORY_KEY)
  try {
    if (s) localStorage.setItem(to, s)
    else localStorage.removeItem(to)
  } catch {
    // そのまま
  }
}

// ---------------------------------------------------------------- 画面の骨組み

const app = document.getElementById('app')!
const mapHost = el('div', 'um')
const root = el('div', 'yh')
root.dataset.time = 'day'
app.append(mapHost, root)
const sheet = el('div', 'uh-sheet')
sheet.hidden = true
root.appendChild(sheet)
const sound = new Sound(true, false)
const logLines: string[] = []
const log = (s: string) => {
  logLines.push(`${new Date().toISOString().slice(11, 19)} ${s}`)
  if (logLines.length > 200) logLines.shift()
}

function showSheet(html: string, cls = ''): HTMLDivElement {
  sheet.className = `uh-sheet ${cls}`
  sheet.innerHTML = `<div class="uh-card">${html}</div>`
  sheet.hidden = false
  return sheet.querySelector('.uh-card') as HTMLDivElement
}
function hideSheet(): void {
  sheet.hidden = true
  sheet.innerHTML = ''
}
const sheetOpen = () => !sheet.hidden

// ---------------------------------------------------------------- はじめ

function showStart(): void {
  const t = loadTestLand()
  const card = showSheet(`
    <p class="count">現の旅（試作）</p>
    <h1>${escapeHtml(iwakurajiPack.name)}</h1>
    <p>現地を歩いて、立ち止まると、妖怪が色のついた姿で現れます。夢の旅で先に会っていれば、再会になります。</p>
    <button class="big" type="button" data-go="iwakuraji">歩きはじめる</button>
    <h3>チームのテスト用</h3>
    <p class="soft">自分の地元で、仕組みを試すための土地です。いまいる所のまわり（約800m四方）の地図を OpenStreetMap から読み、気配を3つ置きます。作った土地はこの端末の中だけに残ります。</p>
    <button class="sub" type="button" data-go="test-new">いまいる所で試す（テスト用の土地を作る）</button>
    ${t ? `<button class="sub" type="button" data-go="test-old">前に作ったテスト用の土地で歩く（${escapeHtml(stampDate(t.createdAt))}）</button>` : ''}
    ${SIM_ALLOWED ? `<h3>開発用</h3><div class="row"><button class="sub" type="button" data-go="sim-iwakuraji">シミュレーター（ふもと）</button>${t ? `<button class="sub" type="button" data-go="sim-test">シミュレーター（テスト用）</button>` : ''}</div>` : ''}
    <a class="sub" href="./">夢の旅（家で遊ぶ）へ</a>
    <p class="soft">位置は気配を出すためだけに、この端末の中で使います。歩いた道は記録せず、どこにも送りません。</p>`)
  card.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      sound.unlock()
      const go = b.dataset.go!
      if (go === 'iwakuraji') withPromises(() => askLocation(() => startSession(iwakurajiLand(), 'gps')))
      else if (go === 'test-new') withPromises(() => askLocation(() => makeTestLand()))
      else if (go === 'test-old' && t) withPromises(() => askLocation(() => startSession(testLand(t), 'gps')))
      else if (go === 'sim-iwakuraji') startSession(iwakurajiLand(), 'sim')
      else if (go === 'sim-test' && t) startSession(testLand(t), 'sim')
    }),
  )
}

/** 三つの約束（04 §2.1、F-60）。初回は飛ばせない。台詞は【創作】 */
const PROMISES: { mashiro: string; plain: string }[] = [
  {
    mashiro: '歩きながら、画面を見ないでね。気配は、立ち止まった人にしか見えないから。',
    plain: '歩きながら画面を見ないでください。画面は開いたまま、ポケットに入れて歩けます。',
  },
  {
    mashiro: '入っちゃいけない所や、祈りの場所では遊ばない。それから、夜は出歩かない。',
    plain: '立入禁止の場所・私有地・境内では使いません。暗くなる前に帰りましょう。',
  },
  {
    mashiro: '本物のライチョウや動物は、追いかけない。見るだけにしよう。',
    plain: '野生の動物に近づいたり、追いかけたりしないでください。',
  },
]

function withPromises(next: () => void): void {
  if (safeGet(PROMISE_KEY) === '1') {
    next()
    return
  }
  const show = (i: number) => {
    const p = PROMISES[i]
    const card = showSheet(`
      <p class="count">三つの約束　${i + 1} / ${PROMISES.length}</p>
      ${mashiroSvg(false)}
      <p class="speaker">${escapeHtml(p.mashiro)}</p>
      <p class="soft">${escapeHtml(p.plain)}</p>
      <button class="big" type="button">わかった</button>`)
    card.querySelector('button')!.addEventListener('click', () => {
      if (i + 1 < PROMISES.length) show(i + 1)
      else {
        safeSet(PROMISE_KEY, '1')
        next()
      }
    })
  }
  show(0)
}

function askLocation(next: () => void): void {
  const card = showSheet(`
    ${mashiroSvg(false)}
    <p class="speaker">気配をさがすのに、いまいる場所を使うよ。</p>
    <p>次に、位置情報の許可を求められます。</p>
    <p class="soft">位置は気配を出すためだけに、この端末の中で使います。歩いた道は記録せず、どこにも送りません。歩いている間は、画面が自動で消えないようにします（電池を使います）。</p>
    <button class="big" type="button" data-act="ok">位置を使って はじめる</button>
    <button class="sub" type="button" data-act="back">もどる</button>`)
  card.querySelector('[data-act="ok"]')!.addEventListener('click', () => next())
  card.querySelector('[data-act="back"]')!.addEventListener('click', () => showStart())
}

function makeTestLand(): void {
  const card = showSheet(`<h2>テスト用の土地を作る</h2><p class="step">いまいる場所を確かめています…</p><p class="err"></p>`)
  const step = card.querySelector('.step') as HTMLElement
  const err = card.querySelector('.err') as HTMLElement
  const fail = (msg: string) => {
    err.textContent = msg
    const back = el('button', 'sub', 'もどる') as HTMLButtonElement
    back.type = 'button'
    back.addEventListener('click', () => showStart())
    card.appendChild(back)
  }
  if (!window.isSecureContext || !navigator.geolocation) {
    fail('この URL では位置が使えません（https のページで開いてください）')
    return
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      if (p.coords.accuracy > 80) step.textContent = `位置の精度が低め（約${Math.round(p.coords.accuracy)}m）ですが、このまま作ります…`
      buildTestLand({ lat: p.coords.latitude, lon: p.coords.longitude }, (s) => (step.textContent = s))
        .then((t) => {
          saveTestLand(t)
          copyMainProgress(TEST_KEY)
          log(`testland ${JSON.stringify(t.stats)}`)
          startSession(testLand(t), 'gps')
        })
        .catch((e: Error) => fail(e.message || '作れませんでした'))
    },
    (e) => fail(e.code === e.PERMISSION_DENIED ? '位置の許可がありません。ブラウザの設定で、このページに位置情報を許可してください' : '位置が取れませんでした。空が見える所で、もう一度試してください'),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
  )
}

/** ましろ（紙の鳥【創作】）の小さな絵。眠っている（道中）か起きているか */
function mashiroSvg(sleeping: boolean): string {
  const eye = sleeping ? '<path d="M64,38 C66,40 69,40 71,38" fill="none" stroke="#3a332d" stroke-width="1.6" stroke-linecap="round"/>' : '<circle cx="67" cy="37" r="2.2" fill="#3a332d"/>'
  const z = sleeping ? '<text x="88" y="22" font-size="12" fill="currentColor" font-family="serif">す…</text>' : ''
  return `<svg class="mashiro" viewBox="0 0 120 90" aria-hidden="true">
    <path d="M18,62 C30,40 52,30 70,30 C80,30 86,34 88,40 L100,44 L88,48 C84,60 70,70 50,70 C38,70 26,68 18,62 Z" fill="#fffdf7" stroke="#3a332d" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M30,60 C40,50 52,46 64,48 C56,56 46,62 30,60 Z" fill="#f1ece0" stroke="#3a332d" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M18,62 L8,58 L14,66 Z" fill="#fffdf7" stroke="#3a332d" stroke-width="1.2" stroke-linejoin="round"/>
    ${eye}${z}
    <path d="M20,74 C46,80 76,80 102,74" fill="none" stroke="#3a332d" stroke-opacity="0.25" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`
}

// ---------------------------------------------------------------- 遊ぶ（地図）

interface Session {
  land: Land
  engine: UtsutsuEngine
  map: MapView
  source: LocationSource
  sim: SimSource | null
  progress: ProgressStore
  encounter: GenEncounter
  mandala: MandalaView
  clockOffset: number
}
let S: Session | null = null

function startSession(land: Land, kind: 'gps' | 'sim'): void {
  hideSheet()
  const key = kind === 'sim' ? SIM_KEY : land.id === 'test' ? TEST_KEY : STORY_KEY
  if (kind === 'sim') copyMainProgress(SIM_KEY)
  const progress = new ProgressStore(browserStorage(), key)
  const engine = new UtsutsuEngine(land.spots, land.rest.map((polygon, i) => ({ id: `rest-${i}`, polygon })), land.origin)
  log(`start ${land.id} ${kind} key=${key}`)

  // 板
  const tl = el('div', 'uh-tl')
  const back = el('button', 'uh-btn', 'もどる') as HTMLButtonElement
  back.type = 'button'
  back.addEventListener('click', () => window.location.reload())
  tl.append(back, el('div', 'uh-land', escapeHtml(land.name + (kind === 'sim' ? '（シミュレーター）' : ''))))
  const tr = el('div', 'uh-tr')
  const soundBtn = el('button', 'uh-btn', '音') as HTMLButtonElement
  soundBtn.type = 'button'
  soundBtn.setAttribute('aria-pressed', 'true')
  soundBtn.addEventListener('click', () => {
    sound.unlock()
    const on = !sound.enabled
    sound.setEnabled(on)
    soundBtn.setAttribute('aria-pressed', String(on))
    if (on) sound.bell(0.5)
  })
  const mandalaBtn = el('button', 'uh-btn title', '曼荼羅帳') as HTMLButtonElement
  mandalaBtn.type = 'button'
  tr.append(soundBtn, mandalaBtn)
  const tools = el('div', 'uh-tools')
  const zin = el('button', 'uh-btn', '＋') as HTMLButtonElement
  const zout = el('button', 'uh-btn', '－') as HTMLButtonElement
  const here = el('button', 'uh-btn here', '現在<br>地') as HTMLButtonElement
  for (const b of [zin, zout, here]) b.type = 'button'
  zin.setAttribute('aria-label', '拡大')
  zout.setAttribute('aria-label', '縮小')
  here.hidden = true
  const north = el('div', 'uh-north', '北')
  north.setAttribute('aria-label', '地図は北が上')
  tools.append(north, zin, zout, here)
  const chip = el('div', 'uh-chip')
  const band = el('div', 'uh-band')
  band.setAttribute('role', 'status')
  const C = 2 * Math.PI * 15
  const stopBtn = el('button', 'uh-stop') as HTMLButtonElement
  stopBtn.type = 'button'
  stopBtn.innerHTML = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/></svg><span><b>足を止めた</b><small>そのまま数秒</small></span>`
  const ring = stopBtn.querySelector('.fg') as SVGCircleElement
  const toastEl = el('div', 'uh-toast')
  toastEl.setAttribute('role', 'status')
  const credit = el('div', 'yh-credit')
  credit.innerHTML = land.attributions
    .map((a) => (a.includes('OpenStreetMap') ? `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${escapeHtml(a)}</a>` : escapeHtml(a)))
    .join('<br>')
  const dbg = DEBUG ? el('div', 'uh-debug') : null
  root.append(tl, tr, tools, chip, stopBtn, band, toastEl, credit)
  if (dbg) root.appendChild(dbg)

  let toastTimer = 0
  const toast = (text: string, who = 'ましろ', ms = 4200) => {
    toastEl.innerHTML = `${who ? `<small>${escapeHtml(who)}</small>` : ''}${escapeHtml(text)}`
    toastEl.classList.add('on')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), ms)
  }

  // 地図
  const map = new MapView(mapHost, land.map, land.rest, {
    tap: (p, spotId) => {
      if (S?.sim) {
        S.sim.walkTo(p.x, p.z)
        map.setSimTarget(p)
        return
      }
      if (spotId) {
        const sp = land.spots.find((s) => s.id === spotId)
        const pos = engine.view.position
        const d = sp && pos ? Math.round(Math.hypot(sp.x - pos.x, sp.z - pos.z) / 10) * 10 : null
        toast(`この地点${d !== null ? `（約${d}m）` : ''}。近くまで行って、立ち止まってみよう。`)
      }
    },
    followChange: (f) => {
      here.hidden = f
    },
  })
  zin.addEventListener('click', () => map.zoomBy(1.4))
  zout.addEventListener('click', () => map.zoomBy(1 / 1.4))
  here.addEventListener('click', () => map.recenter())
  const refreshSpots = () =>
    map.setSpots(
      land.spots.map((s) => {
        const met = s.yokaiId ? progress.get().yokai[s.yokaiId]?.met : undefined
        return { id: s.id, x: s.x, z: s.z, label: met && s.yokaiId ? (story.yokai[s.yokaiId]?.name ?? '？') : '？', onsite: !!met?.onsite }
      }),
    )
  refreshSpots()

  // 曼荼羅帳
  const mandala = new MandalaView(
    root,
    story.mandala,
    {
      piece: (id) => progress.pieceOf(id),
      isNew: (id) => progress.pieceOf(id) !== 'empty' && !progress.flag(`seen:${id}`),
      card: (id) => story.cards[id],
      stamps: () =>
        story.sections
          .filter((s) => s.region === land.id)
          .map((s) => ({ id: s.id, title: s.title, stampTitle: s.stampTitle, motif: s.stampMotif, at: progress.stampOf(s.id)?.at ?? null })),
    },
    {
      close: () => mandala.close(),
      reset: () => {
        progress.reset()
        mandala.close()
        refreshSpots()
      },
      seen: (id) => progress.setFlag(`seen:${id}`, true),
    },
  )
  mandalaBtn.addEventListener('click', () => mandala.open())

  // 出会い
  const encounter = new GenEncounter({
    root,
    story,
    progress,
    sound,
    log,
    onEnd: (spotId, how) => {
      engine.disarm(spotId)
      refreshSpots()
      root.classList.remove('talking')
      if (how === 'finished') window.setTimeout(() => checkSections(), 700)
    },
  })

  // 位置
  const onFix = (f: Fix) => engine.addFix(f)
  let source: LocationSource
  let sim: SimSource | null = null
  if (kind === 'sim') {
    const st = land.map.stations[0]
    const start = land.id === 'iwakuraji' && st ? { x: st[0], z: st[1] - 20 } : { x: 0, z: 0 }
    sim = new SimSource(land.origin, start, onFix)
    source = sim
    root.appendChild(simPanel(sim, land, map, (off) => (S!.clockOffset = off)))
  } else {
    source = new GeoSource(land.origin, onFix, (p) => onGeoProblem(p))
  }
  S = { land, engine, map, source, sim, progress, encounter, mandala, clockOffset: 0 }
  source.start()
  ;(window as unknown as { __utsutsu: unknown }).__utsutsu = { S, log: logLines, story }

  let geoProblem: GeoProblem = null
  function onGeoProblem(p: GeoProblem): void {
    geoProblem = p
    log(`geo-problem ${p}`)
    if (p === 'denied') {
      const card = showSheet(`
        <h2>位置が使えません</h2>
        <p>位置情報の許可がありません。iPhone は「設定 → プライバシーとセキュリティ → 位置情報サービス → Safari の Web サイト」を「使用中のみ」にし、このページを読み込み直してください。</p>
        <button class="sub" type="button">はじめにもどる</button>`)
      card.querySelector('button')!.addEventListener('click', () => window.location.reload())
    } else if (p === 'insecure') {
      showSheet(`<h2>位置が使えません</h2><p>この URL では位置が使えません。https のページ（GitHub Pages など）で開いてください。</p>`)
    }
  }

  // 節を終えたら旅印（D4）
  function checkSections(): void {
    const done = story.sections.find(
      (s) => s.region === land.id && !progress.stampOf(s.id) && checkConditions(s.requires, progress, 'utsutsu'),
    )
    if (done) showStamp(done)
  }
  function showStamp(sec: SectionDef): void {
    const card = showSheet(`
      <p class="count">節を終えた</p>
      <h2>${escapeHtml(sec.title)}</h2>
      <p class="speaker">今日の道のりを、帳の巻末にしるしておこう。</p>
      <div class="uh-stamp-page"><div class="slot"></div></div>
      <button class="big" type="button" data-act="press">旅印を押す</button>
      <p class="soft">旅印は、現地で節を終えた記念です。売ったり譲ったりはできません。</p>`)
    const slot = card.querySelector('.slot') as HTMLDivElement
    const btn = card.querySelector('[data-act="press"]') as HTMLButtonElement
    let pressed = false
    btn.addEventListener('click', () => {
      if (pressed) {
        hideSheet()
        return
      }
      pressed = true
      if (progress.stamp(sec.id, 'utsutsu')) log(`stamp ${sec.id}`)
      const g = progress.stampOf(sec.id)
      slot.innerHTML = stampSvg({ title: sec.stampTitle, date: stampDate(g?.at ?? new Date().toISOString()), motif: sec.stampMotif })
      slot.classList.add('pressed')
      sound.bell(0.8)
      btn.textContent = 'とじる'
      ;(card.querySelector('.soft') as HTMLElement).textContent = '曼荼羅帳の巻末に、旅印を押しました。売ったり譲ったりはできません。'
    })
  }

  // 1秒に4回: 判定を進めて、画面に写す
  let lastBand = ''
  let transitShown = false
  let simTargetShown = false
  const handle = (ev: EngineEvent) => {
    log(`ev ${JSON.stringify(ev)}`)
    if (ev.type === 'bell') sound.bell(0.4)
    else if (ev.type === 'appear') {
      const sp = land.spots.find((s) => s.id === ev.spotId)
      if (sp?.yokaiId && encounter.open(sp.id, sp.yokaiId)) root.classList.add('talking')
    } else if (ev.type === 'faint') toast('……誰かいる。でも、まだ姿は見えないね。')
    else if (ev.type === 'transit-enter') {
      encounter.stop()
      mandala.close()
    } else if (ev.type === 'transit-exit') toast('着いたね。')
    else if (ev.type === 'rest-enter') encounter.stop()
    else if (ev.type === 'phase' && ev.phase === 'oumagatoki') toast('暗くなる前に、帰ろう。')
  }
  const stationMin = (): number | null => {
    const pos = engine.view.position
    if (!pos || !land.map.stations.length) return null
    const d = Math.min(...land.map.stations.map(([x, z]) => Math.hypot(x - pos.x, z - pos.z)))
    // 直線の 1.3 倍の道のりを、分速 70m で歩くとみなす（目安）
    return Math.max(1, Math.ceil((d * 1.3) / 70))
  }
  window.setInterval(() => {
    const now = Date.now()
    const busy = encounter.isOpen || mandala.isOpen || sheetOpen()
    for (const ev of engine.tick(now, now + (S?.clockOffset ?? 0), busy)) handle(ev)
    const v = engine.view
    const ph = v.phase.phase
    root.dataset.time = ph === 'day' ? 'day' : ph === 'oumagatoki' ? 'dusk' : 'night'
    map.setPhase(ph)
    map.setMe(v.position)
    map.setKehai(
      v.kehai.map((k) => {
        const sp = land.spots.find((s) => s.id === k.spotId)!
        return { spotId: k.spotId, x: sp.x, z: sp.z, strength: k.strength }
      }),
      v.motion === 'stopped',
      v.near ? { spotId: v.near.spotId, v: v.clearing } : null,
    )
    if (sim && !sim.moving && simTargetShown) {
      map.setSimTarget(null)
      simTargetShown = false
    } else if (sim?.moving) simTargetShown = true

    // 道中（D3）
    if (v.motion === 'transit' && !transitShown) {
      transitShown = true
      showSheet(`${mashiroSvg(true)}<h2>道中</h2><p class="speaker" style="text-align:left">……すう。</p><p>道中は、ましろが眠っている。</p><p class="soft">乗り物で移動している間は、遊べません。降りて歩き出すと、目を覚まします。</p>`, 'transit')
    } else if (v.motion !== 'transit' && transitShown) {
      transitShown = false
      hideSheet()
    }

    // 状態の帯
    const [world, plain] = bandText(v, stationMin(), geoProblem)
    const html = `<b>${escapeHtml(world)}</b><span>${escapeHtml(plain)}</span>`
    if (html !== lastBand) {
      band.innerHTML = html
      band.classList.toggle('rest', v.motion === 'rest')
      lastBand = html
    }
    // 上の小さな知らせ（遠すぎる・暗くなるまで・画面の点灯）
    let chipText = ''
    const pos = v.position
    if (pos && Math.hypot(pos.x, pos.z) > FAR_M && kind === 'gps') chipText = `ここは「${land.name}」から約${(Math.hypot(pos.x, pos.z) / 1000).toFixed(1)}km 離れています`
    else if (ph === 'day' && v.phase.minutesToOumagatoki !== null && v.phase.minutesToOumagatoki <= 60 && v.phase.minutesToDark !== null) {
      const sm = stationMin()
      chipText = `暗くなるまで あと${v.phase.minutesToDark}分${sm !== null ? `・駅まで歩いて約${sm}分` : ''}`
    } else if (geoProblem === 'no-wake-lock') chipText = '画面が自動で消えると、位置が止まります'
    if (chip.textContent !== chipText) chip.textContent = chipText

    // 「足を止めた」
    const showStop = !!v.near && (v.block === null || v.block === 'busy') && !encounter.isOpen && !busy
    stopBtn.classList.toggle('on', showStop)
    ring.style.strokeDashoffset = (C * (1 - v.clearing)).toFixed(2)

    if (dbg) {
      const f = engine.lastFix
      dbg.textContent = [
        `motion ${v.motion} block ${v.block ?? '-'}`,
        `phase ${ph} 逢魔まで ${v.phase.minutesToOumagatoki ?? '-'}分`,
        `fix ${f ? `±${f.acc.toFixed(0)}m spd ${f.spd?.toFixed(1) ?? '-'} age ${((now - f.t) / 1000).toFixed(0)}s` : '-'} n=${engine.fixes.length}`,
        `speed10s ${v.speed?.toFixed(2) ?? '-'}`,
        `near ${v.near ? `${v.near.spotId} ${v.near.distM.toFixed(0)}m` : '-'} clear ${v.clearing.toFixed(2)}`,
        `kehai ${v.kehai.map((k) => `${k.spotId}:${k.distM.toFixed(0)}`).join(' ') || '-'}`,
      ].join('\n')
    }
  }, 250)

  stopBtn.addEventListener('click', () => {
    sound.unlock()
    const r = engine.pressStop(Date.now())
    log(`press-stop ${r}`)
    if (r === 'moving') toast('止まってから、もう一度。')
    else if (r === 'nothing') toast('このあたりには、気配がないみたい。')
  })
}

/** 状態の帯の言葉（世界の言葉、普通の言葉）。04 §5.3、01-app-ux §3.3 */
function bandText(v: UtsutsuEngine['view'], stationMin: number | null, geo: GeoProblem): [string, string] {
  if (geo === 'unavailable') return ['ここは、空が遠いね', '位置が取れません。空が見える所で少し待ってください']
  switch (v.motion) {
    case 'locating':
      return ['ましろが、風のにおいをかいでいる…', '位置を探しています。空が見える所で少し待ってください']
    case 'weak':
      return ['ここは、空が遠いね', '位置が不安定です。空が見える所で少し待ってください']
    case 'transit':
      return ['道中は、ましろが眠っている', '乗り物で移動している間は、遊べません']
    case 'rest':
      return ['ここから先は、祈りの場所。妖怪は外で待っている', '境内などでは、ゲームを止めています']
  }
  if (v.phase.phase === 'oumagatoki')
    return ['逢魔が時。妖怪たちも帰っていく', `暗くなる前に帰りましょう${stationMin !== null ? `（駅まで歩いて約${stationMin}分）` : ''}`]
  if (v.phase.phase === 'night') return ['夜は、気配だけ', '夜は出会いがありません。明るいうちに来てください']
  const near = v.near
  if (near && v.motion === 'stopped' && v.clearing > 0) return ['気配が、澄んでいく…', 'そのまま、少し待ってください']
  if (near && v.motion === 'stopped') return ['このあたりに、誰かいる', '「足を止めた」を押すと、気配が澄みます']
  if (near) return ['このあたりだ。足を止めてみよう', '立ち止まると、気配が澄みます']
  const k = v.kehai[0]
  if (k) {
    const d = Math.max(10, Math.round(k.distM / 10) * 10)
    return ['どこかに、気配がある', `近くに気配があります（約${d}m）。近づいたら立ち止まってみてください`]
  }
  return v.motion === 'stopped' ? ['しずかだね', '近くに気配はありません。地図の札の方へ歩いてみてください'] : ['気配は、まだ遠い', '画面を開いたまま、ポケットに入れて歩けます']
}

// ---------------------------------------------------------------- 位置シミュレーター（開発用。F-06）

function simPanel(sim: SimSource, land: Land, map: MapView, setClock: (offsetMs: number) => void): HTMLElement {
  const d = el('details', 'uh-sim') as HTMLDetailsElement
  // スマホの幅では、たたんだ状態で始める（地図を広く見せる）
  d.open = window.innerWidth > 600
  const spotBtns = land.spots.map((s, i) => `<button type="button" data-spot="${i}">${escapeHtml(s.yokaiId ? (story.yokai[s.yokaiId]?.name ?? s.id) : s.id)}</button>`).join('')
  d.innerHTML = `<summary>位置シミュレーター（開発用）</summary>
    <div class="g"><span>タップ</span><button type="button" data-tap="walk" aria-pressed="true">歩いて行く</button><button type="button" data-tap="jump" aria-pressed="false">瞬間移動</button></div>
    <div class="g"><span>速さ</span><button type="button" data-speed="1.3" aria-pressed="true">歩く</button><button type="button" data-speed="3.2">走る</button><button type="button" data-speed="11">乗り物</button><button type="button" data-halt>止まる</button></div>
    <div class="g"><span>精度</span><button type="button" data-acc="6" aria-pressed="true">±6m</button><button type="button" data-acc="18">±18m</button><button type="button" data-acc="45">±45m</button></div>
    <div class="g"><span>時刻</span><button type="button" data-clock="real" aria-pressed="true">いま</button><button type="button" data-clock="day">昼</button><button type="button" data-clock="before">暗くなる前</button><button type="button" data-clock="ouma">逢魔が時</button><button type="button" data-clock="night">夜</button></div>
    <div class="g"><span>地点へ</span>${spotBtns}</div>
    <div class="g"><label><input type="checkbox" data-nospd> 端末の速さなし</label><label><input type="checkbox" data-pause> 止まると更新を休む</label></div>`
  let tapMode: 'walk' | 'jump' = 'walk'
  const press = (sel: string, b: HTMLElement) => {
    d.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', 'false'))
    b.setAttribute('aria-pressed', 'true')
  }
  d.querySelectorAll<HTMLButtonElement>('[data-tap]').forEach((b) =>
    b.addEventListener('click', () => {
      tapMode = b.dataset.tap as 'walk' | 'jump'
      press('[data-tap]', b)
    }),
  )
  // タップの動きを差し替える（瞬間移動のとき）
  const origWalk = sim.walkTo.bind(sim)
  sim.walkTo = (x: number, z: number) => (tapMode === 'jump' ? sim.teleport(x, z) : origWalk(x, z))
  d.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      sim.settings.speed = Number(b.dataset.speed)
      press('[data-speed]', b)
    }),
  )
  d.querySelector<HTMLButtonElement>('[data-halt]')!.addEventListener('click', () => {
    sim.halt()
    map.setSimTarget(null)
  })
  d.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((b) =>
    b.addEventListener('click', () => {
      sim.settings.acc = Number(b.dataset.acc)
      press('[data-acc]', b)
    }),
  )
  d.querySelectorAll<HTMLButtonElement>('[data-clock]').forEach((b) =>
    b.addEventListener('click', () => {
      press('[data-clock]', b)
      const now = Date.now()
      const st = sunTimes(new Date(now), land.origin.lat, land.origin.lon)
      const sunset = st.sunset ?? now
      const noon = (st.sunrise ?? now) + (sunset - (st.sunrise ?? now)) / 2
      const target = { real: now, day: noon, before: sunset - 75 * 60_000, ouma: sunset - 10 * 60_000, night: sunset + 90 * 60_000 }[b.dataset.clock as 'real']
      setClock(target - now)
    }),
  )
  d.querySelectorAll<HTMLButtonElement>('[data-spot]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = land.spots[Number(b.dataset.spot)]
      // 地点のすぐ手前（12m）まで歩く
      const dx = s.x - sim.x
      const dz = s.z - sim.z
      const dist = Math.hypot(dx, dz) || 1
      const k = Math.max(0, dist - 12) / dist
      const p = { x: sim.x + dx * k, z: sim.z + dz * k }
      origWalk(p.x, p.z)
      map.setSimTarget(p)
    }),
  )
  d.querySelector<HTMLInputElement>('[data-nospd]')!.addEventListener('change', (e) => (sim.settings.noDeviceSpeed = (e.target as HTMLInputElement).checked))
  d.querySelector<HTMLInputElement>('[data-pause]')!.addEventListener('change', (e) => (sim.settings.pauseWhenStill = (e.target as HTMLInputElement).checked))
  return d
}

// はじめる
if (params.get('land') === 'test' && params.has('sim')) {
  const t = loadTestLand()
  if (t) startSession(testLand(t), 'sim')
  else showStart()
} else if (params.has('sim') && params.get('autostart') === '1') startSession(iwakurajiLand(), 'sim')
else showStart()
// テスト用の土地を消す（?cleartest）
if (params.has('cleartest')) clearTestLand()
