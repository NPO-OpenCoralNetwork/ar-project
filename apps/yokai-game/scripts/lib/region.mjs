// 箱庭「岩峅寺」の範囲の定義。fetch-osm.mjs と fetch-dem.mjs で共有する。
// 原点 = OSM node 2466382798（amenity=place_of_worship。前立社壇の社殿付近）の座標。
// 2026-10-16 に Nominatim と OSM API で確認した値。
//
// 段階1b（2026-10-16、PO 決定）: 原点は変えず、範囲を東へ広げた。
//   西 -200m・東 +500m・南北 ±200m（700m × 400m）。岩峅寺駅（原点の東 約455m）と集落が入る。
import { rectBounds } from './geo.mjs'

export const REGION_ID = 'iwakuraji'
export const ORIGIN = { lat: 36.6076615, lon: 137.3146664 }
export const ORIGIN_OSM_NODE = 2466382798
/** 箱庭の範囲（ローカル座標 m。x = 東, z = 南）。原点から西 200・東 500・北 200・南 200 */
export const RECT = { minX: -200, maxX: 500, minZ: -200, maxZ: 200 }
export const BOUNDS = rectBounds(ORIGIN, RECT)
/** 駅を探す範囲（箱庭の外も含める。「駅まで ○分」の表示用）。範囲の外へ広げる距離（m） */
export const STATION_SEARCH_MARGIN_M = 300
/** OSM の生データを取る範囲。範囲の外 150m までの社寺もお休みの範囲にするので、それより広く取る */
export const FETCH_MARGIN_M = 300
