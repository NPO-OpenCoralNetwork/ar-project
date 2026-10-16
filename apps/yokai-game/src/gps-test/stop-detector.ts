// 立ち止まりの判定（純粋な関数）。04 §3.1「数秒ほぼ動かずにいると澄む」を確かめるためのもの。
//
// 考え方:
// - 止まった: 直近 windowMs（既定8秒）の位置が、精度を考慮した半径（5〜8m）に収まり、
//   その間の正味の速さ（窓の中の最初の点→最後の点の距離 ÷ その時間）と端末の速さの平均が 0.5m/s 未満。
//   精度が悪すぎるとき（中央値が maxMedianAccM を超える）や、位置が途切れているとき
//   （窓の中の点が少ない、点どうしの間が maxGapMs を超えて空く、窓が点で覆われていない）は判定しない。
//   窓の直前の1点は、窓の左端のすぐ近く（maxGapMs 以内）にあるときだけ「左端を覆う点」として使う。
//   古い点を使うと、更新が止まっていたあと歩き出した直後に、速さが薄まって「止まった」と誤判定するため。
// - 歩き出した: 止まった地点（そのときの重心）から exitRadiusM 以上離れ、かつ直近 exitWindowMs の
//   速さ（端末の値があればそれ、なければ位置の差）が exitSpeed 以上。または max(hardExitRadiusM,
//   許容半径＋その位置の精度) 以上離れたら、速さに関係なく歩き出したとみなす。精度の悪い位置は使わない。
// DOM に依存しない。Node のテストからも読み込む。
import type { Detection, Fix } from './types'

export interface DetectorConfig {
  /** 止まったかを見る時間の幅（ms） */
  windowMs: number
  /** 窓の中に最低いくつ位置があるか（窓の直前の1点は数えない） */
  minFixes: number
  /** 窓の幅のうち、実際に位置で覆われている割合の下限 */
  minCoverage: number
  /** 窓の中の点どうし（と、左端を覆う直前の点との）間隔の上限（ms）。これより空くと判定しない */
  maxGapMs: number
  /** 広がりの許容半径 = clamp(radiusBaseM + radiusAccFactor × 精度の中央値, radiusMinM, radiusMaxM) */
  radiusBaseM: number
  radiusAccFactor: number
  radiusMinM: number
  radiusMaxM: number
  /** 平均の速さの上限（m/s） */
  maxAvgSpeed: number
  /** 精度の中央値がこれより悪いと判定しない（m） */
  maxMedianAccM: number
  /** 最後の位置がこれより古いと「止まった」を新しく出さない（ms） */
  maxLastFixAgeMs: number
  /** 歩き出しを見る時間の幅（ms） */
  exitWindowMs: number
  /** 歩き出しとみなす、止まった地点からの距離（m）。実際は max(これ, 許容半径+4) */
  exitRadiusM: number
  /** 歩き出しとみなす速さ（m/s） */
  exitSpeed: number
  /** これだけ離れたら速さに関係なく歩き出したとみなす（m） */
  hardExitRadiusM: number
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  windowMs: 8000,
  minFixes: 3,
  minCoverage: 0.85,
  maxGapMs: 4000,
  radiusBaseM: 4,
  radiusAccFactor: 0.25,
  radiusMinM: 5,
  radiusMaxM: 8,
  maxAvgSpeed: 0.5,
  maxMedianAccM: 35,
  maxLastFixAgeMs: 5000,
  exitWindowMs: 4000,
  exitRadiusM: 10,
  exitSpeed: 0.5,
  hardExitRadiusM: 20,
}

/** ある時刻での「止まっていそうか」の評価 */
export interface StillEvaluation {
  /** 判定に使った位置の数 */
  n: number
  /** 重心からいちばん遠い位置までの距離（m） */
  spreadM: number
  /** 許容半径（m） */
  radiusM: number
  /** 窓の中の最初の点→最後の点の距離 ÷ その時間（m/s） */
  netSpeed: number
  /** 窓の中の端末の速さの平均（m/s）。値がなければ null */
  deviceSpeed: number | null
  medianAcc: number
  /** 窓のうち位置で覆われている時間（ms） */
  coverageMs: number
  lastFixAgeMs: number
  centroid: { x: number; z: number }
  /** すべての条件を満たしたか */
  still: boolean
  /** 満たさなかった理由（画面とログ用、日本語の短い語） */
  reason: string
}

