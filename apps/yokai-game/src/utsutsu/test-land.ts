// 地元のテスト用の土地（02 F-07「チームの地元の地点にテスト用の妖怪を割り当てる」）。
// いまいる所のまわり（約 800m 四方）の OSM データを OSM API から読み、素の地図・お休みの範囲・地点をその場で作る。
// 地点は3種類: 決まった妖怪の地点（4つまで）、調べる地点（光蔵坊の悩み #2。2つまで）、水辺の道の地点（寄り道。出現の表の「水辺」。2つまで）。
//
// - 作った土地は、この端末の中（localStorage）にだけ置く。リポジトリにもサーバーにも入れない（テストする人の家の近くの位置なので）。
//   OSM API には範囲（緯度経度の四角）だけが伝わる。
// - お休みの範囲: 社寺の面（amenity=place_of_worship・landuse=religious）、墓地（landuse=cemetery・amenity=grave_yard）。
//   社寺が点だけのときは半径 50m の円、小さな祠（historic=wayside_shrine）は半径 10m の円で囲む（scripts/fetch-osm.mjs の簡易版）。
// - 地点: 公道（歩道のある道を優先）の上で、お休みの範囲から 60m 以上、線路から 15m 以上、いまいる所から 60〜350m、
//   地点どうし 120m 以上離れた所を機械的に選ぶ（4か所まで）。1つ目（光蔵坊）は、いまいる所からいちばん近い候補にする。
//   ガメとカーラボーズは、とりもつ（悩み #1）で行き来するので、2体そろって置けるとき（3か所以上）だけ置く。
// - 調べる地点: 妖怪の地点のあとに、同じ決まりで2つ。ほかのどの地点からも 90m 以上。水の縁から 20m 以内の道は、ほかが無いときだけ使う。
// - 水辺の道の地点: 同じ決まりの公道のうち、川・用水・小川の縁（線は幅の半分を引く）か水の面の縁から 20m 以内を、
//   水に沿って通っている所（前後 12m も同じくらいの近さ。橋・暗渠の上・水を横切る所は外す）。ほかのどの地点からも 90m 以上、2つまで。
//   側溝（ditch・drain）は水辺に数えない。水辺の道が無ければ置かない（地点は道の上。水には近づけない）。
// - どの地点も「住宅の前でないか」「2分立ち止まっても邪魔にならないか」は分からないので、歩いてみて合わなければ作り直す。
// OSM のデータは ODbL（© OpenStreetMap contributors）。

import { type LatLon, toLocal } from '../core/geo'
import type { MapLayers, XZ } from '../core/map-layers'
import type { PlaceKind } from '../core/story/types'

/** テスト用の土地の地点。yokaiId＝決まった妖怪、clueId＝調べる地点、placeKind＝寄り道の地点（出現の表で妖怪を引く） */
export interface TestSpot {
  id: string
  x: number
  z: number
  yokaiId?: string
  clueId?: string
  placeKind?: PlaceKind
}

export interface TestLand {
  /** 3: 調べる地点・水辺の道の地点を置くようになった版（2 までの土地は作り直してもらう） */
  version: 3
  createdAt: string
  origin: LatLon
  map: MapLayers
  restZones: XZ[][]
  spots: TestSpot[]
  /** 作ったときの数（確認用）。waterSide は水辺の道の候補 */
  stats: { nodes: number; ways: number; roads: number; buildings: number; restZones: number; candidates: number; waterSide: number }
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
/** 地点が3つに満たないときに置く妖怪（とりもつの2体は、片方だけでは進まないので置かない） */
const TEST_YOKAI_FEW = ['kozobo', 'minomoshi']
/** テスト用の土地に置く気配の数（いちばん多いとき） */
export const TEST_SPOTS_MAX = TEST_YOKAI.length
/** 調べる地点（clues.json の id。光蔵坊の悩み #2） */
const TEST_CLUES = ['kozobo-shirabe-1', 'kozobo-shirabe-2']
export const TEST_CLUES_MAX = TEST_CLUES.length
/** 水辺の道の地点の数（いちばん多いとき） */
export const TEST_WANDER_MAX = 2
/** 調べる地点・水辺の道の地点を、ほかのどの地点からも離す距離（m） */
const OTHER_GAP_M = 90
/** 水辺の道: 水の縁からこの距離までの公道（m） */
const WATER_NEAR_M = 20
/** 水辺に数える水路（側溝は数えない） */
const WATER_SIDE_KINDS = new Set(['river', 'canal', 'stream'])

export function loadTestLand(): TestLand | null {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return null
    const t = JSON.parse(s) as TestLand
    return t?.version === 3 && t.spots?.length ? t : null
  } catch {
    return null
  }
}

