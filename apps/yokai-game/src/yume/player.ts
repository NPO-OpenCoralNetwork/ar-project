// アバター（笠をかぶった絵解き師の見習い）と、相棒ましろ（白い紙の鳥）。
// 夢の旅（家のゲームモード）の歩く速さ。現実の歩行（約1.3m/s）より速くして、箱庭を気持ちよく回れるようにする。
// 歩く 3m/s、走る 7m/s。HUD の「速さ」で、さらに 1.8 倍にできる。地面の高さに沿って歩く。
//
// 見た目の決まりは docs/yokai-game/06-art-direction.md §4（形のルール）:
// - アバター: 平たい笠（直径は肩幅の 1.4 倍以上）＋ 道中合羽（肩から膝へ広がる釣鐘の形、前が少し開く）＋ 細い脚。
//   背中に茜の巻物。顔は描かず、笠の影に沈める。角の丸い単純な形で、シルエットで読ませる。
// - ましろ: 平らな三角の面だけで作る折り紙の鳥。光の影響を受けない紙の白で、ほのかに自分で光る（加算の光の輪）。
//
// 描画命令を少なくするため、アバターは1つのメッシュにまとめ（脚の振りと合羽のなびきは CPU で頂点を動かす）、
// ましろも面1つ・折り目の線1つ・光の輪1つにする。足元の影1つ、夕・夜だけ足元の明かり1つ、白描だけ笠の縁の墨の線1つ。

import * as THREE from 'three'
import { applyBend, bendDrop } from './bend'
import type { Palette } from './palette'
import type { Walkability } from './walk'

export const WALK_SPEED = 3
export const RUN_SPEED = 7
/** HUD の「速さ: はやい」のときの倍率 */
export const FAST_SCALE = 1.8
/** 1回の当たり判定で進む最大の距離（速く動いても壁や線路をすり抜けないように分割する） */
const MAX_SUBSTEP = 0.25
const RADIUS = 0.35
/** 小さすぎると見失うので、箱庭の見せ方として少し大きめに描く */
const AVATAR_SCALE = 1.35
const MASHIRO_SCALE = 1.5

// パレットに無いときの色（06 §8 の「光と霞」の値に合わせる）
/** 合羽の下の着物（生成り） */
const DEFAULT_ROBE_UNDER = 0xefe6d6
/** 脚絆（脚）は合羽の色をこの色へ寄せる */
const LEG_INK = 0x1c1e28
const DEFAULT_MASHIRO = { paper: 0xfbf8f0, line: 0x8a7e70, lineAlpha: 0.45, glow: 0xfff1d6, glowAlpha: 0.18, poolAlpha: 0 }
const DEFAULT_BLOB = { color: 0x1e1a16, opacity: 0.45 }

/** パレットに後から足される（かもしれない）項目。無ければ既定値を使う */
interface AvatarExtras {
  robeUnder?: number
  mashiro?: { paper: number; line: number; lineAlpha: number; glow: number; glowAlpha: number; poolAlpha: number }
  blobShadow?: { color: number; opacity: number }
  /** 光と霞の時間帯パレット（hikari.ts）での、ましろの光の輪と足元の明かり */
  mashiroGlow?: { color: number; alpha: number; poolAlpha: number }
}

export interface MoveIntent {
  /** 水平の移動方向（世界座標、長さ 0〜1） */
  x: number
  z: number
  run: boolean
}

export interface PlayerEvents {
  hitRest: boolean
  hitEdge: boolean
}

// ---------------------------------------------------------------------------
// アバターの形（ローカル座標。-z が前、+x が右、y が上。AVATAR_SCALE を掛ける前の値）

/** 頂点の色の種類 */
const C_ROBE = 0
const C_UNDER = 1
const C_HAT = 2
const C_SKIN = 3
const C_PACK = 4
const C_LEGS = 5
const COLOR_KEYS = 6

/** 頂点の動き方 */
const B_STATIC = 0
const B_LEG_L = 1
const B_LEG_R = 2
const B_CAPE = 3

const HIP_Y = 0.42
const LEG_X = 0.085
/** 合羽の肩と裾の高さ（なびきの重みを決める） */
const CAPE_TOP = 0.97
const CAPE_HEM = 0.35

interface AvatarGeometry {
  geo: THREE.BufferGeometry
  base: Float32Array
  key: Uint8Array
  shade: Float32Array
  /** 脚の頂点の番号 */
  legL: Uint32Array
  legR: Uint32Array
  /** 合羽の頂点の番号と、その重み（肩 0 → 裾 1 の二乗）・後ろ向きの度合い（0〜1）・方位 */
  cape: Uint32Array
  capeW: Float32Array
  capeBack: Float32Array
  capeTh: Float32Array
}