export interface DetectorState {
  mode: 'moving' | 'stopped'
  /** いまの mode になった時刻 */
  since: number
  /** 止まった地点（stopped のときだけ） */
  anchor: { x: number; z: number } | null
  /** 止まったときの許容半径 */
  anchorRadiusM: number
}

export function initialDetectorState(t: number): DetectorState {
  return { mode: 'moving', since: t, anchor: null, anchorRadiusM: 0 }
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5)
}

/** 線形補間の分位点。空なら NaN */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * 時刻が [now − spanMs, now] の位置（in）と、窓の直前の1点（pre）を返す（fixes は時刻順）。
 * pre は窓の左端から maxPreGapMs 以内にあるときだけ返す（それより古い点は使わない）。
 */
function windowFixes(
  fixes: readonly Fix[],
  now: number,
  spanMs: number,
  maxPreGapMs: number,
): { pts: Fix[]; pre: Fix | null } {
  const from = now - spanMs
  let i = fixes.length - 1
  while (i >= 0 && fixes[i].t > now) i--
  const end = i
  while (i >= 0 && fixes[i].t >= from) i--
  const pre = i >= 0 && from - fixes[i].t <= maxPreGapMs ? fixes[i] : null
  return { pts: fixes.slice(i + 1, end + 1), pre }
}

function lastFixAtOrBefore(fixes: readonly Fix[], now: number): Fix | null {
  for (let k = fixes.length - 1; k >= 0; k--) if (fixes[k].t <= now) return fixes[k]
  return null
}

function meanDeviceSpeed(fixes: readonly Fix[], from: number): number | null {
  let sum = 0
  let n = 0
  for (const f of fixes) {
    if (f.t < from || f.spd === null || !Number.isFinite(f.spd) || f.spd < 0) continue
    sum += f.spd
    n++
  }
  return n >= 2 ? sum / n : null
}

/** now の時点で、直近 cfg.windowMs の位置が「止まっている」ように見えるか */
export function evaluateStill(
  fixes: readonly Fix[],
  now: number,
  cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): StillEvaluation {
  const win = windowFixes(fixes, now, cfg.windowMs, cfg.maxGapMs)
  const pts = win.pts
  const last = pts[pts.length - 1]
  if (!last) {
    const any = lastFixAtOrBefore(fixes, now)
    return {
      n: 0,
      spreadM: NaN,
      radiusM: cfg.radiusMinM,
      netSpeed: NaN,
      deviceSpeed: null,
      medianAcc: NaN,
      coverageMs: 0,
      lastFixAgeMs: any ? now - any.t : Infinity,
      centroid: any ? { x: any.x, z: any.z } : { x: 0, z: 0 },
      still: false,
      reason: any ? '位置が途切れている' : '位置がまだない',
    }
  }

  // 広がりは、左端を覆う直前の点も含めて見る（含めると広がりは大きくなる方にしか動かない）
  const spreadPts = win.pre ? [win.pre, ...pts] : pts
  let cx = 0
  let cz = 0
  for (const p of spreadPts) {
    cx += p.x
    cz += p.z
  }
  cx /= spreadPts.length
  cz /= spreadPts.length
  let spread = 0
  for (const p of spreadPts) spread = Math.max(spread, Math.hypot(p.x - cx, p.z - cz))

  // 覆われている時間: 左端を覆う点があれば窓の左端から、なければ窓の中の最初の点から、いままで
  // （最後の点から先は、lastFixAgeMs の上限で見る）
  const first = pts[0]
  const coverStart = win.pre ? now - cfg.windowMs : first.t
  const coverageMs = Math.max(0, Math.min(cfg.windowMs, now - coverStart))
  let maxGap = win.pre ? first.t - win.pre.t : 0
  for (let k = 1; k < pts.length; k++) maxGap = Math.max(maxGap, pts[k].t - pts[k - 1].t)
  // 正味の速さは、窓の中の点だけから。分母は点の時間の幅（窓の幅を超えない）
  const disp = Math.hypot(last.x - first.x, last.z - first.z)
  const netSpeed = disp / Math.max(1, Math.min(cfg.windowMs, last.t - first.t) / 1000)
  const medAcc = median(pts.map((p) => p.acc))
  const radiusM = clamp(cfg.radiusBaseM + cfg.radiusAccFactor * medAcc, cfg.radiusMinM, cfg.radiusMaxM)
  const deviceSpeed = meanDeviceSpeed(pts, now - cfg.windowMs)
  const lastFixAgeMs = now - last.t

  let reason = ''
  if (pts.length < cfg.minFixes) reason = '位置の数が足りない'
  else if (coverageMs < cfg.windowMs * cfg.minCoverage) reason = '見ている時間が足りない'
  else if (maxGap > cfg.maxGapMs) reason = '位置の間が空いている'
  else if (lastFixAgeMs > cfg.maxLastFixAgeMs) reason = '位置が途切れている'
  else if (medAcc > cfg.maxMedianAccM) reason = '精度が悪い'
  else if (spread > radiusM) reason = '広がりが大きい'
  else if (netSpeed >= cfg.maxAvgSpeed) reason = '動いている（位置の差）'
  else if (deviceSpeed !== null && deviceSpeed >= cfg.maxAvgSpeed) reason = '動いている（端末の速さ）'

  return {
    n: pts.length,
    spreadM: spread,
    radiusM,
    netSpeed,
    deviceSpeed,
    medianAcc: medAcc,
    coverageMs,
    lastFixAgeMs,
    centroid: { x: cx, z: cz },
    still: reason === '',
    reason: reason || '止まっている',
  }
}

