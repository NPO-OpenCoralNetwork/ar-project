// 札スタジオ（試作）。生成 AI などで作った絵を、3D の札（three.js）に貼って確かめる開発用のページ。
// - 札: 角の丸い薄い板（geometry.ts）。表に絵と題、裏は全札共通の意匠、縁は別の素材。
//   本文と出典は 3D に描かず、札の下の HTML に出す（ゲームの cardHtml をそのまま使う。09 §4.5・§7.2）。
// - 合わせ方: 絵の窓の縦横比に合わせて自動で切り抜き（cover / contain）、拡大・位置・回転。
//   すべて UV（Texture.offset / repeat / rotation / center → Texture.matrix）で行い、画像そのものは変えない。
// - 状態: 空白・白描・彩色・金の縁取り（04 §3.6）。時間帯（昼・夕・夜）。
// - 書き出し: 設定を JSON でコピー。PNG の保存。
// - 置き方: 開発用。`npm run dev` の /card-studio.html と `npm run build:card`（dist-card）だけで使い、
//   本番の build（GitHub Pages）には入れない（09 §6.1）。
// 決まり: 本物のお札・護符・御朱印に似せない（05 §3.2）。伝承の札は題・本文・出典だけを見せる（F-43）。

import * as THREE from 'three'
import './style.css'
import lore from '../data/lore-cards.json'
import { CARD, cardLayout, makeCardGeometry, type FrameId } from './geometry'
import { COLORS, makeMaterials } from './materials'
import { drawSampleArt, drawUvGrid } from './sample-art'
import { BACK_SIZE, drawBackDesign, drawFrontTitle, waitFonts } from './text'
import { cardHtml, injectStyle } from '../yume/encounter/ui'
import type { LoreCard } from '../core/story/types'

// ---------------------------------------------------------------- 状態

type StageId = 'blank' | 'hakubyo' | 'saishiki' | 'kin'
type TimeId = 'day' | 'evening' | 'night'
type FitMode = 'cover' | 'contain'
type BandId = 'ai' | 'wakakusa' | 'fuji'

interface CardText {
  number: string
  title: string
  body: string
  source: string
}

interface StudioState {
  /** width・height は元の画像の大きさ。texture は縮めた時の大きさ（長い辺 2048 まで） */
  image: { name: string; width: number; height: number; source: 'sample' | 'grid' | 'file'; texture?: [number, number] }
  frame: FrameId
  fit: { mode: FitMode; zoom: number; panX: number; panY: number; rotation: number }
  stage: StageId
  time: TimeId
  band: BandId
  look: { washi: number; foil: number; holo: number; lineThreshold: number; lineWidth: number; lineOverlay: number }
  /** showNumber: 札の下の HTML に番号を出すか（F-43 との関係は PO の判断待ち。09 §5.7-7） */
  text: CardText & { showTitleOnFront: boolean; showNumber: boolean; showLore: boolean }
}

const STAGES: { id: StageId; label: string; value: number }[] = [
  { id: 'blank', label: '空白', value: 0 },
  { id: 'hakubyo', label: '白描', value: 1 },
  { id: 'saishiki', label: '彩色', value: 2 },
  { id: 'kin', label: '金', value: 3 },
]
const TIMES: { id: TimeId; label: string }[] = [
  { id: 'day', label: '昼' },
  { id: 'evening', label: '夕' },
  { id: 'night', label: '夜' },
]
const BANDS: { id: BandId; label: string }[] = [
  { id: 'ai', label: '藍' },
  { id: 'wakakusa', label: '若草' },
  { id: 'fuji', label: '藤' },
]

const card0 = lore.cards[0]
const DEFAULT_STATE: StudioState = {
  image: { name: '見本（光蔵坊・仮）', width: 1024, height: 1024, source: 'sample' },
  frame: 'karuta',
  fit: { mode: 'cover', zoom: 1, panX: 0, panY: 0, rotation: 0 },
  stage: 'saishiki',
  time: 'day',
  band: 'ai',
  look: { washi: 0.5, foil: 0.6, holo: 0.15, lineThreshold: 0.12, lineWidth: 1, lineOverlay: 0.25 },
  text: {
    showTitleOnFront: true,
    showNumber: false,
    showLore: true,
    number: card0.number ?? '',
    title: card0.title,
    body: card0.body,
    source: `${card0.source.work}${card0.source.year ? `（${card0.source.year}）` : ''}`,
  },
}
const state: StudioState = structuredClone(DEFAULT_STATE)

const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)')
let reduceMotion = reduceMq.matches

// ---------------------------------------------------------------- 画面

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T

