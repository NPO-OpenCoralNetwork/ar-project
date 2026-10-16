#!/usr/bin/env node
// 箱庭「岩峅寺」の地形（高さの格子）と、立山連峰の稜線（書き割り用）を国土地理院の標高タイルから作る。依存なし。
//
//   node scripts/fetch-dem.mjs [--cache-dir <dir>] [--offline] [--grid 65] [--skip-skyline]
//
//   --cache-dir   取得したタイル（PNG）を置く場所。既定は OS の一時ディレクトリ/yokai-game-dem
//   --offline     取得せず、キャッシュだけで作る
//   --grid        格子の点の数（一辺）。既定 65（400m / 64 = 6.25m 間隔）
//   --skip-skyline 稜線（src/data/tateyama-skyline.json）を作らない
//
// 出力:
//   src/data/iwakuraji-dem.json     原点の標高を 0 とした相対の高さ（m）の格子
//   src/data/tateyama-skyline.json  原点から東向き（方位 60°〜140°、1°刻み）の稜線の仰角と距離
//
// 出典表示（画面に常に出す）:「地理院タイル（標高）を加工して作成」

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toLatLon } from './lib/geo.mjs'
import { createDemSource, DEM_LAYERS } from './lib/gsi-dem.mjs'
import { ORIGIN, HALF_SIZE_M, BOUNDS, REGION_ID } from './lib/region.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const args = process.argv.slice(2)
const argVal = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const CACHE = resolve(argVal('--cache-dir', join(tmpdir(), 'yokai-game-dem')))
const OFFLINE = args.includes('--offline')
const N = Number(argVal('--grid', '65'))
const SKIP_SKYLINE = args.includes('--skip-skyline')
const OUT_DEM = join(APP, 'src/data/iwakuraji-dem.json')
const OUT_SKY = join(APP, 'src/data/tateyama-skyline.json')

const ATTRIBUTION = '地理院タイル（標高）を加工して作成'
const DEM_SOURCE_URL = 'https://maps.gsi.go.jp/development/ichiran.html'
const r2 = (v) => Math.round(v * 100) / 100

// ================= 箱庭の高さの格子 =================
const dem5a = createDemSource('dem5a', 15, CACHE, { offline: OFFLINE })
const dem10b = createDemSource('dem10b', 14, CACHE, { offline: OFFLINE })

const step = (HALF_SIZE_M * 2) / (N - 1)
/** @type {{lat:number, lon:number, x:number, z:number}[]} */
const pts = []
for (let row = 0; row < N; row++) {
  for (let col = 0; col < N; col++) {
    const x = -HALF_SIZE_M + col * step
    const z = -HALF_SIZE_M + row * step
    pts.push({ ...toLatLon({ x, z }, ORIGIN), x, z })
  }
}
console.log(`DEM5A z15 / DEM10B z14 のタイルを取得（キャッシュ: ${CACHE}）`)
await dem5a.prefetch(pts)
await dem10b.prefetch(pts)

const abs = new Float64Array(pts.length)
/** DEM5A がない点の DEM10B の値（最後の手段。ふつうは使わない） */
const b10 = new Float64Array(pts.length).fill(NaN)
const src = new Array(pts.length)
let count5a = 0
let count10b = 0
let countFill = 0
for (let i = 0; i < pts.length; i++) {
  const { lat, lon } = pts[i]
  const h = await dem5a.heightAt(lat, lon)
  if (!Number.isNaN(h)) {
    src[i] = 'a'
    count5a++
  } else {
    // DEM5A が欠けるのは、ほとんどが水面（川の流れ・用水・ため池）。
    // DEM10B には河岸段丘の崖が表れず、水面のまわりより 3〜13m 高くなる（土手のように盛り上がる）ので、
    // ここでは使わず、まわりの DEM5A から埋める。
    b10[i] = await dem10b.heightAt(lat, lon)
    src[i] = '-'
  }
  abs[i] = h
}
// DEM5A がない点は、まわりの有効な点から埋める（繰り返し）。水面なので、まわりの低い値に寄せる
for (let pass = 0; pass < 200; pass++) {
  let left = 0
  const next = Float64Array.from(abs)
  for (let i = 0; i < pts.length; i++) {
    if (!Number.isNaN(abs[i])) continue
    const row = Math.floor(i / N)
    const col = i % N
    let s = 0
    let k = 0
    let lo = Infinity
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const r = row + dr
      const c = col + dc
      if (r < 0 || r >= N || c < 0 || c >= N) continue
      const v = abs[r * N + c]
      if (!Number.isNaN(v)) {
        s += v
        k++
        lo = Math.min(lo, v)
      }
    }
    if (k) {
      next[i] = 0.6 * lo + 0.4 * (s / k)
      src[i] = 'f'
      countFill++
    } else left++
  }
  abs.set(next)
  if (!left) break
}
// それでも埋まらない点（DEM5A がまったくない場合）だけ、DEM10B を使う
for (let i = 0; i < pts.length; i++) {
  if (!Number.isNaN(abs[i]) || Number.isNaN(b10[i])) continue
  abs[i] = b10[i]
  src[i] = 'b'
  count10b++
}
// 確かめ: 埋めた点と、となりの DEM5A の点の平均との差
const fillCheck = []
for (let i = 0; i < pts.length; i++) {
  if (src[i] === 'a') continue
  const row = Math.floor(i / N)
  const col = i % N
  let s = 0
  let k = 0
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const r = row + dr
    const c = col + dc
    if (r < 0 || r >= N || c < 0 || c >= N || src[r * N + c] !== 'a') continue
    s += abs[r * N + c]
    k++
  }
  if (k) fillCheck.push(abs[i] - s / k)
}
fillCheck.sort((a, b) => a - b)
const fillStats = fillCheck.length
  ? {
      cellsNextToDem5a: fillCheck.length,
      minDiffM: r2(fillCheck[0]),
      medianDiffM: r2(fillCheck[Math.floor(fillCheck.length / 2)]),
      maxDiffM: r2(fillCheck[fillCheck.length - 1]),
      over1mCount: fillCheck.filter((d) => Math.abs(d) > 1).length,
    }
  : null