/** 止まっている間に、歩き出したかを見る */
export function evaluateMoveAway(
  fixes: readonly Fix[],
  now: number,
  state: DetectorState,
  cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): { moved: boolean; distM: number; speed: number; deviceSpeed: number | null } {
  if (!state.anchor || fixes.length === 0) return { moved: false, distM: 0, speed: 0, deviceSpeed: null }
  // 精度が跳ねた位置（maxMedianAccM 超）は、歩き出しの判断に使わない（止まっていても十数m飛ぶため）
  const win = windowFixes(fixes, now, cfg.exitWindowMs, cfg.maxGapMs)
  const pts = (win.pre ? [win.pre, ...win.pts] : win.pts).filter((f) => f.acc <= cfg.maxMedianAccM)
  const last = pts[pts.length - 1]
  if (!last) {
    // 窓の中に使える点がなくても、最後の点が遠くへ離れていれば歩き出したとみなせるように、距離だけは見る
    let lastAny: Fix | null = null
    for (let k = fixes.length - 1; k >= 0; k--) {
      if (fixes[k].t <= now && fixes[k].acc <= cfg.maxMedianAccM) {
        lastAny = fixes[k]
        break
      }
    }
    if (!lastAny) return { moved: false, distM: 0, speed: 0, deviceSpeed: null }
    const distM = Math.hypot(lastAny.x - state.anchor.x, lastAny.z - state.anchor.z)
    const hardR = Math.max(cfg.hardExitRadiusM, state.anchorRadiusM + lastAny.acc)
    return { moved: distM >= hardR, distM, speed: 0, deviceSpeed: null }
  }
  const first = pts[0]
  const distM = Math.hypot(last.x - state.anchor.x, last.z - state.anchor.z)
  // 速さの分母は、点の時間の幅（窓の幅を超えない）
  const dt = Math.max(1, Math.min(cfg.exitWindowMs, last.t - first.t) / 1000)
  const speed = pts.length >= 2 ? Math.hypot(last.x - first.x, last.z - first.z) / dt : 0
  const deviceSpeed = meanDeviceSpeed(pts, now - cfg.exitWindowMs)
  const exitR = Math.max(cfg.exitRadiusM, state.anchorRadiusM + 4)
  // 端末の速さ（ドップラーで測るので位置の揺れに強い）があればそれを優先し、なければ位置の差を使う
  const fast = deviceSpeed !== null ? deviceSpeed >= cfg.exitSpeed : speed >= cfg.exitSpeed
  const hardR = Math.max(cfg.hardExitRadiusM, state.anchorRadiusM + last.acc)
  const moved = distM >= hardR || (distM >= exitR && fast)
  return { moved, distM, speed, deviceSpeed }
}

