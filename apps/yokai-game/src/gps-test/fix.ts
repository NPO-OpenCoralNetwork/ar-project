// 端末（または模擬）の位置を、記録用の Fix に直す（純粋な関数）。
import { toLocal, type LatLon } from '../core/geo'
import type { Fix } from './types'

export interface RawPosition {
  lat: number
  lon: number
  acc: number
  spd: number | null
  hdg: number | null
  /** 端末の測位時刻（ms） */
  pt: number
}

function finiteOrNull(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) || v < 0 ? null : v
}

/** 受け取った時刻 t で Fix を作る。速さの計算は端末の測位時刻の差を使う（受け取りの揺れを避ける） */
export function makeFix(raw: RawPosition, t: number, origin: LatLon, prev: Fix | null): Fix {
  const { x, z } = toLocal({ lat: raw.lat, lon: raw.lon }, origin)
  let calcSpd: number | null = null
  if (prev) {
    const dt = (raw.pt - prev.pt) / 1000 || (t - prev.t) / 1000
    if (dt > 0) calcSpd = Math.hypot(x - prev.x, z - prev.z) / dt
  }
  return {
    t,
    pt: raw.pt,
    lat: raw.lat,
    lon: raw.lon,
    acc: raw.acc,
    spd: finiteOrNull(raw.spd),
    hdg: finiteOrNull(raw.hdg),
    x,
    z,
    calcSpd,
  }
}
