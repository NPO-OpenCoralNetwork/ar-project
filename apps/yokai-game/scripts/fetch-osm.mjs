#!/usr/bin/env node
// 箱庭「岩峅寺」の下地データを OpenStreetMap から作る。依存なし（Node 20+）。
//
//   node scripts/fetch-osm.mjs [--raw-dir <dir>] [--offline] [--out <file>]
//
//   --raw-dir  取得した生データ（XML）を置くディレクトリ。既定は OS の一時ディレクトリ/yokai-game-osm
//   --offline  取得せず、--raw-dir にある生データだけで作り直す
//   --out      出力先。既定は src/data/iwakuraji-osm.json
//
// 出力はローカル座標（src/core/geo.ts と同じ式。原点 = scripts/lib/region.mjs の ORIGIN、x = 東, z = 南, m）。
// 名前（社寺名・家の名前・店名・駅名）は出力しない。駅は番号（station-1 …）だけ。
// 駅名には社寺の名と同じもの（岩峅寺・大川寺など）があるので、PO の了承までは出さない（04 §5.2、05 §3）。
//
// ライセンス: 出力は OpenStreetMap のデータから作った Derivative Database なので ODbL 1.0 で扱う。
// 画面には「© OpenStreetMap contributors」を常に表示すること。
// このスクリプト自体も ODbL 4.6(b) のために手順として公開する前提で書いている。

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toLocal, toLatLon, distanceM, rectBounds, expandRect, r1 } from './lib/geo.mjs'
import { parseOsmXml, emptyOsm } from './lib/osm-xml.mjs'
import {
  area,
  centroid,
  circle,
  clipPolygon,
  clipPolyline,
  convexHull,
  distPointPolygon,
  distPointPolyline,
  fractionInside,
  pointInPolygon,
  polygonsTouch,
  polylineLength,
  simplifyRing,
  splitPolylineByPolygons,
} from './lib/geom.mjs'
import { ORIGIN, ORIGIN_OSM_NODE, RECT, BOUNDS, REGION_ID, STATION_SEARCH_MARGIN_M, FETCH_MARGIN_M } from './lib/region.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const USER_AGENT = 'yokai-game-dev/0.1 (region data build script; contact via project repository)'

// ---------- 引数 ----------
const args = process.argv.slice(2)
const argVal = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const RAW_DIR = resolve(argVal('--raw-dir', join(tmpdir(), 'yokai-game-osm')))
const OFFLINE = args.includes('--offline')
const OUT = resolve(argVal('--out', join(APP, 'src/data/iwakuraji-osm.json')))

// ---------- 調整値 ----------
/** 道路の幅の目安（m）。width / lanes タグがあればそちらを使う */
const ROAD_WIDTH = {
  motorway: 10, trunk: 9, primary: 8, secondary: 7, tertiary: 6, unclassified: 5, residential: 4.5,
  living_street: 4, service: 3.5, track: 3, pedestrian: 4, footway: 2, path: 1.5, cycleway: 2, steps: 2,
  bridleway: 2,
}
/** 公道として扱う道の種類（妖怪を置く候補の道） */
const PUBLIC_ROAD = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian'])
const WATER_LINE_WIDTH = { river: 20, canal: 3, stream: 2, ditch: 1, drain: 1 }
/** 境内を近似するときに「社寺のもの」とみなすタグ */
const SHRINE_ITEM = (t) =>
  !!t.religion ||
  t.man_made === 'ceremonial_gate' ||
  t.historic === 'wayside_shrine' ||
  t.historic === 'memorial' ||
  t.man_made === 'lamp' ||
  t.tourism === 'information' ||
  t.building === 'shrine' ||
  t.building === 'temple'
