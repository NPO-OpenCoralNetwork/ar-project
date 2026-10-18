// 夢の旅（家の3D箱庭）の入口。段階1a「夢の旅の骨組み」、段階2「出会いと会話」（yume/encounter、core/story）。
// 地域パックの範囲（段階1b: 東西 700m × 南北 400m）を、OSM と標高タイルから組み立てて、アバターとましろで歩く。
// 画面に出す地域の名前は、地域パックの name（了承が出るまでは仮の呼び方）だけを使う。
// 三つの約束（F-60）は、入口・現の旅・白描の絵地図で読んでいなければ、箱庭を始める前にここで見せる（札は ui/promise-sheet.ts）。
// 1つの HTML にまとめた箱庭（vite.artifact.config.ts。mode 'artifact'。入口の無い、Claude のアーティファクトで見る試作）では出さない。

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { STORY_KEY } from '../core/storage-keys'
import { browserStorage, ProgressStore } from '../core/story/progress'
import { loadStoryPack } from '../data/story-pack'
import { withPromises } from '../ui/promise-sheet'
import { bendDrop, fogShapeUniforms, inkRimUniforms } from './bend'
import { CameraRig, cameraTune } from './camera'
import { Controls } from './controls'
import { clampToRect, inRect, loadFieldData } from './data'
import { Encounters } from './encounter'
import { Sound } from './encounter/sound'
import { Field } from './field'
import { backdropUniforms, updateBackdropDepth } from './field/backdrop'
import { windowUniforms } from './field/buildings'
import { inkLineUniforms } from './field/ink-lines'
import { lampUniforms } from './field/lamps'
import { moteUniforms } from './field/motes'
import { densify } from './geom2d'
import { lightDir, type ScenePalette, scenePalette, type TimeId, TIMES, type ViewLook } from './hikari'
import { Hud } from './hud'
import type { LookId } from './palette'
import { FAST_SCALE, Player } from './player'

const TITLE_PREFIX = '夢の旅 試作'
/** URL に ?debug を付けたときだけ、左下に fps と描画命令数を出す */
const SHOW_PERF = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug')
  } catch {
    return false
  }
})()
const STORE_KEY = 'yume.v1'

interface Quality {
  id: 'low' | 'std' | 'high'
  label: string
  dpr: number
  shadows: boolean
  texture: number
  /** にじみ（ブルーム。後処理）。「影あり」だけ。「標準」（iPhone の既定）は灯りの加算の板だけで見せる（06 §3.7） */
  bloom: boolean
}

const isTouch = (() => {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  } catch {
    return false
  }
})()

const QUALITIES: Quality[] = [
  { id: 'low', label: '軽い', dpr: 1, shadows: false, texture: 1024, bloom: false },
  { id: 'std', label: '標準', dpr: isTouch ? 1.5 : 2, shadows: false, texture: 2048, bloom: false },
  { id: 'high', label: '影あり', dpr: 2, shadows: true, texture: 2048, bloom: true },
]

/** 見た目の切り替えの表示名 */
const LOOK_LABEL: Record<ViewLook, string> = { hikari: '光と霞', hakubyo: '白描' }
/** 保存の形の版。2 から「光と霞」が基本の見た目（前の版は白描を毎回保存していたので、一度だけ光と霞にする） */
const LOOK_VERSION = 2

interface Saved {
  speed?: 'normal' | 'fast'
  look?: LookId
  lookV?: number
  time?: TimeId
  quality?: Quality['id']
  hintSeen?: boolean
  sound?: boolean
}

function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Saved
  } catch {
    return {}
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s))
  } catch {
    // 保存できなくても遊べる
  }
}

/** 止まっているときの移動の意図 */
const STILL = { x: 0, z: 0, run: false }

