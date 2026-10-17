// 地元のテスト用の土地（02 F-07「チームの地元の地点にテスト用の妖怪を割り当てる」）。
// いまいる所のまわり（約 800m 四方）の OSM データを OSM API から読み、素の地図・お休みの範囲・地点3つをその場で作る。
//
// - 作った土地は、この端末の中（localStorage）にだけ置く。リポジトリにもサーバーにも入れない（テストする人の家の近くの位置なので）。
//   OSM API には範囲（緯度経度の四角）だけが伝わる。
// - お休みの範囲: 社寺の面（amenity=place_of_worship・landuse=religious）、墓地（landuse=cemetery・amenity=grave_yard）。
//   社寺が点だけのときは半径 50m の円、小さな祠（historic=wayside_shrine）は半径 10m の円で囲む（scripts/fetch-osm.mjs の簡易版）。
// - 地点: 公道（歩道のある道を優先）の上で、お休みの範囲から 60m 以上、線路から 15m 以上、いまいる所から 60〜350m、
//   地点どうし 120m 以上離れた所を機械的に選ぶ（4か所）。1つ目（光蔵坊）は、いまいる所からいちばん近い候補にする。
//   「住宅の前でないか」「2分立ち止まっても邪魔にならないか」は分からないので、歩いてみて合わなければ作り直す。
// OSM のデータは ODbL（© OpenStreetMap contributors）。

import { type LatLon, toLocal } from '../core/geo'
import type { MapLayers, XZ } from '../core/map-layers'

export interface TestLand {
  version: 1
  createdAt: string
  origin: LatLon
  map: MapLayers
  restZones: XZ[][]
  spots: { id: string; x: number; z: number; yokaiId: string }[]
  /** 作ったときの数（確認用） */
  stats: { nodes: number; ways: number; roads: number; buildings: number; restZones: number; candidates: number }
}

const KEY = 'yume.testland.v1'
const HALF_M = 400
const PUBLIC_ROAD = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian'])
const ROAD_WIDTH: Record<string, number> = {
  motorway: 10, trunk: 9, primary: 8, secondary: 7, tertiary: 6, unclassified: 5, residential: 4.5,
  living_street: 4, service: 3.5, track: 3, pedestrian: 4, footway: 2, path: 1.5, cycleway: 2, steps: 2,
}
const WATER_W: Record<string, number> = { river: 20, canal: 3, stream: 2, ditch: 1, drain: 1 }
/** テスト用の土地に置く妖怪。1つ目（いちばん近い地点）は光蔵坊。ガメとカーラボーズは、とりもつ（悩み #1）で行き来する */
const TEST_YOKAI = ['kozobo', 'game', 'karabozu', 'minomoshi']

export function loadTestLand(): TestLand | null {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return null
    const t = JSON.parse(s) as TestLand
    return t?.version === 1 && t.spots?.length ? t : null
  } catch {
    return null
  }
}

export function saveTestLand(t: TestLand): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    // 保存できなくても、この回は遊べる
  }
}

export function clearTestLand(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // そのまま
  }
}

interface OsmNode {
  lat: number
  lon: number
  tags: Record<string, string>
}
interface OsmWay {
  nodes: string[]
  tags: Record<string, string>
}

function tagsOf(e: Element): Record<string, string> {
  const t: Record<string, string> = {}
  for (const c of Array.from(e.getElementsByTagName('tag'))) t[c.getAttribute('k')!] = c.getAttribute('v')!
  return t
}

function circle(cx: number, cz: number, r: number, n = 16): XZ[] {
  const out: XZ[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return out
}

function pointInPoly(p: XZ, poly: readonly XZ[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

function distSeg(p: XZ, a: XZ, b: XZ): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t))
}

function distPolyline(p: XZ, line: readonly XZ[]): number {
  let d = Infinity
  for (let i = 1; i < line.length; i++) d = Math.min(d, distSeg(p, line[i - 1], line[i]))
  return d
}

function distPolygon(p: XZ, poly: readonly XZ[]): number {
  if (pointInPoly(p, poly)) return 0
  return Math.min(distPolyline(p, poly), poly.length > 1 ? distSeg(p, poly[poly.length - 1], poly[0]) : Infinity)
}