const app = document.getElementById('app')!
app.innerHTML = `
<div class="cs-root">
  <div class="cs-stage day" id="stage">
    <div class="cs-view" id="view">
      <div class="cs-hud" id="hud" aria-hidden="true"></div>
      <div class="cs-quick">
        <button type="button" id="q-flip">裏返す</button>
        <button type="button" id="q-sensor" hidden>傾きセンサー</button>
      </div>
      <div class="cs-hint" id="hint">動かすと傾く・タップで裏返す・画像はここへドロップ</div>
      <div class="cs-drop">画像をここに置く（PNG・JPEG・WebP）</div>
    </div>
    <div class="cs-lore" id="lore" aria-label="札の下の文（ゲームと同じ HTML）"><div class="yc-card" id="lore-card"></div></div>
  </div>
  <details class="cs-panel" id="panel" open>
    <summary><h1>札スタジオ<small>試作・開発用</small></h1><span class="cs-sumhint"></span></summary>
    <p class="cs-note"><b>本物のお札・護符・御朱印に似せない</b>（朱の印と墨書き、縦長の護符の形、紐・袋は使わない）。<b>伝承の札は題・本文・出典だけ</b>を見せる。今も祀られている神仏は描かない。AI で作った絵は仮の絵として扱う。</p>

    <section class="cs-sec">
      <h2>絵</h2>
      <div class="cs-btns">
        <button type="button" class="cs-btn primary" id="pick">画像を選ぶ</button>
        <button type="button" class="cs-btn" id="sample">見本（光蔵坊）</button>
        <button type="button" class="cs-btn" id="grid">UV の格子</button>
        <input type="file" id="file" accept="image/png,image/jpeg,image/webp" hidden />
      </div>
      <p class="cs-file" id="file-name"></p>
      <canvas class="cs-crop" id="crop" width="656" height="420" aria-label="切り抜きの範囲（ドラッグで位置を動かす）"></canvas>
      <p class="cs-small">枠が札の絵の窓に入る範囲です。枠をドラッグして位置を合わせます。</p>
    </section>

    <section class="cs-sec">
      <h2>合わせ方</h2>
      <div class="cs-row"><span>切り抜き</span><div class="cs-seg" id="seg-fit"></div></div>
      <div class="cs-row"><label for="r-zoom">拡大</label><input type="range" id="r-zoom" min="0.5" max="4" step="0.01" /><output id="o-zoom"></output></div>
      <div class="cs-row"><label for="r-panx">位置（横）</label><input type="range" id="r-panx" min="-1" max="1" step="0.001" /><output id="o-panx"></output></div>
      <div class="cs-row"><label for="r-pany">位置（縦）</label><input type="range" id="r-pany" min="-1" max="1" step="0.001" /><output id="o-pany"></output></div>
      <div class="cs-row"><label for="r-rot">回転（＋で左回り）</label><input type="range" id="r-rot" min="-180" max="180" step="0.5" /><output id="o-rot"></output></div>
      <label class="cs-check"><input type="checkbox" id="c-align" /> 札の上のドラッグで絵を動かす（ホイールで拡大）</label>
      <div class="cs-btns"><button type="button" class="cs-btn" id="fit-reset">自動の切り抜きに戻す</button></div>
    </section>

    <section class="cs-sec">
      <h2>段階</h2>
      <div class="cs-row"><span>絵</span><div class="cs-seg" id="seg-stage"></div></div>
      <div class="cs-btns"><button type="button" class="cs-btn" id="replay">段階の演出を再生</button></div>
      <div class="cs-row"><label for="r-lth">線のしきい値</label><input type="range" id="r-lth" min="0.02" max="0.4" step="0.005" /><output id="o-lth"></output></div>
      <div class="cs-row"><label for="r-lw">線の太さ</label><input type="range" id="r-lw" min="0.4" max="3" step="0.05" /><output id="o-lw"></output></div>
      <div class="cs-row"><label for="r-lo">彩色に線</label><input type="range" id="r-lo" min="0" max="1" step="0.01" /><output id="o-lo"></output></div>
      <p class="cs-small">白描は、絵の明るさの境目と暗い所からシェーダーで線を出しています（書き出しの時に線の画像にする予定。09 §4.3）。</p>
    </section>

    <section class="cs-sec">
      <h2>札</h2>
      <div class="cs-row"><span>枠</span><div class="cs-seg" id="seg-frame"></div></div>
      <div class="cs-row"><span>縁の帯の色</span><div class="cs-seg" id="seg-band"></div></div>
      <label class="cs-check"><input type="checkbox" id="c-title" /> 表に題を入れる</label>
      <p class="cs-small">裏は全札共通の意匠です（和紙・霞の文様・ましろの小さな印。藍の一色。文字は入れない）。</p>
    </section>

    <section class="cs-sec">
      <h2>光と質感</h2>
      <div class="cs-row"><span>時間帯</span><div class="cs-seg" id="seg-time"></div></div>
      <div class="cs-row"><label for="r-washi">和紙のざらつき</label><input type="range" id="r-washi" min="0" max="1.5" step="0.01" /><output id="o-washi"></output></div>
      <div class="cs-row"><label for="r-foil">箔のきらめき</label><input type="range" id="r-foil" min="0" max="1.5" step="0.01" /><output id="o-foil"></output></div>
      <div class="cs-row"><label for="r-holo">ホロ</label><input type="range" id="r-holo" min="0" max="0.6" step="0.01" /><output id="o-holo"></output></div>
      <p class="cs-small">紙の白は時間帯で濁らせず、時間帯は札のまわりの光で表します（09 §3.3）。</p>
    </section>

    <section class="cs-sec">
      <h2>文字</h2>
      <p class="cs-small">題は表の題箋に描きます。本文と出典は札の下の HTML（ゲームの <code>cardHtml</code> と同じ）に出します。</p>
      <label class="cs-check"><input type="checkbox" id="c-lore" /> 札の下に本文と出典を出す</label>
      <label class="cs-field">題<input id="t-title" /></label>
      <label class="cs-field">本文<textarea id="t-body" rows="3"></textarea></label>
      <label class="cs-field">出典<input id="t-source" /></label>
      <label class="cs-field">番号<input id="t-number" /></label>
      <label class="cs-check"><input type="checkbox" id="c-number" /> 番号を札の下に出す（F-43 との関係は PO の判断待ち）</label>
      <p class="cs-small" id="font-status">書体を読み込んでいます…</p>
    </section>

    <section class="cs-sec">
      <h2>書き出し</h2>
      <div class="cs-btns">
        <button type="button" class="cs-btn primary" id="copy-json">設定を JSON でコピー</button>
        <button type="button" class="cs-btn" id="save-png">PNG を保存</button>
      </div>
      <textarea class="cs-json" id="json" spellcheck="false" aria-label="設定の JSON"></textarea>
      <div class="cs-btns"><button type="button" class="cs-btn" id="load-json">この JSON を読み込む</button></div>
      <p class="cs-status" id="status" role="status"></p>
    </section>
  </details>
</div>`

const stageEl = $<HTMLDivElement>('#stage')
const viewEl = $<HTMLDivElement>('#view')
const rootEl = $<HTMLDivElement>('.cs-root')
const hudEl = $<HTMLDivElement>('#hud')
const panel = $<HTMLDetailsElement>('#panel')
if (window.matchMedia('(max-width: 760px)').matches) panel.open = false
const syncPanelClass = () => rootEl.classList.toggle('panel-open', panel.open)
panel.addEventListener('toggle', syncPanelClass)
syncPanelClass()
const statusEl = $<HTMLParagraphElement>('#status')
const say = (msg: string) => {
  statusEl.textContent = msg
}