function start(): void {
  const host = document.getElementById('app')!
  const saved = loadSaved()
  // 「彩色（仮）」は「光と霞」として読む。前の版の保存（白描が既定だった）は、一度だけ光と霞にする
  let look: ViewLook = saved.lookV === LOOK_VERSION && saved.look === 'hakubyo' ? 'hakubyo' : 'hikari'
  let timeOfDay: TimeId = TIMES.some((t) => t.id === saved.time) ? (saved.time as TimeId) : 'day'
  let quality = QUALITIES.find((q) => q.id === saved.quality) ?? QUALITIES[1]

  // 物語のデータ（地点の役目は出現の表も見て決めるので、箱庭の材料より先に読む）
  const story = loadStoryPack()
  const data = loadFieldData(story.appearance)

  const hud = new Hud(host, { prefix: `${TITLE_PREFIX} ・ `, name: data.pack.name }, data.attributions, {
    rotate: (d) => rig.rotateStep(d),
    toggleLook: () => setLook(pendingLook === 'hikari' ? 'hakubyo' : 'hikari'),
    cycleTime: () => cycleTime(),
    cycleQuality: () => setQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]),
    toggleSpeed: () => setSpeed(speed === 'fast' ? 'normal' : 'fast'),
    toggleSound: () => setSound(!sound.enabled),
    openMandala: () => encounters?.openMandala(),
  }, SHOW_PERF)
  const sound = new Sound(saved.sound !== false)
  let encounters: Encounters | null = null
  let speed: 'normal' | 'fast' = saved.speed === 'fast' ? 'fast' : 'normal'

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  } catch (err) {
    console.error(err)
    hud.showError('この端末では3D表示を始められませんでした。\nブラウザの設定で WebGL（ハードウェアアクセラレーション）が有効か確かめてください。')
    return
  }
  renderer.setClearColor(0xf1ece2, 1)
  host.prepend(renderer.domElement)
  renderer.domElement.setAttribute('aria-label', '夢の旅の箱庭')
  // three 0.186 では PCFSoftShadowMap がなくなった。PCFShadowMap にして、やわらかさは shadow.radius で付ける
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xf1ece2, 60, 300)
  const rig = new CameraRig()

  const field = new Field(data, {
    textureSize: quality.texture,
    maxTrees: isTouch ? 1500 : 2600,
    maxPuffs: isTouch ? 16 : 26,
  })
  scene.add(field.group)
  field.setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()))

  // 光（向きと色は時間帯ごと。昼・夕は太陽、夜は立山の上の月。06 §3.1）
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d2c4, 2)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  const sunDir = new THREE.Vector3(-0.254, 0.669, 0.698).normalize()
  // iPhone では影の地図を 1024 四方に（06 §3.3）
  const shadowSize = isTouch ? 1024 : 2048
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -55
  sc.right = sc.top = 55
  sc.near = 1
  sc.far = 260
  // 低い光（高度 20〜35°）では、06 の radius 3 だと平らな屋根に影のざらつき（にきび）が出るので、2 にして bias を少し深く
  sun.shadow.bias = -0.001
  sun.shadow.normalBias = 0.05
  sun.shadow.radius = 2
  scene.add(sun, sun.target)
  // 影のカメラを、シャドウマップの1画素（texel）の格子に合わせて動かすための、光の向きの座標軸（光の向きが変わったら作り直す）
  const shadowTexel = (sc.right - sc.left) / sun.shadow.mapSize.x
  const lightX = new THREE.Vector3()
  const lightY = new THREE.Vector3()
  const setSunDir = (d: [number, number, number]) => {
    sunDir.set(d[0], d[1], d[2]).normalize()
    lightX.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
    lightY.crossVectors(sunDir, lightX)
  }
  setSunDir([sunDir.x, sunDir.y, sunDir.z])
  const snapped = new THREE.Vector3()

  // にじみ（ブルーム）。画質「影あり」だけ。しきい値を高めにして光る物だけをにじませる
  let composer: EffectComposer | null = null
  let bloomPass: UnrealBloomPass | null = null
  let sceneCalls = 0
  /** 箱庭そのものの描画命令の数を数える RenderPass（後処理の分を分けて表示するため） */
  class CountingRenderPass extends RenderPass {
    override render(
      r: THREE.WebGLRenderer,
      writeBuffer: THREE.WebGLRenderTarget,
      readBuffer: THREE.WebGLRenderTarget,
      deltaTime: number,
      maskActive: boolean,
    ): void {
      super.render(r, writeBuffer, readBuffer, deltaTime, maskActive)
      sceneCalls = r.info.render.calls
    }
  }
  const ensureComposer = (): EffectComposer => {
    if (composer) return composer
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    // スマホでは MSAA の描画先を使わない（メモリと帯域を抑える）
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 })
    composer = new EffectComposer(renderer, rt)
    // 2枚目の描画先（にじみと出力は1枚目の上で済むので、ほとんど使わない）は MSAA なしにする
    composer.renderTarget2.dispose()
    composer.renderTarget2.samples = 0
    composer.addPass(new CountingRenderPass(scene, rig.camera))
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.5, 0.9)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
    return composer
  }
  /** にじみを使わない画質にしたら、描画先とにじみの mip の描画先を捨てる */
  const disposeComposer = (): void => {
    if (!composer) return
    bloomPass?.dispose()
    composer.dispose()
    composer = null
    bloomPass = null
  }

  // アバターとましろ
  const player = new Player(field.walk)
  scene.add(player.avatar, player.mashiro)
  const startAt = startPoint(data, field, window.innerWidth / Math.max(1, window.innerHeight))
  player.place(startAt.x, startAt.z, startAt.heading)
  rig.yaw = rig.yawTarget = 90

  // 出会いと会話（段階2）。進み具合は端末に保存し、再読み込みしても続きから
  const progress = new ProgressStore(browserStorage(), STORY_KEY)
  encounters = new Encounters({
    field,
    hud,
    player,
    rig,
    scene,
    story,
    progress,
    sound,
    respawn: () => {
      player.place(startAt.x, startAt.z, startAt.heading)
      rig.yawTarget = 90
    },
  })

  // 歩く先の印
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x26221e,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  )
  marker.renderOrder = 9
  marker.visible = false
  scene.add(marker)

  // いまのパレットと、霧の2色（カメラの向きで混ぜる。06 §3.4）
  let palette: ScenePalette = scenePalette(look, timeOfDay)
  // 切り替えの途中（覆いの最中）に次の要求が来たときの基準（確定前の見た目・時間帯）
  let pendingLook: ViewLook = look
  let pendingTime: TimeId = timeOfDay
  // お休みの範囲の中心（遠景の地平に、その方位の灯りを映す）
  const restCenters = data.restZones.map((z) => {
    // 面積の重心（頂点の平均は、頂点の多い辺に寄るので使わない）
    let a = 0
    let x = 0
    let zz = 0
    const ps = z.polygon
    for (let i = 0; i < ps.length; i++) {
      const [x0, z0] = ps[i]
      const [x1, z1] = ps[(i + 1) % ps.length]
      const c = x0 * z1 - x1 * z0
      a += c
      x += (x0 + x1) * c
      zz += (z0 + z1) * c
    }
    if (Math.abs(a) < 1e-6) return { x: ps[0][0], z: ps[0][1] }
    return { x: x / (3 * a), z: zz / (3 * a) }
  })
  const fogAway = new THREE.Color()
  const fogToward = new THREE.Color()
  const fogNow = new THREE.Color()
  const lightH = new THREE.Vector2()

  function applyScene(): void {
    const p = scenePalette(look, timeOfDay)
    palette = p
    field.setPalette(p)
    player.setPalette(p)
    player.setQuality(quality.id === 'low')
    hemi.color.set(p.hemiSky)
    hemi.groundColor.set(p.hemiGround)
    hemi.intensity = p.hemiIntensity
    sun.color.set(p.sun)
    sun.intensity = p.sunIntensity
    setSunDir(lightDir(p))
    lightH.set(sunDir.x, sunDir.z).normalize()
    fogAway.set(p.fog)
    fogToward.set(p.fogToLight)
    fogShapeUniforms.uFogMax.value = p.fogMax
    fogShapeUniforms.uFogShape.value = p.fogShape
    inkLineUniforms.uWidth.value = p.lineWidth * renderer.getPixelRatio()
    // 光と霞では空を広く見せる（書き割りの裾を下げ、山を低めに）。
    // 白描も夕と夜は月と空を見せるので、光と霞と同じ空の帯にする（昼の白描は段階1の構図のまま）
    const wideSky = look === 'hikari' || p.time !== 'day'
    cameraTune.horizonDrop = wideSky ? 0.1 : 0
    cameraTune.ridgeFill = wideSky ? 0.62 : 0.92
    // 縦長の画面（スマホ）では、空が右上のボタンの下に隠れないよう、さらに下げる
    cameraTune.portraitHorizonLift = wideSky ? -0.15 : 0.3
    cameraTune.portraitRidgeCut = wideSky ? 0.6 : 0
    // 横長の画面（PC）は空の帯が細いので、裾を少し下げ、山を少し低くして、月の入る空を広げる
    cameraTune.wideHorizonDrop = wideSky ? 0.08 : 0
    cameraTune.wideRidgeCut = wideSky ? 0.25 : 0
    // 星のまたたきと雲海の細かさは「軽い」で止める
    backdropUniforms.uTwinkle.value = quality.id === 'low' ? 0 : 1
    backdropUniforms.uCloudDetail.value = quality.id === 'low' ? 0 : 1
    field.setQualityLevel(quality.id)
    if (bloomPass) {
      bloomPass.threshold = p.bloom.threshold
      bloomPass.strength = p.bloom.strength
      bloomPass.radius = p.bloom.radius
    }
    updateFogColor()
    hud.setLook(LOOK_LABEL[look])
    hud.setTime(TIMES.find((t) => t.id === timeOfDay)!.label)
    hud.setCreditColors(p.credit.bg, p.credit.text)
    encounters?.setPalette(p, look)
    encounters?.setBloomThreshold(quality.bloom && p.bloom.strength > 0 ? p.bloom.threshold : null)
    hud.setTheme(look === 'hikari' ? p.time : p.time === 'night' ? 'night' : 'day')
  }

  /** 霧の色: 光と反対を向いたとき fog、光の方を向いたとき fogToLight（CPU で毎フレーム1回） */
  function updateFogColor(): void {
    rig.forward(fwd)
    const w = THREE.MathUtils.smoothstep(fwd.dot(lightH), -0.2, 1.0)
    fogNow.copy(fogAway).lerp(fogToward, w)
    ;(scene.fog as THREE.Fog).color.copy(fogNow)
    inkLineUniforms.uFogColor.value.copy(fogNow)
    backdropUniforms.uMist.value.copy(fogNow)
    renderer.setClearColor(fogNow, 1)
  }

  /** 確定前の見た目と時間帯（pendingLook / pendingTime）を、覆いの下で1回だけ適用する */
  function applyPending(): void {
    look = pendingLook
    timeOfDay = pendingTime
    applyScene()
    document.body.style.background = `#${new THREE.Color(palette.fog).getHexString()}`
    saved.look = look
    saved.lookV = LOOK_VERSION
    saved.time = timeOfDay
    save(saved)
  }

  function setLook(id: ViewLook): void {
    pendingLook = id
    hud.veilSwap(`#${new THREE.Color(scenePalette(pendingLook, pendingTime).fog).getHexString()}`, applyPending)
  }

  function setTime(id: TimeId): void {
    pendingTime = id
    hud.veilSwap(`#${new THREE.Color(scenePalette(pendingLook, pendingTime).fog).getHexString()}`, applyPending)
  }

  function cycleTime(): void {
    // 出会いの途中（耳を澄まし終えてから、別れ終わるまで）は、T キーでも右上の「時間」でも変えない
    // （寄り道の妖怪の出る・出ないは時間帯で決まるので、話の途中で変えない）
    if (encounters?.engaged) return
    // 覆いの最中に続けて押されたら、確定前の時間帯の次へ進める
    const i = TIMES.findIndex((t) => t.id === pendingTime)
    setTime(TIMES[(i + 1) % TIMES.length].id)
  }

  function setSpeed(next: 'normal' | 'fast'): void {
    speed = next
    player.speedScale = next === 'fast' ? FAST_SCALE : 1
    hud.setSpeed(next === 'fast' ? 'はやい' : 'ふつう')
    saved.speed = next
    save(saved)
  }

  function setSound(on: boolean): void {
    sound.unlock()
    sound.setEnabled(on)
    hud.setSound(on)
    saved.sound = on
    save(saved)
  }

  function setQuality(q: Quality): void {
    const shadowChanged = q.shadows !== renderer.shadowMap.enabled
    quality = q
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr))
    renderer.shadowMap.enabled = q.shadows
    sun.castShadow = q.shadows
    if (q.bloom) {
      ensureComposer()
      if (bloomPass) {
        bloomPass.threshold = palette.bloom.threshold
        bloomPass.strength = palette.bloom.strength
        bloomPass.radius = palette.bloom.radius
      }
    } else disposeComposer()
    encounters?.setBloomThreshold(q.bloom && palette.bloom.strength > 0 ? palette.bloom.threshold : null)
    backdropUniforms.uTwinkle.value = q.id === 'low' ? 0 : 1
    backdropUniforms.uCloudDetail.value = q.id === 'low' ? 0 : 1
    field.setQualityLevel(q.id)
    player.setQuality(q.id === 'low')
    if (shadowChanged) {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true))
        else if (m) m.needsUpdate = true
      })
    }
    field.setTextureSize(q.texture, palette)
    resize()
    hud.setQuality(q.label)
    saved.quality = q.id
    save(saved)
  }

  let lastW = 0
  let lastH = 0
  let lastPr = 0
  function resize(): void {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    const prWant = Math.min(window.devicePixelRatio || 1, quality.dpr)
    // window の resize と ResizeObserver の両方から呼ばれるので、変わっていなければ何もしない
    if (w === lastW && h === lastH && prWant === lastPr && renderer.getPixelRatio() === prWant) return
    lastW = w
    lastH = h
    lastPr = prWant
    // 画面の拡大率やモニターが変わったときにも、描画の画素比を合わせ直す
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr))
    renderer.setSize(w, h, true)
    rig.setViewport(w, h)
    const pr = renderer.getPixelRatio()
    inkLineUniforms.uResolution.value.set(w * pr, h * pr)
    inkLineUniforms.uWidth.value = palette.lineWidth * pr
    field.motes.setViewport(pr, h * pr, rig.camera.fov)
    // にじみを使う画質のときだけ（描画先の setSize は大きさが同じなら何もしない）
    if (composer && quality.bloom) {
      composer.setPixelRatio(pr)
      composer.setSize(w, h)
    }
  }

  /** 見た目の地面の高さ（曲げ込み。箱庭の外は縁の高さ） */
  const groundSeen = (x: number, z: number): number => {
    const [cx, cz] = clampToRect(data.rect, x, z)
    return field.hf.heightAt(cx, cz) - bendDrop(x, z)
  }

  // 地面を指した点（曲げた見た目の地面と、視線の交わり）
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, rig.camera)
    const o = ray.ray.origin
    const d = ray.ray.direction
    const below = (t: number) => {
      const x = o.x + d.x * t
      const z = o.z + d.z * t
      return o.y + d.y * t - (field.hf.heightAt(x, z) - bendDrop(x, z))
    }
    let prev = 0
    let t = 0.5
    while (t < 1500) {
      if (below(t) <= 0) {
        let lo = prev
        let hi = t
        for (let i = 0; i < 24; i++) {
          const m = (lo + hi) / 2
          if (below(m) <= 0) hi = m
          else lo = m
        }
        const x = o.x + d.x * hi
        const z = o.z + d.z * hi
        if (!inRect(data.rect, x, z, -29)) return null
        const [cx, cz] = clampToRect(data.rect, x, z, 1)
        return new THREE.Vector3(cx, field.hf.heightAt(cx, cz), cz)
      }
      prev = t
      t += Math.max(0.4, t * 0.015)
    }
    return null
  }

  const fwd = new THREE.Vector2()
  const controls = new Controls(renderer.domElement, {
    pickGround,
    walkTo: (p) => {
      if (encounters?.busy) return
      player.walkTarget = new THREE.Vector2(p.x, p.z)
      markerAge = 0
    },
    zoom: (f) => rig.zoomBy(f),
    rotate: (dir) => rig.rotateStep(dir),
    toggleSpeed: () => setSpeed(speed === 'fast' ? 'normal' : 'fast'),
    firstInput: () => {
      hud.hideHint()
      sound.unlock()
    },
    stickVisual: (show, ox, oy, kx, ky) => hud.setStick(show, ox, oy, kx, ky),
  })

  setQuality(quality)
  applyScene()
  document.body.style.background = `#${new THREE.Color(palette.fog).getHexString()}`
  saved.look = look
  saved.lookV = LOOK_VERSION
  saved.time = timeOfDay
  save(saved)
  setSpeed(speed)
  hud.setSound(sound.enabled)
  // T キーで時間帯（昼 → 夕 → 夜）、M キーで曼荼羅帳。出会いの途中（耳を澄まし終えてから、別れ終わるまで）は、どちらも効かない
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (encounters?.engaged) return
    if (e.code === 'KeyT') cycleTime()
    if (e.code === 'KeyM') encounters?.openMandala()
  })
  window.addEventListener('resize', resize)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(host)
  // devicePixelRatio の変化（別のモニターへ移したときなど。resize が来ない場合がある）
  const watchDpr = () => {
    try {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      mq.addEventListener(
        'change',
        () => {
          resize()
          watchDpr()
        },
        { once: true },
      )
    } catch {
      // matchMedia が使えなくても、resize で追従する
    }
  }
  watchDpr()

  if (!saved.hintSeen) {
    hud.showHint(isTouch, () => {
      saved.hintSeen = true
      save(saved)
      sound.unlock()
    })
  }

  // ループ
  let raf = 0
  let last = performance.now()
  let time = 0
  let frames = 0
  let fpsStart = performance.now()
  let fps = 0
  let perfWasOpen = false
  let markerAge = 0
  let lastRestToast = -999
  let lastEdgeToast = -999
  const debug = { calls: 0, tris: 0, post: 0 }
  renderer.info.autoReset = false
  const lightView = new THREE.Vector3()

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    time += dt

    rig.forward(fwd)
    // 会話・曼荼羅帳を開いている間は、アバターを止める
    const busy = encounters?.busy ?? false
    if (busy) player.walkTarget = null
    const ev = player.update(dt, time, busy ? STILL : controls.intent(fwd.x, fwd.y))
    if (ev.hitRest && time - lastRestToast > 8) {
      lastRestToast = time
      hud.toast('ここから先は、祈りの場所。妖怪は外で待っている')
    }
    if (ev.hitEdge && time - lastEdgeToast > 8) {
      lastEdgeToast = time
      hud.toast('この先は、まだ夢がつながっていない')
    }
    rig.update(dt, encounters?.cameraFocus ?? player.pos)
    hud.setCompass(rig.yaw)
    // 遠景の板の深さ（行ごとに、見える地面の手前）と、お休みの範囲の方位
    rig.camera.updateMatrixWorld()
    updateBackdropDepth(rig.camera, groundSeen)
    if (restCenters.length) {
      let best = restCenters[0]
      let bd = Infinity
      for (const c of restCenters) {
        const d = (c.x - player.pos.x) ** 2 + (c.z - player.pos.z) ** 2
        if (d < bd) {
          bd = d
          best = c
        }
      }
      backdropUniforms.uRestAz.value = Math.atan2(best.x - player.pos.x, -(best.z - player.pos.z))
    }

    const fog = scene.fog as THREE.Fog
    // 耳を澄ますと、霞が寄る（霧の近い側・遠い側を縮める）
    const pull = encounters?.fogPull ?? 0
    fog.near = rig.fogNear * palette.fogNearK * (1 - 0.4 * pull)
    fog.far = Math.max(fog.near + 20, rig.fogFar * palette.fogFarK * (1 - 0.3 * pull))
    inkLineUniforms.uFogNear.value = fog.near
    inkLineUniforms.uFogFar.value = fog.far
    lampUniforms.uFogNear.value = moteUniforms.uFogNear.value = fog.near
    lampUniforms.uFogFar.value = moteUniforms.uFogFar.value = fog.far
    windowUniforms.uFogNear.value = fog.near
    windowUniforms.uFogFar.value = fog.far
    updateFogColor()
    // 逆光のふち: 光源へ向かう向きをビュー座標で
    lightView.copy(sunDir).transformDirection(rig.camera.matrixWorldInverse)
    inkRimUniforms.uLightDirView.value.copy(lightView)

    // 影は、アバターのまわりだけ。影のカメラは texel の格子に合わせて置く（動くたびに影の縁がちらつかないように）
    {
      const t = rig.target
      const a = Math.round(t.dot(lightX) / shadowTexel) * shadowTexel
      const b = Math.round(t.dot(lightY) / shadowTexel) * shadowTexel
      snapped.copy(lightX).multiplyScalar(a).addScaledVector(lightY, b).addScaledVector(sunDir, t.dot(sunDir))
      sun.target.position.copy(snapped)
      sun.position.copy(snapped).addScaledVector(sunDir, 120)
    }

    field.update(time, player.pos.x, player.pos.z)
    const near = field.spots.update(time, dt, player.pos.x, player.pos.z)
    encounters?.update(dt, time, near)

    if (player.walkTarget) {
      markerAge += dt
      const tx = player.walkTarget.x
      const tz = player.walkTarget.y
      marker.visible = true
      marker.position.set(tx, field.walk.decalY(tx, tz, 0.6) + 0.12 - bendDrop(tx, tz), tz)
      const s = 1 + 0.12 * Math.sin(markerAge * 5)
      marker.scale.set(s, 1, s)
    } else marker.visible = false

    renderer.info.reset()
    if (quality.bloom && composer && palette.bloom.strength > 0) {
      composer.render(dt)
      debug.calls = renderer.info.render.calls
      debug.post = debug.calls - sceneCalls
    } else {
      renderer.render(scene, rig.camera)
      debug.calls = renderer.info.render.calls
      debug.post = 0
    }
    debug.tris = renderer.info.render.triangles

    // fps は実際の時間で測る（dt は 0.1 秒で頭打ちにしているため）
    frames++
    const span = (now - fpsStart) / 1000
    const toggled = hud.perfExpanded !== perfWasOpen
    if (span >= 0.5 || (toggled && SHOW_PERF)) {
      perfWasOpen = hud.perfExpanded
      if (span >= 0.5) {
        fps = Math.round(frames / span)
        frames = 0
        fpsStart = now
      }
      if (!SHOW_PERF) return
      let text = `${fps} fps ・ 描画 ${debug.calls}`
      if (hud.perfExpanded) {
        text +=
          `\n三角形 ${debug.tris.toLocaleString('ja-JP')}` +
          `\n解像度 ×${renderer.getPixelRatio()}  影 ${quality.shadows ? 'あり' : 'なし'}` +
          `\nにじみ ${debug.post ? `あり（後処理 ${debug.post}）` : 'なし'}` +
          `\n灯り ${field.lamps.count}` +
          `\n木 ${field.stats.trees}  線 ${field.stats.lineSegments}` +
          `\n家 ${field.stats.buildings}（仮 ${field.stats.placeholders}）  窓 ${field.stats.windows}` +
          `\n位置 ${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}` +
          `\nズーム ${rig.dist.toFixed(0)}m`
      }
      hud.setPerf(text)
    }
  }

  function run(): void {
    if (raf) return
    last = performance.now()
    fpsStart = last
    frames = 0
    raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    cancelAnimationFrame(raf)
    raf = 0
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()))
  run()

  // 開発・確認用（Playwright から位置や状態を読む）
  ;(window as unknown as { __yume: unknown }).__yume = {
    player,
    rig,
    cameraTune,
    field,
    renderer,
    sun,
    setLook,
    setTime,
    encounters,
    progress,
    sound,
    setQuality: (id: Quality['id']) => setQuality(QUALITIES.find((q) => q.id === id) ?? quality),
    get look() {
      return look
    },
    get timeOfDay() {
      return timeOfDay
    },
    get stats() {
      return { fps, ...debug }
    },
    get time() {
      return time
    },
  }
}

