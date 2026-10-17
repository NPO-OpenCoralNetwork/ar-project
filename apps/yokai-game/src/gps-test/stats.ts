// 記録の集計（純粋な関数）。DOM に依存しない。Node のテストからも読み込む。
import { compareWithReplay, DEFAULT_DETECTOR_CONFIG, quantile, replayDetector } from '../core/location/stop-detector'
import type { Detection, Label, SessionLog, StopKind } from './types'

/** 位置が来なかった空白とみなす間隔（ms） */
export const GAP_THRESHOLD_MS = 10_000

export interface Gap {
  start: number
  end: number
  ms: number
  /** 画面が非表示だった時間と重なったか */
  whileHidden: boolean
}

export interface MatchConfig {
  /** ラベルより何 ms 前の判定まで一致とみなすか（ポケットから出す間に先に判定が出ることがある） */
  beforeMs: number
  /** ラベルより何 ms 後の判定まで一致とみなすか */
  afterMs: number
}

/**
 * beforeMs: 判定は本当の停止から約6〜10秒後に出る一方、ラベルはポケットから出して押すので
 * 本当の停止から数秒〜10秒ほど遅れる。判定がラベルより先に出ても一致と数えられるよう、10秒にしている
 */
export const DEFAULT_MATCH_CONFIG: MatchConfig = { beforeMs: 10_000, afterMs: 30_000 }

/** 電池の30分換算を出す最短の時間（ms）。これより短いと 1% 刻みの入力に対して誤差が大きすぎる */
export const BATTERY_MIN_MS = 10 * 60_000

/** 正解ラベルの間隔がこれより短い組は、誤タッチのおそれがある（ms） */
export const SHORT_LABEL_GAP_MS = 5_000

export interface MatchResult {
  kind: StopKind
  labels: number
  detections: number
  /** ラベルと判定の組（delayMs = 判定 − ラベル。負なら判定が先） */
  pairs: { labelT: number; detT: number; delayMs: number }[]
  /** 見逃し: 判定が来なかったラベル */
  missed: number[]
  /** 誤判定: どのラベルとも組にならず、正解の「止まっている間」の外で出た判定 */
  falseAlarms: number[]
  /** 重複: 組にならなかったが、正解の「止まっている間」の中で出た判定（止まる→歩く→止まるの揺れ） */
  duplicates: number[]
  /**
   * 遅すぎ（「止まった」だけ）: 見逃したラベルのあと afterMs 以内に、歩き出したあとで出た判定。
   * 短い停止で判定が間に合わなかったもの。ゲームでは実害だが、ただの誤判定とは分けて数える
   */
  late: number[]
  delayMedianMs: number
  delayP95Ms: number
  delayMaxMs: number
}

export interface Summary {
  totalMs: number
  fixCount: number
  /** 開始から最初の位置までの時間 */
  firstFixMs: number | null
  intervalMedianMs: number
  intervalP95Ms: number
  accuracyMedianM: number
  accuracyP95M: number
  /** 精度が 30m より悪かった更新の割合 */
  poorAccuracyRatio: number
  gaps: Gap[]
  gapCount: number
  gapLongestMs: number
  hiddenCount: number
  hiddenTotalMs: number
  hiddenLongestMs: number
  wakeLock: 'acquired' | 'failed' | 'unsupported' | 'none'
  wakeLockReleases: number
  /** 記録の時間のうち、画面の点灯を保てていた割合（0〜1）。記録がなければ null */
  wakeLockHeldRatio: number | null
  /** 最後の状態（終わったときに外れたままだったかどうか） */
  wakeLockLast: 'acquired' | 'released' | 'failed' | 'unsupported' | 'none'
  /** 正解ラベルの間隔が SHORT_LABEL_GAP_MS 未満だった組の数（誤タッチの手がかり） */
  shortLabelGaps: number
  /** 実機の判定と、生ログを流し直した判定の一致（同じ種類・1秒以内）。記録中は計算しない（null） */
  replay: { live: number; replay: number; matched: number } | null
  geoErrors: number
  /** 精度 30m 以内の位置をつないだ距離（m、粗い目安） */
  distanceM: number
  stop: MatchResult
  go: MatchResult
  battery: {
    start: number | null
    end: number | null
    usedPct: number | null
    per30MinPct: number | null
  }
}

function sumOverlap(a0: number, a1: number, periods: SessionLog['hidden'], endT: number): number {
  let s = 0
  for (const p of periods) {
    const b0 = p.start
    const b1 = p.end ?? endT
    s += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
  }
  return s
}

