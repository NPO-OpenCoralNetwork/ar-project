// 光の粒（金のちり・灯の粒）と、舞う紅葉。06 §3.6・§6.5。
// 1回の描画（THREE.Points）。粒はアバターのまわり 90m 四方に、世界に固定して散らし、外へ出たら反対側へ回す。
// 位置は CPU で毎フレーム数百個だけ計算する（地面の高さに沿わせるため）。
// 粒は加算、紅葉は不透明寄り（前もって掛けたアルファで、同じ描画の中で混ぜる）。
// 季節（10月）に合わせてホタルは出さない。夜の粒は「夢の灯の粒」。

import * as THREE from 'three'
import { BEND_GLSL, bendUniforms, fogShapeUniforms } from '../bend'
import { makeRandom } from '../geom2d'
import type { PerQuality, SceneExtras } from '../hikari'
import type { HeightField } from './heightfield'

const MAX_MOTES = 180
const MAX_LEAVES = 28
const SPAN = 90
/** 紅葉の大きさ（m）と、画面での最小の大きさ（CSS px） */
const LEAF_M = 0.45
const LEAF_MIN_PX = 5

/** 世界に固定した位置 o を、c を中心とする SPAN 四方へ回す */
function wrap(o: number, c: number): number {
  return c + ((((o - c) % SPAN) + SPAN * 1.5) % SPAN) - SPAN / 2
}

/** 灯りのまわりに集める粒の、灯りからの距離（m） */
const CLUSTER_R = 8

export const moteUniforms = {
  uColorA: { value: new THREE.Color() },
  uColorB: { value: new THREE.Color() },
  uLeafA: { value: new THREE.Color() },
  uLeafB: { value: new THREE.Color() },
  uAlpha: { value: 0.6 },
  uSize: { value: new THREE.Vector2(2, 4) },
  uHz: { value: new THREE.Vector2(0.2, 0.5) },
  uTime: { value: 0 },
  uPixelRatio: { value: 1 },
  /** 1m の物が、距離 1m で何画素（描画バッファ）に見えるか */
  uProjScale: { value: 800 },
  uFogNear: { value: 60 },
  uFogFar: { value: 300 },
}

interface Seed {
  ox: number
  oz: number
  vx: number
  vz: number
  h: number
  rate: number
  phase: number
  size: number
  mixB: number
  /** 灯りのまわりに集めるときの、今の命の回の番号と、灯りの位置 */
  cyc: number
  ax: number
  az: number
}

/** 灯りの位置の読み出し口（Lamps） */
export interface LampAnchors {
  readonly litArray: Float32Array
  readonly litCount: number
}

export class Motes {
  readonly points: THREE.Points
  private readonly seeds: Seed[] = []
  private readonly leafSeeds: Seed[] = []
  private readonly pos: THREE.BufferAttribute
  private readonly attr: THREE.BufferAttribute
  private readonly life: THREE.BufferAttribute
  private moteCount = 0
  private leafCount = 0
  private counts: { motes: PerQuality; leaves: PerQuality | null } = { motes: { low: 0, std: 0, high: 0 }, leaves: null }
  private quality: keyof PerQuality = 'std'
  private mixB = 0.3
  private cluster = 0

