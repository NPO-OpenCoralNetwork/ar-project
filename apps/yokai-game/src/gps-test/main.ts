// 段階0.5 GPS の検証ページの入口。
// PO が iPhone の Safari で、画面を開いたままポケットに入れて30分歩き、結果をチャットに貼るためのもの。
// 模擬モード: ?sim=1（&x=10 で10倍速、&autolabel=0 で正解ラベルの自動入力を止める、&seed=2 で別の歩き方、
//   &nospd=0.3 で歩いている間も端末の速さを30%で空にする、&stillpause=1 で止まって数秒後から更新を止める、
//   &labeldelay=6000 で自動ラベルの遅れを約6秒にする）
import './style.css'
import { audioState, playGoChime, playStopChime, playTick, resumeAudio, unlockAudio } from './chime'
import { makeFix, type RawPosition } from '../core/location/fix'
import { exportText, fmtDuration, summaryRows } from './report'
import { createSimWalker } from './sim'
import { summarize } from './stats'
import {
  DEFAULT_DETECTOR_CONFIG,
  initialDetectorState,
  stepDetector,
  type DetectorState,
  type StillEvaluation,
} from '../core/location/stop-detector'
import { drawTrack } from './track-canvas'
import type { SessionLog, StopKind } from './types'

// ---- 設定 ----
const params = new URLSearchParams(location.search)
const SIM = params.get('sim') === '1'
const SIM_X = SIM ? Math.min(100, Math.max(1, Number(params.get('x')) || 1)) : 1
const SIM_SEED = Number(params.get('seed')) || 1
const AUTOLABEL = SIM && params.get('autolabel') !== '0'
const SIM_NOSPD = SIM ? Math.min(1, Math.max(0, Number(params.get('nospd')) || 0)) : 0
const SIM_STILLPAUSE = SIM && params.get('stillpause') === '1'
const SIM_LABEL_DELAY = SIM ? Math.max(0, Number(params.get('labeldelay')) || 0) : 0
/** 記録の保存場所。いちばん新しい記録（last）と、ひとつ前の記録（prev）の2つを残す */
const STORAGE_KEY = 'yokai.gpsTest.v1.last'
const STORAGE_KEY_PREV = 'yokai.gpsTest.v1.prev'
type StoreKey = typeof STORAGE_KEY | typeof STORAGE_KEY_PREV
/** 表示中なのに、これだけ位置が来なければ watchPosition を張り直す（実時間 ms） */
const REWATCH_AFTER_MS = 15_000
/** 画面が戻ってから、これだけ位置が来なければ張り直す（実時間 ms） */
const REWATCH_AFTER_VISIBLE_MS = 5_000
/** 反対側のラベルのボタンを、これより短い間に押したら誤タッチとみなす（ms） */
const OPPOSITE_LABEL_GUARD_MS = 3_000

// 模擬モードでは時計を速められる（判定も集計もこの時計で動く）
const realBase = Date.now()
const now = (): number => (SIM ? realBase + (Date.now() - realBase) * SIM_X : Date.now())

