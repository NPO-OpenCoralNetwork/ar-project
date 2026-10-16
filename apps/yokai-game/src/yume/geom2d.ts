// 平面（x = 東, z = 南）の簡単な幾何。箱庭のローカル座標（m）で使う。

export type XZ = readonly [number, number]

export function polygonArea(poly: readonly XZ[]): number {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
  }
  return s / 2
}

/** 閉じた多角形の終点が始点と同じなら外す */
export function openRing(poly: readonly XZ[]): XZ[] {
  const out = poly.slice()
  if (out.length > 1) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) out.pop()
  }
  return out
}

export function pointInPolygon(x: number, z: number, poly: readonly XZ[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const zi = poly[i][1]
    const xj = poly[j][0]
    const zj = poly[j][1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export interface Nearest {
  x: number
  z: number
  dist: number
}

/** 線分 ab 上で p に一番近い点 */
export function nearestOnSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): Nearest {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const x = ax + dx * t
  const z = az + dz * t
  return { x, z, dist: Math.hypot(px - x, pz - z) }
}

/** 多角形の辺の上で一番近い点 */
export function nearestOnRing(px: number, pz: number, poly: readonly XZ[]): Nearest {
  let best: Nearest = { x: px, z: pz, dist: Infinity }
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const n = nearestOnSegment(px, pz, poly[j][0], poly[j][1], poly[i][0], poly[i][1])
    if (n.dist < best.dist) best = n
  }
  return best
}

/** 折れ線の上で一番近い点 */
export function nearestOnPolyline(px: number, pz: number, line: readonly XZ[]): Nearest {
  let best: Nearest = { x: px, z: pz, dist: Infinity }
  for (let i = 1; i < line.length; i++) {
    const n = nearestOnSegment(px, pz, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1])
    if (n.dist < best.dist) best = n
  }
  return best
}

export interface Box2 {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export function bboxOf(pts: readonly XZ[], pad = 0): Box2 {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const [x, z] of pts) {
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  return { minX: minX - pad, minZ: minZ - pad, maxX: maxX + pad, maxZ: maxZ + pad }
}

export function inBox(b: Box2, x: number, z: number, pad = 0): boolean {
  return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad
}

/** 凸包（Andrew の単調連鎖） */
export function convexHull(pts: readonly XZ[]): XZ[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: XZ, a: XZ, b: XZ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: XZ[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: XZ[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

/** 最小面積の外接長方形。u が長い辺の向き、a ≥ b が半分の長さ */
export interface OrientedRect {
  cx: number
  cz: number
  ux: number
  uz: number
  a: number
  b: number
}

export function minAreaRect(pts: readonly XZ[]): OrientedRect {
  const hull = convexHull(pts)
  let best: OrientedRect | null = null
  let bestArea = Infinity
  for (let i = 0; i < hull.length; i++) {
    const p0 = hull[i]
    const p1 = hull[(i + 1) % hull.length]
    let ux = p1[0] - p0[0]
    let uz = p1[1] - p0[1]
    const l = Math.hypot(ux, uz)
    if (l < 1e-6) continue
    ux /= l
    uz /= l
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const [x, z] of hull) {
      const u = x * ux + z * uz
      const v = -x * uz + z * ux
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    const area = (maxU - minU) * (maxV - minV)
    if (area < bestArea) {
      bestArea = area
      const cu = (minU + maxU) / 2
      const cv = (minV + maxV) / 2
      const cx = cu * ux - cv * uz
      const cz = cu * uz + cv * ux
      const hu = (maxU - minU) / 2
      const hv = (maxV - minV) / 2
      best = hu >= hv ? { cx, cz, ux, uz, a: hu, b: hv } : { cx, cz, ux: -uz, uz: ux, a: hv, b: hu }
    }
  }
  return best ?? { cx: 0, cz: 0, ux: 1, uz: 0, a: 0, b: 0 }
}

/** 決まった種から作る疑似乱数（見た目を毎回同じにするため） */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** 整数から 0..1 の値（家ごとのばらつきなど） */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** 折れ線を、だいたい step m ごとの点に細かくする */
export function densify(line: readonly XZ[], step: number): XZ[] {
  const out: XZ[] = []
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]
    const [bx, bz] = line[i]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step))
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n])
  }
  if (line.length) out.push(line[line.length - 1])
  return out
}

export function polylineLength(line: readonly XZ[]): number {
  let s = 0
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
  return s
}
