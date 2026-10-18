import { type LatLon, toLocal } from './geo'
import { lintText } from './story/text'
import { pointInPolygon } from './utsutsu/zones'

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
  /** 協力先の枠（02 F-72。MVP では項目だけ。画面には出さない） */
  partners?: PartnerSlot[]
}

/**
 * 協力先（02 F-72・01-app-ux 5.7・C4）。供物がもらえる場所・旅印の協力先。MVP では項目だけ持ち、画面には出さない。
 * 実名は、合意して公開するまでデータに持たない（name は ''）。表示はいつも「協力先」。協力先の供物は現地だけ（04 §3.7）。
 */
export interface PartnerSlot {
  id: string
  /** 供物がもらえる場所 / 旅印の協力先（02 F-72） */
  kinds: ('kumotsu' | 'tabijirushi')[]
  /** 表示はいつも「協力先」（01-app-ux 5.7） */
  label: '協力先'
  /** 合意して公開するまで ''（実名をデータに持たない） */
  name: string
  spotId?: string
  itemId?: string
  hours?: string
  closed?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  hideUnder13: true
  status: 'draft' | 'agreed' | 'paused'
  /** 公開の前は何も出さない（01-app-ux C4） */
  public: false
}

const PARTNER_KINDS: readonly unknown[] = ['kumotsu', 'tabijirushi']
const WEEKDAYS: readonly unknown[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const PARTNER_STATUS: readonly unknown[] = ['draft', 'agreed', 'paused']

/** name は agreed のときだけ空でなくてよい（禁じた名も見る）・spot がある・spot がお休みの範囲の中でない・item がある・public は false */
export function validatePartners(pack: RegionPack, itemIds: Set<string>): string[] {
  const errs: string[] = []
  const list = pack.partners
  if (list === undefined) return errs
  if (!Array.isArray(list)) return [`地域パック ${pack.id}: partners が並び（配列）でない`]
  const seen = new Set<string>()
  const zones = pack.restZones.map((z) => z.polygon.map((p) => toLocal(p, pack.origin)))
  for (const raw of list as unknown[]) {
    const p = raw as Partial<PartnerSlot> & Record<string, unknown>
    const where = `協力先 ${typeof p?.id === 'string' && p.id ? p.id : '(id なし)'}`
    if (!p || typeof p !== 'object') {
      errs.push(`地域パック ${pack.id}: 協力先の項目が表の形でない`)
      continue
    }
    if (typeof p.id !== 'string' || !p.id) errs.push(`${where}: id がない`)
    else if (seen.has(p.id)) errs.push(`${where}: id が2回ある`)
    else seen.add(p.id)
    if (!Array.isArray(p.kinds) || !p.kinds.length || !p.kinds.every((k) => PARTNER_KINDS.includes(k))) errs.push(`${where}: kinds は kumotsu・tabijirushi から1つ以上`)
    if (p.label !== '協力先') errs.push(`${where}: label はいつも「協力先」`)
    if (!PARTNER_STATUS.includes(p.status)) errs.push(`${where}: status は draft・agreed・paused のどれか`)
    if (typeof p.name !== 'string') errs.push(`${where}: name がない（合意の前は ''）`)
    else {
      if (p.name !== '' && p.status !== 'agreed') errs.push(`${where}: 合意（agreed）の前は name を空にする（実名をデータに持たない）`)
      errs.push(...lintText(p.name, { where }))
    }
    if (p.hideUnder13 !== true) errs.push(`${where}: hideUnder13 は true にする`)
    if (p.public !== false) errs.push(`${where}: public は false にする（公開の前は何も出さない）`)
    if (p.hours !== undefined && typeof p.hours !== 'string') errs.push(`${where}: hours が文字でない`)
    if (p.closed !== undefined && (!Array.isArray(p.closed) || !p.closed.every((d) => WEEKDAYS.includes(d)))) errs.push(`${where}: closed は mon〜sun`)
    if (p.spotId !== undefined) {
      const spot = pack.spots.find((s) => s.id === p.spotId)
      if (!spot) errs.push(`${where}: 地点 ${String(p.spotId)} がない`)
      else if (zones.some((z) => pointInPolygon(toLocal(spot.position, pack.origin), z))) errs.push(`${where}: 地点 ${spot.id} が、お休みの範囲（restZones）の中にある`)
    }
    if (p.itemId !== undefined && (typeof p.itemId !== 'string' || !itemIds.has(p.itemId))) errs.push(`${where}: 持ち物 ${String(p.itemId)} がない`)
  }
  return errs
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