/** 境内を近似するとき、社寺のもの同士をつなぐ最大距離（m）と、社殿からの最大距離（m） */
const SHRINE_LINK_M = 60
const SHRINE_MAX_M = 250
/** 近似した境内の外側に足す余白（m） */
const REST_BUFFER_M = 15
/** 境内の面がないときの最小の円（m） */
const REST_MIN_RADIUS_M = 40
/** 小さな祠（wayside_shrine）を囲む円（m） */
const SMALL_SHRINE_RADIUS_M = 10
/** 妖怪を置く候補は、お休みの範囲からこれ以上離す（04 §3.1 は 50m。GPS のずれを見込んで余裕を持つ） */
const SPOT_MIN_REST_M = 60

// ---------- 取得 ----------
async function fetchText(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}`)
  return res.text()
}

const FETCH_BOUNDS = rectBounds(ORIGIN, expandRect(RECT, FETCH_MARGIN_M))
const bboxStr = (b) => [b.west, b.south, b.east, b.north].map((v) => v.toFixed(7)).join(',')
/** OSM API の /map は 0.25 平方度まで（ノード数は 50000 まで）。余裕を見て、これを超えたら東西に分けて取る */
const API_MAX_AREA_DEG2 = 0.2

/** 取る範囲を、API の上限に収まるよう東西に分ける */
function fetchPieces(b) {
  const areaDeg2 = (b.east - b.west) * (b.north - b.south)
  const n = Math.max(1, Math.ceil(areaDeg2 / API_MAX_AREA_DEG2))
  const w = (b.east - b.west) / n
  return Array.from({ length: n }, (_, i) => ({ ...b, west: b.west + i * w, east: i === n - 1 ? b.east : b.west + (i + 1) * w }))
}

async function fetchMainXml() {
  const pieces = fetchPieces(FETCH_BOUNDS)
  try {
    const xmls = []
    for (const p of pieces) {
      const api = `https://api.openstreetmap.org/api/0.6/map?bbox=${bboxStr(p)}`
      console.log(`GET ${api}`)
      xmls.push(await fetchText(api))
    }
    const api = `https://api.openstreetmap.org/api/0.6/map?bbox=${bboxStr(FETCH_BOUNDS)}${pieces.length > 1 ? `（${pieces.length} 分割）` : ''}`
    return { xmls, source: api }
  } catch (e) {
    console.warn(`OSM API に失敗: ${e.message}。Overpass を試す`)
  }
  const b = FETCH_BOUNDS
  const q = `[out:xml][timeout:90];(nwr(${b.south},${b.west},${b.north},${b.east}););(._;>;);out body;`
  for (const ep of [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ]) {
    try {
      console.log(`POST ${ep}`)
      const xml = await fetchText(ep, {
        method: 'POST',
        body: new URLSearchParams({ data: q }),
      })
      return { xmls: [xml], source: ep }
    } catch (e) {
      console.warn(`Overpass に失敗: ${e.message}`)
    }
  }
  throw new Error('OSM データを取得できなかった')
}

async function loadData() {
  mkdirSync(RAW_DIR, { recursive: true })
  const mainPath = join(RAW_DIR, 'osm-raw.xml')
  const data = emptyOsm()
  const sourcePath = join(RAW_DIR, 'osm-raw.source.json')
  let source = 'offline'
  if (OFFLINE) {
    if (!existsSync(mainPath)) throw new Error(`${mainPath} がない`)
    if (existsSync(sourcePath)) source = JSON.parse(readFileSync(sourcePath, 'utf8')).source + '（--offline で生データから再生成）'
    parseOsmXml(readFileSync(mainPath, 'utf8'), data)
    for (const f of readdirSync(RAW_DIR).filter((f) => /^osm-raw-(part-\d+|relation-\d+)\.xml$/.test(f))) {
      parseOsmXml(readFileSync(join(RAW_DIR, f), 'utf8'), data)
    }
    return { data, source }
  }
  const main = await fetchMainXml()
  source = `${main.source} (${new Date().toISOString().slice(0, 10)})`
  // 1つ目を osm-raw.xml、分けて取ったときの2つ目からを osm-raw-part-<n>.xml に置く
  for (const f of readdirSync(RAW_DIR).filter((f) => /^osm-raw-(part|relation)-\d+\.xml$/.test(f))) unlinkSync(join(RAW_DIR, f))
  main.xmls.forEach((xml, i) => {
    writeFileSync(i === 0 ? mainPath : join(RAW_DIR, `osm-raw-part-${i}.xml`), xml)
    parseOsmXml(xml, data)
  })
  writeFileSync(sourcePath, JSON.stringify({ source }) + '\n')
  // 面のリレーション（multipolygon）は、範囲の外にある辺が欠けるので丸ごと取り直す
  for (const rel of data.relations.values()) {
    if (rel.tags.type !== 'multipolygon' || !isAreaOfInterest(rel.tags)) continue
    const missing = rel.members.some((m) => m.type === 'way' && !data.ways.has(m.ref))
    if (!missing) continue
    const url = `https://api.openstreetmap.org/api/0.6/relation/${rel.id}/full`
    try {
      console.log(`GET ${url}`)
      const xml = await fetchText(url)
      writeFileSync(join(RAW_DIR, `osm-raw-relation-${rel.id}.xml`), xml)
      parseOsmXml(xml, data)
    } catch (e) {
      console.warn(`relation ${rel.id} の取得に失敗: ${e.message}（欠けたまま使う）`)
    }
  }
  return { data, source }
}

