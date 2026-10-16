// 箱庭の材料（OSM・標高・稜線・地域パック）を読み込み、ローカル座標（m）の形にそろえる。
// どれもビルド時に取り込む。実行時に外へ取りに行かない（アーティファクトの1ファイル版でも動くように）。

import { toLocal } from '../core/geo'
import type { RegionPack } from '../core/region-pack'
import demJson from '../data/iwakuraji-dem.json'
import osmJson from '../data/iwakuraji-osm.json'
import { iwakurajiPack } from '../data/iwakuraji-pack'
import housesJson from '../data/iwakuraji-placeholder-houses.json'
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

export interface BuildingData {
  polygon: XZ[]
  areaM2: number
  /** OSM の building の値（house, garage, train_station など） */
  kind?: string
  levels?: number
  /** 'gabled'（切妻）/ 'hipped'（寄棟）。無ければ形と番号から決める */
  roofShape?: string
  /** 仮の家（scripts/make-placeholder-houses.mjs が足した、実在しない家） */
  placeholder?: boolean
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
  /** この地点の妖怪（地域パックの yokaiId） */
  yokaiId?: string
}

/** 箱庭の範囲（ローカル座標 m の矩形。原点は範囲の中心とは限らない） */
export interface FieldRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** 点が矩形の内側か（inset だけ内へ狭めて見る） */
export function inRect(r: FieldRect, x: number, z: number, inset = 0): boolean {
  return x >= r.minX + inset && x <= r.maxX - inset && z >= r.minZ + inset && z <= r.maxZ - inset
}

/** 点を矩形の中（inset だけ内側）へ寄せる */
export function clampToRect(r: FieldRect, x: number, z: number, inset = 0): [number, number] {
  return [
    Math.max(r.minX + inset, Math.min(r.maxX - inset, x)),
    Math.max(r.minZ + inset, Math.min(r.maxZ - inset, z)),
  ]
}

export interface FieldData {
  pack: RegionPack
  /** 箱庭の範囲（m） */
  rect: FieldRect
  roads: RoadData[]
  rails: { points: XZ[]; bridge?: boolean; tunnel?: boolean }[]
  /** 駅のホーム（名前なし。低い台として描く） */
  platforms: XZ[][]
  /** 踏切（線路を渡れる所） */
  railCrossings: XZ[]
  waterLines: WaterLine[]
  waterAreas: AreaData[]
  /** OSM の建物と、仮の家（placeholder） */
  buildings: BuildingData[]
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
    return { id: s.id, label: s.label, x: l.x, z: l.z, yokaiId: s.yokaiId }
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

  const buildings: BuildingData[] = [
    ...osm.buildings.map((b) => {
      const bb = b as typeof b & { levels?: number; roofShape?: string }
      return { polygon: ring(b.polygon), areaM2: b.areaM2, kind: b.kind, levels: bb.levels, roofShape: bb.roofShape }
    }),
    ...housesJson.houses.map((h) => ({
      polygon: ring(h.polygon),
      areaM2: h.areaM2,
      kind: h.kind,
      levels: h.levels,
      roofShape: h.roofShape,
      placeholder: h.placeholder,
    })),
  ]
  const platforms = (osm.rails.platforms ?? []).map((p) => ring(p.polygon))

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
    rect: { ...osm.meta.rect },
    roads,
    rails,
    platforms,
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
