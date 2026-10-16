import type { LatLon } from '../core/geo'
import type { RegionPack, RestZone, Spot } from '../core/region-pack'
import osm from './iwakuraji-osm.json'

/**
 * 地域パック「岩峅寺」（段階0の仮）。
 *
 * - 原点・範囲・お休みの範囲は scripts/fetch-osm.mjs が OSM から作った iwakuraji-osm.json を使う（ODbL）。
 * - 地点（spots）はこのファイルに直接書く。妖怪の配置はゲーム独自のデータなので、
 *   OSM 由来のデータ（ODbL）とは別のファイルに分けておく（05 §5.1）。
 * - 社寺の名前・由緒は持たない。地点の名前は了承が出るまで「この地点」とする（04 §5.2）。
 */

const restZones: RestZone[] = osm.restZones.map((z) => ({
  id: z.id,
  polygon: z.polygonLatLon.map(([lat, lon]): LatLon => ({ lat, lon })),
}))

/**
 * 地点の候補（仮）。fetch-osm.mjs の spotCandidates から、向きの違う3か所を選んだ。
 * 条件: 公道の上、お休みの範囲から 60m 以上（04 §3.1 の 50m に余裕を足した）、鉄道から 15m 以上。
 * 注意: OSM には歩道（sidewalk）のタグが1本もなく、建物も空中写真より少ない。
 * 「歩道があるか」「住宅の前でないか」「2分立ち止まっても邪魔にならないか」は現地で確かめるまで仮。
 */
const spots: Spot[] = [
  {
    // 北東の集落の道（田んぼと家並みの間）。お休みの範囲から約 99m
    id: 'iwakuraji-1',
    label: 'この地点',
    position: { lat: 36.6081932, lon: 137.3160929 },
    placeKind: 'road',
    yokaiId: 'kozobo', // 仮
  },
  {
    // 南西の川沿いの道（堤防の上。河原には下りない）。お休みの範囲から約 92m
    id: 'iwakuraji-2',
    label: 'この地点',
    position: { lat: 36.6064974, lon: 137.3138655 },
    placeKind: 'road',
    yokaiId: 'game', // 仮（04 §3.1 の「川・用水沿いの歩道」）
  },
  {
    // 南東の林の中の道。お休みの範囲から約 130m
    id: 'iwakuraji-3',
    label: 'この地点',
    position: { lat: 36.6060817, lon: 137.3161479 },
    placeKind: 'road',
    yokaiId: 'minomoshi', // 仮
  },
]

export const iwakurajiPack: RegionPack = {
  id: 'iwakuraji',
  // 画面に出す名前。社寺名・地名の札は了承が出るまで出さないので、仮の呼び方にしている
  name: '立山のふもと（仮）',
  origin: { lat: osm.meta.origin.lat, lon: osm.meta.origin.lon },
  bounds: {
    south: osm.meta.bounds.south,
    west: osm.meta.bounds.west,
    north: osm.meta.bounds.north,
    east: osm.meta.bounds.east,
  },
  fieldMapping: { kind: 'identity' },
  spots,
  restZones,
  attributions: ['© OpenStreetMap contributors', '地理院タイル（標高）を加工して作成'],
}

export default iwakurajiPack
