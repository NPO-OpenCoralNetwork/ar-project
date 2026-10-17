// 日の出・日の入りと、一日の時間帯（04 §2.5・§3.8・§5.3）。端末の中で計算する（04 §3.8）。描画に依存しない。
//
// - 計算は NOAA の簡略式（日本の緯度なら誤差は1〜2分程度）。大気差を含めて太陽の中心が -0.833° のときを日の出・日の入りとする。
// - 時間帯: 昼 ＝ 日の出〜日の入りの30分前、逢魔が時 ＝ 日の入りの30分前〜20分後（04 §2.5 の案）、夜 ＝ それ以外。
// - 麓では、日の入りの1時間前から「暗くなるまで あと○分」を出し、逢魔が時に入ったら出会いを止める（04 §5.3）。

export type DayPhase = 'day' | 'oumagatoki' | 'night'

export interface SunTimes {
  /** ms（epoch）。白夜・極夜では null（日本では起きない） */
  sunrise: number | null
  sunset: number | null
}

const RAD = Math.PI / 180

/** その日（date のローカル日付ではなく、経度から見た太陽の日）の日の出・日の入り */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  // 経度に合わせた「その土地の正午」に近い日を選ぶ（UTC の日付のずれを避ける）
  const localNoonGuess = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12) - (lon / 15) * 3600_000
  const dayMs = 86_400_000
  // date に一番近い「その土地の正午」
  const k = Math.round((date.getTime() - localNoonGuess) / dayMs)
  // その日の UTC の正午のユリウス日から、2000年1月1日正午からの日数（整数）を出し、経度の分だけ南中をずらす
  const utcNoon = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12) + k * dayMs
  const n = Math.round(utcNoon / dayMs + 2440587.5 - 2451545.0 + 0.0008)
  const jStar = n - lon / 360
  const M = (357.5291 + 0.98560028 * jStar) % 360
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD)
  const lambda = (M + C + 180 + 102.9372) % 360
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD)
  const decl = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD))
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl))
  if (cosH < -1 || cosH > 1) return { sunrise: null, sunset: null }
  const H = Math.acos(cosH) / RAD
  const toMs = (j: number) => (j - 2440587.5) * dayMs
  return { sunrise: toMs(jTransit - H / 360), sunset: toMs(jTransit + H / 360) }
}

export interface PhaseInfo {
  phase: DayPhase
  sunset: number | null
  sunrise: number | null
  /** 逢魔が時が始まるまでの分（昼のとき）。それ以外は null */
  minutesToOumagatoki: number | null
  /** 暗くなる（日の入りの20分後）までの分（昼と逢魔が時のとき）。それ以外は null */
  minutesToDark: number | null
}

export const OUMAGATOKI_BEFORE_MIN = 30
export const OUMAGATOKI_AFTER_MIN = 20

export function dayPhase(nowMs: number, lat: number, lon: number): PhaseInfo {
  const st = sunTimes(new Date(nowMs), lat, lon)
  if (st.sunrise === null || st.sunset === null) return { phase: 'day', ...st, minutesToOumagatoki: null, minutesToDark: null }
  const omaStart = st.sunset - OUMAGATOKI_BEFORE_MIN * 60_000
  const dark = st.sunset + OUMAGATOKI_AFTER_MIN * 60_000
  const min = (ms: number) => Math.max(0, Math.ceil(ms / 60_000))
  if (nowMs >= st.sunrise && nowMs < omaStart)
    return { phase: 'day', ...st, minutesToOumagatoki: min(omaStart - nowMs), minutesToDark: min(dark - nowMs) }
  if (nowMs >= omaStart && nowMs < dark) return { phase: 'oumagatoki', ...st, minutesToOumagatoki: null, minutesToDark: min(dark - nowMs) }
  return { phase: 'night', ...st, minutesToOumagatoki: null, minutesToDark: null }
}
