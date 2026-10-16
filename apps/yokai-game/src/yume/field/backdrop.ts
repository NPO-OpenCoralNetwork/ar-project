// 遠景: 空のグラデーション（太陽・朱い月・星）、立山連峰の切り絵の書き割り、手前を隠す霞（白描はすやり霞、光と霞は雲海）。
//
// 斜め上から狭い画角で見下ろすと、本当の地平線は画面に入らない。そこで絵巻や立山曼荼羅のように、
// 画面の上の方を霞で覆い、その上に山の書き割りを「貼る」。山の横の位置は向き（方位）に合わせて動き、
// 縦は画面の決まった高さに置く。画面の上の方（霞の下端より上）だけを覆う1枚の板を、最後に1回だけ描く。
// 霞より下の画素は描かない（スマホで描き込みの量を抑えるため）。
//
// 板は深度テストをする。板の深さは、行ごとに「その行に見える地面の手前 8%」（CPU で高さの地図に沿って求める）で、
// 霞の帯の中ほどの行より上は、その行の深さのまま（それより遠い物は霞と空の向こうに隠れる）。
// これで、霞の帯は遠い地面（箱庭の縁）だけを隠し、根元が霞より手前にある家や木は霞の手前に出る（画面に貼った綿の壁にしない）。
// 根元が霞に沈んだ遠い物は、これまでどおり霞と空に隠れる（空に浮いて見えないように）。
//
// 稜線データ（tateyama-skyline.json）があればそれを使い、なければ東（方位およそ95°）に手続きで山並みを作る。

import * as THREE from 'three'
import type { SkylineData } from '../data'
import { makeRandom } from '../geom2d'
import type { ScenePalette } from '../hikari'

/** 稜線テクスチャの1°あたりの列数と、仰角の最大（度） */
const COLS_PER_DEG = 2
const EL_MAX = 8

export const backdropUniforms = {
  uRidge: { value: null as THREE.DataTexture | null },
  uSkyTop: { value: new THREE.Color() },
  uSkyMid: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
  /** 光源（太陽・月）の方角の地平の明るみ */
  uSkyGlow: { value: new THREE.Color() },
  uLightAz: { value: 0 },
  uGlowAmt: { value: 0 },
  uMist: { value: new THREE.Color() },
  /** 霞の上端＝書き割りの裾の高さ（NDC の y） */
  uHorizonNdc: { value: 0.55 },
  /** 霞が地面を覆う深さ（NDC） */
  uMistDepth: { value: 0.3 },
  uYaw: { value: 0 },
  uTanHalfX: { value: 0.5 },
  uHalfFovYDeg: { value: 17 },
  /** 画面の縦横比（幅 / 高さ） */
  uAspect: { value: 1 },
  uExag: { value: 1 },
  uPxDeg: { value: 0.05 },
  uTime: { value: 0 },
  uFill: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  uTop: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  uRidgeInk: { value: new THREE.Color() },
  uRidgeAlpha: { value: 1 },
  uMistEdgeInk: { value: 0 },
  uPxNdc: { value: 0.0025 },
  uSnow: { value: new THREE.Color() },
  // 雲海（光と霞。0 なら白描のすやり霞）
  uCloudAmt: { value: 0 },
  uCloudLit: { value: new THREE.Color() },
  uCloudShade: { value: new THREE.Color() },
  uRimNdc: { value: 0.03 },
  uBillow: { value: 0.5 },
  // 太陽（半径などは画面の短辺に対する割合）
  uSunOn: { value: 0 },
  uSunAz: { value: 0 },
  uSunElFrac: { value: 0.5 },
  uSunColor: { value: new THREE.Color() },
  uSunRadius: { value: 0.03 },
  uSunHalo: { value: new THREE.Color() },
  uSunHaloRadius: { value: 0.2 },
  uSunHaloAlpha: { value: 0.4 },
  // 月
  uMoonOn: { value: 0 },
  uMoonAz: { value: 1.75 },
  uMoonLift: { value: 1.8 },
  uMoonRadius: { value: 0.065 },
  uMoonCore: { value: new THREE.Color() },
  uMoonShade: { value: new THREE.Color() },
  uMoonRim: { value: new THREE.Color() },
  uMoonHalo: { value: new THREE.Color() },
  uMoonHaloOuter: { value: new THREE.Color() },
  uMoonHaloAlpha: { value: 0.5 },
  // 星
  uStarDensity: { value: 0 },
  uStarColor: { value: new THREE.Color() },
  /** 星のまたたき（「軽い」では 0 にして止める） */
  uTwinkle: { value: 1 },
  /** 雲海の細かさ（「軽い」では 0。雲の頭を1列にする） */
  uCloudDetail: { value: 1 },
  /** お休みの範囲の方位（ラジアン）と、その方位の地平の明るみ（夜は琥珀の灯りが雲海に映る） */
  uRestAz: { value: 0 },
  uRestHorizon: { value: 0 },
  uRestColor: { value: new THREE.Color(0xe89a52) },
  /** 横長の画面での月の半径と高さ */
  uMoonRadiusWide: { value: 0.045 },
  uMoonLiftWide: { value: 1.2 },
}