// ---------------------------------------------------------------- three.js

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setClearColor(0x000000, 0)
viewEl.prepend(renderer.domElement)
renderer.domElement.setAttribute('aria-label', '3D の札')

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
scene.add(new THREE.AmbientLight(0xffffff, 1.6))
const sun = new THREE.DirectionalLight(0xfff6e8, 1.4)
sun.position.set(-0.6, 0.8, 1)
scene.add(sun)

// 札の絵（初めは見本）
let artSource: HTMLCanvasElement | HTMLImageElement = drawSampleArt()
let artTex = makeArtTexture(artSource)
/** 読み込む画像は長い辺 2048 までに縮める（4096² をそのまま入れるとミップマップ込みで約 85MiB になる） */
const MAX_ART = 2048
function shrinkImage(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const k = MAX_ART / Math.max(w, h)
  if (k >= 1) return img
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, 0, 0, c.width, c.height)
  return c
}
function sourceSize(src: HTMLCanvasElement | HTMLImageElement): [number, number] {
  return src instanceof HTMLCanvasElement ? [src.width, src.height] : [src.naturalWidth, src.naturalHeight]
}
function makeArtTexture(src: HTMLCanvasElement | HTMLImageElement): THREE.Texture {
  const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  t.matrixAutoUpdate = false // 自分で updateMatrix する（applyFit）
  t.needsUpdate = true
  return t
}

// 題: 題箋の範囲だけの canvas（幅 1024）。字の覆い（A）しか使わないので、ミップマップは作らない
const titleCanvas = document.createElement('canvas')
let titleTex = makeTitleTexture()
function makeTitleTexture() {
  const t = new THREE.CanvasTexture(titleCanvas)
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  return t
}
// 裏: 全札共通の 512² の1枚（09 §2.4）
const backCanvas = document.createElement('canvas')
drawBackDesign(backCanvas)
const backTex = new THREE.CanvasTexture(backCanvas)
backTex.colorSpace = THREE.SRGBColorSpace
backTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
console.assert(backCanvas.width === BACK_SIZE)

let layout = cardLayout(state.frame)
const mats = makeMaterials(artTex, titleTex, backTex, layout)
const flip = { x: 0, v: 0, t: 0 } // 裏返し（ばね。下の「動き」で使う）
const geometry = makeCardGeometry()
const cardMesh = new THREE.Mesh(geometry, mats.list)
const pivot = new THREE.Group()
pivot.add(cardMesh)
scene.add(pivot)