console.log('DEM5A がない点を埋めた結果（となりの DEM5A との差）:', JSON.stringify(fillStats))
if (fillStats && fillStats.maxDiffM > 1) console.warn('注意: 埋めた点が、となりの DEM5A より 1m 以上高い所がある')

let originAbs = await dem5a.heightAt(ORIGIN.lat, ORIGIN.lon)
let originSource = 'dem5a'
if (Number.isNaN(originAbs)) {
  originAbs = await dem10b.heightAt(ORIGIN.lat, ORIGIN.lon)
  originSource = 'dem10b'
}
const rel = Array.from(abs, (h) => r2(h - originAbs))
let min = Infinity
let max = -Infinity
for (const h of abs) {
  if (h < min) min = h
  if (h > max) max = h
}
// 原点の 50m 以内の起伏（足元の地形の手がかり）
let minNear = Infinity
let maxNear = -Infinity
pts.forEach((p, i) => {
  if (Math.hypot(p.x, p.z) <= 50) {
    minNear = Math.min(minNear, abs[i])
    maxNear = Math.max(maxNear, abs[i])
  }
})

const demOut = {
  meta: {
    region: REGION_ID,
    generatedAt: new Date().toISOString(),
    attribution: ATTRIBUTION,
    sourceUrl: DEM_SOURCE_URL,
    sources: [DEM_LAYERS.dem5a.label + ' z15', DEM_LAYERS.dem10b.label + ' z14（DEM5A がまったくない場合だけ使う）'],
    generator: 'scripts/fetch-dem.mjs',
    origin: ORIGIN,
    originElevationM: r2(originAbs),
    originElevationSource: originSource,
    bounds: BOUNDS,
    note: 'heights は原点の標高を 0 とした相対の高さ（m）。row 0 が北端（z = -half）、col 0 が西端（x = -half）。heights[row * cols + col]。sourceMask: a = DEM5A, b = DEM10B, f = まわりの DEM5A から補間（水面など。低い方に寄せる）',
    stats: {
      cells: pts.length,
      dem5aCells: count5a,
      dem10bCells: count10b,
      filledCells: countFill,
      fillCheck: fillStats,
      minElevationM: r2(min),
      maxElevationM: r2(max),
      reliefM: r2(max - min),
      reliefWithin50mOfOriginM: r2(maxNear - minNear),
      tiles: { dem5a: dem5a.stats, dem10b: dem10b.stats },
    },
  },
  grid: { cols: N, rows: N, x0: -HALF_SIZE_M, z0: -HALF_SIZE_M, stepM: r2(step) },
  heights: rel,
  sourceMask: src.join(''),
}
mkdirSync(dirname(OUT_DEM), { recursive: true })
writeFileSync(OUT_DEM, JSON.stringify(demOut) + '\n')
console.log(`書いた: ${OUT_DEM}（${(Buffer.byteLength(JSON.stringify(demOut)) / 1024).toFixed(1)} KB）`)
console.log(JSON.stringify(demOut.meta.stats, null, 2), `原点の標高 ${r2(originAbs)} m（${originSource}）`)