/** 板の行の数（行ごとに深さを決める） */
const ROWS = 16

/** 立山のいちばん高い所（いちばん奥の層）の方位（度）。月の位置の基準 */
let peakAzDeg = 95
/** 板の頂点（z = 行ごとの深さ） */
let depthAttr: THREE.Float32BufferAttribute | null = null
let plateMat: THREE.ShaderMaterial | null = null
const lastCam = new Float32Array(20)
const _ray = new THREE.Vector3()
const _org = new THREE.Vector3()
const _hit = new THREE.Vector3()
const _fwd = new THREE.Vector3()

/**
 * 板の行ごとの深さを決める。
 * - 霞の帯の中ほどの行（capY）より下: その行に見える地面（曲げた後の見た目の高さ）の手前 5%
 * - それより上: capY の行に見える地面の所に立てた「縦の壁」（前方の水平距離 sCap）の深さ。
 *   根元が sCap より手前の物（家・木）は、上の方まで霞と空の手前に出る。sCap より奥の物は、背が高くても霞と空に隠れる
 *   （一定の深さにすると、奥の高い木の梢だけが空に浮くため）。
 * 左・中・右の3本の視線を高さの地図に沿って進め、いちばん手前の地面を使う。カメラが動いたときだけ計算する。
 */
export function updateBackdropDepth(camera: THREE.PerspectiveCamera, groundY: (x: number, z: number) => number): void {
  if (!depthAttr) return
  const u = backdropUniforms
  const e = camera.matrixWorld.elements
  let same = true
  for (let i = 0; i < 16; i++) {
    if (Math.abs(lastCam[i] - e[i]) > 1e-4) same = false
    lastCam[i] = e[i]
  }
  const key = [u.uHorizonNdc.value, u.uMistDepth.value, camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]]
  for (let i = 0; i < 4; i++) {
    if (Math.abs(lastCam[16 + i] - key[i]) > 1e-6) same = false
    lastCam[16 + i] = key[i]
  }
  if (same) return
  const bottom = THREE.MathUtils.clamp(u.uHorizonNdc.value - u.uMistDepth.value * 1.7 - 0.03, -1, 1)
  const capY = u.uHorizonNdc.value - u.uMistDepth.value * 0.5
  const n = camera.near
  const f = camera.far
  const toNdcZ = (d: number) => Math.min(0.99999, (f + n) / (f - n) - (2 * f * n) / ((f - n) * Math.max(n * 2, d)))
  const arr = depthAttr.array as Float32Array
  _org.setFromMatrixPosition(camera.matrixWorld)
  // 前方（水平）
  _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld)
  _fwd.y = 0
  _fwd.normalize()
  const tStart = [0, 0, 0]
  /** 行 y の視線3本の、地面の当たりの「深さ」の最小と「前方の水平距離」の最小 */
  const march = (y: number): { depth: number; ahead: number } => {
    let depth = Infinity
    let ahead = Infinity
    for (let c = 0; c < 3; c++) {
      _ray.set(c - 1, y, 0.5).unproject(camera).sub(_org).normalize()
      // 下の行の当たりより手前には当たらない（上の行ほど視線が浅い）ので、そこから進める
      let t = Math.max(1, tStart[c] * 0.9)
      let prev = t
      let hitT = -1
      while (t < 1500) {
        if (_org.y + _ray.y * t <= groundY(_org.x + _ray.x * t, _org.z + _ray.z * t)) {
          let lo = prev
          let hi = t
          for (let k = 0; k < 7; k++) {
            const m = (lo + hi) / 2
            if (_org.y + _ray.y * m <= groundY(_org.x + _ray.x * m, _org.z + _ray.z * m)) hi = m
            else lo = m
          }
          hitT = hi
          break
        }
        prev = t
        t += Math.max(1, t * 0.03)
      }
      if (hitT < 0) {
        tStart[c] = 1500
        continue
      }
      tStart[c] = hitT
      _hit.copy(_ray).multiplyScalar(hitT)
      ahead = Math.min(ahead, _hit.x * _fwd.x + _hit.z * _fwd.z)
      _hit.add(_org).applyMatrix4(camera.matrixWorldInverse)
      depth = Math.min(depth, -_hit.z)
    }
    return { depth, ahead }
  }
  const cap = march(capY)
  tStart.fill(0)
  for (let r = 0; r < ROWS; r++) {
    const y = bottom + (1 - bottom) * (r / (ROWS - 1))
    let d: number
    if (y < capY) {
      d = march(y).depth * 0.95
    } else if (Number.isFinite(cap.ahead)) {
      // 縦の壁（前方 sCap）と、この行の視線（画面の中ほどの列）の交わりの深さ
      _ray.set(0, y, 0.5).unproject(camera).sub(_org).normalize()
      const along = _ray.x * _fwd.x + _ray.z * _fwd.z
      if (along > 1e-3) {
        _hit.copy(_ray).multiplyScalar(cap.ahead / along).add(_org).applyMatrix4(camera.matrixWorldInverse)
        d = -_hit.z * 0.95
      } else d = Infinity
    } else d = Infinity
    const z = Number.isFinite(d) ? toNdcZ(d) : 0.99999
    arr[r * 6 + 2] = z
    arr[r * 6 + 5] = z
  }
  depthAttr.needsUpdate = true
}

