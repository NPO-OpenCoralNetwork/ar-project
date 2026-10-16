// 地面に沿う帯（道・用水・川・線路の砂利）。すべて1つのジオメトリにまとめて1回で描く。
//
// 帯の三角形は、地面の三角形（heightfield の格子と同じ分け方）で切り分けてから高さを付ける。
// 地面は三角形ごとに平らなので、切り分けた帯は「地面 + 持ち上げ」にぴったり沿い、帯の中で地面が上に出ない。
// 橋だけは、両端の高さを結んだ橋板にする（地面より下には下げない）。

import * as THREE from 'three'
import { applyBend } from '../bend'
import { bboxOf, type Box2, densify, inBox, nearestOnPolyline, type XZ } from '../geom2d'
import type { Palette } from '../palette'
import type { HeightField } from './heightfield'

export type RibbonTone = 'road' | 'path' | 'water' | 'ballast'

export interface RibbonInput {
  points: readonly XZ[]
  width: number
  tone: RibbonTone
  /** 地面からの持ち上げ（m）。重なる帯のちらつきを避けるため種類ごとに少し変える */
  lift: number
  bridge?: boolean
  /** 人が上を歩く帯か（surfaceAt の対象。線路は false） */
  walkable?: boolean
}

export interface RibbonEdges {
  left: THREE.Vector3[]
  right: THREE.Vector3[]
}

const TONE_INDEX: Record<RibbonTone, number> = { road: 0, path: 1, water: 2, ballast: 3 }

/** 橋板の高さ（両端の地面を結んだ線 + 0.6m）。walk の高さと帯の見た目で同じ式を使う */
const BRIDGE_DECK_LIFT = 0.6
/** 帯の中心線に点を足す間隔（m）。箱庭を 700m に広げたとき、三角形を抑えるため 2 → 4 にした */
const RIBBON_STEP = 4

interface SurfaceItem {
  pts: XZ[]
  /** pts の始点からの道のり */
  cum: number[]
  hw: number
  lift: number
  box: Box2
  bridge: { a0: number; a1: number; total: number } | null
}

export class RibbonSet {
  readonly mesh: THREE.Mesh
  /** inputs と同じ並び（点が足りない入力は空の縁） */
  readonly edges: RibbonEdges[] = []
  private readonly tones: Uint8Array
  private readonly colors: Float32Array
  private readonly surfaces: SurfaceItem[] = []