// ---- 画面 ----
const app = document.getElementById('app')!
app.innerHTML = `
  <h1>GPS の検証 <span class="badge ${SIM ? '' : 'hidden'}">模擬モード${SIM_X > 1 ? `（${SIM_X}倍速）` : ''}</span></h1>
  <div id="banners"></div>

  <section id="view-intro" class="hidden">
    <button id="btn-show-last" type="button" class="hidden" style="width:100%;margin:0 0 8px">前回の記録を見る</button>
    <button id="btn-show-prev" type="button" class="hidden" style="width:100%;margin:0 0 12px">ひとつ前の記録を見る</button>
    <div class="card howto">
      <h2>使い方</h2>
      <ol>
        <li>消音（マナーモード）を外し、音量を上げておきます。</li>
        <li>いまの電池残量（%）を入れて「はじめる」。位置情報の確認が出たら「許可」を選びます。</li>
        <li><b>画面を開いたままポケットへ。</b>画面は消えないようにしてあります。</li>
        <li><b>止まったら「いま止まった」</b>を押し、10秒ほどそのまま待ちます。音が鳴って画面が青緑に変われば、判定が出た合図です。</li>
        <li><b>歩き出すときに「歩き始めた」</b>を押します。片方を押してから3秒以内のもう片方は、誤タッチとして記録しません。</li>
        <li>信号待ち、景色を眺める、立ち話など、いろいろな止まり方を10回ほど。30分ほど歩いたら「終える」を押します。</li>
        <li>終わりの電池残量を入れて「コピー」し、チャットに貼ってください。</li>
      </ol>
      <p class="note">記録はこの端末の中だけに、新しいものから2回分残ります（どこにも送りません）。書き出しは、既定では緯度経度を含めず、開始地点からの距離（m）だけにします。<br>歩くときは、いつも通り車や足元に気をつけてください。</p>
    </div>
    <div class="card stack">
      <label class="field">開始の電池残量 <input id="bat-start" type="number" inputmode="numeric" min="0" max="100" placeholder="例 85"> %</label>
      <p class="note" style="margin:0">iPhone は電池の値をページから読めないので、手で入れてください（設定 → バッテリー、またはコントロールセンター）。</p>
      <button id="btn-sound" type="button">音を確かめる</button>
      <button id="btn-start" type="button" class="btn-primary btn-big">はじめる</button>
    </div>
  </section>

  <section id="view-run" class="hidden">
    <div id="status" class="status waiting">
      <div class="big" id="status-big">位置を待っています…</div>
      <div class="sub" id="status-sub">はじめての位置が来るまで、少し時間がかかることがあります</div>
    </div>
    <div class="labels">
      <button id="btn-label-stop" type="button" class="btn-label-stop">いま止まった<small>止まってすぐ押す</small></button>
      <button id="btn-label-go" type="button" class="btn-label-go">歩き始めた<small>歩き出すときに押す</small></button>
    </div>
    <div class="toast" id="toast" aria-live="polite"></div>
    <div class="metrics">
      <div class="metric"><div class="k">経過</div><div class="v" id="m-elapsed">0:00</div></div>
      <div class="metric"><div class="k">最後の更新</div><div class="v" id="m-age">—</div></div>
      <div class="metric"><div class="k">精度</div><div class="v" id="m-acc">—</div></div>
      <div class="metric"><div class="k">速さ（端末／計算）</div><div class="v" id="m-spd">—</div></div>
      <div class="metric"><div class="k">画面の点灯</div><div class="v" id="m-wake">—</div></div>
      <div class="metric"><div class="k">空白（10秒以上）</div><div class="v" id="m-gaps">0回</div></div>
      <div class="metric"><div class="k">判定「止まった」</div><div class="v" id="m-dets">0回</div></div>
      <div class="metric"><div class="k">正解のラベル</div><div class="v" id="m-labels">0回</div></div>
    </div>
    <p class="debug" id="debug"></p>
    <div class="card">
      <h2>軌跡</h2>
      <canvas id="track-run" class="track"></canvas>
      <div class="legend" id="legend-run"></div>
    </div>
    <details class="card">
      <summary>いまの集計</summary>
      <table class="summary" id="live-summary"></table>
    </details>
    <div class="row">
      <button id="btn-undo" type="button">最後のラベルを取り消す</button>
      <button id="btn-end" type="button">終える</button>
    </div>
  </section>

  <section id="view-end" class="hidden">
    <div class="card stack">
      <h2>集計</h2>
      <label class="field">開始の電池残量 <input id="bat-start-2" type="number" inputmode="numeric" min="0" max="100"> %</label>
      <label class="field">終わりの電池残量 <input id="bat-end" type="number" inputmode="numeric" min="0" max="100" placeholder="例 80"> %</label>
      <table class="summary" id="end-summary"></table>
    </div>
    <div class="card">
      <h2>軌跡</h2>
      <canvas id="track-end" class="track"></canvas>
      <div class="legend" id="legend-end"></div>
    </div>
    <div class="card stack">
      <h2>チャットに貼る</h2>
      <label class="field" style="display:block">メモ（天気、ポケットの場所、道の様子など）
        <textarea id="memo" rows="2" placeholder="例: 晴れ。ズボンの前ポケット。住宅街と川沿い。"></textarea>
      </label>
      <label class="check"><input type="checkbox" id="opt-raw" checked> 生ログ（位置の一つひとつ）も含める</label>
      <label class="check"><input type="checkbox" id="opt-latlon"> 緯度経度も含める（自宅の場所が分かるので、ふだんは外したまま）</label>
      <button id="btn-copy" type="button" class="btn-primary btn-big">コピーする</button>
      <div class="toast" id="copy-msg" aria-live="polite"></div>
      <textarea id="export" class="export" readonly></textarea>
      <button id="btn-new" type="button">新しく記録する</button>
    </div>
  </section>
`

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const LEGEND = `
  <span><i style="background:#1e7a3a"></i>開始</span>
  <span><i style="background:#2b2b2b;border-radius:2px;height:4px;vertical-align:3px"></i>軌跡</span>
  <span><i style="background:#c0392b;border-radius:2px;height:4px;vertical-align:3px"></i>空白</span>
  <span><i style="border:3px solid #0b7a75;background:transparent"></i>判定「止まった」</span>
  <span><i style="background:#7a2e8e;border-radius:0;clip-path:polygon(0 0,100% 0,50% 100%)"></i>「いま止まった」</span>
  <span><i style="background:#e08a1e"></i>精度30m超</span>`