// 札のまわりの光（昼: やわらかい影 / 夕: ばら色の照り返し / 夜: 琥珀の光）
const auraMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.3 }, uSize: { value: new THREE.Vector2(CARD.w, CARD.h) } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform vec2 uSize; varying vec2 vP;
    float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main(){ float d = sdRR(vP, uSize * 0.5, ${CARD.r.toFixed(4)}); float a = exp(-max(d, 0.0) / 0.06) * smoothstep(-0.08, 0.02, d) * (1.0 - smoothstep(0.16, 0.29, d)); gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
    }`,
})
const aura = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w + 0.6, CARD.h + 0.6), auraMat)
aura.position.z = -0.3
const AURA_SCALE = 1.15 // 奥に置いた分だけ大きく（札の影・光が札と同じくらいに見える）。札の向きに合わせて縮める（renderFrame）
aura.scale.setScalar(AURA_SCALE)
aura.renderOrder = -1
scene.add(aura)

// 上の端に「裏返す」などのボタン、下の端に操作のヒントがあるので、札はその間に収める
const RESERVE_TOP = 48
const RESERVE_BOTTOM = 34
function resize() {
  const w = viewEl.clientWidth
  const h = Math.max(viewEl.clientHeight, 1)
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  const avail = Math.max(h - RESERVE_TOP - RESERVE_BOTTOM, h * 0.5)
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const distH = ((CARD.h * 1.14) / (2 * t)) * (h / avail)
  const distW = (CARD.w * (camera.aspect < 0.8 ? 1.22 : 1.45)) / (2 * t * camera.aspect)
  camera.position.set(0, 0, Math.max(distH, distW))
  camera.lookAt(0, 0, 0)
  // 札の中心を、ボタンとヒントの間の中央へ（画面の上で下へずらす）
  const shift = h - avail >= RESERVE_TOP + RESERVE_BOTTOM ? (RESERVE_TOP - RESERVE_BOTTOM) / 2 : 0
  camera.setViewOffset(w, h, 0, -shift, w, h)
  camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(viewEl)
resize()

// ---------------------------------------------------------------- UV（切り抜き・拡大・位置・回転）

function imageAspect(): number {
  return state.image.width / Math.max(1, state.image.height)
}
function windowAspect(): number {
  return (layout.win.x1 - layout.win.x0) / (layout.win.y1 - layout.win.y0)
}

/**
 * 窓の縦横比に合わせた repeat を求め、Texture.offset / repeat / rotation / center に入れる。
 * シェーダーは窓の座標を縦横比で直してから（winA）Texture.matrix を掛けるので、回転しても絵がゆがまない。
 */
function applyFit() {
  const ai = imageAspect()
  const aw = windowAspect()
  let rx: number
  let ry: number
  const wider = aw / ai
  if (state.fit.mode === 'cover') {
    if (wider <= 1) [rx, ry] = [wider, 1]
    else [rx, ry] = [1, 1 / wider]
  } else if (wider >= 1) [rx, ry] = [wider, 1]
  else [rx, ry] = [1, 1 / wider]
  rx /= state.fit.zoom
  ry /= state.fit.zoom
  artTex.center.set(0.5, 0.5)
  artTex.repeat.set(rx / aw, ry)
  artTex.offset.set(state.fit.panX, state.fit.panY)
  artTex.rotation = THREE.MathUtils.degToRad(state.fit.rotation)
  artTex.updateMatrix()
  mats.front.uniforms.uArtMat.value = artTex.matrix
  // 白描の線は「書き出しの解像度（窓の高さ 1024 画素）」で見た時の太さにそろえる。
  // 窓の高さ 1 あたりのテクセル数 = repeat.y × 画像の高さ。それが 1024 より多ければ、その分だけ上のミップを引く
  const texH = sourceSize(artSource)[1]
  mats.front.uniforms.uArtLod.value = Math.max(0, Math.log2((artTex.repeat.y * texH) / 1024))
  drawCrop()
}

/** 絵を変えた・合わせ方を変えた時は、表に戻す（裏のままだと貼ったことが分からない） */
function showFront() {
  flip.t = 0
}

function setArt(src: HTMLCanvasElement | HTMLImageElement, info: StudioState['image'], keepFit = false) {
  showFront()
  artSource = src
  const old = artTex
  artTex = makeArtTexture(src)
  mats.front.uniforms.uArt.value = artTex
  old.dispose()
  state.image = info
  if (!keepFit) state.fit = { ...DEFAULT_STATE.fit, mode: state.fit.mode }
  $('#file-name').textContent = `${info.name}（${info.width} × ${info.height}）`
  syncControls()
  applyFit()
  refreshJson()
}

// 切り抜きの見本（画像の全体と、窓に入る範囲の枠）
const cropCanvas = $<HTMLCanvasElement>('#crop')
let cropBox = { x: 0, y: 0, w: 1, h: 1 }
function drawCrop() {
  const g = cropCanvas.getContext('2d')!
  const W = cropCanvas.width
  const H = cropCanvas.height
  g.clearRect(0, 0, W, H)
  const ai = imageAspect()
  const pad = 40
  let w = W - pad * 2
  let h = w / ai
  if (h > H - pad * 2) {
    h = H - pad * 2
    w = h * ai
  }
  cropBox = { x: (W - w) / 2, y: (H - h) / 2, w, h }
  g.drawImage(artSource, cropBox.x, cropBox.y, w, h)
  // 窓の四隅（縦横比を直した座標）→ 絵の UV
  const aw = windowAspect()
  const m = artTex.matrix.elements
  const toUv = (ax: number, ay: number) => [m[0] * ax + m[3] * ay + m[6], m[1] * ax + m[4] * ay + m[7]]
  const corners = [
    [0.5 - aw / 2, 0],
    [0.5 + aw / 2, 0],
    [0.5 + aw / 2, 1],
    [0.5 - aw / 2, 1],
  ].map(([x, y]) => {
    const [u, v] = toUv(x, y)
    return [cropBox.x + u * w, cropBox.y + (1 - v) * h]
  })
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.moveTo(corners[0][0], corners[0][1])
  for (const c of corners.slice(1)) g.lineTo(c[0], c[1])
  g.closePath()
  g.fillStyle = 'rgba(30,26,22,0.45)'
  g.fill('evenodd')
  g.strokeStyle = '#ffe7a8'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(corners[0][0], corners[0][1])
  for (const c of corners.slice(1)) g.lineTo(c[0], c[1])
  g.closePath()
  g.stroke()
  // 窓の上辺に印（上の向き）
  const mx = (corners[2][0] + corners[3][0]) / 2
  const my = (corners[2][1] + corners[3][1]) / 2
  g.fillStyle = '#ffe7a8'
  g.beginPath()
  g.arc(mx, my, 7, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

// 枠のドラッグで位置を動かす（枠が動く向き = 絵の中で範囲が動く向き）
{
  let last: { x: number; y: number } | null = null
  cropCanvas.addEventListener('pointerdown', (e) => {
    cropCanvas.setPointerCapture(e.pointerId)
    last = { x: e.clientX, y: e.clientY }
  })
  cropCanvas.addEventListener('pointermove', (e) => {
    if (!last) return
    const scale = cropCanvas.width / cropCanvas.getBoundingClientRect().width
    const dx = ((e.clientX - last.x) * scale) / cropBox.w
    const dy = ((e.clientY - last.y) * scale) / cropBox.h
    last = { x: e.clientX, y: e.clientY }
    state.fit.panX = clamp(state.fit.panX + dx, -1, 1)
    state.fit.panY = clamp(state.fit.panY - dy, -1, 1)
    showFront()
    syncControls()
    applyFit()
    refreshJson()
  })
  const end = () => (last = null)
  cropCanvas.addEventListener('pointerup', end)
  cropCanvas.addEventListener('pointercancel', end)
}

// ---------------------------------------------------------------- 文字

injectStyle() // ゲームの札の CSS（.yc-card など）
const loreEl = $<HTMLDivElement>('#lore')
const loreCardEl = $<HTMLDivElement>('#lore-card')
function renderLore() {
  loreEl.hidden = !state.text.showLore
  const t = state.text
  const card = {
    id: 'studio',
    title: t.title,
    body: t.body,
    number: t.showNumber ? t.number : '',
    source: { work: t.source },
  } as LoreCard
  loreCardEl.innerHTML = cardHtml(card)
}

function redrawText() {
  const w = titleCanvas.width
  const h = titleCanvas.height
  drawFrontTitle(titleCanvas, state.text.title, layout)
  if (titleCanvas.width !== w || titleCanvas.height !== h) {
    // 大きさが変わったら作り直す（WebGL2 の texStorage は大きさを変えられない）
    titleTex.dispose()
    titleTex = makeTitleTexture()
    mats.front.uniforms.uTitle.value = titleTex
  }
  titleTex.needsUpdate = true
  renderLore()
}
redrawText()
const fontStatus = $('#font-status')
waitFonts(state.text.title + state.text.body + state.text.source + '出典札①②③').then((ok) => {
  fontStatus.textContent = ok ? '書体: Noto Serif JP（Google Fonts）' : '書体: Noto Serif JP を読み込めなかったので、手元の明朝体で描いています'
  redrawText()
})
document.fonts?.addEventListener?.('loadingdone', () => redrawText())

// ---------------------------------------------------------------- 状態 → 素材

let stageValue = STAGES.find((s) => s.id === state.stage)!.value
let stageTarget = stageValue

function applyLook() {
  const u = mats.front.uniforms
  u.uLineTh.value = state.look.lineThreshold
  u.uLineW.value = state.look.lineWidth
  u.uLineOverlay.value = state.look.lineOverlay
  u.uWashi.value = state.look.washi
  mats.back.uniforms.uWashi.value = state.look.washi
  u.uFoil.value = state.look.foil
  u.uHolo.value = state.look.holo
  u.uShowTitle.value = state.text.showTitleOnFront ? 1 : 0
  u.uMotion.value = reduceMotion ? 0 : 1
  stageEl.classList.toggle('reduced', reduceMotion)
  ;(u.uBandCol.value as THREE.Color).set(COLORS.bands[state.band])
  const night = state.time === 'night' ? 1 : state.time === 'evening' ? 0.35 : 0
  u.uNight.value = night
  mats.back.uniforms.uNight.value = night
  stageEl.classList.remove('day', 'evening', 'night')
  stageEl.classList.add(state.time)
  // 札のまわりの光
  const auraU = auraMat.uniforms
  if (state.time === 'day') {
    ;(auraU.uColor.value as THREE.Color).set('#3c4a6a')
    auraU.uOpacity.value = 0.22
    auraMat.blending = THREE.NormalBlending
    aura.position.set(0.03, -0.05, -0.3)
  } else if (state.time === 'evening') {
    ;(auraU.uColor.value as THREE.Color).set('#f4c0a2')
    auraU.uOpacity.value = 0.45
    auraMat.blending = THREE.AdditiveBlending
    aura.position.set(0, 0, -0.3)
  } else {
    ;(auraU.uColor.value as THREE.Color).set('#ffb866')
    auraU.uOpacity.value = 0.5
    auraMat.blending = THREE.AdditiveBlending
    aura.position.set(0, 0, -0.3)
  }
  auraMat.needsUpdate = true
  applyEdge()
}
function applyEdge() {
  const gold = stageValue > 2.5
  mats.edge.color.set(gold ? COLORS.edgeGold : COLORS.edgePaper)
  mats.edge.specular.set(gold ? 0xffe7a8 : 0x222222)
  mats.edge.shininess = gold ? 70 : 8
  mats.edge.emissive.set(gold && state.time === 'night' ? 0x4a3410 : 0x000000)
}

function setStage(id: StageId, animate: boolean) {
  state.stage = id
  stageTarget = STAGES.find((s) => s.id === id)!.value
  if (!animate) stageValue = stageTarget
  applyEdge()
}

// 動きを減らす設定: 傾き・光の筋・虹色を止め、段階は約 0.3 秒のフェードだけにする（09 §3.3）。途中の変更も見る
reduceMq.addEventListener?.('change', (e) => {
  reduceMotion = e.matches
  applyLook()
})

// ---------------------------------------------------------------- 操作の部品

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v))
}

function seg<T extends string>(id: string, items: { id: T; label: string }[], get: () => T, set: (v: T) => void) {
  const box = $(`#${id}`)
  box.setAttribute('role', 'group')
  for (const it of items) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = it.label
    b.dataset.v = it.id
    b.addEventListener('click', () => {
      set(it.id)
      syncControls()
      refreshJson()
    })
    box.appendChild(b)
  }
  segSyncs.push(() => {
    for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === get()))
  })
}
const segSyncs: (() => void)[] = []

