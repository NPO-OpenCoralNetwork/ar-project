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
 * 地点の候補（仮）。fetch-osm.mjs の spotCandidates などから、西・中央・東の3か所を選んだ（段階1b で範囲を東へ広げたので見直した）。段階3で、南の川沿いに4か所目（カーラボーズ）を足した。
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
  {
    // 南、用水沿いの低い所の道（家の前を避ける。いちばん近い家から約 93m）。お休みの範囲から約 112m。
    // ガメの地点から約 122m（とりもつで行き来する。段階3）。川には入らず、道から見る
    id: 'iwakuraji-4',
    label: 'この地点',
    position: { lat: 36.6060999, lon: 137.3151354 },
    placeKind: 'road',
    yokaiId: 'karabozu', // 仮（ガメの親方。04 では里の川沿い）
  },
  // 調べる地点（光蔵坊の悩み #2。04 §3.4・§3.5）。妖怪はおらず、悩みを頼まれてから気配が出る（clues.json）。
  // 公道の上で、お休みの範囲から 160m 以上、ほかの地点から 100m 以上、水辺から 190m 以上。OSM の建物からは 100m 以上
  // （箱庭の仮の家並みからは 14〜18m。村の道はどこも仮の家並みに沿うので、それより離せない）。
  // 光蔵坊 → 1 → 2 → 光蔵坊 で約 810m（4km/h で約12分）。
  {
    // 南の東西の道（集落の南を通る道）の、家並みの切れ目。光蔵坊の地点から南南東へ約100m
    id: 'iwakuraji-c1',
    label: 'この地点',
    position: { lat: 36.6067998, lon: 137.3179279 },
    placeKind: 'road',
    clueId: 'kozobo-shirabe-1',
  },
  {
    // 北西の集落の中の細い東西の道、辻の近く（南北の道との角から約8m）。光蔵坊の地点から北西へ約195m
    id: 'iwakuraji-c2',
    label: 'この地点',
    position: { lat: 36.6090399, lon: 137.3161702 },
    placeKind: 'road',
    clueId: 'kozobo-shirabe-2',
  },
  {
    // 白えびを受け取る地点（ガメの悩み #11。04 §3.7「里の決まった地点」。仕組みは調べる地点と同じ）。
    // 北北東へのびる細い道の突き当たり（家の少ない所）。光蔵坊の地点から約 173m、調べる地点2 から約 174m、線路から約 68m。
    // OSM では行き止まりの道なので、現地で住宅の前や私有地に当たらないかを確かめる（07 §7.2）
    id: 'iwakuraji-c3',
    label: 'この地点',
    position: { lat: 36.6090943, lon: 137.3181198 },
    placeKind: 'road',
    clueId: 'shiroebi',
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
  // 協力先の枠（02 F-72）。MVP では項目だけで、合意した協力先はまだ無い（画面には出さない）
  partners: [],
}

export default iwakurajiPack