$('legend-run').innerHTML = LEGEND
$('legend-end').innerHTML = LEGEND

function show(view: 'intro' | 'run' | 'end'): void {
  for (const v of ['intro', 'run', 'end']) $(`view-${v}`).classList.toggle('hidden', v !== view)
  window.scrollTo(0, 0)
}

const banners = new Map<string, { text: string; bad: boolean }>()
function setBanner(key: string, text: string | null, bad = false): void {
  if (text === null) banners.delete(key)
  else banners.set(key, { text, bad })
  $('banners').innerHTML = [...banners.values()]
    .map((b) => `<div class="banner ${b.bad ? 'bad' : ''}">${b.text}</div>`)
    .join('')
}

function parsePct(el: HTMLInputElement): number | null {
  if (el.value.trim() === '') return null
  const v = Number(el.value)
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString('ja-JP', { hour12: false })
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ---- 保存 ----
/** いま開いている記録の保存場所（前の記録を開いているときは prev） */
let logKey: StoreKey = STORAGE_KEY

function save(log: SessionLog, key: StoreKey = logKey): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: now(), log }))
  } catch {
    setBanner('storage', 'この端末に記録を保存できませんでした（プライベートブラウズでは保存されません）。終わったらすぐコピーしてください。')
  }
}

function readRaw(key: StoreKey): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * 新しく記録を始める前に、いちばん新しい記録を「ひとつ前」へ移す。
 * 消えてしまう記録（ひとつ前の記録）がまだコピーされていなければ、確かめる。false なら始めない
 */
function rotateBeforeStart(): boolean {
  const last = readRaw(STORAGE_KEY)
  if (!last) return true
  const prev = loadSaved(false, STORAGE_KEY_PREV)
  if (prev && !prev.copiedAt) {
    const when = new Date(prev.startedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    if (!window.confirm(`ひとつ前の記録（${when}）は、まだコピーしていません。\n新しく始めると、その記録は消えます。始めますか？`)) return false
  }
  try {
    localStorage.setItem(STORAGE_KEY_PREV, last)
  } catch {
    // 容量が足りないときは、ひとつ前の記録を消してからもう一度
    try {
      localStorage.removeItem(STORAGE_KEY_PREV)
      localStorage.setItem(STORAGE_KEY_PREV, last)
    } catch {
      const lastLog = loadSaved(false, STORAGE_KEY)
      if (lastLog && !lastLog.copiedAt && !window.confirm('保存の容量が足りないため、前回の記録を残せません。前回の記録はまだコピーしていません。消して始めますか？')) {
        return false
      }
    }
  }
  return true
}

function loadSaved(withBanner = true, key: StoreKey = STORAGE_KEY): SessionLog | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw) as { savedAt: number; log: SessionLog }
    if (!data?.log || data.log.version !== 1 || !Array.isArray(data.log.fixes)) return null
    const log = data.log
    if (log.endedAt === null) {
      // 途中で再読み込みなどがあった記録。保存した時刻で終わったことにする
      const lastFix = log.fixes[log.fixes.length - 1]?.t ?? log.startedAt
      log.endedAt = Math.max(data.savedAt, lastFix)
      for (const h of log.hidden) if (h.end === null) h.end = log.endedAt
      if (withBanner) setBanner('restored', '前回の記録は、終える前に画面が閉じられていました。保存できたところまでを表示しています。')
    }
    return log
  } catch {
    return null
  }
}