/** 前に作った土地が古い版で、読めない（作り直してもらう） */
export function testLandIsOld(): boolean {
  try {
    return !!localStorage.getItem(KEY) && !loadTestLand()
  } catch {
    return false
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
  /** 水辺に数える水路（地図の層は種類を持たないので、ここで分けて持つ） */
  const sideWaters: { widthM: number; points: XZ[] }[] = []

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
      if (!(t.tunnel && t.tunnel !== 'no')) {
        const line = { widthM: Number(t.width) || WATER_W[t.waterway], points: p }
        map.waterLines.push(line)
        if (WATER_SIDE_KINDS.has(t.waterway)) sideWaters.push(line)
      }
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

  // 水の縁までの距離（線は幅の半分を引く。面の中は 0）と、水の上か（面の中か、水路の線から 3m 以内）
  const waterEdge = (q: XZ): number =>
    Math.min(Infinity, ...sideWaters.map((l) => Math.max(0, distPolyline(q, l.points) - l.widthM / 2)), ...map.waterAreas.map((a) => distPolygon(q, a)))
  const onWater = (q: XZ): boolean => map.waterAreas.some((a) => pointInPoly(q, a)) || sideWaters.some((l) => distPolyline(q, l.points) < 3)
  /** 水に沿って通る道か（その点と前後 12m が、水の縁から同じくらいの近さ。水を横切る道は、前後で近さが変わる）。e はその点の waterEdge */
  const alongWater = (p: XZ, a: XZ, b: XZ, e: number): boolean => {
    if (e > WATER_NEAR_M || onWater(p)) return false
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [12, -12].every((k) => {
      const q: XZ = [p[0] + ((b[0] - a[0]) / len) * k, p[1] + ((b[1] - a[1]) / len) * k]
      const eq = waterEdge(q)
      return eq <= WATER_NEAR_M && Math.abs(eq - e) <= 6 && !onWater(q)
    })
  }

  onStep('気配を置く場所を選んでいます…')
  /** nearWater: 水の縁から WATER_NEAR_M 以内、waterSide: そのうち水に沿って通る道（水辺の道の候補） */
  const samples: { p: XZ; score: number; dStart: number; nearWater: boolean; waterSide: boolean }[] = []
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
        const score = (r.sidewalk ? 50 : 0) + (inPark ? 30 : 0) + rank * 10
        const e = waterEdge(p)
        samples.push({ p, dStart, score, nearWater: e <= WATER_NEAR_M, waterSide: alongWater(p, a, b, e) })
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
  const yokai = picked.length >= 3 ? TEST_YOKAI : TEST_YOKAI_FEW
  const round = (p: XZ) => ({ x: Math.round(p[0] * 10) / 10, z: Math.round(p[1] * 10) / 10 })
  const spots: TestSpot[] = picked.map((p, i) => ({ id: `test-${i + 1}`, ...round(p), yokaiId: yokai[i] }))
  // 調べる地点・水辺の道の地点（ほかのどの地点からも OTHER_GAP_M 以上）
  const taken = [...picked]
  const pickMore = (cands: typeof samples, n: number): XZ[] => {
    const out: XZ[] = []
    for (const s of cands) {
      if (out.length >= n) break
      if (taken.some((q) => Math.hypot(q[0] - s.p[0], q[1] - s.p[1]) < OTHER_GAP_M)) continue
      out.push(s.p)
      taken.push(s.p)
    }
    return out
  }
  const waterSide = samples.filter((s) => s.waterSide)
  pickMore([...samples.filter((s) => !s.nearWater), ...samples.filter((s) => s.nearWater)], TEST_CLUES.length).forEach((p, i) =>
    spots.push({ id: `test-c${i + 1}`, ...round(p), clueId: TEST_CLUES[i] }),
  )
  pickMore(waterSide, TEST_WANDER_MAX).forEach((p, i) => spots.push({ id: `test-w${i + 1}`, ...round(p), placeKind: 'mizube' }))
  return {
    version: 3,
    createdAt: new Date().toISOString(),
    origin,
    map,
    restZones,
    spots,
    stats: {
      nodes: nodes.size,
      ways: ways.length,
      roads: map.roads.length,
      buildings: map.buildings.length,
      restZones: restZones.length,
      candidates: samples.length,
      waterSide: waterSide.length,
    },
  }
}
