// 集計を、チャットに貼れる文章と JSON にする（純粋な関数）。
import { DEFAULT_DETECTOR_CONFIG } from './stop-detector'
import type { MatchResult, Summary } from './stats'
import type { SessionLog } from './types'

const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100
const r6 = (v: number) => Math.round(v * 1e6) / 1e6
const sec = (ms: number) => (Number.isFinite(ms) ? r1(ms / 1000) : null)
const num = (v: number) => (Number.isFinite(v) ? r1(v) : null)

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}時間${m % 60}分${s % 60}秒`
  if (m > 0) return `${m}分${s % 60}秒`
  return `${s}秒`
}

export function fmtSec(ms: number): string {
  return Number.isFinite(ms) ? `${r1(ms / 1000)}秒` : '—'
}

export function fmtM(m: number): string {
  return Number.isFinite(m) ? `${r1(m)}m` : '—'
}

function wakeLockText(s: Summary): string {
  const ratio = s.wakeLockHeldRatio === null ? '' : `、保てていた時間 ${Math.round(s.wakeLockHeldRatio * 100)}%`
  const tail = s.wakeLockLast === 'released' || s.wakeLockLast === 'failed' ? '、最後は外れたまま' : ''
  switch (s.wakeLock) {
    case 'acquired':
      return (s.wakeLockReleases > 0 ? `取れた（途中で外れた回数 ${s.wakeLockReleases}）` : '取れた') + ratio + tail
    case 'failed':
      return '取れなかった'
    case 'unsupported':
      return 'この端末では使えない'
    default:
      return '—'
  }
}

function matchLine(name: string, m: MatchResult): string {
  const hit = m.pairs.length
  // 遅れは「ラベルを押してから」。本当に止まった時刻からの遅れは、押すまでの数秒だけ長い
  const delay =
    hit > 0 ? `、遅れ（押してから）中央値${fmtSec(m.delayMedianMs)}・95%値${fmtSec(m.delayP95Ms)}・最大${fmtSec(m.delayMaxMs)}` : ''
  const late = m.kind === 'stop' ? `・遅すぎ${m.late.length}` : ''
  return (
    `${name}: 正解${m.labels}回／判定${m.detections}回、一致${hit}・見逃し${m.missed.length}` +
    `・誤判定${m.falseAlarms.length}${late}・重複${m.duplicates.length}${delay}`
  )
}

/** 画面とチャット用の、日本語の集計の行 */
export function summaryRows(s: Summary): [string, string][] {
  const b = s.battery
  const battery =
    b.per30MinPct !== null
      ? `${r1(b.per30MinPct)}%／30分（${b.start}% → ${b.end}%、誤差の目安 ±${r1((1 / (s.totalMs / 60_000)) * 30)}%）`
      : b.usedPct !== null
        ? `参考: ${b.usedPct}% 減（${b.start}% → ${b.end}%）。10分未満なので30分換算はしません`
        : b.start !== null
          ? `開始 ${b.start}%（終了の値を入れると計算します）`
          : '入力なし'
  return [
    ['合計時間', fmtDuration(s.totalMs)],
    ['位置の更新', `${s.fixCount}回（最初の位置まで ${s.firstFixMs === null ? '—' : fmtSec(s.firstFixMs)}）`],
    ['更新の間隔', `中央値 ${fmtSec(s.intervalMedianMs)}／95%値 ${fmtSec(s.intervalP95Ms)}`],
    ['精度', `中央値 ${fmtM(s.accuracyMedianM)}／95%値 ${fmtM(s.accuracyP95M)}（30m超 ${Math.round(s.poorAccuracyRatio * 100)}%）`],
    ['空白（10秒以上）', `${s.gapCount}回、最長 ${s.gapLongestMs ? fmtSec(s.gapLongestMs) : '—'}`],
    ['画面の非表示', `${s.hiddenCount}回、合計 ${fmtDuration(s.hiddenTotalMs)}`],
    ['画面の点灯', wakeLockText(s)],
    ['歩いた距離（目安）', fmtM(s.distanceM)],
    ['止まった', matchLine('止まった', s.stop).replace(/^止まった: /, '')],
    ['歩き始めた', matchLine('歩き始めた', s.go).replace(/^歩き始めた: /, '')],
    ['ラベルの間隔が5秒未満', `${s.shortLabelGaps}組${s.shortLabelGaps ? '（誤タッチかもしれません）' : ''}`],
    ['電池', battery],
    ['位置のエラー', `${s.geoErrors}回`],
    [
      '流し直しとの一致',
      s.replay ? `実機の判定${s.replay.live}回のうち${s.replay.matched}回（流し直しは${s.replay.replay}回）` : '終えたあとに出します',
    ],
  ]
}

export function summaryText(log: SessionLog, s: Summary): string {
  const head = `【GPS の検証】${new Date(log.startedAt).toLocaleString('ja-JP')}${log.sim ? '（模擬モード）' : ''}`
  const rows = summaryRows(s).map(([k, v]) => `- ${k}: ${v}`)
  const memo = log.memo.trim() ? [`- メモ: ${log.memo.trim()}`] : []
  return [head, ...rows, ...memo].join('\n')
}

function matchJson(m: MatchResult, t0: number) {
  return {
    labels: m.labels,
    detections: m.detections,
    matched: m.pairs.length,
    missed: m.missed.length,
    falseAlarms: m.falseAlarms.length,
    duplicates: m.duplicates.length,
    delayMedianS: sec(m.delayMedianMs),
    delayP95S: sec(m.delayP95Ms),
    delayMaxS: sec(m.delayMaxMs),
    pairs: m.pairs.map((p) => [sec(p.labelT - t0), sec(p.delayMs)]),
    missedAtS: m.missed.map((t) => sec(t - t0)),
    falseAlarmsAtS: m.falseAlarms.map((t) => sec(t - t0)),
    late: m.late.length,
    lateAtS: m.late.map((t) => sec(t - t0)),
  }
}

export interface ExportOptions {
  includeRaw: boolean
  /** 緯度経度を含める（既定は含めず、開始地点からの相対位置だけ） */
  includeLatLon: boolean
}

/** チャットに貼る JSON。時刻は開始からの秒、位置は開始地点からの m（x = 東, z = 南） */
export function exportJson(log: SessionLog, s: Summary, opt: ExportOptions): object {
  const t0 = log.startedAt
  const ts = (t: number) => sec(t - t0)
  const out: Record<string, unknown> = {
    kind: 'yokai-gps-test',
    version: 1,
    startedAt: new Date(t0).toISOString(),
    endedAt: log.endedAt ? new Date(log.endedAt).toISOString() : null,
    sim: log.sim,
    userAgent: log.userAgent,
    memo: log.memo,
    summary: {
      totalS: sec(s.totalMs),
      fixCount: s.fixCount,
      firstFixS: s.firstFixMs === null ? null : sec(s.firstFixMs),
      intervalMedianS: sec(s.intervalMedianMs),
      intervalP95S: sec(s.intervalP95Ms),
      accuracyMedianM: num(s.accuracyMedianM),
      accuracyP95M: num(s.accuracyP95M),
      poorAccuracyRatio: r2(s.poorAccuracyRatio),
      gapCount: s.gapCount,
      gapLongestS: sec(s.gapLongestMs),
      hiddenCount: s.hiddenCount,
      hiddenTotalS: sec(s.hiddenTotalMs),
      hiddenLongestS: sec(s.hiddenLongestMs),
      wakeLock: s.wakeLock,
      wakeLockReleases: s.wakeLockReleases,
      wakeLockHeldRatio: s.wakeLockHeldRatio === null ? null : r2(s.wakeLockHeldRatio),
      wakeLockLast: s.wakeLockLast,
      shortLabelGaps: s.shortLabelGaps,
      replay: s.replay,
      geoErrors: s.geoErrors,
      distanceM: num(s.distanceM),
      stop: matchJson(s.stop, t0),
      go: matchJson(s.go, t0),
      battery: {
        start: s.battery.start,
        end: s.battery.end,
        usedPct: s.battery.usedPct,
        per30MinPct: s.battery.per30MinPct === null ? null : r1(s.battery.per30MinPct),
      },
    },
    detectorConfig: DEFAULT_DETECTOR_CONFIG,
  }
  if (opt.includeRaw) {
    const fields = ['tS', 'xM', 'zM', 'accM', 'spd', 'hdg', 'calcSpd', 'ptLagS']
    if (opt.includeLatLon) fields.push('lat', 'lon')
    out.raw = {
      origin: opt.includeLatLon && log.origin ? { lat: r6(log.origin.lat), lon: r6(log.origin.lon) } : null,
      fixFields: fields,
      fixes: log.fixes.map((f) => {
        const row: (number | null)[] = [
          ts(f.t),
          r1(f.x),
          r1(f.z),
          r1(f.acc),
          f.spd === null ? null : r2(f.spd),
          f.hdg === null ? null : Math.round(f.hdg),
          f.calcSpd === null ? null : r2(f.calcSpd),
          r1((f.t - f.pt) / 1000),
        ]
        if (opt.includeLatLon) row.push(r6(f.lat), r6(f.lon))
        return row
      }),
      detectionFields: ['type', 'tS', 'xM', 'zM', 'spreadM', 'netSpeed', 'deviceSpeed', 'medianAccM', 'lastFixAgeS'],
      detections: log.detections.map((d) => [
        d.type,
        ts(d.t),
        r1(d.x),
        r1(d.z),
        num(d.spreadM),
        num(d.netSpeed),
        d.deviceSpeed === null ? null : r2(d.deviceSpeed),
        num(d.medianAcc),
        sec(d.lastFixAgeMs),
      ]),
      labels: log.labels.map((l) => [l.type, ts(l.t)]),
      hidden: log.hidden.map((h) => [ts(h.start), h.end === null ? null : ts(h.end)]),
      gaps: s.gaps.map((g) => [ts(g.start), sec(g.ms), g.whileHidden]),
      wakeLock: log.wakeLock.map((w) => [w.ev, ts(w.t), w.msg ?? null]),
      errors: log.errors.map((e) => [e.code, ts(e.t), e.msg]),
    }
  }
  return out
}

export function exportText(log: SessionLog, s: Summary, opt: ExportOptions): string {
  return `${summaryText(log, s)}\n\n${JSON.stringify(exportJson(log, s, opt))}`
}
