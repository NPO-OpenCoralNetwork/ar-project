// 歩ける場所の判定。範囲の外・建物の中・お休みの範囲・水の中・線路の上には入れない（簡単な押し戻し）。
// 道の上なら、用水や池の上でも歩ける（橋・暗渠の代わり）。線路は踏切のまわりだけ渡れる。
// 足元の高さは、地面と、道の帯（橋なら橋板）の高い方。

import { clampToRect, type FieldData, type FieldRect, inRect } from './data'
import { bboxOf, type Box2, inBox, nearestOnPolyline, nearestOnRing, pointInPolygon, type XZ } from './geom2d'
import type { HeightField } from './field/heightfield'

interface PolyObstacle {
  poly: XZ[]
  box: Box2
  kind: 'building' | 'rest' | 'water'
}

interface LineObstacle {
  line: XZ[]
  halfWidth: number
  box: Box2
}

const RAIL_HALF_WIDTH = 1.5
/** 踏切の中心からこの距離（m）までは線路を渡れる */
const CROSSING_RADIUS = 6

export interface ResolveResult {
  x: number
  z: number
  hitRest: boolean
  hitEdge: boolean
}

export class Walkability {
  readonly rect: FieldRect
  private readonly polys: PolyObstacle[] = []
  private readonly waterLines: LineObstacle[] = []
  private readonly roads: LineObstacle[] = []
  private readonly rails: LineObstacle[] = []
  private readonly crossings: XZ[]
  private surface: ((x: number, z: number, pad: number) => number | null) | null = null

  constructor(
    data: FieldData,
    private readonly hf: HeightField,
  ) {
    this.rect = data.rect
    for (const b of data.buildings) this.polys.push({ poly: b.polygon, box: bboxOf(b.polygon), kind: 'building' })
    // 駅のホームには上がらない（線路の側なので）
    for (const p of data.platforms) this.polys.push({ poly: p, box: bboxOf(p), kind: 'building' })
    for (const z of data.restZones) this.polys.push({ poly: z.polygon, box: bboxOf(z.polygon), kind: 'rest' })
    for (const a of data.waterAreas) {
      if (a.kind === 'river') continue // 河原は歩ける（川の流れは waterLines で止める）
      this.polys.push({ poly: a.polygon, box: bboxOf(a.polygon), kind: 'water' })
    }
    for (const w of data.waterLines) {
      if (w.tunnel || w.inRestZone) continue
      this.waterLines.push({ line: w.points, halfWidth: w.widthM / 2, box: bboxOf(w.points, w.widthM) })
    }
    for (const r of data.roads) {
      if (r.inRestZone) continue
      this.roads.push({ line: r.points, halfWidth: r.widthM / 2 + 0.4, box: bboxOf(r.points, r.widthM) })
    }
    // 線路（幅 3m ほど）。線路沿いを歩かせたり、鉄橋の下をくぐらせたりしない（05 §5.3）
    for (const r of data.rails) {
      if (r.tunnel) continue
      this.rails.push({ line: r.points, halfWidth: RAIL_HALF_WIDTH, box: bboxOf(r.points, RAIL_HALF_WIDTH * 2) })
    }
    this.crossings = data.railCrossings
  }

  /** 道の帯の面の高さを返す関数をつなぐ（帯を作ったあとで呼ぶ） */
  setSurface(fn: (x: number, z: number, pad: number) => number | null): void {
    this.surface = fn
  }

  /** 足元の高さ（地面か、道の帯・橋板の高い方） */
  groundY(x: number, z: number): number {
    const g = this.hf.heightAt(x, z)
    const s = this.surface?.(x, z, 0) ?? null
    return s === null ? g : Math.max(g, s)
  }

  /** 地面に置く印（足元の影・行き先の印）の高さ。大きさの分だけ帯を太らせて見る */
  decalY(x: number, z: number, pad = 0.8): number {
    const g = this.hf.heightAt(x, z)
    const s = this.surface?.(x, z, pad) ?? null
    return s === null ? g : Math.max(g, s)
  }

  private nearCrossing(x: number, z: number): boolean {
    return this.crossings.some((c) => Math.hypot(c[0] - x, c[1] - z) < CROSSING_RADIUS)
  }

  onRoad(x: number, z: number): boolean {
    for (const r of this.roads) {
      if (inBox(r.box, x, z) && nearestOnPolyline(x, z, r.line).dist <= r.halfWidth) return true
    }
    return false
  }

  isInsideRest(x: number, z: number): boolean {
    return this.polys.some((p) => p.kind === 'rest' && inBox(p.box, x, z) && pointInPolygon(x, z, p.poly))
  }

  /** 歩いてよい点か（押し戻しなしで） */
  isWalkable(x: number, z: number, radius = 0.35): boolean {
    const r = this.resolve(x, z, radius)
    return Math.hypot(r.x - x, r.z - z) < 1e-3
  }

  resolve(x: number, z: number, radius: number): ResolveResult {
    let hitRest = false
    let hitEdge = false
    for (let iter = 0; iter < 3; iter++) {
      if (!inRect(this.rect, x, z, 1)) {
        hitEdge = true
        ;[x, z] = clampToRect(this.rect, x, z, 1)
      }
      let road: boolean | null = null
      const isRoad = () => (road ??= this.onRoad(x, z))
      for (const o of this.polys) {
        if (!inBox(o.box, x, z, radius)) continue
        if (o.kind === 'water' && isRoad()) continue
        const inside = pointInPolygon(x, z, o.poly)
        const n = nearestOnRing(x, z, o.poly)
        if (!inside && n.dist >= radius) continue
        let dx = x - n.x
        let dz = z - n.z
        const d = Math.hypot(dx, dz) || 1e-6
        dx /= d
        dz /= d
        if (inside) {
          dx = -dx
          dz = -dz
        }
        x = n.x + dx * radius
        z = n.z + dz * radius
        if (o.kind === 'rest') hitRest = true
        road = null
      }
      for (const w of this.waterLines) {
        if (!inBox(w.box, x, z, radius)) continue
        const n = nearestOnPolyline(x, z, w.line)
        const lim2 = w.halfWidth + radius
        if (n.dist >= lim2 || isRoad()) continue
        let dx = x - n.x
        let dz = z - n.z
        const d = Math.hypot(dx, dz)
        if (d < 1e-6) {
          dx = 1
          dz = 0
        } else {
          dx /= d
          dz /= d
        }
        x = n.x + dx * lim2
        z = n.z + dz * lim2
        road = null
      }
      for (const w of this.rails) {
        if (!inBox(w.box, x, z, radius)) continue
        const n = nearestOnPolyline(x, z, w.line)
        const lim2 = w.halfWidth + radius
        if (n.dist >= lim2 || this.nearCrossing(x, z)) continue
        let dx = x - n.x
        let dz = z - n.z
        const d = Math.hypot(dx, dz)
        if (d < 1e-6) {
          dx = 1
          dz = 0
        } else {
          dx /= d
          dz /= d
        }
        x = n.x + dx * lim2
        z = n.z + dz * lim2
        road = null
      }
    }
    return { x, z, hitRest, hitEdge }
  }

  /** 近くで歩ける点を探す（はじめの位置を決めるときなど） */
  findWalkableNear(x: number, z: number, maxR = 20): { x: number; z: number } {
    if (this.isWalkable(x, z)) return { x, z }
    for (let r = 1; r <= maxR; r += 1) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        const px = x + Math.cos(a) * r
        const pz = z + Math.sin(a) * r
        if (this.isWalkable(px, pz)) return { x: px, z: pz }
      }
    }
    return { x, z }
  }
}