  constructor(
    inputs: RibbonInput[],
    private readonly hf: HeightField,
    renderOrder = 1,
  ) {
    const pos: number[] = []
    const nrm: number[] = []
    const tones: number[] = []
    for (const inp of inputs) {
      // 帯は地面の三角形で切り分けるので、高さを合わせるための細分は要らない。曲がりと縁の線のために 4m ごとに点を足す
      const pts = densify(extendEnds(inp.points, inp.width * 0.3), RIBBON_STEP)
      if (pts.length < 2) {
        this.edges.push({ left: [], right: [] })
        continue
      }
      const hw = inp.width / 2
      const n = pts.length
      const tone = TONE_INDEX[inp.tone]
      const cum: number[] = [0]
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      const total = cum[n - 1]
      const bridge = inp.bridge
        ? { a0: hf.heightAt(pts[0][0], pts[0][1]), a1: hf.heightAt(pts[n - 1][0], pts[n - 1][1]), total }
        : null
      if (inp.walkable !== false) this.surfaces.push({ pts, cum, hw, lift: inp.lift, box: bboxOf(pts, hw + 0.5), bridge })

      const L: XZ[] = []
      const R: XZ[] = []
      const left: THREE.Vector3[] = []
      const right: THREE.Vector3[] = []
      for (let i = 0; i < n; i++) {
        const prev = pts[Math.max(0, i - 1)]
        const next = pts[Math.min(n - 1, i + 1)]
        let tx = next[0] - prev[0]
        let tz = next[1] - prev[1]
        const tl = Math.hypot(tx, tz) || 1
        tx /= tl
        tz /= tl
        const [x, z] = pts[i]
        L.push([x - tz * hw, z + tx * hw])
        R.push([x + tz * hw, z - tx * hw])
      }
      const yAt = (x: number, z: number, along: number) => {
        const g = hf.heightAt(x, z) + inp.lift
        if (!bridge) return g
        const deck = bridge.a0 + (bridge.a1 - bridge.a0) * (total > 0 ? along / total : 0) + BRIDGE_DECK_LIFT
        return Math.max(deck, g)
      }
      for (let i = 0; i < n; i++) {
        left.push(new THREE.Vector3(L[i][0], yAt(L[i][0], L[i][1], cum[i]) + 0.02, L[i][1]))
        right.push(new THREE.Vector3(R[i][0], yAt(R[i][0], R[i][1], cum[i]) + 0.02, R[i][1]))
      }
      this.edges.push({ left, right })

      for (let i = 1; i < n; i++) {
        const quad: [XZ, XZ, XZ][] = [
          [L[i - 1], L[i], R[i - 1]],
          [R[i - 1], L[i], R[i]],
        ]
        for (const tri of quad) {
          if (bridge) {
            // 橋は切り分けない（橋板は平らな板）。道のりは三角形の頂点ごとに近い方の点で近似
            const al = [cum[i - 1], cum[i], tri === quad[0] ? cum[i - 1] : cum[i]]
            this.pushTri(pos, nrm, tones, tone, tri.map((p, k) => [p[0], yAt(p[0], p[1], al[k]), p[1]] as const))
          } else {
            for (const poly of this.clipToTerrain(tri)) {
              for (let k = 1; k + 1 < poly.length; k++) {
                const a = poly[0]
                const b = poly[k]
                const c = poly[k + 1]
                this.pushTri(pos, nrm, tones, tone, [
                  [a[0], hf.heightAt(a[0], a[1]) + inp.lift, a[1]],
                  [b[0], hf.heightAt(b[0], b[1]) + inp.lift, b[1]],
                  [c[0], hf.heightAt(c[0], c[1]) + inp.lift, c[1]],
                ])
              }
            }
          }
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    this.tones = new Uint8Array(tones)
    this.colors = new Float32Array(tones.length * 3)
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    g.computeBoundingSphere()
    const mat = applyBend(
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.renderOrder = renderOrder
  }

  /** 三角形の数（確認用） */
  get triangleCount(): number {
    return this.tones.length / 3
  }

  /**
   * (x, z) が歩ける帯の上なら、その帯の面の高さ（いちばん高いもの）。帯の外なら null。
   * pad だけ帯を太らせて判定する（足元の影など、大きさのある物のため）。
   */
  surfaceAt(x: number, z: number, pad = 0): number | null {
    let best: number | null = null
    for (const s of this.surfaces) {
      if (!inBox(s.box, x, z, pad)) continue
      const near = nearestAlong(x, z, s.pts, s.cum)
      if (near.dist > s.hw + pad) continue
      let y = this.hf.heightAt(x, z) + s.lift
      if (s.bridge) {
        const b = s.bridge
        y = Math.max(y, b.a0 + (b.a1 - b.a0) * (b.total > 0 ? near.along / b.total : 0) + BRIDGE_DECK_LIFT)
      }
      if (best === null || y > best) best = y
    }
    return best
  }

  private pushTri(
    pos: number[],
    nrm: number[],
    tones: number[],
    tone: number,
    tri: readonly (readonly [number, number, number])[],
  ): void {
    const [a, b, c] = tri
    // 上から見て反時計回り（法線が上）にそろえる
    const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    if (Math.abs(cy) < 1e-7) return
    const order = cy > 0 ? [a, b, c] : [a, c, b]
    for (const v of order) {
      pos.push(v[0], v[1], v[2])
      // 法線は地面のなめらかな傾きから（地面のメッシュの陰影と合わせる）
      const e = 1.5
      const dx = this.hf.heightAt(v[0] + e, v[2]) - this.hf.heightAt(v[0] - e, v[2])
      const dz = this.hf.heightAt(v[0], v[2] + e) - this.hf.heightAt(v[0], v[2] - e)
      const l = Math.hypot(dx, 2 * e, dz)
      nrm.push(-dx / l, (2 * e) / l, -dz / l)
      tones.push(tone)
    }
  }

  /** 平面の三角形を、地面の三角形ごとの凸多角形に切り分ける */
  private clipToTerrain(tri: readonly XZ[]): XZ[][] {
    const hf = this.hf
    const out: XZ[][] = []
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const [x, z] of tri) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    const c0 = Math.max(0, Math.floor((minX - hf.x0) / hf.step))
    const c1 = Math.min(hf.cols - 2, Math.floor((maxX - hf.x0) / hf.step))
    const r0 = Math.max(0, Math.floor((minZ - hf.z0) / hf.step))
    const r1 = Math.min(hf.rows - 2, Math.floor((maxZ - hf.z0) / hf.step))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x0 = hf.x0 + c * hf.step
        const z0 = hf.z0 + r * hf.step
        const x1 = x0 + hf.step
        const z1 = z0 + hf.step
        // heightAt と同じ分け方: (x0,z0)-(x0,z1)-(x1,z1) と (x0,z0)-(x1,z1)-(x1,z0)
        for (const t of [
          [[x0, z0], [x0, z1], [x1, z1]],
          [[x0, z0], [x1, z1], [x1, z0]],
        ] as XZ[][]) {
          const poly = clipConvex(tri, t)
          if (poly.length >= 3) out.push(poly)
        }
      }
    }
    return out
  }

  setPalette(p: Palette): void {
    const cols = [new THREE.Color(p.road), new THREE.Color(p.path), new THREE.Color(p.water), new THREE.Color(p.ballast)]
    for (let i = 0; i < this.tones.length; i++) {
      const c = cols[this.tones[i]]
      this.colors[i * 3] = c.r
      this.colors[i * 3 + 1] = c.g
      this.colors[i * 3 + 2] = c.b
    }
    ;(this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
}

/** 多角形 subject を、凸多角形 clip の内側に切り抜く（Sutherland–Hodgman） */
function clipConvex(subject: readonly XZ[], clip: readonly XZ[]): XZ[] {
  // clip の向き（反時計回りなら +1）
  let area = 0
  for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) area += clip[j][0] * clip[i][1] - clip[i][0] * clip[j][1]
  const sgn = area >= 0 ? 1 : -1
  let out: XZ[] = subject.slice()
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const side = (p: XZ) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
    const input = out
    out = []
    for (let k = 0; k < input.length; k++) {
      const cur = input[k]
      const prev = input[(k + input.length - 1) % input.length]
      const sc = side(cur)
      const sp = side(prev)
      if (sc >= 0) {
        if (sp < 0) out.push(lerpXZ(prev, cur, sp / (sp - sc)))
        out.push(cur)
      } else if (sp >= 0) {
        out.push(lerpXZ(prev, cur, sp / (sp - sc)))
      }
    }
  }
  return out
}

function lerpXZ(a: XZ, b: XZ, t: number): XZ {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** 折れ線の上で一番近い点までの距離と、そこまでの道のり */
function nearestAlong(px: number, pz: number, pts: readonly XZ[], cum: readonly number[]): { dist: number; along: number } {
  let best = Infinity
  let along = 0
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0]
    const az = pts[i - 1][1]
    const dx = pts[i][0] - ax
    const dz = pts[i][1] - az
    const l2 = dx * dx + dz * dz
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
    if (d < best) {
      best = d
      along = cum[i - 1] + (cum[i] - cum[i - 1]) * t
    }
  }
  return { dist: best, along }
}

