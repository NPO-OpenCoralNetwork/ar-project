// 多角形を三角形に分け、地面に沿うよう細かくする（池の水面、お休みの範囲の霧の面など）。

import * as THREE from 'three'
import type { XZ } from '../geom2d'

/** 穴あき多角形を三角形に分け、どの辺も maxLen 以下になるまで割る。返すのは [a, b, c] の列 */
export function triangulateDraped(outer: readonly XZ[], holes: readonly XZ[][], maxLen: number): XZ[][] {
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z))
  const holeVecs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)))
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse()
  for (const h of holeVecs) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse()
  const all = contour.concat(...holeVecs)
  const faces = THREE.ShapeUtils.triangulateShape(contour, holeVecs)
  const out: XZ[][] = []
  const split = (a: XZ, b: XZ, c: XZ, depth: number) => {
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1])
    const bc = Math.hypot(b[0] - c[0], b[1] - c[1])
    const ca = Math.hypot(c[0] - a[0], c[1] - a[1])
    const m = Math.max(ab, bc, ca)
    if (m <= maxLen || depth > 14) {
      out.push([a, b, c])
      return
    }
    const mid = (p: XZ, q: XZ): XZ => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    if (m === ab) {
      const d = mid(a, b)
      split(a, d, c, depth + 1)
      split(d, b, c, depth + 1)
    } else if (m === bc) {
      const d = mid(b, c)
      split(a, b, d, depth + 1)
      split(a, d, c, depth + 1)
    } else {
      const d = mid(c, a)
      split(a, b, d, depth + 1)
      split(d, b, c, depth + 1)
    }
  }
  for (const [i, j, k] of faces) {
    const a: XZ = [all[i].x, all[i].y]
    const b: XZ = [all[j].x, all[j].y]
    const c: XZ = [all[k].x, all[k].y]
    split(a, b, c, 0)
  }
  return out
}

/**
 * 三角形の列を、上向きの面のジオメトリにする（頂点は共有しない）。
 * heightOf で高さを決める。
 */
export function drapedGeometry(tris: XZ[][], heightOf: (x: number, z: number) => number): THREE.BufferGeometry {
  const pos = new Float32Array(tris.length * 9)
  let o = 0
  for (const t of tris) {
    // 上から見て反時計回り（法線が上）になるよう並べる
    const [a, b, c] = t
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const order = cross < 0 ? [a, b, c] : [a, c, b]
    for (const [x, z] of order) {
      pos[o++] = x
      pos[o++] = heightOf(x, z)
      pos[o++] = z
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** 多角形が凸か（向きはどちらでもよい） */
export function isConvex(poly: readonly XZ[]): boolean {
  let sign = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const c = poly[(i + 2) % n]
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cr) < 1e-9) continue
    const s = Math.sign(cr)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/**
 * 三角形から凸多角形 convex の内側を取り除き、残りを三角形の列で返す。
 * T \ P = ∪_i (T ∩ H_1 ∩ … ∩ H_{i-1} ∩ ¬H_i)（H_i は P の i 番目の辺の内側の半平面）
 */
export function subtractConvex(tri: readonly XZ[], convex: readonly XZ[]): XZ[][] {
  let area = 0
  for (let i = 0, j = convex.length - 1; i < convex.length; j = i++) area += convex[j][0] * convex[i][1] - convex[i][0] * convex[j][1]
  const sgn = area >= 0 ? 1 : -1
  const out: XZ[][] = []
  let rest: XZ[] = tri.slice()
  for (let i = 0; i < convex.length && rest.length >= 3; i++) {
    const a = convex[i]
    const b = convex[(i + 1) % convex.length]
    const side = (p: XZ) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
    const outside = clipHalf(rest, (p) => -side(p))
    if (outside.length >= 3) for (let k = 1; k + 1 < outside.length; k++) out.push([outside[0], outside[k], outside[k + 1]])
    rest = clipHalf(rest, side)
  }
  return out
}

/** f(p) ≥ 0 の側に切り抜く */
function clipHalf(poly: readonly XZ[], f: (p: XZ) => number): XZ[] {
  const out: XZ[] = []
  for (let k = 0; k < poly.length; k++) {
    const cur = poly[k]
    const prev = poly[(k + poly.length - 1) % poly.length]
    const fc = f(cur)
    const fp = f(prev)
    if (fc >= 0) {
      if (fp < 0) out.push(lerp(prev, cur, fp / (fp - fc)))
      out.push(cur)
    } else if (fp >= 0) out.push(lerp(prev, cur, fp / (fp - fc)))
  }
  return out
}

function lerp(a: XZ, b: XZ, t: number): XZ {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}