/** 位置の空白（GAP_THRESHOLD_MS 以上）を列挙する。開始→最初の位置、最後の位置→終了も含める */
export function findGaps(log: SessionLog, endT: number, threshold = GAP_THRESHOLD_MS): Gap[] {
  const times = [log.startedAt, ...log.fixes.map((f) => f.t), endT]
  const gaps: Gap[] = []
  for (let i = 1; i < times.length; i++) {
    const ms = times[i] - times[i - 1]
    if (ms >= threshold) {
      gaps.push({
        start: times[i - 1],
        end: times[i],
        ms,
        whileHidden: sumOverlap(times[i - 1], times[i], log.hidden, endT) > 0,
      })
    }
  }
  return gaps
}

/** 正解ラベルの「止まっている間」（止まった→歩き始めた）。最後が止まったままなら endT まで */
export function labeledStopIntervals(labels: readonly Label[], endT: number): { start: number; end: number }[] {
  const sorted = [...labels].sort((a, b) => a.t - b.t)
  const out: { start: number; end: number }[] = []
  let open: number | null = null
  for (const l of sorted) {
    if (l.type === 'stop' && open === null) open = l.t
    else if (l.type === 'go' && open !== null) {
      out.push({ start: open, end: l.t })
      open = null
    }
  }
  if (open !== null) out.push({ start: open, end: endT })
  return out
}

/**
 * 判定とラベルを突き合わせる。ラベルを時刻順に見て、[ラベル − beforeMs, ラベル + afterMs] の中で
 * まだ組になっていない最初の判定を組にする。窓は前後のラベル（種類を問わない）を越えない。
 */
