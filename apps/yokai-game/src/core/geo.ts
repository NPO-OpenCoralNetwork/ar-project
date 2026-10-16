/** 緯度経度（WGS84） */
export interface LatLon {
  lat: number
  lon: number
}

/** 箱庭のローカル座標（メートル）。x = 東、z = 南（three.js の右手系で y が上） */
export interface LocalXZ {
  x: number
  z: number
}

const EARTH_RADIUS_M = 6_378_137

/**
 * 原点まわりの狭い範囲（数km以内）で、緯度経度をメートルの平面座標に写す（正距円筒近似）。
 * 箱庭は数百m四方なので、この近似の誤差は無視できる。
 */
export function toLocal(p: LatLon, origin: LatLon): LocalXZ {
  const rad = Math.PI / 180
  const x = (p.lon - origin.lon) * rad * EARTH_RADIUS_M * Math.cos(origin.lat * rad)
  const north = (p.lat - origin.lat) * rad * EARTH_RADIUS_M
  return { x, z: -north }
}

export function toLatLon(p: LocalXZ, origin: LatLon): LatLon {
  const rad = Math.PI / 180
  const lat = origin.lat + -p.z / EARTH_RADIUS_M / rad
  const lon = origin.lon + p.x / (EARTH_RADIUS_M * Math.cos(origin.lat * rad)) / rad
  return { lat, lon }
}

/** 2点間の距離（メートル、ハーバーサイン） */
export function distanceM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}