/**
 * はじめの位置: 1つ目の地点から 15〜60m の道の上で、東（立山の方角）を向いたとき、
 * 前方に家並みと気配の印がなるべく多く入る所。道の上に良い所がなければ、道の外も見る。
 * 1つ目の地点（光蔵坊）までは最大 60m（歩いて 20 秒ほど）。
 */
function startPoint(data: ReturnType<typeof loadFieldData>, field: Field, aspect = 1.6): { x: number; z: number; heading: number } {
  // 縦長の画面（スマホ）は横の画角が狭いので、画面に入る左右の幅を縦横比に合わせて狭める
  const side = aspect >= 1 ? 0.7 : Math.max(0.16, 0.7 * (aspect - 0.25))
  const s = data.spots[0]
  if (!s) return { x: 0, z: 0, heading: Math.PI / 2 }
  const centroids = data.buildings.map((b) => {
    let x = 0
    let z = 0
    for (const p of b.polygon) {
      x += p[0]
      z += p[1]
    }
    return [x / b.polygon.length, z / b.polygon.length] as const
  })
  const candidates: { x: number; z: number; road: boolean }[] = []
  for (const r of data.roads) {
    if (r.inRestZone) continue
    for (const p of densify(r.points, 2)) candidates.push({ x: p[0], z: p[1], road: true })
  }
  for (let x = s.x - 60; x <= s.x + 60; x += 4) for (let z = s.z - 60; z <= s.z + 60; z += 4) candidates.push({ x, z, road: false })
  let best = { x: s.x - 15, z: s.z }
  let bestScore = -Infinity
  for (const c of candidates) {
    const d = Math.hypot(c.x - s.x, c.z - s.z)
    if (d < 15 || d > 60) continue
    // 東を向いた画面に入るおおよその範囲（前方 15〜65m、左右は前方の距離に比例。縦長では狭い。横長は段階1b と同じ）
    const inView = (x: number, z: number) => {
      const ahead = x - c.x
      return ahead > 15 && ahead < 65 && Math.abs(z - c.z) < (aspect >= 1 ? 10 : 3) + ahead * side
    }
    // 建物のすぐ横は避ける（アバターが隠れないように）
    if (centroids.some(([cx, cz]) => Math.hypot(cx - c.x, cz - c.z) < 9)) continue
    let score = c.road ? 8 : 0
    for (const [cx, cz] of centroids) if (inView(cx, cz)) score += 1
    if (aspect >= 1) {
      if (inView(s.x, s.z)) score += 4
    } else {
      // 縦長の画面は横の画角が狭い（ズーム 62m でアバターの左右 約16m まで）。
      // 気配の印（墨のにじみ）がアバターの左右 9m 以内・前後の近くに入ることを、家並みより重く見る（ヒントの「墨のにじみ」が見えるように）
      const ahead = s.x - c.x
      if (Math.abs(s.z - c.z) < 9 && ahead > -6 && ahead < 20) score += 10
    }
    score -= d * 0.03
    if (score > bestScore && !field.walk.isInsideRest(c.x, c.z) && field.walk.isWalkable(c.x, c.z)) {
      bestScore = score
      best = { x: c.x, z: c.z }
    }
  }
  const w = field.walk.findWalkableNear(best.x, best.z)
  return { x: w.x, z: w.z, heading: Math.PI / 2 }
}

// はじめる（約束をまだ読んでいなければ、先に1画面ずつ。読み終えるまで箱庭は始めない）
if (import.meta.env.MODE === 'artifact') start()
else {
  const veil = document.createElement('div')
  veil.className = 'pr-sheet'
  document.getElementById('app')!.appendChild(veil)
  withPromises({
    host: veil,
    journey: '夢の旅',
    home: true,
    back: { label: '入口へ', href: './' },
    done: () => {
      veil.remove()
      start()
    },
  })
}
