// 夢の旅（家の3D箱庭）の入口。段階1a「夢の旅の骨組み」。
// 地域パックの 400m 四方を、OSM と標高タイルから組み立てて、アバターとましろで歩く。
// 画面に出す地域の名前は、地域パックの name（了承が出るまでは仮の呼び方）だけを使う。

import * as THREE from 'three'
import { bendDrop } from './bend'
import { CameraRig, cameraTune } from './camera'
import { Controls } from './controls'
import { loadFieldData } from './data'
import { Field } from './field'
import { inkLineUniforms } from './field/ink-lines'
import { densify } from './geom2d'
import { Hud } from './hud'
import { type LookId, PALETTES } from './palette'
import { FAST_SCALE, Player } from './player'

const TITLE_PREFIX = '夢の旅 試作'
const STORE_KEY = 'yume.v1'

interface Quality {
  id: 'low' | 'std' | 'high'
  label: string
  dpr: number
  shadows: boolean
  texture: number
}

const isTouch = (() => {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  } catch {
    return false
  }
})()

const QUALITIES: Quality[] = [
  { id: 'low', label: '軽い', dpr: 1, shadows: false, texture: 1024 },
  { id: 'std', label: '標準', dpr: isTouch ? 1.5 : 2, shadows: false, texture: 2048 },
  { id: 'high', label: '影あり', dpr: 2, shadows: true, texture: 2048 },
]