// ---- 記録中の状態 ----
let log: SessionLog | null = null
let running = false
let det: DetectorState = initialDetectorState(0)
let lastEval: StillEvaluation | null = null
let watchId: number | null = null
let simTimer: number | null = null
let tickTimer: number | null = null
let wakeSentinel: WakeLockSentinel | null = null
let lastSaveReal = 0
/** 最後に位置が届いた実時間（watchPosition の見張り用） */
let lastFixReal = 0
/** 最後に watchPosition を張った実時間 */
let lastWatchReal = 0
/** 画面が戻った実時間（戻ってから位置が来るかの見張り用。0 なら見張らない） */
let visibleSinceReal = 0
/** 位置情報が拒否された（張り直しても無駄なので止める） */
let geoDenied = false
let wakeRetryTimer: number | null = null
let lastTrackDrawReal = 0
let lastLiveSummaryReal = 0
const autoLabels: { type: StopKind; t: number }[] = []

function newLog(): SessionLog {
  return {
    version: 1,
    startedAt: now(),
    endedAt: null,
    sim: SIM,
    userAgent: navigator.userAgent,
    origin: null,
    fixes: [],
    detections: [],
    labels: [],
    hidden: [],
    wakeLock: [],
    errors: [],
    battery: { start: parsePct($<HTMLInputElement>('bat-start')), end: null },
    memo: '',
  }
}

// ---- 画面の点灯（Screen Wake Lock） ----
async function acquireWakeLock(): Promise<void> {
  if (!log) return
  if (!('wakeLock' in navigator)) {
    log.wakeLock.push({ t: now(), ev: 'unsupported' })
    setBanner(
      'wake',
      'この端末では画面を点けたままにできません。設定 → 画面表示と明るさ → 自動ロック を「なし」にしてから歩いてください（終わったら戻してください）。',
      true,
    )
    renderLive()
    return
  }
  if (wakeSentinel && !wakeSentinel.released) return
  try {
    const s = await navigator.wakeLock.request('screen')
    wakeSentinel = s
    log.wakeLock.push({ t: now(), ev: 'acquired' })
    setBanner('wake', null)
    s.addEventListener('release', () => {
      if (log && running) log.wakeLock.push({ t: now(), ev: 'released' })
      renderLive()
      // 表示中に外れた（低電力モードの切り替えなど）なら、少し待って取り直す
      if (running && document.visibilityState === 'visible') {
        if (wakeRetryTimer !== null) window.clearTimeout(wakeRetryTimer)
        wakeRetryTimer = window.setTimeout(() => {
          wakeRetryTimer = null
          if (running && document.visibilityState === 'visible') void acquireWakeLock()
        }, 1000)
      }
    })
  } catch (e) {
    log.wakeLock.push({ t: now(), ev: 'failed', msg: String((e as Error)?.message ?? e) })
    setBanner(
      'wake',
      '画面を点けたままにできませんでした（低電力モードでは取れないことがあります）。設定 → 画面表示と明るさ → 自動ロック を「なし」にしてから歩いてください。',
      true,
    )
  }
  renderLive()
}

function wakeText(): { text: string; bad: boolean } {
  if (!log) return { text: '—', bad: false }
  if (wakeSentinel && !wakeSentinel.released) return { text: '保持中', bad: false }
  const last = log.wakeLock[log.wakeLock.length - 1]
  if (!last) return { text: '確認中', bad: false }
  if (last.ev === 'unsupported') return { text: '使えない', bad: true }
  if (last.ev === 'failed') return { text: '取れない', bad: true }
  return { text: '外れている', bad: true }
}

// ---- 位置 ----
function onRaw(raw: RawPosition): void {
  if (!log || !running) return
  const t = now()
  if (!log.origin) log.origin = { lat: raw.lat, lon: raw.lon }
  const prev = log.fixes[log.fixes.length - 1] ?? null
  log.fixes.push(makeFix(raw, t, log.origin, prev))
  lastFixReal = Date.now()
  visibleSinceReal = 0
  // 一時的に取れなかった位置が戻ったら、知らせを消す
  if (!geoDenied) setBanner('geo', null)
  if (raw.acc > 500) {
    setBanner('coarse', '位置の精度がとても粗いです。設定 → プライバシーとセキュリティ → 位置情報サービス → Safari の Web サイト で「正確な位置情報」をオンにしてください。')
  } else if (raw.acc < 100) {
    setBanner('coarse', null)
  }
  runDetector(t)
  renderLive()
}

