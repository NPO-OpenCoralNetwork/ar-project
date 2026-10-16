// 建物: OSM の外形を押し出した塊と、長方形に近いものには切妻/寄棟の屋根。
// 階数のタグは岩峅寺のデータに1棟もないので、面積と番号から1〜2階に振り分ける（見た目を毎回同じにするため乱数は使わない）。
// 壁と屋根を、それぞれ1つのジオメトリにまとめる（描画命令2回）。

import * as THREE from 'three'
import { applyBend } from '../bend'
import { hash01, minAreaRect, polygonArea, type XZ } from '../geom2d'
import type { Palette } from '../palette'
import type { HeightField } from './heightfield'
import { type InkLineBuilder, LineKind } from './ink-lines'

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
  private readonly wallMat: THREE.MeshLambertMaterial
  private readonly roofMat: THREE.MeshLambertMaterial
  private readonly flatMat: THREE.MeshLambertMaterial

  constructor(polys: { polygon: XZ[]; levels?: number }[], hf: HeightField, lines: InkLineBuilder) {
    const walls: Acc = { pos: [], col: [], ao: [], base: 0 }
    const roofs: Acc = { pos: [], col: [], ao: [], base: -1e9 }
    const flats: Acc = { pos: [], col: [], ao: [], base: -1e9 }
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

    polys.forEach((b, idx) => {
      let poly = b.polygon.slice()
      if (poly.length < 3) return
      if (polygonArea(poly) > 0) poly = poly.reverse()
      const area = Math.abs(polygonArea(poly))
      const h1 = hash01(idx * 7 + 3)
      const floors = b.levels ?? (area < 25 ? 1 : area > 50 && h1 < 0.55 ? 2 : 1)
      const wallH = area < 25 ? 2.6 : floors === 2 ? 5.9 : 3.2
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
        const hip = hash01(idx * 31 + 11) < 0.45
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
  }

  setPalette(p: Palette): void {
    this.wallMat.color.set(p.wall)
    this.roofMat.color.set(p.roof)
    this.flatMat.color.set(p.flatRoof)
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