function buildAvatar(): AvatarGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const key: number[] = []
  const shade: number[] = []
  const bone: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  /** 部品を足す。colorOf は三角形ごとに [色の種類, 明るさ] を返す */
  const add = (
    src: THREE.BufferGeometry,
    boneId: number,
    colorOf: (tri: number, cx: number, cy: number, cz: number, ny: number) => [number, number],
  ): void => {
    const g = src.index ? src.toNonIndexed() : src
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    const triCount = p.count / 3
    for (let t = 0; t < triCount; t++) {
      a.fromBufferAttribute(p, t * 3)
      b.fromBufferAttribute(p, t * 3 + 1)
      c.fromBufferAttribute(p, t * 3 + 2)
      const ny = (n.getY(t * 3) + n.getY(t * 3 + 1) + n.getY(t * 3 + 2)) / 3
      const [k, s] = colorOf(t, (a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, ny)
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v
        pos.push(p.getX(i), p.getY(i), p.getZ(i))
        nor.push(n.getX(i), n.getY(i), n.getZ(i))
        key.push(k)
        shade.push(s)
        bone.push(boneId)
      }
    }
    g.dispose()
    if (g !== src) src.dispose()
  }
  const v2 = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y))

  // 道中合羽: 肩から膝へ広がる釣鐘。裾は少し厚みを持たせて内側へ折り返す。
  // 前（-z）の中央は、下へいくほど開いて生成りの着物が見える（Sky のマントと違う、和の合羽の形）。
  const capeProfile = v2([
    [0.3, 0.37],
    [0.355, CAPE_HEM],
    [0.33, 0.47],
    [0.29, 0.61],
    [0.262, 0.75],
    [0.24, 0.86],
    [0.205, 0.945],
    [0.14, 0.995],
    [0.1, 1.01],
  ])
  add(new THREE.LatheGeometry(capeProfile, 20), B_CAPE, (t, cx, cy, cz) => {
    const j = (t >> 1) % (capeProfile.length - 1)
    if (j === 0) return [C_ROBE, 0.55] // 裾の内側の折り返し
    const th = Math.abs(Math.atan2(cx, -cz)) // 0 = 前
    const h = THREE.MathUtils.clamp((0.86 - cy) / (0.86 - CAPE_HEM), 0, 1)
    if (cy < 0.86 && th < 0.04 + 0.36 * h) return [C_UNDER, 0.9]
    // 裾の帯を少しだけ濃く（形を締める）
    return [C_ROBE, j === 1 ? 0.78 : 1]
  })
  // 襟（生成り）
  add(new THREE.CylinderGeometry(0.098, 0.118, 0.07, 12, 1, true).translate(0, 1.02, 0), B_STATIC, () => [C_UNDER, 0.95])
  // 頭（顔は描かない。笠の影で暗く沈める）
  add(new THREE.SphereGeometry(0.115, 10, 7).translate(0, 1.1, -0.01), B_STATIC, (_t, _x, cy) => [C_SKIN, cy > 1.13 ? 0.35 : 0.42])
  // 笠: 平たい円錐。上はふっくら、縁は薄く、裏は暗い。てっぺんに小さなつまみ
  const hatProfile = v2([
    [0.0, 0.245],
    [0.028, 0.236],
    [0.04, 0.212],
    [0.13, 0.16],
    [0.26, 0.085],
    [0.375, 0.022],
    [0.405, 0.004],
    [0.39, -0.012],
    [0.25, 0.03],
    [0.0, 0.07],
  ])
  const hatY = 1.13
  add(new THREE.LatheGeometry(hatProfile, 18).translate(0, hatY, 0), B_STATIC, (t) => {
    const j = (t >> 1) % (hatProfile.length - 1)
    if (j >= 7) return [C_HAT, 0.42] // 裏
    if (j === 6) return [C_HAT, 0.8] // 縁の厚み
    if (j <= 1) return [C_HAT, 0.88] // つまみ
    return [C_HAT, 1]
  })
  // 背中の巻物（絵解きの道具）。茜の包みで、両端は紙の色
  const scroll = new THREE.CylinderGeometry(0.052, 0.052, 0.36, 8, 1)
  scroll.rotateZ(Math.PI / 2 - 0.32)
  scroll.translate(0, 0.79, 0.29)
  add(scroll, B_STATIC, (t) => (t < 16 ? [C_PACK, 1] : [C_UNDER, 0.92]))
  // 巻物の紐（合羽の上を斜めに）
  const cord = new THREE.TorusGeometry(0.255, 0.012, 3, 14, Math.PI * 0.9)
  cord.rotateY(Math.PI / 2)
  cord.rotateX(-0.5)
  cord.translate(0, 0.86, 0.02)
  add(cord, B_STATIC, () => [C_PACK, 0.7])
  // 細い脚（脚絆）と、わらじ
  for (const side of [-1, 1] as const) {
    const id = side < 0 ? B_LEG_L : B_LEG_R
    const leg = new THREE.CylinderGeometry(0.052, 0.04, HIP_Y - 0.03, 6, 1).translate(side * LEG_X, (HIP_Y + 0.03) / 2, 0)
    add(leg, id, () => [C_LEGS, 1])
    const foot = new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.55, 1.6).translate(side * LEG_X, 0.028, -0.025)
    add(foot, id, () => [C_LEGS, 0.8])
  }

  const count = pos.length / 3
  const geo = new THREE.BufferGeometry()
  const base = new Float32Array(pos)
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  // なびきで少し動くので、境界球は大きめに固定する
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.1)

  const legL: number[] = []
  const legR: number[] = []
  const cape: number[] = []
  const capeW: number[] = []
  const capeBack: number[] = []
  const capeTh: number[] = []
  for (let i = 0; i < count; i++) {
    if (bone[i] === B_LEG_L) legL.push(i)
    else if (bone[i] === B_LEG_R) legR.push(i)
    else if (bone[i] === B_CAPE) {
      const x = base[i * 3]
      const y = base[i * 3 + 1]
      const z = base[i * 3 + 2]
      const h = THREE.MathUtils.clamp((CAPE_TOP - y) / (CAPE_TOP - CAPE_HEM), 0, 1)
      if (h <= 0) continue
      const th = Math.atan2(x, z) // 0 = 後ろ
      cape.push(i)
      capeW.push(h * h)
      capeBack.push(0.5 + 0.5 * Math.cos(th))
      capeTh.push(th)
    }
  }
  return {
    geo,
    base,
    key: new Uint8Array(key),
    shade: new Float32Array(shade),
    legL: new Uint32Array(legL),
    legR: new Uint32Array(legR),
    cape: new Uint32Array(cape),
    capeW: new Float32Array(capeW),
    capeBack: new Float32Array(capeBack),
    capeTh: new Float32Array(capeTh),
  }
}

