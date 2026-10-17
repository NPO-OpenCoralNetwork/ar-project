import type { LatLon } from './geo'

/**
 * 地域パック（最小形）。段階1では「地点・座標・箱庭への写し方」だけを持ち、段階ごとに項目を足す。
 * 実際の緯度経度を正とし、箱庭への写し方（名所を近づけて描く変換）は fieldMapping で地域ごとに決める。
 */
export interface RegionPack {
  id: string
  name: string
  /** 箱庭のローカル座標の原点 */
  origin: LatLon
  /** 箱庭として作る範囲（緯度経度の矩形） */
  bounds: { south: number; west: number; north: number; east: number }
  /** 箱庭への写し方。段階1は等倍。のちに基準点による引き伸ばしを足す */
  fieldMapping: { kind: 'identity' }
  spots: Spot[]
  /** 出会い・カメラ・会話を止める範囲（境内など）。多角形の頂点列 */
  restZones: RestZone[]
  /** 出典表示（ODbL などの義務） */
  attributions: string[]
}

export interface Spot {
  id: string
  /** 了承前は社寺名などを出さず「この地点」とする */
  label: string
  position: LatLon
  /** 置ける場所の種類（02/04 のルール: 歩道のある道・広場・公園）。mizube は出現の表の「水辺」（川・用水沿いの歩道） */
  placeKind: 'road' | 'square' | 'park' | 'mizube'
  /** 決まった地点の妖怪（F-04）。無くて placeKind が出現の表の行なら、寄り道の地点（表で妖怪を引く） */
  yokaiId?: string
  /** 調べる地点（clues.json の id）。妖怪はおらず、ましろが話して札が出る（04 §3.4） */
  clueId?: string
}

export interface RestZone {
  id: string
  /** 表示用の名前は持たない（了承前は社名を出さない） */
  polygon: LatLon[]
}
