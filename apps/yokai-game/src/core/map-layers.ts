// 素の地図（現の旅 D1）に描く層。地域パックの OSM 由来のデータ（ODbL）から作る。座標はローカル座標（m。x = 東, z = 南）。
// 名前（社寺・家・店・駅）は持たない（04 §5.2）。

export type XZ = [number, number]

export interface MapLayers {
  /** データのある範囲（ローカル座標） */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number }
  roads: { kind: string; widthM: number; points: XZ[] }[]
  rails: { points: XZ[] }[]
  waterLines: { widthM: number; points: XZ[] }[]
  waterAreas: XZ[][]
  buildings: XZ[][]
  greens: { kind: 'park' | 'forest' | 'grass'; polygon: XZ[] }[]
  /** 駅の位置（名前は出さない）。逢魔が時の「駅まで ○分」に使う */
  stations: XZ[]
}