/** いまいる所のまわりの OSM データを読み、テスト用の土地を作る */
export async function buildTestLand(origin: LatLon, onStep: (s: string) => void): Promise<TestLand> {
  const dLat = HALF_M / 111_320
  const dLon = HALF_M / (111_320 * Math.cos((origin.lat * Math.PI) / 180))
  const bbox = [origin.lon - dLon, origin.lat - dLat, origin.lon + dLon, origin.lat + dLat].map((v) => v.toFixed(6)).join(',')
  onStep('OpenStreetMap から、まわりの道と建物を読んでいます…')
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`)
  if (!res.ok) throw new Error(res.status === 400 ? 'データが多すぎて読めませんでした（街なかすぎるかもしれません）' : `読めませんでした（${res.status}）`)
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml')
  onStep('地図を組み立てています…')

  const nodes = new Map<string, OsmNode>()
  for (const n of Array.from(xml.getElementsByTagName('node')))
    nodes.set(n.getAttribute('id')!, { lat: Number(n.getAttribute('lat')), lon: Number(n.getAttribute('lon')), tags: tagsOf(n) })
  const ways: OsmWay[] = []
  for (const w of Array.from(xml.getElementsByTagName('way')))
    ways.push({ nodes: Array.from(w.getElementsByTagName('nd')).map((nd) => nd.getAttribute('ref')!), tags: tagsOf(w) })

  const local = (n: OsmNode): XZ => {
    const p = toLocal(n, origin)
    return [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]
  }
  const pts = (w: OsmWay): XZ[] => w.nodes.map((id) => nodes.get(id)).filter((n): n is OsmNode => !!n).map(local)
  const closed = (w: OsmWay) => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1]

  const map: MapLayers = {
    rect: { minX: -HALF_M, maxX: HALF_M, minZ: -HALF_M, maxZ: HALF_M },
    roads: [],
    rails: [],
    waterLines: [],
    waterAreas: [],
    buildings: [],
    greens: [],
    stations: [],
  }
  const restZones: XZ[][] = []
  const publicRoads: { kind: string; points: XZ[]; sidewalk: boolean }[] = []
  const parks: XZ[][] = []

  for (const w of ways) {
    const t = w.tags
    const p = pts(w)
    if (p.length < 2) continue
    if (t.highway && !['proposed', 'construction', 'platform', 'corridor', 'elevator'].includes(t.highway)) {
      if (t.tunnel && t.tunnel !== 'no') continue
      map.roads.push({ kind: t.highway, widthM: Number(t.width) || ROAD_WIDTH[t.highway] || 3, points: p })
      if (PUBLIC_ROAD.has(t.highway) && !(t.bridge && t.bridge !== 'no') && t.access !== 'private' && t.access !== 'no') {
        const sw = t.sidewalk ?? t['sidewalk:both'] ?? ''
        publicRoads.push({ kind: t.highway, points: p, sidewalk: !!sw && sw !== 'no' && sw !== 'none' && sw !== 'separate' ? true : false })
      }
      continue
    }
    if (t.railway && ['rail', 'light_rail', 'narrow_gauge', 'tram', 'subway'].includes(t.railway)) {
      if (!(t.tunnel && t.tunnel !== 'no')) map.rails.push({ points: p })
      continue
    }
    if (t.waterway && WATER_W[t.waterway] !== undefined && !closed(w)) {
      if (!(t.tunnel && t.tunnel !== 'no')) map.waterLines.push({ widthM: Number(t.width) || WATER_W[t.waterway], points: p })
      continue
    }
    if (!closed(w)) continue
    if (t.amenity === 'place_of_worship' || t.landuse === 'religious' || t.landuse === 'cemetery' || t.amenity === 'grave_yard') {
      restZones.push(p)
      continue
    }
    if (t.building) {
      map.buildings.push(p)
      continue
    }
    if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') {
      map.waterAreas.push(p)
      continue
    }
    if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'playground') {
      map.greens.push({ kind: 'park', polygon: p })
      parks.push(p)
      continue
    }
    if (t.landuse === 'forest' || t.natural === 'wood') {
      map.greens.push({ kind: 'forest', polygon: p })
      continue
    }
    if (t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'recreation_ground') map.greens.push({ kind: 'grass', polygon: p })
  }
  // 社寺が点だけのとき・小さな祠
  for (const n of nodes.values()) {
    const t = n.tags
    if (t.railway === 'station') map.stations.push(local(n))
    if (t.amenity !== 'place_of_worship' && t.historic !== 'wayside_shrine') continue
    const c = local(n)
    if (restZones.some((z) => pointInPoly(c, z))) continue
    restZones.push(circle(c[0], c[1], t.amenity === 'place_of_worship' ? 50 : 10))
  }

  onStep('気配を置く場所を選んでいます…')
  const samples: { p: XZ; score: number; dStart: number }[] = []
  for (const r of publicRoads) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]
      const b = r.points[i]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (let d = 0; d < len; d += 6) {
        const k = d / len
        const p: XZ = [a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])]
        const dStart = Math.hypot(p[0], p[1])
        if (dStart < 60 || dStart > 350) continue
        if (restZones.some((z) => distPolygon(p, z) < 60)) continue
        if (map.rails.some((l) => distPolyline(p, l.points) < 15)) continue
        const inPark = parks.some((pk) => distPolygon(p, pk) < 8)
        const rank = { primary: 3, secondary: 3, tertiary: 3, unclassified: 2, pedestrian: 3, residential: 1, living_street: 1 }[r.kind] ?? 0
        samples.push({ p, dStart, score: (r.sidewalk ? 50 : 0) + (inPark ? 30 : 0) + rank * 10 })
      }
    }
  }
  samples.sort((a, b) => b.score - a.score || a.dStart - b.dStart)
  const picked: XZ[] = []
  // 1つ目は、点数が上位のうち、いまいる所にいちばん近いもの（すぐ試せるように）
  const top = samples.filter((s) => s.score >= (samples[0]?.score ?? 0) - 20)
  const first = [...top].sort((a, b) => a.dStart - b.dStart)[0]
  if (first) picked.push(first.p)
  for (const s of samples) {
    if (picked.length >= TEST_YOKAI.length) break
    if (picked.some((q) => Math.hypot(q[0] - s.p[0], q[1] - s.p[1]) < 120)) continue
    picked.push(s.p)
  }
  if (!picked.length) throw new Error('近くに、気配を置ける公道が見つかりませんでした（OSM に道が少ないか、社寺・墓地が近すぎます）。少し移動して、もう一度作ってください')
  const spots = picked.map((p, i) => ({ id: `test-${i + 1}`, x: Math.round(p[0] * 10) / 10, z: Math.round(p[1] * 10) / 10, yokaiId: TEST_YOKAI[i] }))
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    origin,
    map,
    restZones,
    spots,
    stats: { nodes: nodes.size, ways: ways.length, roads: map.roads.length, buildings: map.buildings.length, restZones: restZones.length, candidates: samples.length },
  }
}
