// 遠景: 空のグラデーション、立山連峰の切り絵の書き割り、手前を隠す霞（すやり霞）。
//
// 斜め上から狭い画角で見下ろすと、本当の地平線は画面に入らない。そこで絵巻や立山曼荼羅のように、
// 画面の上の方を霞で覆い、その上に山の書き割りを「貼る」。山の横の位置は向き（方位）に合わせて動き、
// 縦は画面の決まった高さに置く。画面の上の方（霞の下端より上）だけを覆う1枚の板を、最後に1回だけ描く。
// 霞より下の画素は描かない（スマホで描き込みの量を抑えるため）。
//
// 稜線データ（tateyama-skyline.json）があればそれを使い、なければ東（方位およそ95°）に手続きで山並みを作る。

import * as THREE from 'three'
import type { SkylineData } from '../data'
import { makeRandom } from '../geom2d'
import type { Palette } from '../palette'

/** 稜線テクスチャの1°あたりの列数と、仰角の最大（度） */
const COLS_PER_DEG = 2
const EL_MAX = 8

export const backdropUniforms = {
  uRidge: { value: null as THREE.DataTexture | null },
  uSkyTop: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
  uMist: { value: new THREE.Color() },
  /** 霞の上端＝書き割りの裾の高さ（NDC の y） */
  uHorizonNdc: { value: 0.55 },
  /** 霞が地面を覆う深さ（NDC） */
  uMistDepth: { value: 0.3 },
  uYaw: { value: 0 },
  uTanHalfX: { value: 0.5 },
  uHalfFovYDeg: { value: 17 },
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
  // x = -1..1、y = 0（霞の下端より下）..1（画面の上端）の四角。縦の位置は頂点シェーダーで決める
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  const mat = new THREE.ShaderMaterial({
    uniforms: backdropUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uHorizonNdc;
      uniform float uMistDepth;
      varying vec2 vNdc;
      void main() {
        // 霞の下端は、いちばん下でも uHorizonNdc − uMistDepth × 1.65（雲形のゆらぎ込み）。少し余裕を持たせる
        float bottom = clamp(uHorizonNdc - uMistDepth * 1.7 - 0.03, -1.0, 1.0);
        vNdc = vec2(position.x, mix(bottom, 1.0, position.y));
        gl_Position = vec4(vNdc, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uRidge;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uMist;
      uniform float uHorizonNdc;
      uniform float uMistDepth;
      uniform float uYaw;
      uniform float uTanHalfX;
      uniform float uHalfFovYDeg;
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
      varying vec2 vNdc;

      float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { return 0.55 * n2(p) + 0.3 * n2(p * 2.03 + 1.7) + 0.15 * n2(p * 4.1 - 2.3); }

      void main() {
        // この画素の方位（度）と、書き割りの裾からの見かけの仰角（度）
        float azDeg = degrees(uYaw + atan(vNdc.x * uTanHalfX));
        float elS = (vNdc.y - uHorizonNdc) * uHalfFovYDeg;
        float u = azDeg / 360.0;
        vec4 ridge = texture2D(uRidge, vec2(u, 0.5)) * ${EL_MAX.toFixed(1)} * uExag;

        float mistTop = uHorizonNdc;
        // 書き割りの裾と霞をなめらかにつなぐ（blend = 0 なら空と山は見えないので計算しない）
        float blend = smoothstep(mistTop - 0.015, mistTop + 0.02, vNdc.y);
        vec3 col = uSkyHorizon;
        if (blend > 0.0) {
        // 空
        float t = clamp(elS / max(1.0, (1.0 - uHorizonNdc) * uHalfFovYDeg), 0.0, 1.0);
        col = mix(uSkyHorizon, uSkyTop, pow(t, 0.75));
        // たなびく雲
        float cloud = fbm(vec2(azDeg * 0.05 + uTime * 0.01, elS * 0.35));
        col = mix(col, uSkyHorizon * 1.02, smoothstep(0.6, 0.8, cloud) * smoothstep(1.0, 3.0, elS) * 0.5);

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
          // 裾は霞に溶かす
          c = mix(c, uMist, smoothstep(footDeg, 0.0, elS) * 0.97);
          // 稜線の墨
          float lw = uPxDeg * (li == 3 ? 1.0 : li == 0 ? 1.5 : 1.3) * brush;
          float ink = 1.0 - smoothstep(lw * 0.6, lw * 1.4, d);
          float inkA = uRidgeAlpha * (li == 3 ? 0.3 : li == 0 ? 0.85 : 0.7);
          col = mix(c, uRidgeInk, ink * inkA);
        }
        }

        // 霞（すやり霞）: 書き割りの裾から下へ、雲の形の縁で地面を隠す
        float lobe = fbm(vec2(azDeg * 0.07 - uTime * 0.004, 1.3));
        float bottomEdge = mistTop - uMistDepth + (lobe - 0.5) * uMistDepth * 1.3;
        float e = vNdc.y - bottomEdge;
        float mistA = smoothstep(-0.01, 0.06, e);
        vec3 mistCol = uMist;
        if (blend < 1.0 && mistA > 0.0) {
          float bands = smoothstep(0.45, 0.75, fbm(vec2(azDeg * 0.03 + uTime * 0.003, vNdc.y * 5.0 + azDeg * 0.01)));
          mistCol = uMist * (0.985 + 0.03 * bands);
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
  const mesh = new THREE.Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 1000
  mesh.name = 'backdrop'
  return mesh
}

export function setBackdropPalette(p: Palette): void {
  const u = backdropUniforms
  u.uSkyTop.value.set(p.skyTop)
  u.uSkyHorizon.value.set(p.skyHorizon)
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
