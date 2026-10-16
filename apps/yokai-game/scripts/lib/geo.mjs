// src/core/geo.ts と同じ式（正距円筒近似）。x = 東, z = 南, 単位 m。
// スクリプトは Node だけで動かしたいので、TypeScript を読み込まずに式を写している。
// 式を変えるときは src/core/geo.ts と必ず同時に変えること。

export const EARTH_RADIUS_M = 6_378_137
const RAD = Math.PI / 180

/** @param {{lat:number, lon:number}} p @param {{lat:number, lon:number}} origin */
export function toLocal(p, origin) {
  const x = (p.lon - origin.lon) * RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD)
  const north = (p.lat - origin.lat) * RAD * EARTH_RADIUS_M
  return { x, z: -north }
}

/** @param {{x:number, z:number}} p @param {{lat:number, lon:number}} origin */
export function toLatLon(p, origin) {
  const lat = origin.lat + -p.z / EARTH_RADIUS_M / RAD
  const lon = origin.lon + p.x / (EARTH_RADIUS_M * Math.cos(origin.lat * RAD)) / RAD
  return { lat, lon }
}

/** 2点間の距離（m、ハーバーサイン） */
export function distanceM(a, b) {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** 原点から東西南北に halfM の矩形（緯度経度） */
export function boundsAround(origin, halfM) {
  const ne = toLatLon({ x: halfM, z: -halfM }, origin)
  const sw = toLatLon({ x: -halfM, z: halfM }, origin)
  return { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon }
}

/** 0.1 m に丸める */
export const r1 = (v) => Math.round(v * 10) / 10
