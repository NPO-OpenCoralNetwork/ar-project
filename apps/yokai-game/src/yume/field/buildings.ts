// 建物: OSM の外形を押し出した塊と、長方形に近いものには切妻/寄棟の屋根。仮の家（placeholder）も同じ作り方で、屋根は切妻。
// 階数のタグはこの地域のデータに1棟もないので、面積と番号から1〜2階に振り分ける（見た目を毎回同じにするため乱数は使わない）。
// 壁と屋根を、それぞれ1つのジオメトリにまとめる（描画命令2〜3回）。駅のホームは低い台として壁と平らな屋根に混ぜる。
//
// 窓の灯り（夜と夕の終わり）: 壁の外に少し浮かせた小さな板を、加算合成の1つのジオメトリにまとめる（描画命令1回。昼は描かない）。
// 家の中は作らない。灯る窓は番号から決める（毎回同じ）。

import * as THREE from 'three'
import { applyBend, BEND_GLSL, bendUniforms, fogShapeUniforms } from '../bend'
import type { BuildingData } from '../data'
import { hash01, minAreaRect, pointInPolygon, polygonArea, type XZ } from '../geom2d'
import type { SceneExtras } from '../hikari'
import type { Palette } from '../palette'
import type { HeightField } from './heightfield'
import { type InkLineBuilder, LineKind } from './ink-lines'

/** 窓の灯りの色と強さ（main の霧の範囲も入れる） */
export const windowUniforms = {
  uWinColor: { value: new THREE.Color(0xffcf8a) },
  uWinIntensity: { value: 0 },
  uFogNear: { value: 60 },
  uFogFar: { value: 300 },
}

/** 窓（障子）の大きさ（m）・壁からの浮かせ・1階の窓の中心の高さ・階の高さ */
const WIN_W = 1.1
const WIN_H = 0.9
/** 板は窓より WIN_PAD 倍大きくし、窓のまわりに淡いにじみを付ける */
const WIN_PAD = 1.7
const WIN_OUT = 0.07
const WIN_Y0 = 1.25
const FLOOR_H = 2.75
/** 1棟あたりの灯る窓の上限と、窓が灯る割合 */
const WIN_MAX = 5
const WIN_LIT_P = 0.42
/** ホームの高さ（m） */
const PLATFORM_H = 0.9

const ROOF_PITCH = THREE.MathUtils.degToRad(24)
const EAVE = 0.55

interface Acc {
  pos: number[]
  col: number[]
  /** 頂点の明るさ（建物の根元を暗くする。06「建物の根元や木の下を少し暗く」） */
  ao: number[]
  /** この建物の地面の高さ（ao の基準） */
  base: number
}

export interface BuildingInfo {
  polygon: XZ[]
  floors: number
  wallTop: number
}

/** 平らな屋根の縁の立ち上がり（m） */
const PARAPET = 0.3

export class Buildings {
  readonly group = new THREE.Group()
  readonly info: BuildingInfo[] = []
  /** 灯る窓の数（確認用） */
  readonly windowCount: number
  private readonly wallMat: THREE.MeshLambertMaterial
  private readonly roofMat: THREE.MeshLambertMaterial
  private readonly flatMat: THREE.MeshLambertMaterial
  private readonly windows: THREE.Mesh | null = null