interface RangeDef {
  id: string
  get: () => number
  set: (v: number) => void
  fmt?: (v: number) => string
}
const ranges: RangeDef[] = [
  { id: 'zoom', get: () => state.fit.zoom, set: (v) => (state.fit.zoom = v), fmt: (v) => `${v.toFixed(2)}×` },
  { id: 'panx', get: () => state.fit.panX, set: (v) => (state.fit.panX = v), fmt: (v) => v.toFixed(3) },
  { id: 'pany', get: () => state.fit.panY, set: (v) => (state.fit.panY = v), fmt: (v) => v.toFixed(3) },
  { id: 'rot', get: () => state.fit.rotation, set: (v) => (state.fit.rotation = v), fmt: (v) => `${v.toFixed(1)}°`, },
  { id: 'lth', get: () => state.look.lineThreshold, set: (v) => (state.look.lineThreshold = v) },
  { id: 'lw', get: () => state.look.lineWidth, set: (v) => (state.look.lineWidth = v) },
  { id: 'lo', get: () => state.look.lineOverlay, set: (v) => (state.look.lineOverlay = v) },
  { id: 'washi', get: () => state.look.washi, set: (v) => (state.look.washi = v) },
  { id: 'foil', get: () => state.look.foil, set: (v) => (state.look.foil = v) },
  { id: 'holo', get: () => state.look.holo, set: (v) => (state.look.holo = v) },
]
for (const r of ranges) {
  const input = $<HTMLInputElement>(`#r-${r.id}`)
  input.addEventListener('input', () => {
    r.set(Number(input.value))
    $(`#o-${r.id}`).textContent = (r.fmt ?? ((v: number) => v.toFixed(2)))(r.get())
    if (['zoom', 'panx', 'pany', 'rot'].includes(r.id)) showFront()
    applyFit()
    applyLook()
    refreshJson()
  })
}

seg<FitMode>(
  'seg-fit',
  [
    { id: 'cover', label: 'いっぱい（cover）' },
    { id: 'contain', label: '全体（contain）' },
  ],
  () => state.fit.mode,
  (v) => {
    state.fit.mode = v
    showFront()
    applyFit()
  },
)
seg<StageId>('seg-stage', STAGES, () => state.stage, (v) => setStage(v, true))
seg<FrameId>(
  'seg-frame',
  [
    { id: 'karuta', label: 'かるた寄り' },
    { id: 'hanafuda', label: '花札寄り' },
  ],
  () => state.frame,
  (v) => {
    state.frame = v
    layout = cardLayout(v)
    mats.setLayout(layout)
    redrawText()
    applyFit()
  },
)
seg<BandId>('seg-band', BANDS, () => state.band, (v) => {
  state.band = v
  applyLook()
})
seg<TimeId>('seg-time', TIMES, () => state.time, (v) => {
  state.time = v
  applyLook()
})

const titleCheck = $<HTMLInputElement>('#c-title')
titleCheck.addEventListener('change', () => {
  state.text.showTitleOnFront = titleCheck.checked
  applyLook()
  refreshJson()
})
const loreCheck = $<HTMLInputElement>('#c-lore')
loreCheck.addEventListener('change', () => {
  state.text.showLore = loreCheck.checked
  renderLore()
  refreshJson()
})
const numberCheck = $<HTMLInputElement>('#c-number')
numberCheck.addEventListener('change', () => {
  state.text.showNumber = numberCheck.checked
  renderLore()
  refreshJson()
})
const alignCheck = $<HTMLInputElement>('#c-align')
alignCheck.addEventListener('change', () => stageEl.classList.toggle('align', alignCheck.checked))