// ---------------------------------------------------------------------------
// ましろの形（ローカル座標。-z が頭。MASHIRO_SCALE を掛ける前の値）。平らな三角の面だけで作る

/** 点の動き方: 0 = 胴、1/2 = 左の翼の内・外、3/4 = 右の翼の内・外 */
const BIRD_POINTS: [number, number, number, number][] = [
  // 胴
  [0, 0.085, -0.3, 0], // 0 くちばしの先（少し上を向く）
  [0, 0.05, 0.02, 0], // 1 背の稜線
  [0, -0.05, 0.0, 0], // 2 腹の稜線
  [-0.045, 0.0, -0.02, 0], // 3 左わき
  [0.045, 0.0, -0.02, 0], // 4 右わき
  [0, 0.11, 0.3, 0], // 5 尾の先（はね上げる）
  // 左の翼
  [-0.03, 0.015, -0.09, 1], // 6 付け根・前
  [-0.03, 0.015, 0.1, 1], // 7 付け根・後ろ
  [-0.19, 0.015, -0.04, 1], // 8 折り目・前
  [-0.19, 0.015, 0.07, 1], // 9 折り目・後ろ
  [-0.39, 0.015, 0.14, 2], // 10 翼の先（後ろへ流す）
  // 右の翼
  [0.03, 0.015, -0.09, 3],
  [0.03, 0.015, 0.1, 3],
  [0.19, 0.015, -0.04, 3],
  [0.19, 0.015, 0.07, 3],
  [0.39, 0.015, 0.14, 4],
]
const BIRD_TRIS = [
  // 胴（ひし形の筒）
  0, 3, 1, 0, 1, 4, 0, 2, 3, 0, 4, 2, 1, 3, 5, 1, 5, 4, 2, 5, 3, 2, 4, 5,
  // 左の翼
  6, 8, 7, 8, 9, 7, 8, 10, 9,
  // 右の翼
  11, 12, 13, 13, 12, 14, 13, 14, 15,
]
/** 折り目と輪郭の細い線 */
const BIRD_LINES = [0, 1, 1, 5, 0, 2, 2, 5, 6, 8, 8, 10, 10, 9, 9, 7, 8, 9, 11, 13, 13, 15, 15, 14, 14, 12, 13, 14]
const WING_ROOT_X = 0.03
const WING_FOLD_X = 0.19
const WING_Y = 0.015

export class Player {
  readonly avatar = new THREE.Group()
  readonly mashiro = new THREE.Group()
  /** 曲げる前の位置（y は地面の高さ） */
  readonly pos = new THREE.Vector3()
  /** 向き（方位、ラジアン。北=0、東=π/2） */
  heading = Math.PI / 2
  walkTarget: THREE.Vector2 | null = null
  speed = 0
  /** 速さの倍率（1 = ふつう、FAST_SCALE = はやい） */
  speedScale = 1

  /** 向き（y 軸の回転）と大きさ */
  private readonly body: THREE.Group
  /** 前かがみ・左右の揺れ・上下の弾み */
  private readonly pose: THREE.Group
  private readonly av: AvatarGeometry
  private readonly avPos: THREE.BufferAttribute
  private readonly avColor: THREE.BufferAttribute
  private readonly hatRim: THREE.LineLoop
  private readonly shadow: THREE.Mesh
  private readonly shadowMat: THREE.MeshBasicMaterial
  /** 足元の明かり（ましろの光が地面に落ちる。夕・夜だけ） */
  private readonly pool: THREE.Mesh
  private readonly poolMat: THREE.MeshBasicMaterial
  private poolAlpha = 0
  /** 画質「軽い」（足元の明かりの加算の板を出さない） */
  private lowQuality = false