function isAreaOfInterest(t) {
  return !!(
    t.building ||
    t.landuse ||
    t.natural ||
    t.leisure ||
    t.amenity === 'place_of_worship' ||
    t.amenity === 'parking' ||
    t.waterway === 'riverbank' ||
    t.water
  )
}

// ---------- 形を組み立てる ----------
function makeGeometry(data) {
  const local = (n) => {
    const p = toLocal(n, ORIGIN)
    return [p.x, p.z]
  }
  const wayPoints = (w) => {
    const pts = []
    for (const id of w.nodes) {
      const n = data.nodes.get(id)
      if (n) pts.push(local(n))
    }
    return pts
  }
  const isClosed = (w) => w.nodes.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1]

  /** multipolygon のメンバーの道をつないで輪にする */
  function assembleRings(rel, role) {
    const segs = rel.members
      .filter((m) => m.type === 'way' && (m.role === role || (role === 'outer' && m.role === '')))
      .map((m) => data.ways.get(m.ref))
      .filter(Boolean)
      .map((w) => [...w.nodes])
    const rings = []
    while (segs.length) {
      let ring = segs.shift()
      let guard = 0
      while (ring[0] !== ring[ring.length - 1] && guard++ < 10000) {
        const end = ring[ring.length - 1]
        const i = segs.findIndex((s) => s[0] === end || s[s.length - 1] === end)
        if (i < 0) break
        const s = segs.splice(i, 1)[0]
        if (s[0] !== end) s.reverse()
        ring = ring.concat(s.slice(1))
      }
      if (ring[0] === ring[ring.length - 1]) {
        const pts = ring.map((id) => data.nodes.get(id)).filter(Boolean).map(local)
        if (pts.length >= 4) rings.push(simplifyRing(pts))
      }
    }
    return rings
  }

  /** 面を持つ要素（閉じた way と multipolygon）を { tags, outer, inners } で列挙 */
  const areas = []
  for (const w of data.ways.values()) {
    if (isClosed(w) && isAreaOfInterest(w.tags)) areas.push({ tags: w.tags, outer: simplifyRing(wayPoints(w)), inners: [], osm: `way/${w.id}` })
  }
  for (const rel of data.relations.values()) {
    if (rel.tags.type !== 'multipolygon' || !isAreaOfInterest(rel.tags)) continue
    const outers = assembleRings(rel, 'outer')
    const inners = assembleRings(rel, 'inner')
    for (const o of outers) {
      areas.push({ tags: rel.tags, outer: o, inners: inners.filter((r) => pointInPolygon(r[0], o)), osm: `relation/${rel.id}` })
    }
  }
  // multipolygon の外側の道にタグが付いていない場合があるので、タグ付きの way が二重に入っても害はない
  return { local, wayPoints, isClosed, areas }
}