const textInputs: [string, keyof CardText][] = [
  ['t-number', 'number'],
  ['t-title', 'title'],
  ['t-body', 'body'],
  ['t-source', 'source'],
]
for (const [id, key] of textInputs) {
  const el = $<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)
  el.addEventListener('input', () => {
    state.text[key] = el.value
    redrawText()
    refreshJson()
  })
}

function syncControls() {
  for (const r of ranges) {
    $<HTMLInputElement>(`#r-${r.id}`).value = String(r.get())
    $(`#o-${r.id}`).textContent = (r.fmt ?? ((v: number) => v.toFixed(2)))(r.get())
  }
  for (const s of segSyncs) s()
  titleCheck.checked = state.text.showTitleOnFront
  loreCheck.checked = state.text.showLore
  numberCheck.checked = state.text.showNumber
  for (const [id, key] of textInputs) {
    const el = $<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)
    if (el.value !== state.text[key]) el.value = state.text[key]
  }
}

$('#fit-reset').addEventListener('click', () => {
  state.fit = { ...DEFAULT_STATE.fit, mode: state.fit.mode }
  showFront()
  syncControls()
  applyFit()
  refreshJson()
})
$('#replay').addEventListener('click', () => {
  showFront()
  stageValue = Math.max(0, stageTarget - 1)
})

// ---------------------------------------------------------------- 画像の読み込み（選ぶ・ドロップ）

const fileInput = $<HTMLInputElement>('#file')
$('#pick').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (f) loadFile(f)
  fileInput.value = ''
})
$('#sample').addEventListener('click', () => {
  const c = drawSampleArt()
  setArt(c, { name: '見本（光蔵坊・仮）', width: c.width, height: c.height, source: 'sample' })
})
$('#grid').addEventListener('click', () => {
  const c = drawUvGrid()
  setArt(c, { name: 'UV の格子（横長 16:9）', width: c.width, height: c.height, source: 'grid' })
})

function loadFile(f: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
    say(`読み込めない形式です（${f.type || '不明'}）。PNG・JPEG・WebP を使ってください。`)
    return
  }
  const url = URL.createObjectURL(f)
  const img = new Image()
  img.onload = () => {
    const src = shrinkImage(img)
    const [tw, th] = sourceSize(src)
    const info: StudioState['image'] = { name: f.name, width: img.naturalWidth, height: img.naturalHeight, source: 'file' }
    if (src !== img) info.texture = [tw, th]
    setArt(src, info)
    say(src !== img ? `読み込みました: ${f.name}（${tw} × ${th} に縮めて貼っています）` : `読み込みました: ${f.name}`)
    // URL は描き直し（切り抜きの見本）に使うので、次の画像まで残す
    if (lastUrl) URL.revokeObjectURL(lastUrl)
    lastUrl = url
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    say(`画像を開けませんでした: ${f.name}`)
  }
  img.src = url
}
let lastUrl: string | null = null

let dragDepth = 0
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  rootEl.classList.add('dragging')
})
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) rootEl.classList.remove('dragging')
})
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  rootEl.classList.remove('dragging')
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f)
})

// ---------------------------------------------------------------- 動き（ばね・傾き・裏返し）

interface Spring {
  x: number
  v: number
  t: number
}
const spring = (x = 0): Spring => ({ x, v: 0, t: x })
const tiltX = spring()
const tiltY = spring()
const K = 120
const C = 2 * Math.sqrt(K) * 0.6
function stepSpring(s: Spring, dt: number, k = K, c = C) {
  if (reduceMotion) {
    // 動きを減らす設定: ばねを使わず、すぐ目標へ（傾きの目標は renderFrame で 0 にしている）
    s.x = s.t
    s.v = 0
    return
  }
  const a = k * (s.t - s.x) - c * s.v
  s.v += a * dt
  s.x += s.v * dt
}
const MAX_TILT = THREE.MathUtils.degToRad(16)

function doFlip() {
  flip.t = flip.t > 0.5 ? 0 : Math.PI
}
$('#q-flip').addEventListener('click', doFlip)

// ポインタ: 動かすと傾く。タップで裏返す。「絵を動かす」のときはドラッグで位置合わせ
{
  const cv = renderer.domElement
  let down: { x: number; y: number; t: number; lastX: number; lastY: number; moved: number } | null = null
  const setTiltFrom = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect()
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1
    tiltX.t = clamp(nx * 1.3, -1, 1)
    tiltY.t = clamp(ny * 1.3, -1, 1)
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId)
    down = { x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, lastY: e.clientY, moved: 0 }
    if (!alignCheck.checked) setTiltFrom(e)
  })
  cv.addEventListener('pointermove', (e) => {
    if (down) {
      down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y))
      if (alignCheck.checked) {
        panByScreen(e.clientX - down.lastX, e.clientY - down.lastY)
        down.lastX = e.clientX
        down.lastY = e.clientY
        return
      }
    }
    if (alignCheck.checked) return
    if (down || e.pointerType === 'mouse') setTiltFrom(e)
  })
  const release = (e: PointerEvent, cancelled: boolean) => {
    const d = down
    down = null
    if (e.pointerType !== 'mouse' || cancelled) {
      tiltX.t = 0
      tiltY.t = 0
    }
    if (!cancelled && d && d.moved < 8 && performance.now() - d.t < 400 && !alignCheck.checked) doFlip()
  }
  cv.addEventListener('pointerup', (e) => release(e, false))
  cv.addEventListener('pointercancel', (e) => release(e, true))
  cv.addEventListener('pointerleave', () => {
    if (!down) {
      tiltX.t = 0
      tiltY.t = 0
    }
  })
  cv.addEventListener(
    'wheel',
    (e) => {
      if (!alignCheck.checked) return
      e.preventDefault()
      state.fit.zoom = clamp(state.fit.zoom * Math.exp(-e.deltaY * 0.0015), 0.5, 4)
      syncControls()
      applyFit()
      refreshJson()
    },
    { passive: false },
  )
}

