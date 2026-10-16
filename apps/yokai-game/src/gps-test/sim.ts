// 模擬モード（?sim=1）の偽の位置。歩く→止まる→歩くを繰り返し、精度のゆらぎと空白も混ぜる。
// DOM に依存しない（Node のテストからも使う）。
import { toLatLon, type LatLon } from '../core/geo'

/** 再現できる乱数（mulberry32） */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export type SimPhase = 'walk' | 'slow' | 'stop'

export interface SimSample {
  /** 位置が来なかったときは null（空白） */
  fix: { lat: number; lon: number; acc: number; spd: number | null; hdg: number | null } | null
  /** 本当の動き（模擬なので分かる）。この時刻に切り替わったら値が入る */
  truth: 'stop' | 'go' | null
  phase: SimPhase
}

/** 架空の原点（特定の場所ではない、富山平野のあたりの数字） */
export const SIM_ORIGIN: LatLon = { lat: 36.7, lon: 137.25 }

export interface SimOptions {
  /** 歩いている間も、端末の速さをこの割合で空（null）にする（iPhone の Wi-Fi 測位や再開直後の真似）。既定 0 */
  noSpeedRatio?: number
  /** 止まって数秒（3〜6秒）たつと、位置の更新を止める（iPhone が止まっている間に更新を止める真似）。既定 false */
  stillPause?: boolean
}

/**
 * 1秒ごとに next() を呼ぶと、次の模擬の位置を返す。
 * - 歩く 35〜70秒（1.2〜1.5m/s）、ゆっくり歩く（0.5〜0.7m/s、ときどき）、止まる 15〜35秒
 * - 位置のずれは AR(1)（止まっていても数mふらつく）。精度はなだらかに 5〜14m、ときどき 25〜40m に跳ねる
 * - ときどき 11〜18秒の空白
 */
export function createSimWalker(seed = 1, origin: LatLon = SIM_ORIGIN, opts: SimOptions = {}) {
  const rng = makeRng(seed)
  // オプションの乱数は別の系列にする（オプションなしのときの歩き方を変えないため）
  const optRng = makeRng(seed * 7919 + 17)
  const noSpeedRatio = opts.noSpeedRatio ?? 0
  let stillFor = 0
  let pauseAfter = 4
  let x = 0
  let z = 0
  let heading = rng() * Math.PI * 2
  let phase: SimPhase = 'walk'
  let phaseLeft = 40
  let speed = 1.35
  let nx = 0
  let nz = 0
  let accBase = 8
  let spikeLeft = 0
  let gapLeft = 0
  let sinceGap = 0

  function nextPhase(): 'stop' | 'go' | null {
    const prev = phase
    if (phase === 'stop') {
      phase = rng() < 0.2 ? 'slow' : 'walk'
    } else {
      phase = rng() < 0.75 ? 'stop' : phase === 'walk' && rng() < 0.5 ? 'slow' : 'walk'
    }
    if (phase === 'walk') {
      phaseLeft = 35 + Math.floor(rng() * 35)
      speed = 1.2 + rng() * 0.3
    } else if (phase === 'slow') {
      phaseLeft = 15 + Math.floor(rng() * 15)
      speed = 0.5 + rng() * 0.2
    } else {
      phaseLeft = 15 + Math.floor(rng() * 20)
      speed = 0
    }
    if (prev !== 'stop' && phase === 'stop') return 'stop'
    if (prev === 'stop' && phase !== 'stop') return 'go'
    return null
  }

  return {
    origin,
    next(): SimSample {
      let truth: SimSample['truth'] = null
      phaseLeft--
      if (phaseLeft <= 0) truth = nextPhase()

      // 本当の位置をすすめる（曲がり角っぽく、ときどき向きを変える）
      if (speed > 0) {
        heading += gauss(rng) * 0.08 + (rng() < 0.03 ? (rng() < 0.5 ? -1 : 1) * Math.PI / 2 : 0)
        x += Math.sin(heading) * speed
        z -= Math.cos(heading) * speed
      }

      // 精度
      accBase = Math.min(14, Math.max(5, accBase + gauss(rng) * 0.6))
      if (spikeLeft > 0) spikeLeft--
      else if (rng() < 0.01) spikeLeft = 3 + Math.floor(rng() * 5)
      const acc = spikeLeft > 0 ? 25 + rng() * 15 : accBase + rng() * 2

      // ずれ（相関のあるふらつき）
      const sigma = acc * 0.12
      nx = 0.85 * nx + gauss(rng) * sigma
      nz = 0.85 * nz + gauss(rng) * sigma

      // 空白
      sinceGap++
      if (gapLeft > 0) {
        gapLeft--
        return { fix: null, truth, phase }
      }
      if (sinceGap > 120 && rng() < 0.006) {
        gapLeft = 11 + Math.floor(rng() * 8)
        sinceGap = 0
        return { fix: null, truth, phase }
      }

      const p = toLatLon({ x: x + nx, z: z + nz }, origin)
      const moving = speed > 0
      let spd = moving ? Math.max(0, speed + gauss(rng) * 0.15) : rng() < 0.3 ? null : Math.abs(gauss(rng) * 0.08)
      if (moving && noSpeedRatio > 0 && optRng() < noSpeedRatio) spd = null
      if (opts.stillPause) {
        if (moving) {
          stillFor = 0
          pauseAfter = 3 + Math.floor(optRng() * 4)
        } else if (++stillFor > pauseAfter) {
          return { fix: null, truth, phase }
        }
      }
      const hdg = moving ? ((heading * 180) / Math.PI + 360) % 360 : null
      return { fix: { lat: p.lat, lon: p.lon, acc, spd, hdg }, truth, phase }
    },
  }
}