function onGeoError(err: GeolocationPositionError): void {
  if (!log) return
  log.errors.push({ t: now(), code: err.code, msg: err.message })
  if (err.code === err.PERMISSION_DENIED) {
    // 張り直しても位置は来ないので止める。記録はここまで保存しておく
    geoDenied = true
    stopGeolocation()
    save(log)
    setBanner(
      'geo',
      '位置情報の利用が許可されていません。設定 → プライバシーとセキュリティ → 位置情報サービス → Safari の Web サイト を「使用中のみ」にし、「正確な位置情報」をオンにしてください。設定を変えたら、<b>このページを再読み込み</b>してから、もう一度はじめてください（ここまでの記録は保存してあります）。',
      true,
    )
  } else {
    setBanner('geo', `位置が取れていません（${err.code === err.TIMEOUT ? '時間切れ' : '位置が分からない'}）。空の見えるところへ出ると戻ることがあります。`)
  }
  renderLive()
}

function startGeolocation(): void {
  if (SIM) {
    const walker = createSimWalker(SIM_SEED, undefined, { noSpeedRatio: SIM_NOSPD, stillPause: SIM_STILLPAUSE })
    simTimer = window.setInterval(() => {
      const smp = walker.next()
      const t = now()
      if (AUTOLABEL && smp.truth) {
        // 人がポケットから出して押すまでの遅れ（既定 1.5〜4秒。&labeldelay で変えられる）を真似る
        const delay = SIM_LABEL_DELAY > 0 ? SIM_LABEL_DELAY * (0.75 + Math.random() * 0.5) : 1500 + Math.random() * 2500
        autoLabels.push({ type: smp.truth, t: t + delay })
      }
      // iPhone では、画面が非表示の間は位置が来ない。模擬でも捨てる
      if (smp.fix && !document.hidden) onRaw({ ...smp.fix, pt: t - 150 })
    }, 1000 / SIM_X)
    return
  }
  if (!('geolocation' in navigator)) {
    setBanner('geo', 'この端末（ブラウザ）は位置情報に対応していません。', true)
    return
  }
  watchGeolocation()
}

/** watchPosition を張る（張り直しにも使う） */
function watchGeolocation(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  lastWatchReal = Date.now()
  watchId = navigator.geolocation.watchPosition(
    (p) =>
      onRaw({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        acc: p.coords.accuracy,
        spd: p.coords.speed,
        hdg: p.coords.heading,
        pt: p.timestamp,
      }),
    onGeoError,
    { enableHighAccuracy: true, maximumAge: 0 },
  )
}

/**
 * 位置の途切れの見張り。表示中なのに長く位置が来ない、または画面が戻ってから位置が来ないときは、
 * watchPosition を張り直す（iOS ではバックグラウンドから戻ったあと通知が止まったままになる例がある）
 */
function watchdog(): void {
  if (SIM || !log || !running || geoDenied || watchId === null) return
  if (document.visibilityState !== 'visible') return
  const real = Date.now()
  const sinceFix = real - Math.max(lastFixReal, lastWatchReal)
  const afterVisible = visibleSinceReal > 0 && real - visibleSinceReal > REWATCH_AFTER_VISIBLE_MS && lastFixReal < visibleSinceReal
  if (sinceFix > REWATCH_AFTER_MS || afterVisible) {
    log.errors.push({ t: now(), code: 0, msg: afterVisible ? 'rewatch (visible)' : 'rewatch' })
    visibleSinceReal = 0
    watchGeolocation()
    setBanner('geo', '位置がしばらく来ないので、位置の取得をやり直しています。空の見えるところへ出ると戻ることがあります。')
  }
}

function stopGeolocation(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  if (simTimer !== null) window.clearInterval(simTimer)
  watchId = null
  simTimer = null
}

// ---- 判定 ----
function runDetector(t: number): void {
  if (!log) return
  const r = stepDetector(det, log.fixes, t, DEFAULT_DETECTOR_CONFIG)
  det = r.state
  lastEval = r.evaluation
  if (!r.detection) return
  log.detections.push(r.detection)
  if (r.detection.type === 'stop') playStopChime()
  else playGoChime()
}