/** 札の上のドラッグ（画面の px）→ 絵の UV の offset。指と一緒に絵が動く向き */
function panByScreen(dxPx: number, dyPx: number) {
  const h = stageEl.clientHeight
  const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const pxPerUnit = h / visH
  const winH = layout.win.y1 - layout.win.y0
  const da = { x: dxPx / (pxPerUnit * winH), y: -dyPx / (pxPerUnit * winH) }
  if (flip.t > 0.5) showFront()
  const m = artTex.matrix.elements
  const du = m[0] * da.x + m[3] * da.y
  const dv = m[1] * da.x + m[4] * da.y
  state.fit.panX = clamp(state.fit.panX - du, -1, 1)
  state.fit.panY = clamp(state.fit.panY - dv, -1, 1)
  syncControls()
  applyFit()
  refreshJson()
}

// スマホの傾き（任意）。iOS は操作の中で許可を求める。iframe の中では届かないことがある
{
  const btn = $<HTMLButtonElement>('#q-sensor')
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined
  const touchy = window.matchMedia('(pointer: coarse)').matches
  if (DOE && touchy) btn.hidden = false
  let base: { x: number; y: number; angle: number } | null = null
  let on = false
  let got = false
  let watchdog = 0
  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return
    got = true
    // 横画面では軸を入れ替える（09 §4.6）。画面の右へ傾けると x が増え、手前へ倒すと y が増える向き
    const angle = ((screen.orientation?.angle ?? 0) + 360) % 360
    let x = e.gamma
    let y = e.beta
    if (angle === 90) [x, y] = [e.beta, -e.gamma]
    else if (angle === 270) [x, y] = [-e.beta, e.gamma]
    else if (angle === 180) [x, y] = [-e.gamma, -e.beta]
    if (!base || base.angle !== angle) base = { x, y, angle } // 向きが変わったら、今の向きを基準に取り直す
    tiltX.t = clamp((x - base.x) / 22, -1, 1)
    tiltY.t = clamp((y - base.y) / 22, -1, 1)
  }
  const stop = () => {
    window.removeEventListener('deviceorientation', onOrient)
    window.clearTimeout(watchdog)
    on = false
    base = null
    tiltX.t = tiltY.t = 0
    btn.textContent = '傾きセンサー'
  }
  btn.addEventListener('click', async () => {
    if (on) {
      stop()
      return
    }
    try {
      if (DOE?.requestPermission) {
        const r = await DOE.requestPermission()
        if (r !== 'granted') {
          say('傾きセンサーは許可されませんでした。指で傾けて見てください。')
          return
        }
      }
      got = false
      window.addEventListener('deviceorientation', onOrient)
      on = true
      btn.textContent = 'センサーを止める'
      say('傾きセンサーを待っています…')
      // 許可されても、iframe の中やセンサーのない端末では何も届かない。1.2 秒待って確かめる
      watchdog = window.setTimeout(() => {
        if (got) say('傾きセンサーを使っています（今の向きが基準）。')
        else {
          stop()
          say('この画面では傾きが届きません（iframe の中や、センサーのない端末など）。指で傾けて見てください。')
        }
      }, 1200)
    } catch {
      say('傾きセンサーを使えませんでした（HTTPS でないか、iframe の中の可能性があります）。')
    }
  })
}

// ---------------------------------------------------------------- 書き出し

/**
 * 窓の UV（0〜1。左下が 0,0）から絵の UV を直接引く行列。
 * スタジオのシェーダーは a = ((u−0.5)×windowAspect＋0.5, v) に Texture.matrix を掛けている（winA）。
 * その「a に直す」行列 A を右から掛けておけば、ゲーム側は winA を書かずに同じ切り抜きを再現できる。
 */
function windowUvMatrix(): THREE.Matrix3 {
  const aw = windowAspect()
  const A = new THREE.Matrix3().set(aw, 0, 0.5 - 0.5 * aw, 0, 1, 0, 0, 0, 1)
  return artTex.matrix.clone().multiply(A)
}

function exportSettings() {
  const wm = windowUvMatrix()
  const e = wm.elements
  const corner = (u: number, v: number) => [round(e[0] * u + e[3] * v + e[6]), round(e[1] * u + e[4] * v + e[7])]
  return {
    version: 1,
    tool: 'card-studio',
    image: { ...state.image },
    frame: state.frame,
    fit: { ...state.fit },
    uv: {
      howTo:
        'matrix は「窓の UV（0〜1、左下が 0,0）→ 絵の UV」の 3×3（three の Matrix3.elements と同じ列優先）。' +
        '組み込みの素材なら texture.matrixAutoUpdate = false; texture.matrix.fromArray(matrix) で同じ切り抜きになる。' +
        'offset・repeat・rotation・center は、窓の座標を縦横比で直した a = ((u−0.5)×windowAspect＋0.5, v) に掛ける値（スタジオのシェーダー用）。' +
        '窓が 1:1（かるた寄り）の時だけ、両者は同じになる。',
      matrix: Array.from(e, round),
      offset: [round(artTex.offset.x), round(artTex.offset.y)],
      repeat: [round(artTex.repeat.x), round(artTex.repeat.y)],
      rotation: round(artTex.rotation),
      center: [0.5, 0.5],
      windowAspect: round(windowAspect()),
    },
    // 原本の中の切り抜き（09 §6.3）。窓の四隅を原本の UV（0〜1、左下が 0,0）で、左下・右下・右上・左上の順に。
    // 回転があると軸に沿った長方形（x, y, w, h）では表せないので、四隅と回転（度、＋で絵が左回り）で持つ
    crop: {
      corners: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
      rotation: state.fit.rotation,
    },
    stage: state.stage,
    time: state.time,
    band: state.band,
    look: { ...state.look },
    text: { ...state.text },
  }
}
function round(v: number) {
  return Math.round(v * 10000) / 10000
}
const jsonEl = $<HTMLTextAreaElement>('#json')
let jsonTimer = 0
function refreshJson() {
  window.clearTimeout(jsonTimer)
  jsonTimer = window.setTimeout(() => (jsonEl.value = JSON.stringify(exportSettings(), null, 2)), 60)
}

