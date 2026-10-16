#!/usr/bin/env node
// 仮の家並み（placeholder houses）を作る。依存なし。fetch-osm.mjs と fetch-dem.mjs のあとに動かす。
//
//   node scripts/make-placeholder-houses.mjs [--seed 20261016] [--out <file>]
//
// OSM の建物は、空中写真の数の半分ほどしかない（400m 四方で 32 棟。空中写真の概数は 90〜110 棟）。
// 道沿いの空き地に、名前のない小さな家（切妻屋根、1〜2階）を手続き的に足して、集落らしく見せる。
//
// - 実在の家を写したものではない。位置・形・数は乱数（種は固定）で決めた「仮」のもの
// - お休みの範囲（境内）・水・河原・線路・ホーム・道・既存の建物・林・駐車場・公園とは重ならない
// - 段差（河岸段丘の崖）の上と、段丘の下の低地（河原・堤防の道）には置かない
// - 出力の各棟に placeholder: true を付け、meta に件数を残す
//
// 入力: src/data/iwakuraji-osm.json（ODbL）と src/data/iwakuraji-dem.json。
// 出力: src/data/iwakuraji-placeholder-houses.json。置き場所は OSM の道から決めているので、
//       OSM の Derivative Database として ODbL で扱う（画面には「© OpenStreetMap contributors」を常に表示）。

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { r1 } from './lib/geo.mjs'
import { area, distPointSegment, pointInPolygon } from './lib/geom.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const args = process.argv.slice(2)
const argVal = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const SEED = Number(argVal('--seed', '20261016'))
const OUT = resolve(argVal('--out', join(APP, 'src/data/iwakuraji-placeholder-houses.json')))
const osm = JSON.parse(readFileSync(join(APP, 'src/data/iwakuraji-osm.json'), 'utf8'))
const dem = JSON.parse(readFileSync(join(APP, 'src/data/iwakuraji-dem.json'), 'utf8'))
const RECT = osm.meta.rect

// ---------- 調整値 ----------
/** 家を並べる道の種類（公道と、集落の中の私道） */
const FRONTAGE_ROADS = new Set(['residential', 'unclassified', 'living_street', 'tertiary', 'secondary', 'service'])
/** 家の間口（道に沿う長さ）・奥行き（m） */
const WIDTH = [7.5, 11]
const DEPTH = [6.5, 9]
/** 道の端から家の壁までの下がり（m） */
const SETBACK = [2.2, 5]
/** 隣の家とのすき間（m） */
const GAP = [2.5, 7]
/** 空き地として飛ばす割合と、そのときの長さ（m）。畑や庭、駐車場の代わり */
const SKIP_P = 0.2
const SKIP_LEN = [8, 22]
/** 2階建ての割合 */
const TWO_FLOORS_P = 0.5
/** 敷地の中の高さの差がこれを超える所（段丘の崖など）には置かない（m） */
const MAX_SLOPE_M = 1.6
/**
 * 原点（段丘の上）よりこれ以上低い所には置かない（m）。西と南西は常願寺川の河原と、段丘の下の低地（堤防の道・草地）で、
 * 空中写真では家がない。集落の家（OSM）は原点より -1.7〜+5.3m にある
 */
const MIN_REL_HEIGHT_M = -4
/** 離す距離（m） */
const CLEAR = {
  rest: 12, // お休みの範囲（境内）から
  building: 2.5, // 既存の建物・ほかの仮の家から
  road: 1.2, // 道の端から（道の帯の上に乗らない）
  rail: 6, // 線路の中心から
  platform: 3, // ホームから
  waterLine: 2.5, // 用水の端から
  waterArea: 3, // 池・河原から
  landuse: 1.5, // 林・駐車場・公園から
  edge: 5, // 箱庭の縁から
}

// ---------- 乱数（種を固定） ----------
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(SEED)
const between = ([a, b]) => a + rnd() * (b - a)