  // ましろ
  private readonly birdPts = new Float32Array(BIRD_POINTS.length * 3)
  private readonly birdPos3: THREE.BufferAttribute
  private readonly birdColor: THREE.BufferAttribute
  private readonly birdLinePos: THREE.BufferAttribute
  private readonly birdLineMat: THREE.LineBasicMaterial
  private readonly glow: THREE.Sprite
  private readonly glowMat: THREE.SpriteMaterial
  private glowAlpha = DEFAULT_MASHIRO.glowAlpha
  private readonly paper = new THREE.Color(DEFAULT_MASHIRO.paper)
  private readonly birdPos = new THREE.Vector3()
  private readonly birdPrev = new THREE.Vector3()
  private readonly birdVel = new THREE.Vector3()
  private birdHeading = Math.PI / 2
  private birdPitch = 0
  /** くるりと回る（0..1 で進む。負のときは回っていない） */
  private rollT = -1
  private rollDir = 1
  private nextRoll = 6

  /** update() の戻り値（毎フレーム作らずに使い回す） */
  private readonly ev: PlayerEvents = { hitRest: false, hitEdge: false }
  private bobPhase = 0
  private stuckTime = 0
  private lastDist = Infinity
  // 合羽のなびき（ばねでゆっくり追いつく）
  private runS = 0
  private trail = 0
  private trailVel = 0
  private side = 0
  private lastHeading = Math.PI / 2