// ---------- 分類 ----------
const inRect = (p, r) => p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minZ && p[1] <= r.maxZ
const inBounds = (p, margin = 0) => inRect(p, expandRect(RECT, -margin))
const round2 = (pts) => pts.map((p) => [r1(p[0]), r1(p[1])])
const num = (v) => {
  if (v === undefined) return undefined
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function roadWidth(t) {
  const w = num(t.width)
  if (w) return w
  const lanes = num(t.lanes)
  if (lanes) return lanes * 3
  return ROAD_WIDTH[t.highway] ?? 3
}

function sidewalkOf(t) {
  if (t.sidewalk) return t.sidewalk
  if (t['sidewalk:both']) return t['sidewalk:both'] === 'yes' ? 'both' : t['sidewalk:both']
  const l = t['sidewalk:left']
  const r = t['sidewalk:right']
  if (l === 'yes' && r === 'yes') return 'both'
  if (l === 'yes') return 'left'
  if (r === 'yes') return 'right'
  if (l === 'no' && r === 'no') return 'no'
  return null
}

function build(data) {
  const g = makeGeometry(data)
  const stats = {
    buildingsInBounds: 0,
    buildingsWithLevels: 0,
    buildingsWithRoofShape: 0,
    buildingsWithHeight: 0,
    buildingValues: {},
    buildingsHiddenInRestZones: 0,
    buildingsTouchingRestZones: 0, // 一部だけ境内にかかる建物（これも出力しない）
    roadsByKind: {},
    roadLengthMByKind: {},
    roadsWithSidewalkTag: 0,
    footwaySidewalkWays: 0,
    waterLinesByKind: {},
    waterAreas: 0,
    railLines: 0,
    landuseByKind: {},
    placeOfWorship: { nodesInBounds: 0, nodesNearby: 0, areasInBounds: 0 },
    landuseReligiousAreas: 0, // 範囲内の landuse=religious の面
  }
  const inc = (obj, k, v = 1) => (obj[k] = (obj[k] ?? 0) + v)

  // ----- お休みの範囲（境内） -----
  const restZones = []
  const religiousAreas = g.areas.filter(
    (a) => a.tags.amenity === 'place_of_worship' || a.tags.landuse === 'religious',
  )
  for (const a of religiousAreas) {
    if (!inBounds(centroid(a.outer))) continue
    if (a.tags.amenity === 'place_of_worship') stats.placeOfWorship.areasInBounds++
    if (a.tags.landuse === 'religious') stats.landuseReligiousAreas++
  }
  // 範囲の外 150m までの社寺も、境界をまたぐおそれがあるのでお休みの範囲にする
  const NEAR_RECT = expandRect(RECT, 150)
  const nearBounds = (p) => inRect(p, NEAR_RECT)
  for (const a of religiousAreas) {
    if (!a.outer.some(nearBounds)) continue
    restZones.push({ source: 'osm-area', polygon: a.outer })
  }
  // 社殿が点（node）だけのときは、まわりの「社寺のもの」をつないで凸包を作り、余白を足して境内を近似する
  const shrineNodes = [...data.nodes.values()].filter((n) => n.tags.amenity === 'place_of_worship')
  const itemPoints = []
  for (const n of data.nodes.values()) if (SHRINE_ITEM(n.tags)) itemPoints.push(g.local(n))
  for (const w of data.ways.values()) {
    if (SHRINE_ITEM(w.tags)) for (const p of g.wayPoints(w)) itemPoints.push(p)
  }
  for (const n of shrineNodes) {
    const c = g.local(n)
    if (!nearBounds(c)) continue
    if (inBounds(c)) stats.placeOfWorship.nodesInBounds++
    else stats.placeOfWorship.nodesNearby++
    if (restZones.some((z) => pointInPolygon(c, z.polygon))) continue
    const cluster = [c]
    const rest = itemPoints.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= SHRINE_MAX_M)
    let grew = true
    while (grew) {
      grew = false
      for (let i = rest.length - 1; i >= 0; i--) {
        const p = rest[i]
        if (cluster.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= SHRINE_LINK_M)) {
          cluster.push(p)
          rest.splice(i, 1)
          grew = true
        }
      }
    }
    const pts = [...circle(c[0], c[1], REST_MIN_RADIUS_M, 16)]
    for (const p of cluster) pts.push(...circle(p[0], p[1], REST_BUFFER_M, 12))
    restZones.push({ source: 'approx-hull', polygon: convexHull(pts), itemCount: cluster.length - 1 })
  }
  // 境内の外にある小さな祠は、半径 SMALL_SHRINE_RADIUS_M の円で囲む
  for (const w of data.ways.values()) {
    if (w.tags.historic !== 'wayside_shrine') continue
    const pts = g.wayPoints(w)
    if (!pts.length) continue
    const c = centroid(pts)
    if (!inBounds(c) || restZones.some((z) => pointInPolygon(c, z.polygon))) continue
    restZones.push({ source: 'small-shrine', polygon: circle(c[0], c[1], SMALL_SHRINE_RADIUS_M, 12) })
  }
  for (const n of data.nodes.values()) {
    if (n.tags.historic !== 'wayside_shrine') continue
    const c = g.local(n)
    if (!inBounds(c) || restZones.some((z) => pointInPolygon(c, z.polygon))) continue
    restZones.push({ source: 'small-shrine', polygon: circle(c[0], c[1], SMALL_SHRINE_RADIUS_M, 12) })
  }
  const inRest = (p) => restZones.some((z) => pointInPolygon(p, z.polygon))
  const restPolys = restZones.map((z) => z.polygon)
  /** 公道のうち、お休みの範囲に入る区間（手で範囲を直すときの手がかり） */
  const publicRoadsInRest = []

  // ----- 建物 -----
  const buildings = []
  for (const a of g.areas) {
    const t = a.tags
    if (!t.building || t.building === 'no') continue
    const c = centroid(a.outer)
    if (!inBounds(c)) continue
    stats.buildingsInBounds++
    inc(stats.buildingValues, t.building)
    const levels = num(t['building:levels'])
    const heightM = num(t.height)
    const roofShape = t['roof:shape']
    if (levels !== undefined) stats.buildingsWithLevels++
    if (roofShape) stats.buildingsWithRoofShape++
    if (heightM !== undefined) stats.buildingsWithHeight++
    // 境内の建物（社殿・社務所など）は作り込まない（霧の中にする）ので出力しない
    if (inRest(c) || t.historic === 'wayside_shrine' || t.building === 'shrine' || t.building === 'temple') {
      stats.buildingsHiddenInRestZones++
      continue
    }
    // 1頂点でも境内に入る（辺が境界をまたぐ）建物も、境内のものかもしれないので出さない
    if (restPolys.some((rp) => polygonsTouch(a.outer, rp))) {
      stats.buildingsTouchingRestZones++
      continue
    }
    const b = { kind: t.building, polygon: round2(a.outer), areaM2: Math.round(area(a.outer)) }
    if (levels !== undefined) b.levels = levels
    if (roofShape) b.roofShape = roofShape
    if (heightM !== undefined) b.heightM = heightM
    if (t['roof:levels']) b.roofLevels = num(t['roof:levels'])
    buildings.push(b)
  }

  // ----- 道路 -----
  const roads = []
  for (const w of data.ways.values()) {
    const t = w.tags
    if (!t.highway || ['proposed', 'construction', 'platform', 'corridor', 'elevator'].includes(t.highway)) continue
    if (t.area === 'yes') continue
    const pts = g.wayPoints(w)
    // 範囲で切ったあと、お休みの範囲の境界でも切り分ける（境内の中の区間には印を付け、描かない・歩かせない）
    for (const run of clipPolyline(pts, RECT).flatMap((piece) => splitPolylineByPolygons(piece, restPolys))) {
      const piece = run.points
      const len = polylineLength(piece)
      if (len < 0.5) continue
      const road = { kind: t.highway, widthM: roadWidth(t), points: round2(piece) }
      const sw = sidewalkOf(t)
      if (sw) road.sidewalk = sw
      if (t.footway) road.footway = t.footway
      if (t.service) road.service = t.service
      if (t.bridge && t.bridge !== 'no') road.bridge = true
      if (t.tunnel && t.tunnel !== 'no') road.tunnel = t.tunnel
      if (t.layer) road.layer = num(t.layer)
      if (t.surface) road.surface = t.surface
      if (run.inside) {
        road.inRestZone = true
        if (PUBLIC_ROAD.has(t.highway)) {
          const c = centroid(piece)
          publicRoadsInRest.push({ kind: t.highway, osm: `way/${w.id}`, lengthM: Math.round(len), at: [r1(c[0]), r1(c[1])] })
        }
      }
      roads.push(road)
      inc(stats.roadsByKind, t.highway)
      inc(stats.roadLengthMByKind, t.highway, Math.round(len))
      if (sw) stats.roadsWithSidewalkTag++
      if (t.footway === 'sidewalk') stats.footwaySidewalkWays++
    }
  }

  // ----- 鉄道 -----
  const railLines = []
  for (const w of data.ways.values()) {
    const t = w.tags
    if (!['rail', 'light_rail', 'tram', 'narrow_gauge'].includes(t.railway)) continue
    for (const piece of clipPolyline(g.wayPoints(w), RECT)) {
      const line = { kind: t.railway, points: round2(piece) }
      if (t.bridge && t.bridge !== 'no') line.bridge = true
      if (t.tunnel && t.tunnel !== 'no') line.tunnel = true
      if (t.electrified && t.electrified !== 'no') line.electrified = true
      if (t.operator) line.operator = t.operator
      railLines.push(line)
      stats.railLines++
    }
  }
  const stations = []
  for (const n of data.nodes.values()) {
    const t = n.tags
    if (!(t.railway === 'station' || t.railway === 'halt')) continue
    const p = g.local(n)
    if (!inRect(p, expandRect(RECT, STATION_SEARCH_MARGIN_M))) continue
    stations.push({
      // 駅名は出さない（社寺の名と同じ駅名があるため。PO の了承後に、地名の駅だけ足す）
      id: `station-${stations.length + 1}`,
      kind: t.railway,
      x: r1(p[0]),
      z: r1(p[1]),
      lat: n.lat,
      lon: n.lon,
      distanceM: Math.round(distanceM(ORIGIN, n)),
      inBounds: inBounds(p),
    })
  }
  // 駅のホーム（面）。名前は持たない。箱庭では低い台として描く
  const platforms = []
  for (const w of data.ways.values()) {
    const t = w.tags
    if (t.railway !== 'platform' && t.public_transport !== 'platform') continue
    if (!g.isClosed(w) || t.highway) continue
    const clipped = clipPolygon(simplifyRing(g.wayPoints(w)), RECT)
    if (clipped.length < 3 || area(clipped) < 4) continue
    platforms.push({ polygon: round2(simplifyRing(clipped)), areaM2: Math.round(area(clipped)) })
  }
  const crossings = []
  for (const n of data.nodes.values()) {
    if (n.tags.railway !== 'level_crossing' && n.tags.railway !== 'crossing') continue
    const p = g.local(n)
    if (inBounds(p)) crossings.push({ x: r1(p[0]), z: r1(p[1]) })
  }

  // ----- 水 -----
  const waterLines = []
  for (const w of data.ways.values()) {
    const t = w.tags
    if (!['river', 'canal', 'stream', 'ditch', 'drain'].includes(t.waterway)) continue
    for (const run of clipPolyline(g.wayPoints(w), RECT).flatMap((piece) => splitPolylineByPolygons(piece, restPolys))) {
      const piece = run.points
      if (polylineLength(piece) < 0.5) continue
      const line = { kind: t.waterway, widthM: num(t.width) ?? WATER_LINE_WIDTH[t.waterway], points: round2(piece) }
      if (t.tunnel && t.tunnel !== 'no') line.tunnel = t.tunnel
      if (t.layer) line.layer = num(t.layer)
      if (run.inside) line.inRestZone = true
      waterLines.push(line)
      inc(stats.waterLinesByKind, t.waterway)
    }
  }
  const waterAreas = []
  for (const a of g.areas) {
    const t = a.tags
    const isWater =
      t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin'
    if (!isWater) continue
    const clipped = clipPolygon(a.outer, RECT)
    if (clipped.length < 3 || area(clipped) < 1) continue
    const wa = { kind: t.water ?? t.waterway ?? t.landuse ?? 'water', polygon: round2(simplifyRing(clipped)) }
    const holes = a.inners.map((r) => clipPolygon(r, RECT)).filter((r) => r.length >= 3 && area(r) >= 1)
    if (holes.length) wa.holes = holes.map((r) => round2(simplifyRing(r)))
    // 半分以上が境内にあれば境内のもの（一部だけかかる面は、描く側で境内の部分を除く）
    if (fractionInside(clipped, restPolys) > 0.5) wa.inRestZone = true
    waterAreas.push(wa)
    stats.waterAreas++
  }

  // ----- 土地利用 -----
  const landuse = []
  const landKind = (t) => {
    if (t.landuse && !['religious', 'reservoir', 'basin'].includes(t.landuse)) return t.landuse
    if (t.natural && ['wood', 'scrub', 'grassland', 'heath', 'bare_rock', 'sand', 'shingle', 'wetland'].includes(t.natural)) return t.natural
    if (t.leisure && ['park', 'garden', 'pitch', 'playground', 'sports_centre'].includes(t.leisure)) return t.leisure
    if (t.amenity === 'parking') return 'parking'
    return null
  }
  for (const a of g.areas) {
    const kind = landKind(a.tags)
    if (!kind) continue
    const clipped = clipPolygon(a.outer, RECT)
    if (clipped.length < 3 || area(clipped) < 1) continue
    const lu = { kind, polygon: round2(simplifyRing(clipped)) }
    if (fractionInside(clipped, restPolys) > 0.5) lu.inRestZone = true
    landuse.push(lu)
    inc(stats.landuseByKind, kind)
  }

  // ----- 妖怪を置く地点の候補（公道・お休みの範囲から離す・家から離す） -----
  const buildingPolys = buildings.map((b) => b.polygon)
  const samples = []
  for (const r of roads) {
    if (!PUBLIC_ROAD.has(r.kind) || r.inRestZone || r.bridge || r.tunnel) continue
    const pts = r.points
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (let d = 0; d < len; d += 5) {
        const t = d / len
        const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
        if (!inBounds(p, 20)) continue
        const restDist = Math.min(...restZones.map((z) => distPointPolygon(p, z.polygon)))
        if (restDist < SPOT_MIN_REST_M) continue
        const bDist = buildingPolys.length ? Math.min(...buildingPolys.map((bp) => distPointPolygon(p, bp))) : 99
        const railDist = railLines.length ? Math.min(...railLines.map((l) => distPointPolyline(p, l.points))) : 99
        if (railDist < 15) continue
        const rank = { primary: 3, secondary: 3, tertiary: 3, unclassified: 2, pedestrian: 2, residential: 1, living_street: 1 }[r.kind] ?? 0
        const score = (r.sidewalk && r.sidewalk !== 'no' ? 50 : 0) + rank * 10 + Math.min(bDist, 30) + Math.min(restDist - SPOT_MIN_REST_M, 30) * 0.3
        samples.push({ p, score, roadKind: r.kind, sidewalkTag: r.sidewalk ?? null, restDist, bDist })
      }
    }
  }
  samples.sort((a, b) => b.score - a.score)
  const spotCandidates = []
  for (const s of samples) {
    if (spotCandidates.some((c) => Math.hypot(c.x - s.p[0], c.z - s.p[1]) < 90)) continue
    const ll = toLatLon({ x: s.p[0], z: s.p[1] }, ORIGIN)
    spotCandidates.push({
      x: r1(s.p[0]),
      z: r1(s.p[1]),
      lat: +ll.lat.toFixed(7),
      lon: +ll.lon.toFixed(7),
      roadKind: s.roadKind,
      sidewalkTag: s.sidewalkTag,
      distToRestZoneM: Math.round(s.restDist),
      distToBuildingM: Math.round(s.bDist),
    })
    if (spotCandidates.length >= 10) break
  }

  const restOut = restZones.map((z, i) => {
    const poly = round2(simplifyRing(z.polygon))
    return {
      id: `rest-${i + 1}`,
      source: z.source,
      polygon: poly,
      polygonLatLon: poly.map(([x, zz]) => {
        const ll = toLatLon({ x, z: zz }, ORIGIN)
        return [+ll.lat.toFixed(7), +ll.lon.toFixed(7)]
      }),
      areaM2: Math.round(area(z.polygon)),
    }
  })

  return {
    roads,
    rails: { lines: railLines, stations, platforms, levelCrossings: crossings },
    waters: { lines: waterLines, areas: waterAreas },
    buildings,
    restZones: restOut,
    landuse,
    spotCandidates,
    publicRoadsInRest,
    stats,
  }
}