// ---------- 高さ ----------
const G = dem.grid
function heightAt(x, z) {
  const fx = Math.max(0, Math.min(G.cols - 1.001, (x - G.x0) / G.stepM))
  const fz = Math.max(0, Math.min(G.rows - 1.001, (z - G.z0) / G.stepM))
  const c = Math.floor(fx)
  const r = Math.floor(fz)
  const tx = fx - c
  const tz = fz - r
  const h = (cc, rr) => dem.heights[rr * G.cols + cc]
  return (h(c, r) * (1 - tx) + h(c + 1, r) * tx) * (1 - tz) + (h(c, r + 1) * (1 - tx) + h(c + 1, r + 1) * tx) * tz
}

// ---------- 幾何 ----------
const bbox = (pts, pad = 0) => {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const [x, z] of pts) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad }
}
const boxesMeet = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}
/** 線分と線分の距離 */
function segSegDist(a, b, c, d) {
  if (segsCross(a, b, c, d)) return 0
  return Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d), distPointSegment(c, a, b), distPointSegment(d, a, b))
}
/** 閉じた多角形 poly と、折れ線 line（closed なら輪）の距離。poly の中に入っていれば 0 */
function polyLineDist(poly, line, closed) {
  if (line.some((p) => pointInPolygon(p, poly))) return 0
  if (closed && poly.some((p) => pointInPolygon(p, line))) return 0
  let d = Infinity
  const nl = closed ? line.length : line.length - 1
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    for (let j = 0; j < nl; j++) d = Math.min(d, segSegDist(a, b, line[j], line[(j + 1) % line.length]))
  }
  return d
}

// ---------- よける物 ----------
const lineObs = []
const polyObs = []
const addLine = (pts, clear, kind) => lineObs.push({ pts, clear, kind, box: bbox(pts, clear + 1) })
const addPoly = (pts, clear, kind) => polyObs.push({ pts, clear, kind, box: bbox(pts, clear + 1) })
for (const r of osm.roads) addLine(r.points, r.widthM / 2 + CLEAR.road, 'road')
for (const l of osm.rails.lines) addLine(l.points, CLEAR.rail, 'rail')
for (const p of osm.rails.platforms ?? []) addPoly(p.polygon, CLEAR.platform, 'platform')
for (const w of osm.waters.lines) if (!w.tunnel) addLine(w.points, w.widthM / 2 + CLEAR.waterLine, 'water')
for (const a of osm.waters.areas) addPoly(a.polygon, CLEAR.waterArea, 'water')
for (const z of osm.restZones) addPoly(z.polygon, CLEAR.rest, 'rest')
for (const b of osm.buildings) addPoly(b.polygon, CLEAR.building, 'building')
for (const l of osm.landuse) if (['forest', 'parking', 'park', 'wood'].includes(l.kind)) addPoly(l.polygon, CLEAR.landuse, 'landuse')

const rejected = {}
function blocked(poly) {
  const inset = CLEAR.edge
  if (poly.some(([x, z]) => x < RECT.minX + inset || x > RECT.maxX - inset || z < RECT.minZ + inset || z > RECT.maxZ - inset)) return 'edge'
  const hs = poly.map(([x, z]) => heightAt(x, z))
  hs.push(heightAt((poly[0][0] + poly[2][0]) / 2, (poly[0][1] + poly[2][1]) / 2))
  if (Math.max(...hs) - Math.min(...hs) > MAX_SLOPE_M) return 'slope'
  if (Math.min(...hs) < MIN_REL_HEIGHT_M) return 'lowland'
  const box = bbox(poly)
  for (const o of polyObs) {
    if (!boxesMeet(box, o.box)) continue
    if (polyLineDist(poly, o.pts, true) < o.clear) return o.kind
  }
  for (const o of lineObs) {
    if (!boxesMeet(box, o.box)) continue
    if (polyLineDist(poly, o.pts, false) < o.clear) return o.kind
  }
  return null
}