function tick(): void {
  if (!log || !running) return
  const t = now()
  while (autoLabels.length && autoLabels[0].t <= t) {
    const a = autoLabels.shift()!
    addLabel(a.type, a.t, true)
  }
  runDetector(t)
  watchdog()
  renderLive()
  if (Date.now() - lastSaveReal > 10_000) {
    save(log)
    lastSaveReal = Date.now()
  }
}

// ---- 正解のラベル ----
let toastTimer: number | null = null
function toast(text: string): void {
  $('toast').textContent = text
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => ($('toast').textContent = ''), 5000)
}

function addLabel(type: StopKind, t = now(), auto = false): void {
  if (!log || !running) return
  const last = [...log.labels].reverse().find((l) => l.type === type)
  if (last && t - last.t < 3000) return // ポケットの中での連打を無視する
  if (!auto) {
    // 反対側のボタンをすぐ押したのは、ポケットの中での誤タッチとみなす
    const latest = log.labels[log.labels.length - 1]
    if (latest && latest.type !== type && t - latest.t < OPPOSITE_LABEL_GUARD_MS) {
      toast(`続けて押されたので記録しませんでした（反対のボタンは ${OPPOSITE_LABEL_GUARD_MS / 1000}秒あけて押してください）`)
      return
    }
    // ボタンを押したとき（ユーザー操作の中）に、音と画面の点灯を取り直しておく
    if (audioState() !== 'running') unlockAudio()
    if (!wakeSentinel || wakeSentinel.released) void acquireWakeLock()
  }
  log.labels.push({ type, t })
  log.labels.sort((a, b) => a.t - b.t)
  if (!auto) playTick()
  toast(`${auto ? '（自動）' : ''}記録しました: ${type === 'stop' ? 'いま止まった' : '歩き始めた'}（${clock(t)}）`)
  save(log)
  renderLive()
}

function undoLabel(): void {
  if (!log || log.labels.length === 0) {
    toast('取り消すラベルはありません')
    return
  }
  const l = log.labels[log.labels.length - 1]
  const name = l.type === 'stop' ? 'いま止まった' : '歩き始めた'
  if (!window.confirm(`最後のラベル「${name}」（${clock(l.t)}）を取り消しますか？`)) return
  log.labels.pop()
  toast(`取り消しました: ${l.type === 'stop' ? 'いま止まった' : '歩き始めた'}（${clock(l.t)}）`)
  save(log)
  renderLive()
}