function extendEnds(pts: readonly XZ[], d: number): XZ[] {
  if (pts.length < 2 || d <= 0) return pts.slice()
  const out = pts.slice()
  const ext = (a: XZ, b: XZ): XZ => {
    const dx = a[0] - b[0]
    const dz = a[1] - b[1]
    const l = Math.hypot(dx, dz) || 1
    return [a[0] + (dx / l) * d, a[1] + (dz / l) * d]
  }
  out[0] = ext(pts[0], pts[1])
  out[out.length - 1] = ext(pts[pts.length - 1], pts[pts.length - 2])
  return out
}

/**
 * 帯の縁の線を、ほかの帯の上に乗っている部分で切る（交差点に縁の線が通らないように）。
 * 返すのは連続した区間ごとの点列。
 */
export function clipEdgeRuns(
  edge: THREE.Vector3[],
  others: { points: readonly XZ[]; width: number }[],
  self: number,
): THREE.Vector3[][] {
  const runs: THREE.Vector3[][] = []
  let cur: THREE.Vector3[] = []
  for (const p of edge) {
    let covered = false
    for (let k = 0; k < others.length && !covered; k++) {
      if (k === self) continue
      const o = others[k]
      if (nearestOnPolyline(p.x, p.z, o.points).dist < o.width / 2 - 0.15) covered = true
    }
    if (covered) {
      if (cur.length > 1) runs.push(cur)
      cur = []
    } else cur.push(p)
  }
  if (cur.length > 1) runs.push(cur)
  return runs
}