interface Saved {
  speed?: 'normal' | 'fast'
  look?: LookId
  quality?: Quality['id']
  hintSeen?: boolean
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

function start(): void {
  const host = document.getElementById('app')!
  const saved = loadSaved()
  let look: LookId = saved.look === 'saishiki' ? 'saishiki' : 'hakubyo'
  let quality = QUALITIES.find((q) => q.id === saved.quality) ?? QUALITIES[1]

  const data = loadFieldData()

  const hud = new Hud(host, `${TITLE_PREFIX} ・ ${data.pack.name}`, data.attributions, {
    rotate: (d) => rig.rotateStep(d),
    toggleLook: () => setLook(look === 'hakubyo' ? 'saishiki' : 'hakubyo'),
    cycleQuality: () => setQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]),
    toggleSpeed: () => setSpeed(speed === 'fast' ? 'normal' : 'fast'),
  })
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

  // 光（日は南南西から）
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d2c4, 2)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  const sunDir = new THREE.Vector3(-0.254, 0.669, 0.698).normalize()
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -55
  sc.right = sc.top = 55
  sc.near = 1
  sc.far = 260
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.04
  sun.shadow.radius = 2
  scene.add(sun, sun.target)
  // 影のカメラを、シャドウマップの1画素（texel）の格子に合わせて動かすための、光の向きの座標軸
  const shadowTexel = (sc.right - sc.left) / sun.shadow.mapSize.x
  const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
  const lightY = new THREE.Vector3().crossVectors(sunDir, lightX)
  const snapped = new THREE.Vector3()

  // アバターとましろ
  const player = new Player(field.walk)
  scene.add(player.avatar, player.mashiro)
  const startAt = startPoint(data, field)
  player.place(startAt.x, startAt.z, startAt.heading)
  rig.yaw = rig.yawTarget = 90

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

  function setLook(id: LookId): void {
    look = id
    const p = PALETTES[id]
    field.setPalette(p)
    player.setPalette(p)
    hemi.color.set(p.hemiSky)
    hemi.groundColor.set(p.hemiGround)
    hemi.intensity = p.hemiIntensity
    sun.color.set(p.sun)
    sun.intensity = p.sunIntensity
    ;(scene.fog as THREE.Fog).color.set(p.fog)
    inkLineUniforms.uFogColor.value.set(p.fog)
    inkLineUniforms.uWidth.value = p.lineWidth * renderer.getPixelRatio()
    renderer.setClearColor(p.fog, 1)
    hud.setLook(p.label)
    saved.look = id
    save(saved)
  }

  function setSpeed(next: 'normal' | 'fast'): void {
    speed = next
    player.speedScale = next === 'fast' ? FAST_SCALE : 1
    hud.setSpeed(next === 'fast' ? 'はやい' : 'ふつう')
    saved.speed = next
    save(saved)
  }

  function setQuality(q: Quality): void {
    const shadowChanged = q.shadows !== renderer.shadowMap.enabled
    quality = q
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr))
    renderer.shadowMap.enabled = q.shadows
    sun.castShadow = q.shadows
    if (shadowChanged) {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true))
        else if (m) m.needsUpdate = true
      })
    }
    field.setTextureSize(q.texture, PALETTES[look])
    resize()
    hud.setQuality(q.label)
    saved.quality = q.id
    save(saved)
  }

  function resize(): void {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    // 画面の拡大率やモニターが変わったときにも、描画の画素比を合わせ直す
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr))
    renderer.setSize(w, h, true)
    rig.setViewport(w, h)
    const pr = renderer.getPixelRatio()
    inkLineUniforms.uResolution.value.set(w * pr, h * pr)
    inkLineUniforms.uWidth.value = PALETTES[look].lineWidth * pr
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
        const lim = data.half - 1
        if (Math.abs(x) > lim + 30 || Math.abs(z) > lim + 30) return null
        const cx = Math.max(-lim, Math.min(lim, x))
        const cz = Math.max(-lim, Math.min(lim, z))
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
      player.walkTarget = new THREE.Vector2(p.x, p.z)
      markerAge = 0
    },
    zoom: (f) => rig.zoomBy(f),
    rotate: (dir) => rig.rotateStep(dir),
    toggleSpeed: () => setSpeed(speed === 'fast' ? 'normal' : 'fast'),
    firstInput: () => hud.hideHint(),
    stickVisual: (show, ox, oy, kx, ky) => hud.setStick(show, ox, oy, kx, ky),
  })

  setQuality(quality)
  setLook(look)
  setSpeed(speed)
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
  const debug = { calls: 0, tris: 0 }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    time += dt

    rig.forward(fwd)
    const ev = player.update(dt, time, controls.intent(fwd.x, fwd.y))
    if (ev.hitRest && time - lastRestToast > 8) {
      lastRestToast = time
      hud.toast('ここから先は、祈りの場所。妖怪は外で待っている')
    }
    if (ev.hitEdge && time - lastEdgeToast > 8) {
      lastEdgeToast = time
      hud.toast('この先は、まだ夢がつながっていない')
    }
    rig.update(dt, player.pos)
    hud.setCompass(rig.yaw)

    const fog = scene.fog as THREE.Fog
    fog.near = rig.fogNear
    fog.far = rig.fogFar
    inkLineUniforms.uFogNear.value = fog.near
    inkLineUniforms.uFogFar.value = fog.far

    // 影は、アバターのまわりだけ。影のカメラは texel の格子に合わせて置く（動くたびに影の縁がちらつかないように）
    {
      const t = rig.target
      const a = Math.round(t.dot(lightX) / shadowTexel) * shadowTexel
      const b = Math.round(t.dot(lightY) / shadowTexel) * shadowTexel
      snapped.copy(lightX).multiplyScalar(a).addScaledVector(lightY, b).addScaledVector(sunDir, t.dot(sunDir))
      sun.target.position.copy(snapped)
      sun.position.copy(snapped).addScaledVector(sunDir, 120)
    }

    field.update(time)
    const near = field.spots.update(time, dt, player.pos.x, player.pos.z)
    hud.showPrompt(near !== null)

    if (player.walkTarget) {
      markerAge += dt
      const tx = player.walkTarget.x
      const tz = player.walkTarget.y
      marker.visible = true
      marker.position.set(tx, field.walk.decalY(tx, tz, 0.6) + 0.12 - bendDrop(tx, tz), tz)
      const s = 1 + 0.12 * Math.sin(markerAge * 5)
      marker.scale.set(s, 1, s)
    } else marker.visible = false

    renderer.render(scene, rig.camera)
    debug.calls = renderer.info.render.calls
    debug.tris = renderer.info.render.triangles

    // fps は実際の時間で測る（dt は 0.1 秒で頭打ちにしているため）
    frames++
    const span = (now - fpsStart) / 1000
    const toggled = hud.perfExpanded !== perfWasOpen
    if (span >= 0.5 || toggled) {
      perfWasOpen = hud.perfExpanded
      if (span >= 0.5) {
        fps = Math.round(frames / span)
        frames = 0
        fpsStart = now
      }
      let text = `${fps} fps ・ 描画 ${debug.calls}`
      if (hud.perfExpanded) {
        text +=
          `\n三角形 ${debug.tris.toLocaleString('ja-JP')}` +
          `\n解像度 ×${renderer.getPixelRatio()}  影 ${quality.shadows ? 'あり' : 'なし'}` +
          `\n木 ${field.stats.trees}  線 ${field.stats.lineSegments}` +
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
    setLook,
    get look() {
      return look
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
 * はじめの位置: 1つ目の地点から 15〜60m の所で、東（立山の方角）を向いたとき、
 * 前方に家並みと気配の印がなるべく多く入る所（道の上を少し優先）。
 */
function startPoint(data: ReturnType<typeof loadFieldData>, field: Field): { x: number; z: number; heading: number } {
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
    // 東を向いた画面に入るおおよその範囲（前方 8〜60m、左右は前方の距離の 0.8 倍まで）
    const inView = (x: number, z: number) => {
      const ahead = x - c.x
      return ahead > 15 && ahead < 65 && Math.abs(z - c.z) < 10 + ahead * 0.7
    }
    // 建物のすぐ横は避ける（アバターが隠れないように）
    if (centroids.some(([cx, cz]) => Math.hypot(cx - c.x, cz - c.z) < 16)) continue
    let score = c.road ? 1.5 : 0
    for (const [cx, cz] of centroids) if (inView(cx, cz)) score += 1
    if (inView(s.x, s.z)) score += 4
    score -= d * 0.03
    if (score > bestScore && !field.walk.isInsideRest(c.x, c.z) && field.walk.isWalkable(c.x, c.z)) {
      bestScore = score
      best = { x: c.x, z: c.z }
    }
  }
  const w = field.walk.findWalkableNear(best.x, best.z)
  return { x: w.x, z: w.z, heading: Math.PI / 2 }
}

start()
