// 道沿いの小さな灯り（道しるべの行灯）。06 §3.9・§6.6。
// 社寺の灯籠ではない: 細い木の柱の上に紙の箱、上に丸みのある小さな屋根。装飾なし。
//
// - 柱と紙の箱は1つの形にまとめ、InstancedMesh で1回の描画（夜は紙の箱が光る）
// - 光の輪・外のにじみ・地面の明かりは、1つの InstancedBufferGeometry で1回の描画（加算合成）。
//   本物の点光源（PointLight）は使わない（すべての Lambert のシェーダーが重くなるため）
// - 光の輪を出すのは、アバターに近い順に画質ごとの数まで

import * as THREE from 'three'
import { applyBend, BEND_GLSL, bendUniforms, fogShapeUniforms } from '../bend'
import type { FieldData } from '../data'
import { bboxOf, densify, inBox, nearestOnPolyline, nearestOnRing, pointInPolygon } from '../geom2d'
import type { SceneExtras } from '../hikari'
import type { HeightField } from './heightfield'

/** 道沿いの間隔（m）と、灯りどうしの最小の距離（m）。夜の画面に灯りが 4〜6 基は入るように */
const SPACING = 16
const MIN_GAP = 11
const POST_H = 0.9
const BOX_H = 0.3
const GLOW_Y = POST_H + BOX_H / 2
/** 輪・外のにじみ・地面の明かりの半径（m）。06 §3.7 の値より少し大きく（既定のズーム 78m で読めるように） */
const R_HALO = 1.6
const R_OUTER = 4.2
const R_POOL = 6.0
const MAX_GLOWS = 64

export const lampUniforms = {
  uCore: { value: new THREE.Color(0xffd89a) },
  uHalo: { value: new THREE.Color(0xff9a48) },
  uOuter: { value: new THREE.Color(0xc4402c) },
  uPool: { value: new THREE.Color(0xffae5c) },
  uPaper: { value: new THREE.Color(0xf4ead6) },
  uPost: { value: new THREE.Color(0x7a5a48) },
  uIntensity: { value: 0 },
  uPoolOn: { value: 1 },
  uTime: { value: 0 },
  uFogNear: { value: 60 },
  uFogFar: { value: 300 },
}

export class Lamps {
  readonly group = new THREE.Group()
  readonly count: number
  private readonly spots: THREE.Vector3[]
  private readonly glowGeo: THREE.InstancedBufferGeometry
  private readonly glowPos: THREE.InstancedBufferAttribute
  private readonly glowMesh: THREE.Mesh
  private maxGlows = 24
  private lastX = Infinity
  private lastZ = Infinity
  private on = false
  private readonly posts: THREE.InstancedMesh
  /** 近い順の選び直しに使い回す配列（毎回の確保をしない） */
  private readonly dist2: Float32Array
  private readonly order: Uint16Array