// ================= 立山連峰の稜線 =================
if (!SKIP_SKYLINE) {
  const AZ_FROM = 60
  const AZ_TO = 140
  const D_MIN = 2000
  const D_MAX = 45000
  const D_STEP = 50
  const EYE_M = 1.6
  const R = 6_371_000
  /** 大気の屈折係数（地理院・測量でよく使う 0.13） */
  const K = 0.13
  const BANDS = [
    [2000, 8000],
    [8000, 20000],
    [20000, 45000],
  ]
  const ZOOM = 12
  const dem = createDemSource('dem10b', ZOOM, CACHE, { offline: OFFLINE })
  const rad = Math.PI / 180
  /** 球面上で、方位 az（度、北から時計回り）へ d m 進んだ点 */
  const dest = (az, d) => {
    const φ1 = ORIGIN.lat * rad
    const λ1 = ORIGIN.lon * rad
    const δ = d / R
    const θ = az * rad
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
    return { lat: φ2 / rad, lon: λ2 / rad }
  }
  const rays = []
  for (let az = AZ_FROM; az <= AZ_TO; az++) {
    const samples = []
    for (let d = D_MIN; d <= D_MAX; d += D_STEP) samples.push({ d, ...dest(az, d) })
    rays.push({ az, samples })
  }
  console.log(`DEM10B z${ZOOM} のタイルを取得`)
  const nTiles = await dem.prefetch(rays.flatMap((r) => [r.samples[0], ...r.samples.filter((_, i) => i % 20 === 0), r.samples.at(-1)]))
  // 間引いた点だけで先読みしたので、残りは heightAt の中で取る
  const eye = originAbs + EYE_M
  const skyline = []
  const bands = BANDS.map(() => [])
  for (const { az, samples } of rays) {
    let best = { angle: -90, d: 0, h: 0, lat: 0, lon: 0 }
    const bandBest = BANDS.map(() => ({ angle: -90, d: 0, h: 0 }))
    for (const s of samples) {
      const h = await dem.heightAt(s.lat, s.lon)
      if (Number.isNaN(h)) continue
      const drop = ((1 - K) * s.d * s.d) / (2 * R)
      const angle = Math.atan2(h - eye - drop, s.d) / rad
      if (angle > best.angle) best = { angle, d: s.d, h, lat: s.lat, lon: s.lon }
      BANDS.forEach(([a, b], k) => {
        if (s.d >= a && s.d < b && angle > bandBest[k].angle) bandBest[k] = { angle, d: s.d, h }
      })
    }
    skyline.push({
      azimuthDeg: az,
      elevationDeg: Math.round(best.angle * 1000) / 1000,
      distanceM: best.d,
      heightM: Math.round(best.h),
      lat: +best.lat.toFixed(5),
      lon: +best.lon.toFixed(5),
    })
    bandBest.forEach((b, k) =>
      bands[k].push({ azimuthDeg: az, elevationDeg: Math.round(b.angle * 1000) / 1000, distanceM: b.d, heightM: Math.round(b.h) }),
    )
  }
  // 仰角の山（極大）を拾う。名前は付けない（同定は人が地図で行う）
  const peaks = skyline
    .filter((s, i) => i > 0 && i < skyline.length - 1 && s.elevationDeg >= skyline[i - 1].elevationDeg && s.elevationDeg >= skyline[i + 1].elevationDeg)
    .sort((a, b) => b.elevationDeg - a.elevationDeg)
    .slice(0, 8)
  const skyOut = {
    meta: {
      generatedAt: new Date().toISOString(),
      attribution: ATTRIBUTION,
      sourceUrl: DEM_SOURCE_URL,
      source: `${DEM_LAYERS.dem10b.label} z${ZOOM}（1ピクセル 約31m）`,
      generator: 'scripts/fetch-dem.mjs',
      observer: { ...ORIGIN, groundElevationM: r2(originAbs), eyeHeightM: EYE_M },
      method: `方位 ${AZ_FROM}°〜${AZ_TO}°（北から時計回り）を 1°刻み、距離 ${D_MIN / 1000}〜${D_MAX / 1000}km を ${D_STEP}m 刻みで調べ、見かけの仰角が最大の点を稜線とした。地球の丸みと大気の屈折（k=${K}）を補正。${D_MIN / 1000}km より手前の起伏は含まない`,
      note: 'skyline は全距離での稜線。bands は距離帯ごとの稜線（切り絵の書き割りを奥行き別の層にするため）',
      tilesUsed: dem.stats,
      prefetchedTiles: nTiles,
    },
    skyline,
    bands: BANDS.map(([a, b], k) => ({ fromM: a, toM: b, ridge: bands[k] })),
    peaks,
  }
  writeFileSync(OUT_SKY, JSON.stringify(skyOut) + '\n')
  console.log(`書いた: ${OUT_SKY}（${(Buffer.byteLength(JSON.stringify(skyOut)) / 1024).toFixed(1)} KB）`)
  console.log('仰角の大きい山:', peaks.map((p) => `${p.azimuthDeg}° ${p.elevationDeg}° ${p.heightM}m ${(p.distanceM / 1000).toFixed(1)}km`).join(' / '))
}