  constructor(private readonly walk: Walkability) {
    // アバター（-z が前）。1つのメッシュにまとめ、色は頂点の色で持つ
    this.av = buildAvatar()
    this.avPos = this.av.geo.getAttribute('position') as THREE.BufferAttribute
    this.avColor = this.av.geo.getAttribute('color') as THREE.BufferAttribute
    const avMat = applyBend(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
      bend: false,
      inkRim: true,
    })
    const avMesh = new THREE.Mesh(this.av.geo, avMat)
    avMesh.castShadow = true
    this.body = new THREE.Group()
    this.pose = new THREE.Group()
    this.pose.add(avMesh)
    // 笠の縁の墨の線（白描のときだけ見せる）
    const rimPts: THREE.Vector3[] = []
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2
      rimPts.push(new THREE.Vector3(Math.sin(t) * 0.405, 1.134, Math.cos(t) * 0.405))
    }
    this.hatRim = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(rimPts),
      new THREE.LineBasicMaterial({ color: 0x26221e, transparent: true, opacity: 0.85 }),
    )
    this.pose.add(this.hatRim)
    this.body.add(this.pose)
    this.body.scale.setScalar(AVATAR_SCALE)

    // 足元の影（柔らかい円）。色はマテリアルで付ける
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: softDotTexture(),
      color: DEFAULT_BLOB.color,
      transparent: true,
      depthWrite: false,
      opacity: DEFAULT_BLOB.opacity,
      // 道の帯（polygonOffset -2）より手前に描く
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), this.shadowMat)
    this.shadow.renderOrder = 3

    const glowTex = glowTexture()
    this.poolMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: DEFAULT_MASHIRO.glow,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    })
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), this.poolMat)
    this.pool.renderOrder = 4
    this.pool.visible = false
    this.avatar.add(this.body, this.shadow, this.pool)

    // ましろ（白い紙の鳥）。光の影響を受けない紙の白に、面ごとの明るさを少し付けて折り目を見せる
    const triCount = BIRD_TRIS.length / 3
    const birdGeo = new THREE.BufferGeometry()
    this.birdPos3 = new THREE.BufferAttribute(new Float32Array(triCount * 9), 3).setUsage(THREE.DynamicDrawUsage)
    this.birdColor = new THREE.BufferAttribute(new Float32Array(triCount * 9), 3).setUsage(THREE.DynamicDrawUsage)
    birdGeo.setAttribute('position', this.birdPos3)
    birdGeo.setAttribute('color', this.birdColor)
    birdGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.6)
    const birdMesh = new THREE.Mesh(
      birdGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )
    const lineGeo = new THREE.BufferGeometry()
    this.birdLinePos = new THREE.BufferAttribute(new Float32Array(BIRD_LINES.length * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    )
    lineGeo.setAttribute('position', this.birdLinePos)
    lineGeo.boundingSphere = birdGeo.boundingSphere.clone()
    this.birdLineMat = new THREE.LineBasicMaterial({
      color: DEFAULT_MASHIRO.line,
      transparent: true,
      opacity: DEFAULT_MASHIRO.lineAlpha,
    })
    const birdLines = new THREE.LineSegments(lineGeo, this.birdLineMat)
    birdLines.renderOrder = 1
    // ほのかな光の輪（加算。半径 0.9m）
    this.glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: DEFAULT_MASHIRO.glow,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      opacity: DEFAULT_MASHIRO.glowAlpha,
    })
    this.glow = new THREE.Sprite(this.glowMat)
    this.glow.scale.setScalar(1.8 / MASHIRO_SCALE)
    this.glow.renderOrder = 5
    this.mashiro.add(birdMesh, birdLines, this.glow)
    this.mashiro.scale.setScalar(MASHIRO_SCALE)
    this.mashiro.rotation.order = 'YXZ'
    this.updateBirdShape(0, 0, 0)
    this.updateAvatarShape(0)
  }

  setPalette(p: Palette): void {
    const x = p as Palette & AvatarExtras
    const cols: THREE.Color[] = []
    for (let k = 0; k < COLOR_KEYS; k++) cols.push(new THREE.Color())
    cols[C_ROBE].set(p.robe)
    cols[C_UNDER].set(x.robeUnder ?? DEFAULT_ROBE_UNDER)
    cols[C_HAT].set(p.hat)
    cols[C_SKIN].set(p.skin)
    cols[C_PACK].set(p.pack)
    cols[C_LEGS].set(p.robe).lerp(new THREE.Color(LEG_INK), 0.4)
    const arr = this.avColor.array as Float32Array
    const { key, shade } = this.av
    for (let i = 0; i < key.length; i++) {
      const c = cols[key[i]]
      const s = shade[i]
      arr[i * 3] = c.r * s
      arr[i * 3 + 1] = c.g * s
      arr[i * 3 + 2] = c.b * s
    }
    this.avColor.needsUpdate = true
    // 笠の縁の墨の線は、墨のぼかしがある見た目（白描）だけ
    this.hatRim.visible = p.rim > 0
    ;(this.hatRim.material as THREE.LineBasicMaterial).color.set(p.ink)

    const blob = x.blobShadow ?? DEFAULT_BLOB
    this.shadowMat.color.set(blob.color)
    this.shadowMat.opacity = blob.opacity

    const m = { ...(x.mashiro ?? {
      ...DEFAULT_MASHIRO,
      // 白描は和紙の地が明るいので、光の輪を控えめに、線を墨に
      line: p.rim > 0 ? p.ink : DEFAULT_MASHIRO.line,
      lineAlpha: p.rim > 0 ? 0.85 : DEFAULT_MASHIRO.lineAlpha,
      glowAlpha: p.id === 'hakubyo' ? 0.1 : DEFAULT_MASHIRO.glowAlpha,
    }) }
    const g = x.mashiroGlow
    if (g && !x.mashiro) {
      m.glow = g.color
      m.glowAlpha = g.alpha
      m.poolAlpha = g.poolAlpha
    }
    this.paper.set(m.paper)
    this.birdLineMat.color.set(m.line)
    this.birdLineMat.opacity = m.lineAlpha
    this.glowMat.color.set(m.glow)
    this.glowAlpha = m.glowAlpha
    this.poolMat.color.set(m.glow)
    this.poolAlpha = m.poolAlpha
    this.pool.visible = m.poolAlpha > 0.001 && !this.lowQuality
  }

  /** 画質「軽い」では、足元の明かり（透明な板の重ね描き）を消す。灯りの地面の明かりと同じ扱い */
  setQuality(low: boolean): void {
    this.lowQuality = low
    this.pool.visible = this.poolAlpha > 0.001 && !low
  }

  place(x: number, z: number, heading: number): void {
    this.pos.set(x, this.walk.groundY(x, z), z)
    this.heading = heading
    this.lastHeading = heading
    this.walkTarget = null
    this.speed = 0
    this.birdPos.set(x + 0.6, this.pos.y + 2.2, z)
  }

  /** 1フレーム進める。intent があれば歩く。なければ walkTarget へ向かう。戻り値のオブジェクトは使い回す */
  update(dt: number, time: number, intent: MoveIntent): PlayerEvents {
    let dirX = intent.x
    let dirZ = intent.z
    let mag = Math.min(1, Math.hypot(dirX, dirZ))
    let run = intent.run
    if (mag > 0.05) {
      this.walkTarget = null
    } else if (this.walkTarget) {
      const dx = this.walkTarget.x - this.pos.x
      const dz = this.walkTarget.y - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.25) {
        this.walkTarget = null
      } else {
        dirX = dx / d
        dirZ = dz / d
        mag = Math.min(1, d / 0.6)
        run = run || d > 15
        // 進まなくなったら（建物などにぶつかったら）あきらめる
        if (d > this.lastDist - 0.02 * dt * 60) this.stuckTime += dt
        else this.stuckTime = 0
        this.lastDist = d
        if (this.stuckTime > 1.5) {
          this.walkTarget = null
          this.stuckTime = 0
        }
      }
    }
    if (!this.walkTarget) this.lastDist = Infinity

    const want = mag > 0.05 ? (run ? RUN_SPEED : WALK_SPEED) * Math.max(mag, 0.35) * this.speedScale : 0
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want > this.speed ? 6 : 10)))
    const ev = this.ev
    ev.hitRest = false
    ev.hitEdge = false
    if (mag > 0.05) {
      const len = Math.hypot(dirX, dirZ) || 1
      dirX /= len
      dirZ /= len
      const targetHeading = Math.atan2(dirX, -dirZ)
      let dh = targetHeading - this.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      this.heading += dh * (1 - Math.exp(-dt * 12))
    }
    if (this.speed > 0.01) {
      const mx = Math.sin(this.heading)
      const mz = -Math.cos(this.heading)
      const total = this.speed * Math.min(dt, 0.1)
      // 向きを変えている途中は、進みたい方向へ動く（滑らかさのため）
      const vx = mag > 0.05 ? dirX : mx
      const vz = mag > 0.05 ? dirZ : mz
      const steps = Math.max(1, Math.ceil(total / MAX_SUBSTEP))
      const step = total / steps
      for (let i = 0; i < steps; i++) {
        let r = this.walk.resolve(this.pos.x + vx * step, this.pos.z + vz * step, RADIUS)
        // 目的地へ歩いている途中で塀や建物に当たったら、左右に少しそれて回り込む（簡単なよけ方）
        if (this.walkTarget && step > 1e-4) {
          const progress = ((r.x - this.pos.x) * vx + (r.z - this.pos.z) * vz) / step
          if (progress < 0.4) {
            const tx = this.walkTarget.x
            const tz = this.walkTarget.y
            let bestD = Math.hypot(tx - r.x, tz - r.z)
            for (const ang of [0.8, -0.8, 1.4, -1.4]) {
              const ca = Math.cos(ang)
              const sa = Math.sin(ang)
              const ax = vx * ca - vz * sa
              const az = vx * sa + vz * ca
              const alt = this.walk.resolve(this.pos.x + ax * step, this.pos.z + az * step, RADIUS)
              const moved = Math.hypot(alt.x - this.pos.x, alt.z - this.pos.z)
              const d = Math.hypot(tx - alt.x, tz - alt.z)
              if (moved > step * 0.5 && d < bestD + step * 0.6) {
                bestD = d
                r = alt
                break
              }
            }
          }
        }
        ev.hitRest = ev.hitRest || r.hitRest
        ev.hitEdge = ev.hitEdge || r.hitEdge
        const movedSq = (r.x - this.pos.x) ** 2 + (r.z - this.pos.z) ** 2
        this.pos.x = r.x
        this.pos.z = r.z
        if (movedSq < 1e-8) break
      }
      this.pos.y = this.walk.groundY(this.pos.x, this.pos.z)
      // 走るときは歩幅が大きいので、揺れの周期を少しゆっくりにする
      this.bobPhase += total * (this.speed > WALK_SPEED * 1.2 ? 3.4 : 4.6)
    }

    // アバターの見た目
    const drop = bendDrop(this.pos.x, this.pos.z)
    this.avatar.position.set(this.pos.x, this.pos.y - drop, this.pos.z)
    this.body.rotation.y = -this.heading
    const k = Math.max(this.speedScale, 1e-3)
    // 歩き（0..1）と走り（0..1）。「はやい」の倍率は割り戻して、見た目は同じ歩き方にする
    const walking = Math.min(1, this.speed / (WALK_SPEED * k))
    const runTarget = THREE.MathUtils.clamp((this.speed / k - WALK_SPEED * 1.15) / (RUN_SPEED - WALK_SPEED * 1.15), 0, 1)
    this.runS += (runTarget - this.runS) * (1 - Math.exp(-dt * 5))
    const runS = this.runS
    // 曲がる速さ（合羽が外へ振れ、体が内へ傾く）
    const yawRate = dt > 0 ? (this.heading - this.lastHeading) / dt : 0
    this.lastHeading = this.heading
    const sideTarget = THREE.MathUtils.clamp(yawRate * 0.035 * walking, -0.12, 0.12)
    this.side += (sideTarget - this.side) * (1 - Math.exp(-dt * 6))
    // 前かがみ（走ると深く）、上下の弾み、左右の揺れ、止まっているときの息
    this.pose.rotation.x = -(0.05 * walking + 0.2 * runS)
    this.pose.rotation.z = Math.sin(this.bobPhase) * 0.035 * walking - this.side * 0.6
    this.pose.position.y = Math.abs(Math.sin(this.bobPhase)) * (0.045 + 0.03 * runS) * walking
    this.pose.scale.y = 1 + Math.sin(time * 1.9) * 0.012 * (1 - walking)
    // 合羽のなびき: 後ろへ流れる量をばねで追わせる（止まると少し前へ戻ってゆれる）
    const trailTarget = 0.05 * walking + 0.17 * runS
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / sub
    for (let i = 0; i < sub; i++) {
      this.trailVel += (60 * (trailTarget - this.trail) - 8 * this.trailVel) * h
      this.trail += this.trailVel * h
    }
    this.updateAvatarShape(time)
    // 足元の影は、道の帯の上でも隠れないよう、帯の面より少し上に置く
    this.shadow.position.y = this.walk.decalY(this.pos.x, this.pos.z) - this.pos.y + 0.06

    this.updateMashiro(dt, time)
    return ev
  }

  /** 脚の振りと合羽のなびき（CPU で頂点を動かす。アバター全体で数百頂点） */
  private updateAvatarShape(time: number): void {
    const { base, legL, legR, cape, capeW, capeBack, capeTh } = this.av
    const out = this.avPos.array as Float32Array
    const walking = Math.min(1, this.speed / (WALK_SPEED * Math.max(this.speedScale, 1e-3)))
    const runS = this.runS
    const swing = Math.sin(this.bobPhase) * (0.42 + 0.28 * runS) * walking
    const rotLeg = (idx: Uint32Array, ang: number) => {
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      for (let n = 0; n < idx.length; n++) {
        const i = idx[n] * 3
        const y = base[i + 1] - HIP_Y
        const z = base[i + 2]
        out[i] = base[i]
        out[i + 1] = HIP_Y + y * c - z * s
        out[i + 2] = y * s + z * c
      }
    }
    rotLeg(legL, swing)
    rotLeg(legR, -swing)

    const trail = this.trail
    const flare = 0.03 * walking + 0.12 * runS
    const wave = (0.012 + 0.022 * runS) * walking
    const breeze = 0.007 * (1 - 0.5 * walking)
    const ph = this.bobPhase * 2
    const side = this.side
    for (let n = 0; n < cape.length; n++) {
      const i = cape[n] * 3
      const w = capeW[n]
      const back = capeBack[n]
      const th = capeTh[n]
      const f = 1 + w * flare
      const ripple = Math.sin(ph + th * 2) * wave + Math.sin(time * 1.7 + th * 3) * breeze
      out[i] = base[i] * f - w * side
      out[i + 1] = base[i + 1] + w * Math.max(0, trail) * 0.45 * back
      out[i + 2] = base[i + 2] * f + w * (trail * (0.4 + 0.6 * back) + ripple)
    }
    this.avPos.needsUpdate = true
  }

  private updateMashiro(dt: number, time: number): void {
    // 右肩の斜め後ろ・少し上。歩いていると少し後ろへ
    const hx = Math.sin(this.heading)
    const hz = -Math.cos(this.heading)
    const rx = -hz
    const rz = hx
    const lag = Math.min(1, this.speed / WALK_SPEED)
    const s = AVATAR_SCALE
    const back = 0.25 + 0.3 * lag
    const tx = this.pos.x + rx * 0.75 * s - hx * back * s + Math.sin(time * 0.9) * 0.15
    const tz = this.pos.z + rz * 0.75 * s - hz * back * s + Math.cos(time * 0.7) * 0.15
    // くるりと回る（ときどき）。回る間は少し浮き上がる
    if (this.rollT < 0 && time > this.nextRoll) {
      this.rollT = 0
      this.rollDir = Math.random() < 0.5 ? -1 : 1
    }
    let roll = 0
    let hop = 0
    if (this.rollT >= 0) {
      this.rollT += dt / 1.1
      if (this.rollT >= 1) {
        this.rollT = -1
        this.nextRoll = time + 7 + Math.random() * 7
      } else {
        const t = this.rollT
        roll = this.rollDir * Math.PI * 2 * (t * t * (3 - 2 * t))
        hop = Math.sin(t * Math.PI) * 0.35
      }
    }
    const ty = this.pos.y + 1.72 * s + Math.sin(time * 2.1) * 0.08 + hop
    const prev = this.birdPrev.copy(this.birdPos)
    const k = 1 - Math.exp(-dt * (3.5 + this.speed * 0.6))
    this.birdPos.x += (tx - this.birdPos.x) * k
    this.birdPos.y += (ty - this.birdPos.y) * k
    this.birdPos.z += (tz - this.birdPos.z) * k
    if (dt > 0) this.birdVel.copy(this.birdPos).sub(prev).divideScalar(dt)
    const v = Math.hypot(this.birdVel.x, this.birdVel.z)
    const want = v > 0.3 ? Math.atan2(this.birdVel.x, -this.birdVel.z) : this.heading
    let dh = want - this.birdHeading
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    this.birdHeading += dh * (1 - Math.exp(-dt * 5))
    // 上るときは頭を上げ、下るときは下げる
    const pitchTarget = THREE.MathUtils.clamp(this.birdVel.y * 0.25, -0.4, 0.4)
    this.birdPitch += (pitchTarget - this.birdPitch) * (1 - Math.exp(-dt * 6))
    const drop = bendDrop(this.birdPos.x, this.birdPos.z)
    this.mashiro.position.set(this.birdPos.x, this.birdPos.y - drop, this.birdPos.z)
    // 回転の順は YXZ（向き → 上下 → くるり）
    this.mashiro.rotation.set(this.birdPitch, -this.birdHeading, Math.sin(time * 1.3) * 0.08 - dh * 0.6 + roll)

    // はばたき（動いているときは速く、止まると時々滑空）。外の翼は少し遅れてしなる
    const fast = Math.min(1, v / 1.5)
    const glide = 0.5 + 0.5 * Math.sin(time * 0.8)
    const amp = 0.22 + 0.42 * Math.max(fast, glide * 0.6, this.rollT >= 0 ? 0.8 : 0)
    const w = time * (7 + fast * 6)
    const flap = Math.sin(w) * amp + 0.08
    const tip = Math.sin(w - 0.9) * amp * 0.6
    this.updateBirdShape(flap, tip, time)

    // 光の輪はゆっくり息をする
    this.glowMat.opacity = this.glowAlpha * (0.88 + 0.12 * Math.sin(time * 1.6))
    if (this.pool.visible) {
      // 足元の明かりは、アバターとましろの間の地面に落とす
      const px = (this.pos.x + this.birdPos.x) * 0.5
      const pz = (this.pos.z + this.birdPos.z) * 0.5
      this.pool.position.set(px - this.pos.x, this.walk.decalY(px, pz) - this.pos.y + 0.08, pz - this.pos.z)
      this.poolMat.opacity = this.poolAlpha * (0.9 + 0.1 * Math.sin(time * 1.6))
    }
  }

  /** ましろの点を翼の角度で動かして、面と線の頂点を作り直す（数十頂点） */
  private updateBirdShape(flap: number, tip: number, _time: number): void {
    const P = this.birdPts
    const cf = Math.cos(flap)
    const sf = Math.sin(flap)
    const ct = Math.cos(flap + tip)
    const st = Math.sin(flap + tip)
    // 折り目（内の翼の先）の位置。外の翼はここを軸に、さらに tip だけ回る
    const fx = WING_FOLD_X - WING_ROOT_X
    for (let n = 0; n < BIRD_POINTS.length; n++) {
      const [x, y, z, b] = BIRD_POINTS[n]
      let ox = x
      let oy = y
      if (b !== 0) {
        const sideSign = b <= 2 ? -1 : 1
        const lx = Math.abs(x) - WING_ROOT_X
        const ly = y - WING_Y
        if (b === 1 || b === 3) {
          ox = lx * cf - ly * sf
          oy = lx * sf + ly * cf
        } else {
          // 外の翼: 折り目までは内の翼の角度、その先は合わせた角度
          const ex = lx - fx
          ox = fx * cf + ex * ct - ly * st
          oy = fx * sf + ex * st + ly * ct
        }
        ox = sideSign * (ox + WING_ROOT_X)
        oy += WING_Y
      }
      P[n * 3] = ox
      P[n * 3 + 1] = oy
      P[n * 3 + 2] = z
    }
    const pos = this.birdPos3.array as Float32Array
    const col = this.birdColor.array as Float32Array
    const paper = this.paper
    for (let t = 0; t < BIRD_TRIS.length; t += 3) {
      const a = BIRD_TRIS[t] * 3
      const b = BIRD_TRIS[t + 1] * 3
      const c = BIRD_TRIS[t + 2] * 3
      // 面の向きで明るさを少し変える（上を向く面ほど明るい。紙の折り目が読める）
      const ux = P[b] - P[a]
      const uy = P[b + 1] - P[a + 1]
      const uz = P[b + 2] - P[a + 2]
      const vx = P[c] - P[a]
      const vy = P[c + 1] - P[a + 1]
      const vz = P[c + 2] - P[a + 2]
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      const nl = Math.hypot(nx, ny, nz) || 1
      const lit = Math.abs(ny / nl) * 0.75 + Math.abs(nx / nl) * 0.15 + Math.abs(nz / nl) * 0.1
      const s = 0.8 + 0.2 * lit
      for (let v = 0; v < 3; v++) {
        const src = BIRD_TRIS[t + v] * 3
        const dst = (t + v) * 3
        pos[dst] = P[src]
        pos[dst + 1] = P[src + 1]
        pos[dst + 2] = P[src + 2]
        col[dst] = paper.r * s
        col[dst + 1] = paper.g * s
        col[dst + 2] = paper.b * s
      }
    }
    const lp = this.birdLinePos.array as Float32Array
    for (let n = 0; n < BIRD_LINES.length; n++) {
      const src = BIRD_LINES[n] * 3
      lp[n * 3] = P[src]
      lp[n * 3 + 1] = P[src + 1]
      lp[n * 3 + 2] = P[src + 2]
    }
    this.birdPos3.needsUpdate = true
    this.birdColor.needsUpdate = true
    this.birdLinePos.needsUpdate = true
  }
}

/** 足元の影: 白い柔らかい円（色はマテリアルで付ける） */
function softDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** 光の輪: 芯が明るく、外へなだらかに消える円（加算で重ねる） */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.6)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.2)')
  g.addColorStop(0.75, 'rgba(255,255,255,0.05)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