interface Ridge {
  az: number
  el: number
}

export function createBackdrop(sky: SkylineData | null): THREE.Mesh {
  // 層: 0 = 奥の連峰、1 = 中景、2 = 手前の丘、3 = ぐるりの低い丘
  const layers: Ridge[][] = []
  if (sky && sky.bands.length >= 3) {
    for (let i = 0; i < 3; i++) layers.push(taper(sky.bands[i].ridge.map((r) => ({ az: r.azimuthDeg, el: r.elevationDeg }))))
  } else {
    layers.push(...proceduralRange())
  }
  layers.push(lowRing())
  peakAzDeg = layers[0].reduce((a, b) => (b.el > a.el ? b : a), layers[0][0] ?? { az: 95, el: 0 }).az

  const W = 360 * COLS_PER_DEG
  const data = new Uint8Array(W * 4)
  layers.forEach((ridge, li) => {
    const sorted = ridge.slice().sort((a, b) => a.az - b.az)
    for (let i = 0; i < W; i++) {
      const az = i / COLS_PER_DEG
      // 仰角が負（見下ろす稜線）は 0 にする（Uint8 があふれて偽の高い山にならないように）
      data[i * 4 + li] = Math.round((Math.max(0, Math.min(EL_MAX, sample(sorted, az))) / EL_MAX) * 255)
    }
  })
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  backdropUniforms.uRidge.value = tex

  const g = new THREE.BufferGeometry()
  // x = -1..1、y = 0（霞の下端より下）..1（画面の上端）を ROWS 行に分けた帯。縦の位置は頂点シェーダーで決める。
  // z は行ごとの深さ（NDC）。updateBackdropDepth が書き換える（はじめは一番奥）
  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r < ROWS; r++) {
    const v = r / (ROWS - 1)
    pos.push(-1, v, 0.99999, 1, v, 0.99999)
    if (r > 0) {
      const a = (r - 1) * 2
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }
  }
  depthAttr = new THREE.Float32BufferAttribute(pos, 3)
  depthAttr.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute('position', depthAttr)
  g.setIndex(idx)
  const mat = new THREE.ShaderMaterial({
    uniforms: backdropUniforms,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uHorizonNdc;
      uniform float uMistDepth;
      varying vec2 vNdc;
      void main() {
        // 霞の下端は、いちばん下でも uHorizonNdc − uMistDepth × 1.65（雲形のゆらぎ込み）。少し余裕を持たせる
        float bottom = clamp(uHorizonNdc - uMistDepth * 1.7 - 0.03, -1.0, 1.0);
        vNdc = vec2(position.x, mix(bottom, 1.0, position.y));
        gl_Position = vec4(vNdc, position.z, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uRidge;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyMid;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSkyGlow;
      uniform float uLightAz;
      uniform float uGlowAmt;
      uniform vec3 uMist;
      uniform float uHorizonNdc;
      uniform float uMistDepth;
      uniform float uYaw;
      uniform float uTanHalfX;
      uniform float uHalfFovYDeg;
      uniform float uAspect;
      uniform float uExag;
      uniform float uPxDeg;
      uniform float uTime;
      uniform vec3 uFill[4];
      uniform vec3 uTop[4];
      uniform vec3 uRidgeInk;
      uniform float uRidgeAlpha;
      uniform float uMistEdgeInk;
      uniform float uPxNdc;
      uniform vec3 uSnow;
      uniform float uCloudAmt;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform float uRimNdc;
      uniform float uBillow;
      uniform float uSunOn;
      uniform float uSunAz;
      uniform float uSunElFrac;
      uniform vec3 uSunColor;
      uniform float uSunRadius;
      uniform vec3 uSunHalo;
      uniform float uSunHaloRadius;
      uniform float uSunHaloAlpha;
      uniform float uMoonOn;
      uniform float uMoonAz;
      uniform float uMoonLift;
      uniform float uMoonRadius;
      uniform vec3 uMoonCore;
      uniform vec3 uMoonShade;
      uniform vec3 uMoonRim;
      uniform vec3 uMoonHalo;
      uniform vec3 uMoonHaloOuter;
      uniform float uMoonHaloAlpha;
      uniform float uStarDensity;
      uniform vec3 uStarColor;
      uniform float uTwinkle;
      uniform float uCloudDetail;
      uniform float uRestAz;
      uniform float uRestHorizon;
      uniform vec3 uRestColor;
      uniform float uMoonRadiusWide;
      uniform float uMoonLiftWide;
      varying vec2 vNdc;

      float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { return 0.55 * n2(p) + 0.3 * n2(p * 2.03 + 1.7) + 0.15 * n2(p * 4.1 - 2.3); }
      // 丸い雲の頭の並び（0..1）。ひとつずつ幅と高さを変える
      float cloudHeads(float x, float seed) {
        float ci = floor(x);
        float cf = fract(x);
        float hh = 0.35 + 0.65 * h1(vec2(ci, seed));
        float w = 0.55 + 0.45 * h1(vec2(ci, seed + 1.0));
        float c = 0.5 + (h1(vec2(ci, seed + 2.0)) - 0.5) * (1.0 - w);
        float q = (cf - c) / (w * 0.5);
        return sqrt(max(0.0, 1.0 - q * q)) * hh;
      }

      // 方位（ラジアン）の天体の、画面の x（NDC）。カメラの後ろなら 9.0
      float bodyX(float az) {
        float d = az - uYaw;
        if (cos(d) < 0.05) return 9.0;
        return tan(d) / uTanHalfX;
      }
      // NDC の差を、画面の短辺に対する割合の距離にする
      float shortDist(vec2 d) {
        return uAspect >= 1.0 ? length(vec2(d.x * uAspect, d.y)) * 0.5 : length(vec2(d.x, d.y / uAspect)) * 0.5;
      }
      // 短辺に対する割合を、NDC の縦の長さに
      float shortToNdcY(float r) { return uAspect >= 1.0 ? r * 2.0 : r * 2.0 * uAspect; }
      float ridgeMax(float azDeg) {
        vec4 r = texture2D(uRidge, vec2(azDeg / 360.0, 0.5)) * ${EL_MAX.toFixed(1)} * uExag;
        return max(max(r.r, r.g), max(r.b, r.a));
      }

      void main() {
        // この画素の方位（度）と、書き割りの裾からの見かけの仰角（度）
        float azDeg = degrees(uYaw + atan(vNdc.x * uTanHalfX));
        float elS = (vNdc.y - uHorizonNdc) * uHalfFovYDeg;
        float u = azDeg / 360.0;
        vec4 ridge = texture2D(uRidge, vec2(u, 0.5)) * ${EL_MAX.toFixed(1)} * uExag;

        float mistTop = uHorizonNdc;
        // 霞（すやり霞）の下の縁。これより下で、雲海の縁にも届かない画素は描かない
        float lobe = fbm(vec2(azDeg * 0.07 - uTime * 0.004, 1.3));
        float bottomEdge = mistTop - uMistDepth + (lobe - 0.5) * uMistDepth * 1.3;
        float e = vNdc.y - bottomEdge;
        float seaSwing = 0.5 * uMistDepth * uBillow * 2.2;
        float blendLow = min(mistTop - 0.015, mistTop + uCloudAmt * (0.008 - seaSwing) - 0.006);
        if (e < -0.02 && vNdc.y < blendLow) discard;

        // 雲海の上の縁: 大きくゆっくりした波と、大きさのそろわない丸い雲の頭（光と霞のとき）。
        // ノイズは雲海の縁の近くの画素だけで計算する（それより上は空、下は霞）
        float seaHigh = mistTop + 0.008 + seaSwing + uRimNdc * 1.6 + 0.006;
        bool seaZone = uCloudAmt > 0.0 && vNdc.y < seaHigh;
        float head = 0.0;
        float seaTop = mistTop;
        float headF = 0.0;
        float seaTopF = -9.0;
        if (seaZone) {
          float big = fbm(vec2(azDeg * 0.035 + uTime * 0.002, 2.7));
          float headA = cloudHeads(azDeg * 0.13 + uTime * 0.003, 3.0);
          float headB = uCloudDetail > 0.0 ? cloudHeads(azDeg * 0.29 - uTime * 0.002 + 5.3, 11.0) * 0.6 : 0.0;
          head = max(headA, headB);
          seaTop = mistTop + uCloudAmt * (0.008 + (big - 0.5) * uMistDepth * uBillow * 2.2 + head * uRimNdc * 1.6);
          // 手前の、もう一段低い雲の列（奥行き）
          headF = cloudHeads(azDeg * 0.21 + 2.1 + uTime * 0.004, 17.0);
          if (uCloudDetail > 0.0) headF = max(headF, cloudHeads(azDeg * 0.43 + 0.7, 23.0) * 0.55);
          float bigF = fbm(vec2(azDeg * 0.05 + 9.0, 4.1));
          seaTopF = mistTop - uMistDepth * 0.55 + (bigF - 0.5) * uMistDepth * uBillow * 1.6 + headF * uRimNdc * 1.3;
        }

        // 書き割りの裾と霞をなめらかにつなぐ（blend = 0 なら空と山は見えないので計算しない）
        float seaBlend = seaZone ? smoothstep(seaTop - 0.004, seaTop + 0.004, vNdc.y) : 1.0;
        float blend = mix(smoothstep(mistTop - 0.015, mistTop + 0.02, vNdc.y), seaBlend, uCloudAmt);
        // お休みの範囲の方位（夜は、霧の向こうの灯りが雲海と地平に映る）
        float dAzRest = abs(mod(azDeg - degrees(uRestAz) + 540.0, 360.0) - 180.0);
        float restGlow = uRestHorizon * exp(-dAzRest / 16.0);
        vec3 col = uSkyHorizon;
        if (blend > 0.0) {
        // 空（地平 → 中ほど → 上）
        float t = clamp(elS / max(1.0, (1.0 - uHorizonNdc) * uHalfFovYDeg), 0.0, 1.0);
        float tp = pow(t, 0.75);
        col = tp < 0.45 ? mix(uSkyHorizon, uSkyMid, tp / 0.45) : mix(uSkyMid, uSkyTop, (tp - 0.45) / 0.55);
        // 光源の方角の地平の明るみ
        float dAz = abs(mod(azDeg - degrees(uLightAz) + 540.0, 360.0) - 180.0);
        col = mix(col, uSkyGlow, uGlowAmt * exp(-dAz / 32.0) * pow(1.0 - t, 1.4) * 0.75);
        col = mix(col, uRestColor, restGlow * pow(1.0 - t, 3.0));
        // たなびく雲（白描は前の版と同じ地平の色）
        float cloud = fbm(vec2(azDeg * 0.05 + uTime * 0.01, elS * 0.35));
        col = mix(col, mix(uSkyHorizon, uSkyMid, 0.3 * uCloudAmt) * 1.02, smoothstep(0.6, 0.8, cloud) * smoothstep(1.0, 3.0, elS) * mix(0.5, 0.4, uCloudAmt));

        // 星（夜）
        if (uStarDensity > 0.0) {
          vec2 sc = floor(gl_FragCoord.xy / 2.0);
          float hs = h1(sc * 0.37 + 0.5);
          if (hs > 1.0 - uStarDensity) {
            float b = 0.5 + 0.4 * h1(sc + 3.1);
            b *= 1.0 - 0.45 * uTwinkle * (0.5 + 0.5 * sin(uTime * 1.9 + hs * 900.0));
            col = mix(col, uStarColor, b * smoothstep(0.08, 0.4, t));
          }
        }

        // 太陽（昼・夕）
        if (uSunOn > 0.0) {
          float sx = bodyX(uSunAz);
          if (sx < 8.0) {
            float sy = uHorizonNdc + uSunElFrac * (1.0 - uHorizonNdc);
            float d = shortDist(vec2(vNdc.x - sx, vNdc.y - sy));
            col = mix(col, uSkyGlow, 0.6 * exp(-d / 0.25));
            col = mix(col, uSunHalo, uSunHaloAlpha * exp(-d / (uSunHaloRadius * 0.45)));
            col = mix(col, uSunColor, smoothstep(uSunRadius, uSunRadius * 0.8, d));
          }
        }

        // 月（立山の上。稜線に貼りつく）
        if (uMoonOn > 0.0) {
          float mx = bodyX(uMoonAz);
          if (mx < 8.0) {
            float ridgeEl = ridgeMax(degrees(uMoonAz));
            // 横長の画面は空の帯が細いので、小さめに
            float R = uAspect >= 1.0 ? uMoonRadiusWide : uMoonRadius;
            float rNdcY = shortToNdcY(R);
            float my = uHorizonNdc + ridgeEl / uHalfFovYDeg + (uAspect >= 1.0 ? uMoonLiftWide : uMoonLift) * rNdcY;
            // 上の端で切れないように（収まらなければ、稜線から昇る途中の月になる）
            my = min(my, 1.0 - rNdcY * 1.35);
            vec2 dv = vec2(vNdc.x - mx, vNdc.y - my);
            float d = shortDist(dv);
            // 暈（外 → 内）
            col = mix(col, uSkyGlow, 0.6 * exp(-d / 0.25) * uMoonOn);
            col = mix(col, uMoonHaloOuter, uMoonHaloAlpha * 0.64 * uMoonOn * (1.0 - smoothstep(R, R * 3.2, d)));
            col = mix(col, uMoonHalo, uMoonHaloAlpha * uMoonOn * pow(1.0 - smoothstep(R, R * 1.6, d), 1.5));
            // 本体: まだらと、縁の明るみ
            if (d < R * 1.02) {
              vec2 q = dv / max(R, 1e-4);
              float m = fbm(q * vec2(uAspect >= 1.0 ? uAspect : 1.0, uAspect >= 1.0 ? 1.0 : 1.0 / uAspect) * 2.2 + 4.0);
              vec3 mc = mix(uMoonCore, uMoonShade, smoothstep(0.45, 0.75, m) * 0.6);
              mc = mix(mc, uMoonRim, smoothstep(R * 0.86, R, d) * 0.7);
              col = mix(col, mc, smoothstep(R * 1.02, R * 0.96, d) * uMoonOn);
            }
          }
        }

        // 山の層（奥から手前へ重ねる）。稜線は濃く、下へ行くほど霞へぼかす（墨のぼかし）
        float footDeg = (1.0 - uHorizonNdc) * uHalfFovYDeg * 0.45;
        float brush = 0.7 + 0.6 * n2(vec2(azDeg * 0.9, 3.0));
        for (int k = 0; k < 4; k++) {
          int li = k == 0 ? 3 : k - 1;
          float el = li == 0 ? ridge.r : li == 1 ? ridge.g : li == 2 ? ridge.b : ridge.a;
          if (el < 0.02) continue;
          float d = el - elS;
          if (d < 0.0) continue;
          vec3 fill = li == 0 ? uFill[0] : li == 1 ? uFill[1] : li == 2 ? uFill[2] : uFill[3];
          vec3 top = li == 0 ? uTop[0] : li == 1 ? uTop[1] : li == 2 ? uTop[2] : uTop[3];
          float snow = li == 0 ? smoothstep(4.3, 5.6, el / max(uExag, 0.01)) : 0.0;
          float fadeLen = (li == 0 ? 2.2 : li == 1 ? 1.4 : li == 2 ? 1.0 : 0.8) * max(uExag, 0.5);
          vec3 c = mix(top, fill, smoothstep(0.0, fadeLen * 0.45, d));
          c = mix(c, uSnow, snow * (1.0 - smoothstep(0.0, fadeLen * 0.45, d)));
          // 裾は霞（雲海）に溶かす
          c = mix(c, uMist, smoothstep(footDeg, 0.0, elS) * 0.97);
          // 稜線の墨（光と霞では、細い光の縁）
          float lw = uPxDeg * (li == 3 ? 1.0 : li == 0 ? 1.5 : 1.3) * brush;
          float ink = 1.0 - smoothstep(lw * 0.6, lw * 1.4, d);
          float inkA = uRidgeAlpha * (li == 3 ? 0.3 : li == 0 ? 0.85 : 0.7);
          // 光と霞: 雲海に沈んだ低い稜線には線を描かない（面が霞に溶けて、線だけが空に残らないように）
          inkA *= mix(1.0, smoothstep(footDeg * 0.8, footDeg + 0.5, el), uCloudAmt);
          col = mix(c, uRidgeInk, ink * inkA);
        }
        }

        // 霞（すやり霞）: 書き割りの裾から下へ、雲の形の縁で地面を隠す。光と霞では、下の縁をやわらかくして地面の霧に溶かす
        float mistA = mix(smoothstep(-0.01, 0.06, e), smoothstep(-0.02, 0.16, e), uCloudAmt);
        vec3 mistCol = uMist;
        if (blend < 1.0 && mistA > 0.0 && e > -0.02) {
          float bands = smoothstep(0.45, 0.75, fbm(vec2(azDeg * 0.03 + uTime * 0.003, vNdc.y * 5.0 + azDeg * 0.01)));
          mistCol = uMist * (0.985 + 0.03 * bands);
          if (uCloudAmt > 0.0) {
            // 雲海: 上の面だけ光り、雲の頭の間の谷は少し沈む。手前の列を重ねて奥行きを出す
            float dTop = max(0.0, seaTop - vNdc.y);
            float lit = exp(-dTop / max(uRimNdc, 1e-3));
            float valley = (1.0 - head) * exp(-dTop / (uRimNdc * 2.5));
            vec3 sea = mix(uMist, uCloudShade, valley * 0.3 + smoothstep(0.0, uMistDepth * 0.5, dTop) * 0.22);
            sea = mix(sea, uCloudLit, lit * 0.85);
            float dF = seaTopF - vNdc.y;
            if (dF > -0.004) {
              float litF = exp(-max(dF, 0.0) / max(uRimNdc * 0.8, 1e-3));
              vec3 front = mix(uMist, uCloudShade, (1.0 - headF) * exp(-max(dF, 0.0) / (uRimNdc * 2.0)) * 0.25);
              front = mix(front, uCloudLit, litF * 0.7);
              sea = mix(sea, front, smoothstep(-0.004, 0.003, dF));
            }
            // お休みの範囲の方位は、雲の上の面が灯りの色を受ける
            sea = mix(sea, uRestColor, restGlow * (0.35 + 0.65 * lit));
            sea *= 0.985 + 0.03 * bands;
            mistCol = mix(mistCol, sea, uCloudAmt);
          }
        }
        // 霞の縁の、淡い墨の線（白描のとき）
        float edgeLine = (1.0 - smoothstep(uPxNdc * 0.6, uPxNdc * 1.6, abs(e - 0.012))) * uMistEdgeInk;
        vec3 outCol = mix(mistCol, col, blend);
        float outA = max(mistA, blend);
        outCol = mix(outCol, uRidgeInk, edgeLine * 0.22 * (1.0 - blend));
        outA = max(outA, edgeLine * 0.22);
        if (outA <= 0.0) discard;
        gl_FragColor = vec4(outCol, outA);
        #include <colorspace_fragment>
      }
    `,
  })
  plateMat = mat
  const mesh = new THREE.Mesh(g, mat)
  mesh.frustumCulled = false
  // 透明な物（霧・灯り・粒）より後に描く。深度テストで、手前の物には重ならない
  mesh.renderOrder = 1000
  mesh.name = 'backdrop'
  return mesh
}

export function setBackdropPalette(p: ScenePalette): void {
  const u = backdropUniforms
  const DEG = Math.PI / 180
  u.uSkyTop.value.set(p.skyTop)
  u.uSkyMid.value.set(p.skyMid)
  u.uSkyHorizon.value.set(p.skyHorizon)
  u.uSkyGlow.value.set(p.skyGlow)
  u.uLightAz.value = p.light.azDeg * DEG
  // 白描の昼は前の版と同じ（光の方角の明るみなし）。白描の夕・夜は控えめに
  u.uGlowAmt.value = p.id === 'hakubyo' ? (p.time === 'day' ? 0 : 0.4) : 1
  u.uMist.value.set(p.fog)
  p.mountains.forEach((m, i) => {
    u.uFill.value[i].set(m.fill)
    u.uTop.value[i].set(m.top)
  })
  // ぐるりの丘はいちばん霞ませる
  u.uFill.value[3].set(p.mountains[0].fill).lerp(new THREE.Color(p.skyHorizon), 0.55)
  u.uTop.value[3].copy(u.uFill.value[3])
  u.uSnow.value.set(p.snow)
  u.uRidgeInk.value.set(p.mountainInk)
  u.uRidgeAlpha.value = p.id === 'hakubyo' ? 1 : 0.4
  u.uMistEdgeInk.value = p.id === 'hakubyo' ? 1 : 0
  u.uCloudAmt.value = p.cloudSea.amount
  // 深度テストは光と霞（雲海）だけ。白描のすやり霞は前の版のまま、画面の上の方を覆う
  if (plateMat) plateMat.depthTest = p.cloudSea.amount > 0
  u.uCloudLit.value.set(p.cloudSea.lit)
  u.uCloudShade.value.set(p.cloudSea.shade)
  u.uRimNdc.value = p.cloudSea.rimNdc
  u.uBillow.value = p.cloudSea.billow
  const sun = p.sunDisc
  u.uSunOn.value = sun ? 1 : 0
  if (sun) {
    u.uSunAz.value = p.light.azDeg * DEG
    u.uSunElFrac.value = sun.elFrac
    u.uSunColor.value.set(sun.color)
    u.uSunRadius.value = sun.radius
    u.uSunHalo.value.set(sun.halo)
    u.uSunHaloRadius.value = sun.haloRadius
    u.uSunHaloAlpha.value = sun.haloAlpha
  }
  const moon = p.moon
  u.uMoonOn.value = moon ? moon.alpha : 0
  if (moon) {
    u.uMoonAz.value = (peakAzDeg + moon.azOffsetDeg) * DEG
    u.uMoonLift.value = moon.clearance
    u.uMoonRadius.value = moon.radius
    u.uMoonRadiusWide.value = moon.radiusWide ?? moon.radius
    u.uMoonLiftWide.value = moon.clearanceWide ?? moon.clearance
    u.uMoonCore.value.set(moon.core)
    u.uMoonShade.value.set(moon.shade)
    u.uMoonRim.value.set(moon.rim)
    u.uMoonHalo.value.set(moon.halo)
    u.uMoonHaloOuter.value.set(moon.haloOuter)
    u.uMoonHaloAlpha.value = moon.haloAlpha
  }
  u.uRestHorizon.value = p.restGlow.horizon ?? 0
  u.uRestColor.value.set(p.restGlow.color)
  u.uStarDensity.value = p.stars?.density ?? 0
  if (p.stars) u.uStarColor.value.set(p.stars.color)
}

function sample(sorted: Ridge[], az: number): number {
  if (!sorted.length) return 0
  // 方位の範囲外は 0（山なし）。360° の層は両端がつながる
  if (az < sorted[0].az || az > sorted[sorted.length - 1].az) return 0
  let lo = 0
  let hi = sorted.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (sorted[m].az <= az) lo = m
    else hi = m
  }
  const a = sorted[lo]
  const b = sorted[hi]
  const t = b.az > a.az ? (az - a.az) / (b.az - a.az) : 0
  return a.el + (b.el - a.el) * t
}

/** 端（方位60°と140°）で稜線が切れないよう、外側へなだらかに下げる */
function taper(r: Ridge[]): Ridge[] {
  if (r.length < 2) return r
  const out = r.slice().sort((a, b) => a.az - b.az)
  const first = out[0]
  const last = out[out.length - 1]
  const pre: Ridge[] = []
  const post: Ridge[] = []
  for (let k = 1; k <= 24; k++) {
    const s = 1 - k / 24
    const ease = s * s * (3 - 2 * s)
    pre.unshift({ az: first.az - k, el: first.el * ease })
    post.push({ az: last.az + k, el: last.el * ease })
  }
  return pre.concat(out, post)
}

/** ぐるり360°の、低く霞んだ丘（立山の方角以外が空っぽにならないように） */
function lowRing(): Ridge[] {
  const rnd = makeRandom(77)
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28]
  const out: Ridge[] = []
  for (let az = 0; az <= 360; az += 1) {
    const a = THREE.MathUtils.degToRad(az)
    const el = 0.45 + 0.25 * Math.sin(a * 3 + ph[0]) + 0.15 * Math.sin(a * 7 + ph[1]) + 0.08 * Math.sin(a * 17 + ph[2])
    out.push({ az, el: Math.max(0.1, el) })
  }
  return out
}

/** 稜線データがないときの山並み（東、方位およそ95°を中心に3層、霞ませて重ねる） */
function proceduralRange(): Ridge[][] {
  const rnd = makeRandom(5)
  const layers: Ridge[][] = []
  for (let i = 0; i < 3; i++) {
    const peak = [5.8, 3.6, 2.2][i]
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28]
    const ridge: Ridge[] = []
    for (let az = 35; az <= 155; az += 1) {
      const d = (az - 95) / 50
      const env = Math.max(0, 1 - d * d)
      const a = THREE.MathUtils.degToRad(az)
      const n = 0.55 + 0.25 * Math.sin(a * 9 + ph[0]) + 0.13 * Math.sin(a * 23 + ph[1]) + 0.07 * Math.sin(a * 51 + ph[2])
      ridge.push({ az, el: Math.max(0, peak * env * n) })
    }
    layers.push(ridge)
  }
  return layers
}
