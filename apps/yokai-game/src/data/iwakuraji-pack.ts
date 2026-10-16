import type { LatLon } from '../core/geo'
import type { RegionPack, RestZone, Spot } from '../core/region-pack'
import osm from './iwakuraji-osm.json'

/**
 * 麓の地域パック（id: iwakuraji。段階0の仮）。社寺と同じ名の地名は、了承まで画面・データの文字に出さない。
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
 * 地点の候補（仮）。fetch-osm.mjs の spotCandidates などから、西・中央・東の3か所を選んだ（段階1b で範囲を東へ広げたので見直した）。
 * 条件: 公道の上、お休みの範囲から 60m 以上（04 §3.1 の 50m に余裕を足した）、鉄道から 15m 以上。
 * 1つ目（光蔵坊）は、はじめの位置（main.ts の startPoint。この地点から 15〜60m）から歩いて 1分以内。
 * 注意: OSM には歩道（sidewalk）のタグが1本もなく、建物も空中写真より少ない（仮の家で補っている）。
 * 「歩道があるか」「住宅の前でないか」「2分立ち止まっても邪魔にならないか」は現地で確かめるまで仮。
 */
const spots: Spot[] = [
  {
    // 東の集落の中ほど、南北の道（家並みの間）。お休みの範囲から約 178m
    id: 'iwakuraji-1',
    label: 'この地点',
    position: { lat: 36.6076283, lon: 137.3174607 },
    placeKind: 'road',
    yokaiId: 'kozobo', // 仮
  },
  {
    // 南西の川沿いの道（堤防の上。河原には下りない）。お休みの範囲から約 92m（段階1a と同じ）
    id: 'iwakuraji-2',
    label: 'この地点',
    position: { lat: 36.6064974, lon: 137.3138655 },
    placeKind: 'road',
    yokaiId: 'game', // 仮（04 §3.1 の「川・用水沿いの歩道」）
  },
  {
    // 南東、駅の南の集落の道。お休みの範囲から約 227m、線路から約 61m
    id: 'iwakuraji-3',
    label: 'この地点',
    position: { lat: 36.6068054, lon: 137.3193094 },
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
