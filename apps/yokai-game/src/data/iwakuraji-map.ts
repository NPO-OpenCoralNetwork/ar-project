// 麓（岩峅寺）の素の地図の層。scripts/fetch-osm.mjs が作った iwakuraji-osm.json（ODbL）から写す。
import type { MapLayers, XZ } from '../core/map-layers'
import osm from './iwakuraji-osm.json'

const pts = (a: number[][]): XZ[] => a.map(([x, z]) => [x, z])

export const iwakurajiMap: MapLayers = {
  rect: osm.meta.rect,
  roads: osm.roads.map((r) => ({ kind: r.kind, widthM: r.widthM, points: pts(r.points) })),
  rails: osm.rails.lines.map((r) => ({ points: pts(r.points) })),
  waterLines: osm.waters.lines.map((w) => ({ widthM: w.widthM, points: pts(w.points) })),
  waterAreas: osm.waters.areas.map((a) => pts(a.polygon)),
  buildings: osm.buildings.map((b) => pts(b.polygon)),
  greens: osm.landuse
    .filter((l) => l.kind === 'park' || l.kind === 'forest')
    .map((l) => ({ kind: l.kind as 'park' | 'forest', polygon: pts(l.polygon) })),
  stations: osm.rails.stations.map((s): XZ => [s.x, s.z]),
}