// ---------- 並べる ----------
const houses = []
const roads = osm.roads
  .map((r, i) => ({ r, i }))
  .filter(({ r }) => FRONTAGE_ROADS.has(r.kind) && !r.inRestZone && !r.bridge && !r.tunnel && !(r.kind === 'service' && r.service === 'parking_aisle'))
for (const { r } of roads) {
  const pts = r.points
  for (const side of [1, -1]) {
    // 道の始めから、間口とすき間ずつ進む
    let carry = between([0, 8])
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-6) continue
      const ux = (b[0] - a[0]) / len
      const uz = (b[1] - a[1]) / len
      // 道の左右（side = 1 は進む向きの右）
      const vx = -uz * side
      const vz = ux * side
      let s = carry
      while (s < len) {
        if (rnd() < SKIP_P) {
          s += between(SKIP_LEN)
          continue
        }
        const W = between(WIDTH)
        const D = between(DEPTH)
        const at = s + W / 2
        if (at + W / 2 > len + 2) break
        const off = r.widthM / 2 + between(SETBACK) + D / 2
        const cx = a[0] + ux * at + vx * off
        const cz = a[1] + uz * at + vz * off
        // 少しだけ向きを揺らす（± 4°）
        const rot = (rnd() - 0.5) * 0.14
        const cu = Math.cos(rot)
        const su = Math.sin(rot)
        const ax = ux * cu - uz * su
        const az = ux * su + uz * cu
        const bx = -az * side
        const bz = ax * side
        const corner = (p, q) => [cx + ax * p * (W / 2) + bx * q * (D / 2), cz + az * p * (W / 2) + bz * q * (D / 2)]
        const poly = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
        const why = blocked(poly)
        if (why) {
          rejected[why] = (rejected[why] ?? 0) + 1
          s += 3
          continue
        }
        const levels = rnd() < TWO_FLOORS_P ? 2 : 1
        const h = { kind: 'house', polygon: poly.map(([x, z]) => [r1(x), r1(z)]), areaM2: Math.round(area(poly)), levels, roofShape: 'gabled', placeholder: true }
        houses.push(h)
        addPoly(h.polygon, CLEAR.building, 'building')
        s = at + W / 2 + between(GAP)
      }
      carry = Math.max(0, s - len)
    }
  }
}

// ---------- 数える ----------
const inSquare = (b, half = 200) => {
  const c = b.polygon.reduce((acc, p) => [acc[0] + p[0] / b.polygon.length, acc[1] + p[1] / b.polygon.length], [0, 0])
  return Math.abs(c[0]) <= half && Math.abs(c[1]) <= half
}
const osmIn400 = osm.buildings.filter((b) => inSquare(b)).length
const phIn400 = houses.filter((b) => inSquare(b)).length
const out = {
  meta: {
    region: osm.meta.region,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/make-placeholder-houses.mjs',
    seed: SEED,
    attribution: '© OpenStreetMap contributors（置き場所を OSM の道から決めた）',
    license: 'ODbL-1.0（OSM の Derivative Database として扱う）',
    note: '仮の家並み。実在の家を写したものではない（位置・形・数は種を固定した乱数）。名前は持たない。各棟に placeholder: true',
    count: houses.length,
    counts: {
      placeholder: houses.length,
      osmBuildings: osm.buildings.length,
      total: houses.length + osm.buildings.length,
      twoFloors: houses.filter((h) => h.levels === 2).length,
      /** 段階1a の範囲（原点のまわり 400m 四方）での数。空中写真の概数は 90〜110 棟 */
      original400mSquare: { placeholder: phIn400, osmBuildings: osmIn400, total: phIn400 + osmIn400 },
    },
    rejectedCandidates: rejected,
  },
  houses,
}
writeFileSync(OUT, JSON.stringify(out) + '\n')
console.log(`書いた: ${OUT}（${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1)} KB）`)
console.log(JSON.stringify(out.meta.counts), JSON.stringify(rejected))