// ---- 表示（記録中） ----
function renderLive(): void {
  if (!log || !running) return
  const t = now()
  const last = log.fixes[log.fixes.length - 1]
  const status = $('status')
  const still = det.mode === 'stopped'
  document.body.classList.toggle('is-still', still)
  status.classList.toggle('still', still)
  status.classList.toggle('waiting', !last)
  if (!last) {
    $('status-big').textContent = '位置を待っています…'
    $('status-sub').textContent = 'はじめての位置が来るまで、少し時間がかかることがあります'
  } else if (still) {
    $('status-big').textContent = '止まった — 澄みました'
    $('status-sub').textContent = `${mmss(t - det.since)} 止まっています。歩き出すと元に戻ります`
  } else {
    $('status-big').textContent = '歩いています'
    $('status-sub').textContent = '立ち止まると、ここが青緑に変わって音が鳴ります'
  }

  $('m-elapsed').textContent = mmss(t - log.startedAt)
  const age = last ? t - last.t : Infinity
  const ageEl = $('m-age')
  ageEl.textContent = last ? `${Math.round(age / 1000)}秒前` : '—'
  ageEl.classList.toggle('bad', age >= 10_000)
  $('m-acc').textContent = last ? `±${Math.round(last.acc)}m` : '—'
  $('m-acc').classList.toggle('bad', !!last && last.acc > 30)
  $('m-spd').textContent = last
    ? `${last.spd === null ? '—' : last.spd.toFixed(1)}／${last.calcSpd === null ? '—' : last.calcSpd.toFixed(1)} m/s`
    : '—'
  const w = wakeText()
  $('m-wake').textContent = w.text
  $('m-wake').classList.toggle('bad', w.bad)
  // 音が止まっている（iOS で画面が戻ったあとなど）ときは、操作を頼む
  const audio = audioState()
  setBanner(
    'audio',
    audio !== 'running' && audio !== 'none' ? '音が止まっています。画面のどこかを一度押してください（判定の音が鳴らなくなります）。' : null,
    true,
  )

  const s = summarize(log, t)
  $('m-gaps').textContent = `${s.gapCount}回${s.gapLongestMs ? `（最長${Math.round(s.gapLongestMs / 1000)}秒）` : ''}`
  $('m-dets').textContent = `${log.detections.filter((d) => d.type === 'stop').length}回`
  const ls = log.labels.filter((l) => l.type === 'stop').length
  $('m-labels').textContent = `止${ls}・歩${log.labels.length - ls}`

  const e = lastEval
  $('debug').textContent = e
    ? `判定の中身: 広がり ${Number.isFinite(e.spreadM) ? e.spreadM.toFixed(1) : '—'}m／許容 ${e.radiusM.toFixed(1)}m・` +
      `速さ ${Number.isFinite(e.netSpeed) ? e.netSpeed.toFixed(2) : '—'}m/s・端末 ${e.deviceSpeed === null ? '—' : e.deviceSpeed.toFixed(2)}m/s・` +
      `位置${e.n}個・${e.reason}・方位 ${last?.hdg === null || !last ? '—' : `${Math.round(last.hdg)}°`}・音 ${audioState()}`
    : ''

  if (Date.now() - lastTrackDrawReal > 1000) {
    drawTrack($<HTMLCanvasElement>('track-run'), log, { showCurrent: true })
    lastTrackDrawReal = Date.now()
  }
  if (Date.now() - lastLiveSummaryReal > 3000) {
    renderSummaryTable($('live-summary'), summaryRows(s))
    lastLiveSummaryReal = Date.now()
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function renderSummaryTable(el: HTMLElement, rows: [string, string][]): void {
  el.innerHTML = rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')
}

// ---- 表示（終わったあと） ----
function exportOptions() {
  return {
    includeRaw: $<HTMLInputElement>('opt-raw').checked,
    includeLatLon: $<HTMLInputElement>('opt-latlon').checked,
  }
}

function renderEnd(): void {
  if (!log) return
  const s = summarize(log)
  renderSummaryTable($('end-summary'), summaryRows(s))
  $<HTMLTextAreaElement>('export').value = exportText(log, s, exportOptions())
  // 表示されてから描く（幅が決まってから）
  requestAnimationFrame(() => log && drawTrack($<HTMLCanvasElement>('track-end'), log, { showCurrent: false }))
}

function openEnd(l: SessionLog): void {
  log = l
  $<HTMLInputElement>('bat-start-2').value = l.battery.start === null ? '' : String(l.battery.start)
  $<HTMLInputElement>('bat-end').value = l.battery.end === null ? '' : String(l.battery.end)
  $<HTMLTextAreaElement>('memo').value = l.memo
  $('copy-msg').textContent = ''
  show('end')
  renderEnd()
}

// ---- 開始・終了 ----
function start(): void {
  unlockAudio()
  if (!SIM && !window.isSecureContext) {
    setBanner('https', 'このページは HTTPS で開いてください（位置情報が使えません）。', true)
    return
  }
  if (!rotateBeforeStart()) return
  logKey = STORAGE_KEY
  geoDenied = false
  lastFixReal = 0
  visibleSinceReal = 0
  setBanner('restored', null)
  setBanner('sim', null)
  log = newLog()
  det = initialDetectorState(log.startedAt)
  lastEval = null
  autoLabels.length = 0
  running = true
  lastTrackDrawReal = 0
  lastLiveSummaryReal = 0
  show('run')
  void acquireWakeLock()
  startGeolocation()
  tickTimer = window.setInterval(tick, Math.max(50, 1000 / SIM_X))
  save(log)
  renderLive()
}

function end(): void {
  if (!log || !running) return
  if (!window.confirm('記録を終えますか？')) return
  running = false
  stopGeolocation()
  if (tickTimer !== null) window.clearInterval(tickTimer)
  tickTimer = null
  const t = now()
  log.endedAt = t
  for (const h of log.hidden) if (h.end === null) h.end = t
  if (wakeSentinel && !wakeSentinel.released) void wakeSentinel.release()
  wakeSentinel = null
  document.body.classList.remove('is-still')
  if (wakeRetryTimer !== null) window.clearTimeout(wakeRetryTimer)
  wakeRetryTimer = null
  for (const k of ['wake', 'geo', 'coarse', 'audio']) setBanner(k, null)
  save(log)
  openEnd(log)
}

// ---- 画面の非表示 ----
document.addEventListener('visibilitychange', () => {
  if (!log || !running) return
  const t = now()
  if (document.visibilityState === 'hidden') {
    log.hidden.push({ start: t, end: null })
    save(log)
  } else {
    const h = log.hidden[log.hidden.length - 1]
    if (h && h.end === null) h.end = t
    visibleSinceReal = Date.now()
    resumeAudio()
    void acquireWakeLock()
    renderLive()
  }
})
window.addEventListener('pagehide', () => {
  if (log && running) save(log)
})

// ---- ボタン ----
$('btn-sound').addEventListener('click', () => {
  unlockAudio()
  playStopChime()
})
$('btn-start').addEventListener('click', start)
$('btn-show-last').addEventListener('click', () => {
  const l = loadSaved(true, STORAGE_KEY)
  if (l) {
    logKey = STORAGE_KEY
    openEnd(l)
  }
})
$('btn-show-prev').addEventListener('click', () => {
  const l = loadSaved(false, STORAGE_KEY_PREV)
  if (l) {
    logKey = STORAGE_KEY_PREV
    openEnd(l)
  }
})
// 音が止まっていたら、画面のどこかを押したときに戻す（iOS はユーザー操作の中でないと戻らない）
document.addEventListener(
  'pointerdown',
  () => {
    if (running && audioState() !== 'running') unlockAudio()
  },
  { capture: true },
)
$('btn-label-stop').addEventListener('click', () => addLabel('stop'))
$('btn-label-go').addEventListener('click', () => addLabel('go'))
$('btn-undo').addEventListener('click', undoLabel)
$('btn-end').addEventListener('click', end)
$('btn-new').addEventListener('click', () => {
  setBanner('restored', null)
  refreshSavedButtons()
  show('intro')
})

function onEndInput(): void {
  if (!log || running) return
  log.battery.start = parsePct($<HTMLInputElement>('bat-start-2'))
  log.battery.end = parsePct($<HTMLInputElement>('bat-end'))
  log.memo = $<HTMLTextAreaElement>('memo').value
  save(log)
  renderEnd()
}
for (const id of ['bat-start-2', 'bat-end', 'memo']) $(id).addEventListener('input', onEndInput)
for (const id of ['opt-raw', 'opt-latlon']) $(id).addEventListener('change', renderEnd)

$('btn-copy').addEventListener('click', async () => {
  const ta = $<HTMLTextAreaElement>('export')
  const msg = $('copy-msg')
  const markCopied = () => {
    if (!log || running) return
    log.copiedAt = now()
    save(log)
  }
  try {
    await navigator.clipboard.writeText(ta.value)
    msg.textContent = `コピーしました（${Math.round(ta.value.length / 1024)}KB）。チャットに貼ってください。`
    markCopied()
  } catch {
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    msg.textContent = ok
      ? 'コピーしました。チャットに貼ってください。'
      : 'コピーできませんでした。下の文字を選んだ状態にしたので、長押しして「コピー」を選んでください。'
    if (ok) markCopied()
  }
})

window.addEventListener('resize', () => {
  if (!log) return
  if (running) drawTrack($<HTMLCanvasElement>('track-run'), log, { showCurrent: true })
  else drawTrack($<HTMLCanvasElement>('track-end'), log, { showCurrent: false })
})

// ---- 最初の画面（使い方。前の記録があれば、それを開くボタンも出す） ----
function refreshSavedButtons(): void {
  const fmt = (l: SessionLog) =>
    `${new Date(l.startedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${l.copiedAt ? '' : '・未コピー'}`
  const last = loadSaved(false, STORAGE_KEY)
  const prev = loadSaved(false, STORAGE_KEY_PREV)
  if (last) $('btn-show-last').textContent = `前回の記録を見る（${fmt(last)}）`
  if (prev) $('btn-show-prev').textContent = `ひとつ前の記録を見る（${fmt(prev)}）`
  $('btn-show-last').classList.toggle('hidden', !last)
  $('btn-show-prev').classList.toggle('hidden', !prev)
}
show('intro')
refreshSavedButtons()
if (SIM) {
  setBanner('sim', `模擬モードです。偽の位置で「歩く→止まる→歩く」を繰り返します${AUTOLABEL ? '（正解のラベルも自動で入れます）' : ''}。`)
}
// 確認用（Playwright など）
;(window as unknown as { __gpsTest: unknown }).__gpsTest = { getLog: () => log, fmtDuration }