$('#copy-json').addEventListener('click', async () => {
  const text = JSON.stringify(exportSettings(), null, 2)
  jsonEl.value = text
  try {
    await navigator.clipboard.writeText(text)
    say('設定の JSON をコピーしました。')
  } catch {
    jsonEl.focus()
    jsonEl.select()
    const ok = document.execCommand?.('copy')
    say(ok ? '設定の JSON をコピーしました。' : 'コピーできなかったので、下の欄から手でコピーしてください。')
  }
})

$('#load-json').addEventListener('click', () => {
  try {
    const j = JSON.parse(jsonEl.value) as Partial<StudioState>
    showFront()
    if (j.frame === 'karuta' || j.frame === 'hanafuda') {
      state.frame = j.frame
      layout = cardLayout(j.frame)
      mats.setLayout(layout)
    }
    if (j.fit) Object.assign(state.fit, j.fit)
    if (j.look) Object.assign(state.look, j.look)
    if (j.text) {
      for (const k of ['title', 'body', 'source', 'number'] as const) if (typeof j.text[k] === 'string') state.text[k] = j.text[k]
      for (const k of ['showTitleOnFront', 'showNumber', 'showLore'] as const) if (typeof j.text[k] === 'boolean') state.text[k] = j.text[k]
    }
    if (j.time && TIMES.some((t) => t.id === j.time)) state.time = j.time
    if (j.band && BANDS.some((b) => b.id === j.band)) state.band = j.band
    if (j.stage && STAGES.some((s) => s.id === j.stage)) setStage(j.stage, false)
    syncControls()
    applyFit()
    applyLook()
    redrawText()
    say(j.image?.name && j.image.name !== state.image.name ? `設定を読み込みました（画像「${j.image.name}」は別に読み込んでください）。` : '設定を読み込みました。')
  } catch (err) {
    say(`JSON を読めませんでした: ${(err as Error).message}`)
  }
})

$('#save-png').addEventListener('click', () => {
  renderFrame(0)
  renderer.domElement.toBlob((blob) => {
    if (!blob) return say('PNG を作れませんでした。')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `card-${state.stage}-${state.time}.png`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    say('PNG を保存しました（背景は透明）。')
  }, 'image/png')
})

// ---------------------------------------------------------------- 毎フレーム

const lightWorld = new THREE.Vector3(-0.45, 0.6, 0.9).normalize()
const invQ = new THREE.Quaternion()
const lightObj = new THREE.Vector3()
let lastT = performance.now()
let fpsAcc = 0
let fpsN = 0
let fps = 0
let hudT = 0
let debugTilt = false // 確認用の setTilt は、動きを減らす設定でも効かせる

function renderFrame(dt: number) {
  if (reduceMotion && !debugTilt) tiltX.t = tiltY.t = 0 // 動きを減らす設定: 傾けない
  stepSpring(tiltX, dt)
  stepSpring(tiltY, dt)
  stepSpring(flip, dt, 70, 2 * Math.sqrt(70) * 0.75)
  if (stageValue !== stageTarget) {
    const sp = dt / (reduceMotion ? 0.3 : 1.3) // 動きを減らす設定では、段階1つを約 0.3 秒のフェードで
    stageValue = stageValue < stageTarget ? Math.min(stageTarget, stageValue + sp) : Math.max(stageTarget, stageValue - sp)
    applyEdge()
  }
  const rx = tiltY.x * MAX_TILT
  const ry = flip.x + tiltX.x * MAX_TILT
  pivot.rotation.set(rx, ry, 0)
  pivot.updateMatrixWorld()
  // 札のまわりの光（影）は場面に置いた板なので、札の向きに合わせて幅と高さを縮める（裏返しの途中で四角く残らないように）
  aura.scale.set(AURA_SCALE * Math.max(Math.abs(Math.cos(ry)), 0.02), AURA_SCALE * Math.abs(Math.cos(rx)), 1)
  invQ.copy(pivot.quaternion).invert()
  lightObj.copy(lightWorld).applyQuaternion(invQ)
  const u = mats.front.uniforms
  u.uStage.value = stageValue
  if (reduceMotion && !debugTilt) (u.uTilt.value as THREE.Vector2).set(0, 0)
  else (u.uTilt.value as THREE.Vector2).set(tiltX.x, -tiltY.x)
  ;(u.uLight.value as THREE.Vector3).copy(lightObj)
  ;(mats.back.uniforms.uLight.value as THREE.Vector3).set(-lightObj.x, lightObj.y, -lightObj.z)
  u.uTime.value = performance.now() / 1000
  renderer.render(scene, camera)
}

function loop(now: number) {
  const dt = Math.min(1 / 30, (now - lastT) / 1000)
  fpsAcc += (now - lastT) / 1000
  fpsN++
  lastT = now
  renderFrame(dt)
  if (now - hudT > 500) {
    fps = fpsN / Math.max(fpsAcc, 1e-3)
    fpsAcc = 0
    fpsN = 0
    hudT = now
    hudEl.textContent = `${fps.toFixed(0)} fps ・ 描画命令 ${renderer.info.render.calls} ・ 三角形 ${renderer.info.render.triangles}`
  }
  requestAnimationFrame(loop)
}

// ---------------------------------------------------------------- はじめ

$('#file-name').textContent = `${state.image.name}（${state.image.width} × ${state.image.height}）`
syncControls()
applyFit()
applyLook()
refreshJson()
requestAnimationFrame(loop)

// 確認用（Playwright などから状態を変える）
declare global {
  interface Window {
    __cardStudio?: unknown
  }
}
window.__cardStudio = {
  state,
  setStage: (id: StageId) => {
    setStage(id, false)
    syncControls()
  },
  setTilt: (x: number, y: number) => {
    debugTilt = x !== 0 || y !== 0
    tiltX.t = tiltX.x = x
    tiltY.t = tiltY.x = y
  },
  setReduceMotion: (on: boolean) => {
    reduceMotion = on
    applyLook()
  },
  uvMatrix: () => Array.from(windowUvMatrix().elements),
  flip: (back: boolean) => {
    flip.t = flip.x = back ? Math.PI : 0
  },
  setTime: (t: TimeId) => {
    state.time = t
    applyLook()
    syncControls()
  },
  setFrame: (f: FrameId) => {
    state.frame = f
    layout = cardLayout(f)
    mats.setLayout(layout)
    redrawText()
    applyFit()
    syncControls()
  },
  export: exportSettings,
}