  constructor(polys: BuildingData[], platforms: XZ[][], hf: HeightField, lines: InkLineBuilder) {
    const walls: Acc = { pos: [], col: [], ao: [], base: 0 }
    const roofs: Acc = { pos: [], col: [], ao: [], base: -1e9 }
    const flats: Acc = { pos: [], col: [], ao: [], base: -1e9 }
    const win: WinAcc = { pos: [], uv: [], level: [] }
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

    polys.forEach((b, idx) => {
      let poly = b.polygon.slice()
      if (poly.length < 3) return
      if (polygonArea(poly) > 0) poly = poly.reverse()
      const area = Math.abs(polygonArea(poly))
      const h1 = hash01(idx * 7 + 3)
      const floors = b.levels ?? (area < 25 ? 1 : area > 50 && h1 < 0.55 ? 2 : 1)
      const wallH = area < 25 && !b.placeholder ? 2.6 : floors === 2 ? 5.9 : 3.2
      let gMin = Infinity
      let gMax = -Infinity
      const ground = poly.map(([x, z]) => {
        const y = hf.heightAt(x, z)
        gMin = Math.min(gMin, y)
        gMax = Math.max(gMax, y)
        return y
      })
      const y0 = gMin - 0.4
      walls.base = gMin
      const top = gMax + wallH
      const shade = 0.93 + hash01(idx * 13 + 1) * 0.1
      const roofShade = 0.9 + hash01(idx * 17 + 5) * 0.16
      this.info.push({ polygon: poly, floors, wallTop: top })

      // 窓の灯り（小屋・車庫・屋根だけの建物には付けない）
      if (area >= 25 && !['garage', 'garages', 'hut', 'roof', 'shed', 'carport'].includes(b.kind ?? '')) {
        // 駅舎は夜もどこにあるか分かるよう、窓の候補をすべて灯す
        addWindows(win, poly, gMin, top, floors, idx, b.kind === 'train_station')
      }

      // 壁
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i]
        const q = poly[(i + 1) % poly.length]
        pushQuad(walls, V(p[0], y0, p[1]), V(q[0], y0, q[1]), V(q[0], top, q[1]), V(p[0], top, p[1]), shade)
      }

      // 縦の角と足元の線
      const base = poly.map(([x, z], i) => V(x, ground[i] + 0.04, z))
      lines.polyline(base, LineKind.Building, 1, 0.8, true)
      for (let i = 0; i < poly.length; i++) {
        const a = poly[(i + poly.length - 1) % poly.length]
        const p = poly[i]
        const c = poly[(i + 1) % poly.length]
        const d1 = Math.atan2(p[1] - a[1], p[0] - a[0])
        const d2 = Math.atan2(c[1] - p[1], c[0] - p[0])
        let turn = Math.abs(d2 - d1)
        if (turn > Math.PI) turn = Math.PI * 2 - turn
        if (turn > THREE.MathUtils.degToRad(25)) lines.segment(base[i], V(p[0], top - 0.05, p[1]), LineKind.Building, 0.9)
      }

      // 屋根
      const r = minAreaRect(poly)
      const fill = area / (4 * r.a * r.b || 1)
      if (fill > 0.72 && area >= 15 && r.b > 1.2) {
        const hip = b.roofShape === 'hipped' || (b.roofShape !== 'gabled' && hash01(idx * 31 + 11) < 0.45)
        const ux = r.ux
        const uz = r.uz
        const vx = -uz
        const vz = ux
        const A = r.a + EAVE
        const B = r.b + EAVE
        const yE = top - 0.12
        const yR = yE + B * Math.tan(ROOF_PITCH)
        const P = (su: number, sv: number, y: number) => V(r.cx + ux * su + vx * sv, y, r.cz + uz * su + vz * sv)
        const c1 = P(-A, -B, yE)
        const c2 = P(A, -B, yE)
        const c3 = P(A, B, yE)
        const c4 = P(-A, B, yE)
        const ridgeHalf = hip ? Math.max(0, A - B) : A
        const r0 = P(-ridgeHalf, 0, yR)
        const r1 = P(ridgeHalf, 0, yR)
        pushQuad(roofs, c1, c2, r1, r0, roofShade)
        pushQuad(roofs, c3, c4, r0, r1, roofShade)
        if (hip) {
          pushTri(roofs, c2, c3, r1, roofShade)
          pushTri(roofs, c4, c1, r0, roofShade)
          lines.segment(c2, r1, LineKind.Building, 1)
          lines.segment(c3, r1, LineKind.Building, 1)
          lines.segment(c4, r0, LineKind.Building, 1)
          lines.segment(c1, r0, LineKind.Building, 1)
        } else {
          // 妻壁（壁の色）
          const yW = yE + (B - EAVE) * Math.tan(ROOF_PITCH)
          for (const s of [-1, 1]) {
            const w1 = P(s * r.a, -r.b, yE)
            const w2 = P(s * r.a, r.b, yE)
            const w3 = P(s * r.a, 0, yW)
            pushTri(walls, w1, w2, w3, shade)
            pushTri(walls, w2, w1, w3, shade)
          }
          lines.segment(c1, r0, LineKind.Building, 1)
          lines.segment(c4, r0, LineKind.Building, 1)
          lines.segment(c2, r1, LineKind.Building, 1)
          lines.segment(c3, r1, LineKind.Building, 1)
        }
        lines.polyline([c1, c2, c3, c4], LineKind.Building, 1.1, 1, true)
        if (ridgeHalf > 0.01) lines.segment(r0, r1, LineKind.Building, 1.25)
      } else {
        // 平らな屋根（L字など）。屋根の面を縁より 0.3m 下げ、縁の内側に一段暗い立ち上がりを付けて厚みを見せる
        const contour = poly.map(([x, z]) => new THREE.Vector2(x, z))
        const faces = THREE.ShapeUtils.triangulateShape(contour, [])
        const yIn = top - PARAPET
        for (const [i, j, k] of faces) {
          pushTri(flats, V(poly[i][0], yIn, poly[i][1]), V(poly[j][0], yIn, poly[j][1]), V(poly[k][0], yIn, poly[k][1]), roofShade)
        }
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i]
          const q = poly[(i + 1) % poly.length]
          // 内向きの面（壁と逆回り）。壁の色の 0.85 倍
          pushQuad(walls, V(q[0], yIn, q[1]), V(p[0], yIn, p[1]), V(p[0], top, p[1]), V(q[0], top, q[1]), shade * 0.85)
        }
        lines.polyline(
          poly.map(([x, z]) => V(x, top + 0.03, z)),
          LineKind.Building,
          1,
          1,
          true,
        )
      }
    })

    // 駅のホーム（低い台。壁の色の縁と、平らな上面）
    platforms.forEach((pl, k) => {
      let poly = pl.slice()
      if (poly.length < 3) return
      if (polygonArea(poly) > 0) poly = poly.reverse()
      let gMax = -Infinity
      let gMin = Infinity
      for (const [x, z] of poly) {
        const y = hf.heightAt(x, z)
        gMax = Math.max(gMax, y)
        gMin = Math.min(gMin, y)
      }
      const top = gMax + PLATFORM_H
      walls.base = gMin
      const shade = 0.82 + hash01(k * 5 + 2) * 0.04
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i]
        const q = poly[(i + 1) % poly.length]
        pushQuad(walls, V(p[0], gMin - 0.4, p[1]), V(q[0], gMin - 0.4, q[1]), V(q[0], top, q[1]), V(p[0], top, p[1]), shade)
      }
      const contour = poly.map(([x, z]) => new THREE.Vector2(x, z))
      for (const [i, j, kk] of THREE.ShapeUtils.triangulateShape(contour, [])) {
        pushTri(flats, V(poly[i][0], top, poly[i][1]), V(poly[j][0], top, poly[j][1]), V(poly[kk][0], top, poly[kk][1]), 1.02)
      }
      lines.polyline(
        poly.map(([x, z]) => V(x, top + 0.03, z)),
        LineKind.Building,
        0.9,
        0.9,
        true,
      )
    })

    this.wallMat = applyBend(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { ao: true })
    this.roofMat = applyBend(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }))
    this.flatMat = applyBend(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }))
    for (const [acc, mat, name] of [
      [walls, this.wallMat, 'walls'],
      [roofs, this.roofMat, 'roofs'],
      [flats, this.flatMat, 'flat-roofs'],
    ] as const) {
      if (!acc.pos.length) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3))
      if (acc === walls) g.setAttribute('aAO', new THREE.Float32BufferAttribute(acc.ao, 1))
      g.computeVertexNormals()
      const m = new THREE.Mesh(g, mat)
      m.name = name
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      this.group.add(m)
    }

    this.windowCount = win.pos.length / 12
    if (win.pos.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(win.pos, 3))
      g.setAttribute('aUv', new THREE.Float32BufferAttribute(win.uv, 2))
      g.setAttribute('aLevel', new THREE.Float32BufferAttribute(win.level, 1))
      const idx: number[] = []
      for (let q = 0; q < win.pos.length / 12; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3)
      g.setIndex(idx)
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...windowUniforms, ...bendUniforms, uFogMax: fogShapeUniforms.uFogMax },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        vertexShader: /* glsl */ `
          attribute vec2 aUv;
          attribute float aLevel;
          uniform float uWinIntensity;
          uniform float uFogNear;
          uniform float uFogFar;
          uniform float uFogMax;
          varying vec2 vUv;
          varying float vA;
          ${BEND_GLSL}
          void main() {
            vUv = aUv;
            vec3 w = position;
            w.y -= bendDrop(w.xz);
            vec4 mv = viewMatrix * vec4(w, 1.0);
            float fs = smoothstep(uFogNear, uFogFar, -mv.z);
            float fog = uFogMax * fs * (2.0 - fs);
            // 霧の中では、窓の灯りも霞む（遠くの窓はかすかに残す）
            vA = uWinIntensity * aLevel * (1.0 - fog * 0.75);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uWinColor;
          varying vec2 vUv;
          varying float vA;
          void main() {
            // 障子の明かり: 窓の形（縁をやわらかく、中ほどに細い桟を1本）と、まわりの淡いにじみ
            vec2 d = abs(vUv * 2.0 - 1.0) * ${WIN_PAD.toFixed(2)};
            float pane = (1.0 - smoothstep(0.8, 1.0, d.x)) * (1.0 - smoothstep(0.78, 1.0, d.y));
            pane *= 1.0 - 0.4 * (1.0 - smoothstep(0.03, 0.08, d.x));
            float r = length(max(d - vec2(0.7), 0.0));
            float halo = exp(-r * r * 9.0) * 0.28;
            vec3 col = uWinColor * mix(0.75, 1.0, pane);
            gl_FragColor = vec4(col, (pane * 0.85 + halo) * vA);
            #include <colorspace_fragment>
          }
        `,
      })
      const m = new THREE.Mesh(g, mat)
      m.name = 'windows'
      m.frustumCulled = false
      m.renderOrder = 7
      m.visible = false
      this.windows = m
      this.group.add(m)
    }
  }

  setPalette(p: Palette & Partial<SceneExtras>): void {
    this.wallMat.color.set(p.wall)
    this.roofMat.color.set(p.roof)
    this.flatMat.color.set(p.flatRoof)
    const w = p.windows
    windowUniforms.uWinIntensity.value = w?.intensity ?? 0
    if (w) windowUniforms.uWinColor.value.set(w.color)
    if (this.windows) this.windows.visible = (w?.intensity ?? 0) > 0
  }
}