  constructor(private readonly hf: HeightField) {
    const rnd = makeRandom(31337)
    for (let i = 0; i < MAX_MOTES; i++) {
      this.seeds.push({
        ox: rnd() * SPAN,
        oz: rnd() * SPAN,
        vx: (rnd() - 0.5) * 0.5,
        vz: (rnd() - 0.5) * 0.5,
        h: rnd(),
        rate: 0.02 + rnd() * 0.03,
        phase: rnd() * 100,
        size: rnd(),
        mixB: rnd(),
        cyc: -1,
        ax: 0,
        az: 0,
      })
    }
    for (let i = 0; i < MAX_LEAVES; i++) {
      this.leafSeeds.push({
        ox: rnd() * SPAN,
        oz: rnd() * SPAN,
        vx: 0.5 + rnd() * 0.6,
        vz: (rnd() - 0.5) * 0.6,
        h: rnd(),
        rate: 0.06 + rnd() * 0.05,
        phase: rnd() * 100,
        size: rnd(),
        mixB: rnd(),
        cyc: -1,
        ax: 0,
        az: 0,
      })
    }
    const n = MAX_MOTES + MAX_LEAVES
    const g = new THREE.BufferGeometry()
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)
    // aAttr: x = 大きさ(0..1)、y = 位相、z = 色 B か(0/1)、w = 種類（0 = 粒、1 = 紅葉）。パレットか画質が変わったときだけ書く
    this.attr = new THREE.BufferAttribute(new Float32Array(n * 4), 4)
    this.life = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.pos)
    g.setAttribute('aAttr', this.attr)
    g.setAttribute('aLife', this.life)
    g.setDrawRange(0, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...moteUniforms, ...bendUniforms, uFogMax: fogShapeUniforms.uFogMax },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec4 aAttr;
        attribute float aLife;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uLeafA;
        uniform vec3 uLeafB;
        uniform float uAlpha;
        uniform vec2 uSize;
        uniform vec2 uHz;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uProjScale;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uFogMax;
        varying vec3 vColor;
        varying float vA;
        varying float vKind;
        varying float vRot;
        ${BEND_GLSL}
        void main() {
          vec3 p = position;
          p.y -= bendDrop(p.xz);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float depth = -mv.z;
          vKind = aAttr.w;
          float hz = mix(uHz.x, uHz.y, fract(aAttr.y * 7.13));
          float tw = 0.55 + 0.45 * sin(uTime * 6.2832 * hz + aAttr.y);
          float fs = smoothstep(uFogNear, uFogFar, depth);
          float fog = uFogMax * fs * (2.0 - fs);
          // カメラから 8m 以内と、霧の奥は消す
          float fade = smoothstep(8.0, 14.0, depth) * (1.0 - fog);
          float px;
          if (vKind < 0.5) {
            vColor = aAttr.z > 0.5 ? uColorB : uColorA;
            vA = uAlpha * tw * aLife * fade;
            // 芯の直径が CSS px で uSize（ズーム 78m のとき。基準の距離。既定のズームは 62m）。外の輪を含めて 3 倍の板
            px = mix(uSize.x, uSize.y, aAttr.x) * 3.0 * uPixelRatio * clamp(78.0 / max(depth, 1.0), 0.6, 2.2);
          } else {
            vColor = aAttr.z > 0.5 ? uLeafB : uLeafA;
            vA = 0.9 * aLife * fade;
            // 紅葉は ${LEAF_M}m（既定のズームでも見えるよう、画面で ${LEAF_MIN_PX}px より小さくしない）
            px = max(${LEAF_M.toFixed(2)} * 1.6 * uProjScale / max(depth, 1.0), ${LEAF_MIN_PX.toFixed(1)} * uPixelRatio);
          }
          vRot = uTime * (0.8 + aAttr.x) + aAttr.y;
          gl_PointSize = clamp(px, 1.5, 36.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
          if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vA;
        varying float vKind;
        varying float vRot;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float a;
          float opaque;
          if (vKind < 0.5) {
            float r = length(q) * 2.0;
            // 芯（半径 1/3）と、外のやわらかい輪
            a = (1.0 - smoothstep(0.0, 0.34, r)) + 0.35 * (1.0 - smoothstep(0.34, 1.0, r));
            opaque = 0.0;
          } else {
            // 紅葉: 回る葉（2つの円の重なり）
            float c = cos(vRot);
            float s = sin(vRot);
            vec2 l = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * 2.0;
            float d1 = length(l - vec2(0.0, 0.42));
            float d2 = length(l + vec2(0.0, 0.42));
            a = (1.0 - smoothstep(0.66, 0.74, d1)) * (1.0 - smoothstep(0.66, 0.74, d2));
            opaque = 1.0;
          }
          a *= vA;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor, 1.0);
          #include <colorspace_fragment>
          gl_FragColor = vec4(gl_FragColor.rgb * a, a * opaque);
        }
      `,
    })
    this.points = new THREE.Points(g, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 9
    this.points.name = 'motes'
  }

  setPalette(p: SceneExtras): void {
    const m = p.motes
    moteUniforms.uColorA.value.set(m.a)
    moteUniforms.uColorB.value.set(m.b)
    moteUniforms.uAlpha.value = m.alpha
    moteUniforms.uSize.value.set(m.sizePx[0], m.sizePx[1])
    moteUniforms.uHz.value.set(m.twinkleHz[0], m.twinkleHz[1])
    if (p.leaves) {
      moteUniforms.uLeafA.value.set(p.leaves.a)
      moteUniforms.uLeafB.value.set(p.leaves.b)
    }
    this.mixB = m.mixB
    this.cluster = m.cluster ?? 0
    this.counts = { motes: m.count, leaves: p.leaves?.count ?? null }
    this.applyCounts()
  }

  setQuality(q: keyof PerQuality): void {
    this.quality = q
    this.applyCounts()
  }

  /** 画面の大きさ（描画バッファの高さ）と縦の画角が変わったとき */
  setViewport(pixelRatio: number, bufferHeight: number, fovYDeg: number): void {
    moteUniforms.uPixelRatio.value = pixelRatio
    moteUniforms.uProjScale.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovYDeg) / 2))
  }

  private applyCounts(): void {
    this.moteCount = Math.min(MAX_MOTES, this.counts.motes[this.quality])
    this.leafCount = Math.min(MAX_LEAVES, this.counts.leaves?.[this.quality] ?? 0)
    this.points.visible = this.moteCount + this.leafCount > 0
    // 変わらない属性（大きさ・位相・色・種類）は、ここで1回だけ書いて送る
    const A = this.attr.array as Float32Array
    let k = 0
    for (let i = 0; i < this.moteCount; i++, k++) {
      const s = this.seeds[i]
      A[k * 4] = s.size
      A[k * 4 + 1] = s.phase
      A[k * 4 + 2] = s.mixB < this.mixB ? 1 : 0
      A[k * 4 + 3] = 0
    }
    for (let i = 0; i < this.leafCount; i++, k++) {
      const s = this.leafSeeds[i]
      A[k * 4] = s.size
      A[k * 4 + 1] = s.phase
      A[k * 4 + 2] = s.mixB < 0.5 ? 1 : 0
      A[k * 4 + 3] = 1
    }
    this.attr.needsUpdate = true
  }

  /** lamps を渡すと、夜は粒の一部（cluster の割合）を灯りのまわり 8m 以内に集める */
  update(time: number, cx: number, cz: number, lamps?: LampAnchors): void {
    moteUniforms.uTime.value = time
    if (!this.points.visible) return
    const P = this.pos.array as Float32Array
    const L = this.life.array as Float32Array
    const lit = lamps && this.cluster > 0 ? lamps.litCount : 0
    let k = 0
    for (let i = 0; i < this.moteCount; i++, k++) {
      const s = this.seeds[i]
      // ゆっくり上へ漂い、上で消えて下から現れる
      const life = s.h + time * s.rate
      const f = life % 1
      let x: number
      let z: number
      if (lit > 0 && s.h < this.cluster) {
        // 命の回が変わったとき（見えない瞬間）だけ、集まる灯りを選び直す
        const cyc = Math.floor(life)
        if (cyc !== s.cyc) {
          s.cyc = cyc
          const j = (i * 7 + cyc * 13) % lit
          s.ax = lamps!.litArray[j * 4]
          s.az = lamps!.litArray[j * 4 + 2]
        }
        const r = 1.2 + (s.ox / SPAN) * (CLUSTER_R - 1.2)
        const a = s.phase + time * (0.08 + s.rate)
        x = s.ax + Math.cos(a) * r
        z = s.az + Math.sin(a) * r
      } else {
        x = wrap(s.ox + s.vx * time + Math.sin(time * 0.3 + s.phase) * 0.8, cx)
        z = wrap(s.oz + s.vz * time + Math.cos(time * 0.27 + s.phase) * 0.8, cz)
      }
      P[k * 3] = x
      P[k * 3 + 1] = this.hf.heightAt(x, z) + 0.5 + f * 3.5
      P[k * 3 + 2] = z
      L[k] = Math.sin(Math.PI * f)
    }
    for (let i = 0; i < this.leafCount; i++, k++) {
      const s = this.leafSeeds[i]
      const x = wrap(s.ox + s.vx * time + Math.sin(time * 1.1 + s.phase) * 1.2, cx)
      const z = wrap(s.oz + s.vz * time, cz)
      // 舞い落ちる
      const f = (s.h + time * s.rate) % 1
      P[k * 3] = x
      P[k * 3 + 1] = this.hf.heightAt(x, z) + 0.2 + (1 - f) * 5
      P[k * 3 + 2] = z
      L[k] = Math.min(1, (1 - f) * 6) * Math.min(1, f * 10)
    }
    this.points.geometry.setDrawRange(0, k)
    this.pos.needsUpdate = true
    this.life.needsUpdate = true
  }
}