export function matchDetections(
  kind: StopKind,
  detections: readonly Detection[],
  labels: readonly Label[],
  endT: number,
  cfg: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchResult {
  const allLabels = [...labels].sort((a, b) => a.t - b.t)
  const dets = detections.filter((d) => d.type === kind).sort((a, b) => a.t - b.t)
  const used = new Set<number>()
  const pairs: MatchResult['pairs'] = []
  const missed: number[] = []
  let labelCount = 0
  for (let i = 0; i < allLabels.length; i++) {
    const l = allLabels[i]
    if (l.type !== kind) continue
    labelCount++
    const prevT = i > 0 ? allLabels[i - 1].t : -Infinity
    const nextT = i + 1 < allLabels.length ? allLabels[i + 1].t : Infinity
    const lo = Math.max(l.t - cfg.beforeMs, prevT)
    const hi = Math.min(l.t + cfg.afterMs, nextT)
    const j = dets.findIndex((d, k) => !used.has(k) && d.t >= lo && d.t <= hi)
    if (j < 0) {
      missed.push(l.t)
      continue
    }
    used.add(j)
    pairs.push({ labelT: l.t, detT: dets[j].t, delayMs: dets[j].t - l.t })
  }
  // 組にならなかった判定を、正解の「止まっている間」の内外で分ける
  const stops = labeledStopIntervals(labels, endT)
  const inStop = (t: number) => stops.some((s) => t >= s.start && t <= s.end)
  const falseAlarms: number[] = []
  const duplicates: number[] = []
  const late: number[] = []
  dets.forEach((d, k) => {
    if (used.has(k)) return
    // 「止まった」なら止まっている間の中は重複、「歩き出した」なら止まっている間の外（歩いている間）が重複
    const benign = kind === 'stop' ? inStop(d.t) : !inStop(d.t)
    if (benign) duplicates.push(d.t)
    else if (kind === 'stop' && missed.some((t) => d.t >= t && d.t <= t + cfg.afterMs)) late.push(d.t)
    else falseAlarms.push(d.t)
  })
  const delays = pairs.map((p) => p.delayMs)
  return {
    kind,
    labels: labelCount,
    detections: dets.length,
    pairs,
    missed,
    falseAlarms,
    duplicates,
    late,
    delayMedianMs: quantile(delays, 0.5),
    delayP95Ms: quantile(delays, 0.95),
    delayMaxMs: delays.length ? Math.max(...delays) : NaN,
  }
}

const replayCache = new WeakMap<SessionLog, { key: string; value: NonNullable<Summary['replay']> }>()

/** 生ログを流し直して、実機の判定と比べる（同じ記録なら結果を使い回す） */
function replayFor(log: SessionLog, endT: number): NonNullable<Summary['replay']> {
  const key = `${log.fixes.length}:${log.detections.length}:${endT}`
  const hit = replayCache.get(log)
  if (hit && hit.key === key) return hit.value
  const rep = replayDetector(log.fixes, 1000, DEFAULT_DETECTOR_CONFIG, endT, { atFixes: true, startT: log.startedAt })
  const value = compareWithReplay(log.detections, rep)
  replayCache.set(log, { key, value })
  return value
}

/** 記録を集計する。終わっていない記録は now までで集計する */
export function summarize(log: SessionLog, now: number = log.endedAt ?? Date.now()): Summary {
  const endT = log.endedAt ?? now
  const fixes = log.fixes
  const intervals: number[] = []
  for (let i = 1; i < fixes.length; i++) intervals.push(fixes[i].t - fixes[i - 1].t)
  const accs = fixes.map((f) => f.acc)
  const gaps = findGaps(log, endT)

  const hiddenDur = log.hidden.map((p) => (p.end ?? endT) - p.start)

  let distanceM = 0
  let prev: { x: number; z: number } | null = null
  for (const f of fixes) {
    if (f.acc > 30) continue
    if (prev) distanceM += Math.hypot(f.x - prev.x, f.z - prev.z)
    prev = f
  }

  let wakeLock: Summary['wakeLock'] = 'none'
  if (log.wakeLock.some((w) => w.ev === 'acquired')) wakeLock = 'acquired'
  else if (log.wakeLock.some((w) => w.ev === 'failed')) wakeLock = 'failed'
  else if (log.wakeLock.some((w) => w.ev === 'unsupported')) wakeLock = 'unsupported'

  const totalMs = Math.max(0, endT - log.startedAt)
  // 画面の点灯を保てていた時間（acquired から次の released / failed まで）
  let heldMs = 0
  let heldFrom: number | null = null
  for (const w of [...log.wakeLock].sort((a, b) => a.t - b.t)) {
    if (w.ev === 'acquired') heldFrom ??= w.t
    else if (heldFrom !== null) {
      heldMs += Math.max(0, w.t - heldFrom)
      heldFrom = null
    }
  }
  if (heldFrom !== null) heldMs += Math.max(0, endT - heldFrom)
  const wakeLockHeldRatio = log.wakeLock.length && totalMs > 0 ? Math.min(1, heldMs / totalMs) : null
  const wakeLockLast = log.wakeLock.length ? log.wakeLock[log.wakeLock.length - 1].ev : 'none'

  const sortedLabels = [...log.labels].sort((a, b) => a.t - b.t)
  let shortLabelGaps = 0
  for (let i = 1; i < sortedLabels.length; i++) if (sortedLabels[i].t - sortedLabels[i - 1].t < SHORT_LABEL_GAP_MS) shortLabelGaps++

  const { start, end } = log.battery
  const usedPct = start !== null && end !== null ? start - end : null
  const per30MinPct = usedPct !== null && totalMs >= BATTERY_MIN_MS ? (usedPct / totalMs) * 30 * 60_000 : null

  return {
    totalMs,
    fixCount: fixes.length,
    firstFixMs: fixes.length ? fixes[0].t - log.startedAt : null,
    intervalMedianMs: quantile(intervals, 0.5),
    intervalP95Ms: quantile(intervals, 0.95),
    accuracyMedianM: quantile(accs, 0.5),
    accuracyP95M: quantile(accs, 0.95),
    poorAccuracyRatio: fixes.length ? accs.filter((a) => a > 30).length / fixes.length : 0,
    gaps,
    gapCount: gaps.length,
    gapLongestMs: gaps.length ? Math.max(...gaps.map((g) => g.ms)) : 0,
    hiddenCount: log.hidden.length,
    hiddenTotalMs: hiddenDur.reduce((a, b) => a + b, 0),
    hiddenLongestMs: hiddenDur.length ? Math.max(...hiddenDur) : 0,
    wakeLock,
    wakeLockReleases: log.wakeLock.filter((w) => w.ev === 'released').length,
    wakeLockHeldRatio,
    wakeLockLast,
    shortLabelGaps,
    replay: log.endedAt !== null ? replayFor(log, endT) : null,
    geoErrors: log.errors.length,
    distanceM,
    stop: matchDetections('stop', log.detections, log.labels, endT),
    go: matchDetections('go', log.detections, log.labels, endT),
    battery: { start, end, usedPct, per30MinPct },
  }
}