export interface DetectorStep {
  state: DetectorState
  evaluation: StillEvaluation
  detection: Detection | null
}

/**
 * 判定を1歩すすめる。位置が来たときと、1秒ごとの見回りの両方で呼んでよい。
 * fixes は時刻順。now は「いま」の時刻（模擬モードでは模擬の時計）。
 */
export function stepDetector(
  prev: DetectorState,
  fixes: readonly Fix[],
  now: number,
  cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): DetectorStep {
  const evaluation = evaluateStill(fixes, now, cfg)
  if (prev.mode === 'moving') {
    if (!evaluation.still) return { state: prev, evaluation, detection: null }
    const state: DetectorState = {
      mode: 'stopped',
      since: now,
      anchor: evaluation.centroid,
      anchorRadiusM: evaluation.radiusM,
    }
    return {
      state,
      evaluation,
      detection: {
        type: 'stop',
        t: now,
        x: evaluation.centroid.x,
        z: evaluation.centroid.z,
        spreadM: evaluation.spreadM,
        netSpeed: evaluation.netSpeed,
        deviceSpeed: evaluation.deviceSpeed,
        medianAcc: evaluation.medianAcc,
        lastFixAgeMs: evaluation.lastFixAgeMs,
      },
    }
  }
  const away = evaluateMoveAway(fixes, now, prev, cfg)
  if (!away.moved) return { state: prev, evaluation, detection: null }
  let li = fixes.length - 1
  while (li > 0 && fixes[li].t > now) li--
  const last = fixes[li]
  return {
    state: { mode: 'moving', since: now, anchor: null, anchorRadiusM: 0 },
    evaluation,
    detection: {
      type: 'go',
      t: now,
      x: last.x,
      z: last.z,
      spreadM: away.distM,
      netSpeed: away.speed,
      deviceSpeed: away.deviceSpeed,
      medianAcc: evaluation.medianAcc,
      lastFixAgeMs: now - last.t,
    },
  }
}

export interface ReplayOptions {
  /**
   * 位置が届いた時刻にも評価する（既定 true）。実機は1秒ごとの見回りに加えて、位置が届くたびにも評価するので、
   * これを true にすると、同じ生ログから実機と同じ時刻の判定が出やすい
   */
  atFixes?: boolean
  /** 見回りの始まりの時刻（実機では記録の開始時刻）。既定は最初の位置の時刻 */
  startT?: number
}

/** 記録済みの位置の列を最初から流し直して、判定の結果を得る（テストと再計算用） */
export function replayDetector(
  fixes: readonly Fix[],
  tickMs = 1000,
  cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
  endT?: number,
  opts: ReplayOptions = {},
): Detection[] {
  if (fixes.length === 0) return []
  const atFixes = opts.atFixes ?? true
  const startT = opts.startT ?? fixes[0].t
  const out: Detection[] = []
  let state = initialDetectorState(startT)
  const stop = endT ?? fixes[fixes.length - 1].t
  const times: number[] = []
  for (let t = startT; t <= stop; t += tickMs) times.push(t)
  if (atFixes) for (const f of fixes) if (f.t >= startT && f.t <= stop) times.push(f.t)
  times.sort((a, b) => a - b)
  let i = 0
  for (const now of times) {
    while (i < fixes.length && fixes[i].t <= now) i++
    const r = stepDetector(state, fixes.slice(0, i), now, cfg)
    state = r.state
    if (r.detection) out.push(r.detection)
  }
  return out
}

/** 実機の判定と、生ログを流し直した判定が、同じ種類・1秒以内でいくつ一致するか */
export function compareWithReplay(
  live: readonly Detection[],
  replay: readonly Detection[],
  toleranceMs = 1000,
): { live: number; replay: number; matched: number } {
  const used = new Set<number>()
  let matched = 0
  for (const d of live) {
    const j = replay.findIndex((r, k) => !used.has(k) && r.type === d.type && Math.abs(r.t - d.t) <= toleranceMs)
    if (j >= 0) {
      used.add(j)
      matched++
    }
  }
  return { live: live.length, replay: replay.length, matched }
}