  constructor(data: FieldData, hf: HeightField, isInsideRest: (x: number, z: number) => boolean) {
    this.spots = placeLamps(data, hf, isInsideRest)
    this.count = this.spots.length
    this.dist2 = new Float32Array(this.count)
    this.order = new Uint16Array(this.count)

    // 柱・紙の箱・屋根（aPart: 0 = 柱、1 = 紙の箱、2 = 屋根）。
    // 見下ろすカメラでも紙の箱が屋根に隠れないよう、屋根は箱からわずかに出るだけの大きさに
    const post = new THREE.BoxGeometry(0.08, POST_H, 0.08).translate(0, POST_H / 2, 0)
    const box = new THREE.BoxGeometry(0.22, BOX_H, 0.22).translate(0, POST_H + BOX_H / 2, 0)
    const roof = new THREE.ConeGeometry(0.13, 0.1, 8, 1).translate(0, POST_H + BOX_H + 0.05, 0)
    const parts: [THREE.BufferGeometry, number][] = [
      [post, 0],
      [box, 1],
      [roof, 2],
    ]
    const pos: number[] = []
    const nrm: number[] = []
    const part: number[] = []
    for (const [g, k] of parts) {
      const ng = g.index ? g.toNonIndexed() : g
      pos.push(...(ng.getAttribute('position').array as Float32Array))
      nrm.push(...(ng.getAttribute('normal').array as Float32Array))
      for (let i = 0; i < ng.getAttribute('position').count; i++) part.push(k)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1))
    const mat = applyBend(new THREE.MeshLambertMaterial({ flatShading: true }), {
      extend: {
        key: 'lamp',
        patch: (shader) => {
          shader.uniforms.uPaper = lampUniforms.uPaper
          shader.uniforms.uPost = lampUniforms.uPost
          shader.uniforms.uCore = lampUniforms.uCore
          shader.uniforms.uIntensity = lampUniforms.uIntensity
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;')
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nuniform vec3 uPaper;\nuniform vec3 uPost;\nuniform vec3 uCore;\nuniform float uIntensity;\nvarying float vPart;',
            )
            // 屋根は、灯りがともると内側から照らされた紙の色（夕・夜）
            .replace(
              '#include <color_fragment>',
              '#include <color_fragment>\nfloat lit = min( 1.0, uIntensity * 2.0 );\ndiffuseColor.rgb = vPart < 0.5 ? uPost : vPart < 1.5 ? uPaper : mix( uPost, uPaper * 0.6, lit );',
            )
            .replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uCore * ( ( vPart > 0.5 && vPart < 1.5 ? 0.9 : vPart > 1.5 ? 0.25 : 0.0 ) * uIntensity );',
            )
        },
      },
    })
    const posts = new THREE.InstancedMesh(geo, mat, Math.max(1, this.count))
    posts.count = this.count
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const one = new THREE.Vector3(1, 1, 1)
    this.spots.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39996) % (Math.PI * 2))
      m.compose(s, q, one)
      posts.setMatrixAt(i, m)
    })
    posts.instanceMatrix.needsUpdate = true
    posts.castShadow = true
    posts.frustumCulled = false
    posts.name = 'lamps'
    this.posts = posts
    this.group.add(posts)

    // 光の輪（板3枚: 0 = 輪、1 = 外のにじみ、2 = 地面の明かり）
    const quad = new THREE.InstancedBufferGeometry()
    const qp: number[] = []
    const qk: number[] = []
    const qi: number[] = []
    for (let k = 0; k < 3; k++) {
      const b = k * 4
      qp.push(-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0)
      qk.push(k, k, k, k)
      qi.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
    quad.setAttribute('position', new THREE.Float32BufferAttribute(qp, 3))
    quad.setAttribute('aKind', new THREE.Float32BufferAttribute(qk, 1))
    quad.setIndex(qi)
    // iPos: xyz = 灯りの紙の箱の中心、w = 地面の高さ
    this.glowPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS * 4), 4)
    this.glowPos.setUsage(THREE.DynamicDrawUsage)
    quad.setAttribute('iPos', this.glowPos)
    quad.instanceCount = 0
    this.glowGeo = quad
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { ...lampUniforms, ...bendUniforms, uFogMax: fogShapeUniforms.uFogMax },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aKind;
        attribute vec4 iPos;
        uniform float uIntensity;
        uniform float uPoolOn;
        uniform float uTime;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uFogMax;
        varying vec2 vUv;
        varying float vKind;
        varying float vA;
        ${BEND_GLSL}
        void main() {
          vUv = position.xy;
          vKind = aKind;
          vec4 mv;
          float seed = iPos.x * 0.37 + iPos.z * 0.61;
          // ゆらぎ 3%・0.8Hz
          float flick = 1.0 + 0.03 * sin(uTime * 5.03 + seed) + 0.015 * sin(uTime * 11.3 + seed * 2.0);
          float a;
          if (aKind < 1.5) {
            vec3 c = iPos.xyz;
            c.y -= bendDrop(c.xz);
            mv = viewMatrix * vec4(c, 1.0);
            // 輪の板をカメラ側へ 0.5m 出す（紙の箱の上の小さな屋根に、輪の芯が隠れないように）
            mv.xyz += normalize(-mv.xyz) * 0.5;
            float r = aKind < 0.5 ? ${R_HALO.toFixed(2)} : ${R_OUTER.toFixed(2)};
            mv.xy += position.xy * r;
            a = aKind < 0.5 ? 0.75 : 0.26;
          } else {
            vec3 w = vec3(iPos.x + position.x * ${R_POOL.toFixed(2)}, iPos.w + 0.3, iPos.z + position.y * ${R_POOL.toFixed(2)});
            w.y -= bendDrop(w.xz);
            mv = viewMatrix * vec4(w, 1.0);
            a = 0.36 * uPoolOn;
          }
          float depth = -mv.z;
          float fs = smoothstep(uFogNear, uFogFar, depth);
          float fog = uFogMax * fs * (2.0 - fs);
          // カメラに近すぎる輪は消す（画面を大きく覆うと重い）。灯りは霧を少し透かして見える
          vA = a * uIntensity * flick * (1.0 - fog * 0.6) * smoothstep(6.0, 18.0, depth);
          gl_Position = projectionMatrix * mv;
          if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uCore;
        uniform vec3 uHalo;
        uniform vec3 uOuter;
        uniform vec3 uPool;
        varying vec2 vUv;
        varying float vKind;
        varying float vA;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float f = 1.0 - r;
          vec3 col;
          float a;
          if (vKind < 0.5) {
            // 芯（輪の半径の 25% まで）は明るい点として残す（既定のズームで 3px 以上）
            col = mix(uCore, uHalo, smoothstep(0.2, 0.55, r));
            a = f * f * (1.0 + 2.0 * exp(-r * r * 16.0));
          } else if (vKind < 1.5) {
            col = uOuter;
            a = f * f;
          } else {
            col = uPool;
            a = pow(f, 1.6);
          }
          gl_FragColor = vec4(col, a * vA);
          #include <colorspace_fragment>
        }
      `,
    })
    this.glowMesh = new THREE.Mesh(quad, glowMat)
    this.glowMesh.frustumCulled = false
    this.glowMesh.renderOrder = 8
    this.glowMesh.name = 'lamp-glows'
    this.group.add(this.glowMesh)
  }

  setPalette(p: SceneExtras & { id: string }): void {
    const l = p.lamps
    lampUniforms.uCore.value.set(l.core)
    lampUniforms.uHalo.value.set(l.halo)
    lampUniforms.uOuter.value.set(l.outer)
    lampUniforms.uPool.value.set(l.pool)
    lampUniforms.uPaper.value.set(l.paper)
    lampUniforms.uPost.value.set(l.post)
    lampUniforms.uIntensity.value = l.intensity
    this.on = l.intensity > 0
    this.glowMesh.visible = this.on
    // 白描は、灯りがともる夜だけ行灯を立てる（昼の白描は和紙と墨だけ）
    this.posts.visible = p.id !== 'hakubyo' || this.on
    this.lastX = Infinity
  }

  /** 画質: 輪を出す数と、地面の明かりの有無 */
  setQuality(maxGlows: number, pool: boolean): void {
    this.maxGlows = Math.min(MAX_GLOWS, maxGlows)
    lampUniforms.uPoolOn.value = pool ? 1 : 0
    this.lastX = Infinity
  }

  /** アバターに近い順に、輪を出す灯りを選び直す（4m 動いたら） */
  update(time: number, x: number, z: number): void {
    lampUniforms.uTime.value = time
    if (!this.on) return
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 4) return
    this.lastX = x
    this.lastZ = z
    // 近い順に maxGlows 個（使い回しの配列で部分選択。並べ替えの配列とオブジェクトを作らない）
    const n = this.count
    const d2 = this.dist2
    const ord = this.order
    for (let i = 0; i < n; i++) {
      const s = this.spots[i]
      d2[i] = (s.x - x) ** 2 + (s.z - z) ** 2
      ord[i] = i
    }
    const m = Math.min(this.maxGlows, n)
    for (let k = 0; k < m; k++) {
      let best = k
      for (let j = k + 1; j < n; j++) if (d2[ord[j]] < d2[ord[best]]) best = j
      const t = ord[k]
      ord[k] = ord[best]
      ord[best] = t
    }
    const arr = this.glowPos.array as Float32Array
    for (let k = 0; k < m; k++) {
      const s = this.spots[ord[k]]
      arr[k * 4] = s.x
      arr[k * 4 + 1] = s.y + GLOW_Y
      arr[k * 4 + 2] = s.z
      arr[k * 4 + 3] = s.y
    }
    this.glowPos.needsUpdate = true
    this.glowGeo.instanceCount = m
  }

  /** 輪を出している灯りの位置（x, 箱の高さ, z, 地面の高さ の並び。近い順）。粒を灯りのまわりに集めるのに使う */
  get litArray(): Float32Array {
    return this.glowPos.array as Float32Array
  }

  /** 輪を出している灯りの数（消灯なら 0） */
  get litCount(): number {
    return this.on ? this.glowGeo.instanceCount : 0
  }
}

/** 道沿いに SPACING ごと、道の端から 1.2m 外へ。お休みの範囲・建物・水・ほかの道を避ける */
function placeLamps(data: FieldData, hf: HeightField, isInsideRest: (x: number, z: number) => boolean): THREE.Vector3[] {
  const half = data.half - 4
  const out: THREE.Vector3[] = []
  const roads = data.roads.filter((r) => !r.inRestZone && !r.tunnel && !r.bridge && r.kind !== 'steps')
  const buildings = data.buildings.map((b) => ({ poly: b.polygon, box: bboxOf(b.polygon, 4) }))
  const rests = data.restZones.map((z) => z.polygon)
  const waters = data.waterLines.filter((w) => !w.tunnel)
  const blocked = (x: number, z: number) => {
    if (Math.abs(x) > half || Math.abs(z) > half) return true
    if (isInsideRest(x, z)) return true
    for (const r of rests) if (nearestOnRing(x, z, r).dist < 10) return true
    for (const b of buildings) {
      if (!inBox(b.box, x, z)) continue
      if (pointInPolygon(x, z, b.poly) || nearestOnRing(x, z, b.poly).dist < 3) return true
    }
    for (const r of roads) if (nearestOnPolyline(x, z, r.points).dist < r.widthM / 2 + 0.6) return true
    for (const w of waters) if (nearestOnPolyline(x, z, w.points).dist < w.widthM / 2 + 1) return true
    for (const a of data.waterAreas) if (pointInPolygon(x, z, a.polygon)) return true
    for (const r of data.rails) if (nearestOnPolyline(x, z, r.points).dist < 3) return true
    for (const o of out) if ((o.x - x) ** 2 + (o.z - z) ** 2 < MIN_GAP * MIN_GAP) return true
    return false
  }
  roads.forEach((r, ri) => {
    const pts = densify(r.points, 1)
    let along = SPACING * 0.5
    let side = ri % 2 === 0 ? 1 : -1
    for (let i = 1; i < pts.length; i++) {
      along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (along < SPACING) continue
      const tx = pts[i][0] - pts[i - 1][0]
      const tz = pts[i][1] - pts[i - 1][1]
      const l = Math.hypot(tx, tz) || 1
      const off = r.widthM / 2 + 1.2
      // 片側がふさがっていれば反対側に
      for (const s of [side, -side]) {
        const x = pts[i][0] - (tz / l) * off * s
        const z = pts[i][1] + (tx / l) * off * s
        if (blocked(x, z)) continue
        out.push(new THREE.Vector3(x, hf.heightAt(x, z), z))
        along = 0
        side = -s
        break
      }
    }
  })
  return out
}
