// お休みの範囲（境内など）の出入り（02 F-64、04 §3.1）。描画に依存しない。
//
// - 範囲の多角形の中か、縁から enterM 以内に来たら「お休み」。出るのは縁から exitM より離れたとき（GPS のずれで出入りを繰り返さないように）。
// - 語りの地点は境内から 50m 以上離してあるので（04 §3.1）、地点で立ち止まっているときに誤って「お休み」になることはない。

import type { LocalXZ } from '../geo'

export function pointInPolygon(p: LocalXZ, poly: readonly LocalXZ[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function distToSegment(p: LocalXZ, a: LocalXZ, b: LocalXZ): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

/** 多角形までの距離（m）。中なら 0 */
export function distanceToPolygon(p: LocalXZ, poly: readonly LocalXZ[]): number {
  if (poly.length === 0) return Infinity
  if (pointInPolygon(p, poly)) return 0
  let d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]))
  return d
}

export interface RestTuning {
  /** 縁からこの距離以内に入ったら「お休み」（m） */
  enterM: number
  /** 「お休み」から出るのは、縁からこの距離より離れたとき（m） */
  exitM: number
}

export const REST_TUNING: RestTuning = { enterM: 10, exitM: 22 }

export interface RestZoneLocal {
  id: string
  polygon: LocalXZ[]
}

/** お休みの範囲の出入りを、ゆとり（ヒステリシス）をつけて見る */
export class RestWatcher {
  /** いま中にいる範囲の id（いなければ null） */
  inside: string | null = null

  constructor(
    private readonly zones: readonly RestZoneLocal[],
    private readonly tune: RestTuning = REST_TUNING,
  ) {}

  /** 位置が来るたびに呼ぶ。入った・出たときに 'enter' / 'exit' を返す */
  update(p: LocalXZ): 'enter' | 'exit' | null {
    let nearest: { id: string; d: number } | null = null
    for (const z of this.zones) {
      const d = distanceToPolygon(p, z.polygon)
      if (!nearest || d < nearest.d) nearest = { id: z.id, d }
    }
    if (!nearest) return null
    if (this.inside === null) {
      if (nearest.d <= this.tune.enterM) {
        this.inside = nearest.id
        return 'enter'
      }
      return null
    }
    const cur = this.zones.find((z) => z.id === this.inside)
    const d = cur ? distanceToPolygon(p, cur.polygon) : Infinity
    if (d > this.tune.exitM) {
      this.inside = null
      return 'exit'
    }
    return null
  }

  reset(): void {
    this.inside = null
  }
}
