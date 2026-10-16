// 箱庭の材料（OSM・標高・稜線・地域パック）を読み込み、ローカル座標（m）の形にそろえる。
// どれもビルド時に取り込む。実行時に外へ取りに行かない（アーティファクトの1ファイル版でも動くように）。

import { toLocal } from '../core/geo'
import type { RegionPack } from '../core/region-pack'
import demJson from '../data/iwakuraji-dem.json'
import osmJson from '../data/iwakuraji-osm.json'
import { iwakurajiPack } from '../data/iwakuraji-pack'
import skylineJson from '../data/tateyama-skyline.json'
import { openRing, type XZ } from './geom2d'

export interface RoadData {
  kind: string
  widthM: number
  points: XZ[]
  bridge?: boolean
  tunnel?: string
  inRestZone?: boolean
}

export interface WaterLine {
  kind: string
  widthM: number
  points: XZ[]
  tunnel?: string
  /** お休みの範囲（境内）の中の区間。描かない */
  inRestZone?: boolean
}

export interface AreaData {
  kind: string
  polygon: XZ[]
  holes?: XZ[][]
  inRestZone?: boolean
}

export interface DemData {
  cols: number
  rows: number
  x0: number
  z0: number
  step: number
  heights: number[]
}

export interface RidgePoint {
  azimuthDeg: number
  elevationDeg: number
}

export interface SkylineData {
  /** 遠い順（奥の層から） */
  bands: { fromM: number; toM: number; ridge: RidgePoint[] }[]
}

export interface SpotLocal {
  id: string
  label: string
  x: number
  z: number
}

export interface FieldData {
  pack: RegionPack
  /** 箱庭の半分の幅（m）。範囲は x, z とも -half〜+half */
  half: number
  roads: RoadData[]
  rails: { points: XZ[]; bridge?: boolean; tunnel?: boolean }[]
  /** 踏切（線路を渡れる所） */
  railCrossings: XZ[]
  waterLines: WaterLine[]
  waterAreas: AreaData[]
  buildings: { polygon: XZ[]; areaM2: number }[]
  landuse: AreaData[]
  restZones: { id: string; polygon: XZ[] }[]
  spots: SpotLocal[]
  dem: DemData
  skyline: SkylineData | null
  attributions: string[]
}

type Pt = number[]
const xz = (p: Pt): XZ => [p[0], p[1]]
const ring = (pts: Pt[]): XZ[] => openRing(pts.map(xz))

export function loadFieldData(): FieldData {
  const pack = iwakurajiPack
  const osm = osmJson
  const origin = pack.origin

  const restZones = pack.restZones.map((z) => ({
    id: z.id,
    polygon: openRing(
      z.polygon.map((p) => {
        const l = toLocal(p, origin)
        return [l.x, l.z] as XZ
      }),
    ),
  }))

  const spots = pack.spots.map((s) => {
    const l = toLocal(s.position, origin)
    return { id: s.id, label: s.label, x: l.x, z: l.z }
  })

  const roads: RoadData[] = osm.roads.map((r) => {
    const rr = r as typeof r & { bridge?: boolean; tunnel?: string; inRestZone?: boolean }
    return {
      kind: r.kind,
      widthM: r.widthM,
      points: r.points.map(xz),
      bridge: rr.bridge,
      tunnel: rr.tunnel,
      inRestZone: rr.inRestZone,
    }
  })

  const rails = osm.rails.lines.map((l) => {
    const ll = l as typeof l & { bridge?: boolean; tunnel?: boolean }
    return { points: l.points.map(xz), bridge: ll.bridge, tunnel: ll.tunnel }
  })
  const railCrossings = osm.rails.levelCrossings.map((c): XZ => [c.x, c.z])

  const waterLines: WaterLine[] = osm.waters.lines.map((w) => {
    const ww = w as typeof w & { tunnel?: string; inRestZone?: boolean }
    return { kind: w.kind, widthM: w.widthM, points: w.points.map(xz), tunnel: ww.tunnel, inRestZone: ww.inRestZone }
  })

  const waterAreas: AreaData[] = osm.waters.areas.map((a) => {
    const aa = a as typeof a & { holes?: Pt[][]; inRestZone?: boolean }
    return {
      kind: a.kind,
      polygon: ring(a.polygon),
      holes: aa.holes?.map(ring),
      inRestZone: aa.inRestZone,
    }
  })

  const landuse: AreaData[] = osm.landuse.map((a) => {
    const aa = a as typeof a & { inRestZone?: boolean }
    return { kind: a.kind, polygon: ring(a.polygon), inRestZone: aa.inRestZone }
  })

  const buildings = osm.buildings.map((b) => ({ polygon: ring(b.polygon), areaM2: b.areaM2 }))

  const g = demJson.grid
  const dem: DemData = {
    cols: g.cols,
    rows: g.rows,
    x0: g.x0,
    z0: g.z0,
    step: g.stepM,
    heights: demJson.heights,
  }

  const skyline: SkylineData | null = skylineJson?.bands?.length
    ? {
        bands: skylineJson.bands
          .map((b) => ({
            fromM: b.fromM,
            toM: b.toM,
            ridge: b.ridge.map((r) => ({ azimuthDeg: r.azimuthDeg, elevationDeg: r.elevationDeg })),
          }))
          .sort((a, b) => b.fromM - a.fromM),
      }
    : null

  return {
    pack,
    half: osm.meta.halfSizeM,
    roads,
    rails,
    railCrossings,
    waterLines,
    waterAreas,
    buildings,
    landuse,
    restZones,
    spots,
    dem,
    skyline,
    attributions: pack.attributions,
  }
}