interface WinAcc {
  pos: number[]
  uv: number[]
  level: number[]
}

/**
 * 壁の外に、灯る窓の板を置く。長さ 2.6m 以上の壁に、階ごと・間隔 3m 前後で窓の候補を並べ、
 * 番号から決めた一部だけを灯す（1棟に WIN_MAX まで）
 */
function addWindows(acc: WinAcc, poly: XZ[], ground: number, wallTop: number, floors: number, idx: number, allLit = false): void {
  let lit = 0
  const n = poly.length
  for (let i = 0; i < n && lit < WIN_MAX; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % n]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (len < 2.6) continue
    const ux = (q[0] - p[0]) / len
    const uz = (q[1] - p[1]) / len
    // 外向きの法線（中点から少し出た点が多角形の外になる向き）
    let nx = uz
    let nz = -ux
    const mx = (p[0] + q[0]) / 2
    const mz = (p[1] + q[1]) / 2
    if (pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, poly)) {
      nx = -nx
      nz = -nz
    }
    const slots = Math.max(1, Math.min(3, Math.floor(len / 3)))
    for (let f = 0; f < floors && lit < WIN_MAX; f++) {
      const yc = ground + WIN_Y0 + f * FLOOR_H
      if (yc + WIN_H / 2 > wallTop - 0.35) break
      for (let k = 0; k < slots && lit < WIN_MAX; k++) {
        const h = hash01(idx * 97 + i * 13 + f * 7 + k * 3 + 1)
        if (!allLit && h > WIN_LIT_P) continue
        const t = (k + 0.5) / slots
        const cx = p[0] + ux * len * t + nx * WIN_OUT
        const cz = p[1] + uz * len * t + nz * WIN_OUT
        const hw = (WIN_W / 2) * WIN_PAD
        const hh = (WIN_H / 2) * WIN_PAD
        acc.pos.push(
          cx - ux * hw, yc - hh, cz - uz * hw,
          cx + ux * hw, yc - hh, cz + uz * hw,
          cx + ux * hw, yc + hh, cz + uz * hw,
          cx - ux * hw, yc + hh, cz - uz * hw,
        )
        acc.uv.push(0, 0, 1, 0, 1, 1, 0, 1)
        // 窓ごとの明るさ（0.55〜1）
        const lv = allLit ? 1 : 0.55 + 0.45 * hash01(idx * 31 + i * 5 + f * 11 + k + 7)
        acc.level.push(lv, lv, lv, lv)
        lit++
      }
    }
  }
}

function pushTri(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade: number): void {
  acc.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  for (let i = 0; i < 3; i++) acc.col.push(shade, shade, shade)
  // 根元（地面の高さ）で 0.58、2.8m 上で 1 になる
  for (const v of [a, b, c]) acc.ao.push(0.58 + 0.42 * THREE.MathUtils.smoothstep(v.y, acc.base - 0.4, acc.base + 2.8))
}

function pushQuad(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, shade: number): void {
  pushTri(acc, a, b, c, shade)
  pushTri(acc, a, c, d, shade)
}