// ---------- 実行 ----------
const { data, source } = await loadData()
const out = build(data)
const result = {
  meta: {
    region: REGION_ID,
    generatedAt: new Date().toISOString(),
    source,
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL-1.0（https://www.openstreetmap.org/copyright）。このファイルは OSM の Derivative Database として ODbL で扱う',
    generator: 'scripts/fetch-osm.mjs',
    origin: ORIGIN,
    originNote: `OSM node ${ORIGIN_OSM_NODE}（社殿付近の点）`,
    bounds: BOUNDS,
    rect: RECT,
    rectNote: '箱庭の範囲（ローカル座標 m）。x は minX〜maxX、z は minZ〜maxZ',
    coordinates: 'ローカル座標 [x, z]（m）。x = 東, z = 南。src/core/geo.ts の toLocal と同じ式',
    notes: [
      '名前（社寺・家・店・駅）は持たない。駅は番号（id）だけ（駅名に社寺の名と同じものがあるため。PO の了承待ち）',
      'restZones の source: osm-area = OSM の面、approx-hull = 社殿の点のまわりの社寺のもの（鳥居・灯籠・案内板など）をつないだ凸包に余白を足した近似、small-shrine = 小さな祠を囲む円',
      '境内の建物は buildings に入れない（霧の中にする）。一部だけ境内にかかる建物も入れない',
      '道・水の線は、お休みの範囲の境界で切り分け、中の区間に inRestZone を付けた。面（水・土地利用）は半分以上が中にあれば inRestZone',
      'publicRoadsInRestZones は、お休みの範囲（近似）に入ってしまう公道の区間。範囲は近似なので、了承のあと手で境内の形を直す前提',
      'rails.platforms は駅のホームの面（名前なし）。rails.stations は駅の位置と番号（名前なし）',
      'spotCandidates は機械的に選んだ候補。歩道の有無と「2分立ち止まっても邪魔にならないか」は現地で確かめること',
    ],
    publicRoadsInRestZones: out.publicRoadsInRest,
    stats: out.stats,
  },
  roads: out.roads,
  rails: out.rails,
  waters: out.waters,
  buildings: out.buildings,
  restZones: out.restZones,
  landuse: out.landuse,
  spotCandidates: out.spotCandidates,
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(result) + '\n')
const kb = (Buffer.byteLength(JSON.stringify(result)) / 1024).toFixed(1)
console.log(`書いた: ${OUT}（${kb} KB）`)
console.log(JSON.stringify(out.stats, null, 2))
console.log('restZones:', out.restZones.map((z) => `${z.id} ${z.source} ${z.areaM2}m2`).join(', '))
console.log('spotCandidates:', JSON.stringify(out.spotCandidates, null, 1))
console.log('stations:', JSON.stringify(out.rails.stations))
