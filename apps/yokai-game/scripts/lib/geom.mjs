// 平面（ローカル座標 x, z）の小さな幾何ユーティリティ。点は [x, z] の配列。

/** 多角形の符号付き面積（x-z 平面） */
export function signedArea(poly) {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  }
  return a / 2
}

export function area(poly) {
  return Math.abs(signedArea(poly))
}

export function centroid(poly) {
  let x = 0
  let z = 0
  for (const p of poly) {
    x += p[0]
    z += p[1]
  }
  return [x / poly.length, z / poly.length]
}

/** 点が多角形の内側か（偶奇判定） */
export function pointInPolygon(p, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** 点と線分の距離 */
export function distPointSegment(p, a, b) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}

/** 点と多角形の距離（内側なら 0） */
export function distPointPolygon(p, poly) {
  if (pointInPolygon(p, poly)) return 0
  let d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distPointSegment(p, poly[j], poly[i]))
  return d
}

/** 点と折れ線の距離 */
export function distPointPolyline(p, line) {
  let d = Infinity
  for (let i = 1; i < line.length; i++) d = Math.min(d, distPointSegment(p, line[i - 1], line[i]))
  return d
}

/** 折れ線の長さ */
export function polylineLength(line) {
  let l = 0
  for (let i = 1; i < line.length; i++) l += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
  return l
}

/** 凸包（Andrew の単調鎖）。反時計回り（x 右・z 下の画面では時計回りに見える） */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

/** 円を n 角形で近似 */
export function circle(cx, cz, r, n = 24) {
  const out = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    out.push([cx + r * Math.cos(t), cz + r * Math.sin(t)])
  }
  return out
}

/** 折れ線を矩形 [-h, h]^2 で切る（Liang–Barsky）。切れた部分ごとの折れ線の配列を返す */
export function clipPolyline(line, h) {
  const pieces = []
  let cur = []
  const inside = (p) => p[0] >= -h && p[0] <= h && p[1] >= -h && p[1] <= h
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const seg = clipSegment(a, b, h)
    if (!seg) {
      if (cur.length > 1) pieces.push(cur)
      cur = []
      continue
    }
    const [p, q] = seg
    if (cur.length === 0) cur.push(p)
    cur.push(q)
    if (!inside(b)) {
      if (cur.length > 1) pieces.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) pieces.push(cur)
  return pieces
}

function clipSegment(a, b, h) {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const tests = [
    [-dx, a[0] + h],
    [dx, h - a[0]],
    [-dz, a[1] + h],
    [dz, h - a[1]],
  ]
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const r = q / p
      if (p < 0) {
        if (r > t1) return null
        if (r > t0) t0 = r
      } else {
        if (r < t0) return null
        if (r < t1) t1 = r
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dz],
    [a[0] + t1 * dx, a[1] + t1 * dz],
  ]
}

/** 多角形を矩形 [-h, h]^2 で切る（Sutherland–Hodgman）。凹多角形では細い縮退辺が残ることがある */
export function clipPolygon(poly, h) {
  const edges = [
    (p) => p[0] >= -h,
    (p) => p[0] <= h,
    (p) => p[1] >= -h,
    (p) => p[1] <= h,
  ]
  const isect = [
    (a, b) => lerpAt(a, b, 0, -h),
    (a, b) => lerpAt(a, b, 0, h),
    (a, b) => lerpAt(a, b, 1, -h),
    (a, b) => lerpAt(a, b, 1, h),
  ]
  let out = poly
  for (let e = 0; e < 4; e++) {
    const input = out
    out = []
    if (input.length === 0) break
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]
      const prev = input[(i + input.length - 1) % input.length]
      const ci = edges[e](cur)
      const pi = edges[e](prev)
      if (ci) {
        if (!pi) out.push(isect[e](prev, cur))
        out.push(cur)
      } else if (pi) {
        out.push(isect[e](prev, cur))
      }
    }
  }
  return out
}

function lerpAt(a, b, axis, v) {
  const t = (v - a[axis]) / (b[axis] - a[axis])
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

/** 隣り合う同じ点・ほぼ一直線の点を間引く */
export function simplifyRing(poly, eps = 0.05) {
  const out = []
  for (const p of poly) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - p[0]) < eps && Math.abs(last[1] - p[1]) < eps) continue
    out.push(p)
  }
  if (out.length > 1) {
    const f = out[0]
    const l = out[out.length - 1]
    if (Math.abs(f[0] - l[0]) < eps && Math.abs(f[1] - l[1]) < eps) out.pop()
  }
  return out
}

/** 線分 a→b と多角形の辺の交点の位置 t（0〜1）を返す */
function segmentPolygonTs(a, b, poly) {
  const ts = []
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j]
    const q = poly[i]
    const ex = q[0] - p[0]
    const ez = q[1] - p[1]
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den
    const u = ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / den
    if (t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1) ts.push(t)
  }
  return ts
}

/**
 * 折れ線を、多角形（複数）の境界で切り分ける。
 * 返すのは { inside, points } の配列（inside = どれかの多角形の中にある区間）
 */
export function splitPolylineByPolygons(line, polys) {
  if (line.length < 2) return []
  const isIn = (p) => polys.some((poly) => pointInPolygon(p, poly))
  const out = []
  let cur = null
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const ts = [0, ...polys.flatMap((poly) => segmentPolygonTs(a, b, poly)), 1].sort((x, y) => x - y)
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < 1e-9) continue
      const p0 = [a[0] + (b[0] - a[0]) * ts[k - 1], a[1] + (b[1] - a[1]) * ts[k - 1]]
      const p1 = [a[0] + (b[0] - a[0]) * ts[k], a[1] + (b[1] - a[1]) * ts[k]]
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      const inside = isIn(mid)
      if (!cur) cur = { inside, points: [p0] }
      else if (cur.inside !== inside) {
        if (cur.points.length > 1) out.push(cur)
        cur = { inside, points: [p0] }
      }
      cur.points.push(p1)
    }
  }
  if (cur && cur.points.length > 1) out.push(cur)
  return out
}

/** 2つの多角形が重なるか（頂点が相手の中にある、または辺が交わる） */
export function polygonsTouch(a, b) {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    if (segmentPolygonTs(a[j], a[i], b).length) return true
  }
  return false
}

/** 多角形の面積のうち、ほかの多角形（複数）の中にある割合（格子で数える目安） */
export function fractionInside(poly, polys, stepM = 1.5) {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const [x, z] of poly) {
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxZ = Math.max(maxZ, z)
  }
  let n = 0
  let k = 0
  for (let z = minZ + stepM / 2; z < maxZ; z += stepM) {
    for (let x = minX + stepM / 2; x < maxX; x += stepM) {
      if (!pointInPolygon([x, z], poly)) continue
      n++
      if (polys.some((q) => pointInPolygon([x, z], q))) k++
    }
  }
  return n ? k / n : polys.some((q) => pointInPolygon(centroid(poly), q)) ? 1 : 0
}
