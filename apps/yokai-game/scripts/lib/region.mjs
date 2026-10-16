// 箱庭「岩峅寺」の範囲の定義。fetch-osm.mjs と fetch-dem.mjs で共有する。
// 原点 = OSM node 2466382798（amenity=place_of_worship。前立社壇の社殿付近）の座標。
// 2026-10-16 に Nominatim と OSM API で確認した値。
import { boundsAround } from './geo.mjs'

export const REGION_ID = 'iwakuraji'
export const ORIGIN = { lat: 36.6076615, lon: 137.3146664 }
export const ORIGIN_OSM_NODE = 2466382798
/** 原点から東西南北それぞれ何 m を箱庭にするか（合計 400 m 四方） */
export const HALF_SIZE_M = 200
export const BOUNDS = boundsAround(ORIGIN, HALF_SIZE_M)
/** 駅を探す範囲（箱庭の外も含める。「駅まで ○分」の表示用） */
export const STATION_SEARCH_HALF_M = 600
