// 地面のメッシュ（標高の格子から）と、箱庭の外の霞んだ土地、等高線（白描のときの墨の線）。

import * as THREE from 'three'
import { applyBend } from '../bend'
import type { Palette } from '../palette'
import type { HeightField } from './heightfield'
import { type InkLineBuilder, LineKind } from './ink-lines'

export function createTerrainMesh(hf: HeightField, half: number, map: THREE.Texture): THREE.Mesh {
  const { cols, rows } = hf
  const pos = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const x = hf.x0 + c * hf.step
      const z = hf.z0 + r * hf.step
      pos[i * 3] = x
      pos[i * 3 + 1] = hf.h[i]
      pos[i * 3 + 2] = z
      uv[i * 2] = (x + half) / (half * 2)
      uv[i * 2 + 1] = 1 - (z + half) / (half * 2)
    }
  }
  const index: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v00 = r * cols + c
      const v10 = v00 + 1
      const v01 = v00 + cols
      const v11 = v01 + 1
      // heightfield.ts の heightAt と同じ分け方（対角線 v00–v11）
      index.push(v00, v01, v11, v00, v11, v10)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  const mat = applyBend(new THREE.MeshLambertMaterial({ map }))
  const mesh = new THREE.Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.receiveShadow = true
  mesh.name = 'terrain'
  return mesh
}

/** 箱庭の外。歩けない、霞んだ土地。下の地面とつなげ、外へ行くほど霞の色へ */
export class OuterLand {
  readonly mesh: THREE.Mesh
  private readonly fade: Float32Array
  private readonly colors: Float32Array

  constructor(hf: HeightField, half: number) {
    const step = 10
    const R = half + 240
    const n = Math.round((R * 2) / step) + 1
    // 外へ向かうほど、箱庭の縁の高さの平均へなだらかに寄せる
    let rimSum = 0
    let rimN = 0
    for (let t = -half; t <= half; t += 5) {
      for (const [x, z] of [
        [t, -half],
        [t, half],
        [-half, t],
        [half, t],
      ]) {
        rimSum += hf.heightAt(x, z)
        rimN++
      }
    }
    const rimMean = rimSum / rimN
    const pos = new Float32Array(n * n * 3)
    const inner = new Uint8Array(n * n)
    this.fade = new Float32Array(n * n)
    this.colors = new Float32Array(n * n * 3)
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c
        const x = -R + c * step
        const z = -R + r * step
        const inside = Math.abs(x) < half - 0.01 && Math.abs(z) < half - 0.01
        const cx = Math.max(-half, Math.min(half, x))
        const cz = Math.max(-half, Math.min(half, z))
        const out = Math.hypot(x - cx, z - cz)
        let y = hf.heightAt(cx, cz)
        if (inside) y -= 4
        else y = y * Math.max(0, 1 - out / 160) + rimMean * Math.min(1, out / 160) - 0.04
        inner[i] = inside ? 1 : 0
        pos[i * 3] = x
        pos[i * 3 + 1] = y
        pos[i * 3 + 2] = z
        this.fade[i] = Math.min(1, 0.25 + out / 150)
      }
    }
    const index: number[] = []
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v00 = r * n + c
        // 4隅とも箱庭の内側（地面の下に隠れる）の四角は作らない
        if (inner[v00] && inner[v00 + 1] && inner[v00 + n] && inner[v00 + n + 1]) continue
        index.push(v00, v00 + n, v00 + n + 1, v00, v00 + n + 1, v00 + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    g.setIndex(index)
    g.computeVertexNormals()
    const mat = applyBend(new THREE.MeshLambertMaterial({ vertexColors: true }))
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.name = 'outer-land'
  }

  setPalette(p: Palette): void {
    const a = new THREE.Color(p.outer)
    const b = new THREE.Color(p.fog)
    const c = new THREE.Color()
    for (let i = 0; i < this.fade.length; i++) {
      c.copy(a).lerp(b, this.fade[i])
      this.colors[i * 3] = c.r
      this.colors[i * 3 + 1] = c.g
      this.colors[i * 3 + 2] = c.b
    }
    ;(this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
}

/** 地面の三角形ごとに等高線を引く（2m ごと、10m ごとに少し太く） */
export function addContours(hf: HeightField, lines: InkLineBuilder, interval = 2): void {
  const { cols, rows } = hf
  const P = (c: number, r: number) => new THREE.Vector3(hf.x0 + c * hf.step, hf.get(c, r), hf.z0 + r * hf.step)
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const lo = Math.min(a.y, b.y, c.y)
    const hi = Math.max(a.y, b.y, c.y)
    for (let lv = Math.ceil(lo / interval) * interval; lv <= hi; lv += interval) {
      const pts: THREE.Vector3[] = []
      const edge = (p: THREE.Vector3, q: THREE.Vector3) => {
        if ((p.y < lv && q.y >= lv) || (q.y < lv && p.y >= lv)) {
          const t = (lv - p.y) / (q.y - p.y)
          pts.push(new THREE.Vector3(p.x + (q.x - p.x) * t, lv + 0.06, p.z + (q.z - p.z) * t))
        }
      }
      edge(a, b)
      edge(b, c)
      edge(c, a)
      if (pts.length === 2) {
        const major = Math.abs(lv % (interval * 5)) < 1e-6
        lines.segment(pts[0], pts[1], LineKind.Contour, major ? 1.1 : 0.75, major ? 1 : 0.75)
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v00 = P(c, r)
      const v10 = P(c + 1, r)
      const v01 = P(c, r + 1)
      const v11 = P(c + 1, r + 1)
      tri(v00, v01, v11)
      tri(v00, v11, v10)
    }
  }
}
