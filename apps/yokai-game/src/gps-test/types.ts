// 段階0.5 GPS の検証で使う型。DOM に依存しない（Node のテストからも読み込む）。
import type { LatLon } from '../core/geo'
import type { Detection, Fix, StopKind } from '../core/location/types'

export type { Detection, Fix, StopKind }

/** 人が押した正解のラベル */
export interface Label {
  type: StopKind
  t: number
}

export interface Period {
  start: number
  end: number | null
}

export interface WakeLockEvent {
  t: number
  ev: 'acquired' | 'released' | 'failed' | 'unsupported'
  msg?: string
}

export interface GeoErrorEvent {
  t: number
  code: number
  msg: string
}

/** 1回の歩きの記録（localStorage にそのまま保存する） */
export interface SessionLog {
  version: 1
  startedAt: number
  endedAt: number | null
  sim: boolean
  userAgent: string
  origin: LatLon | null
  fixes: Fix[]
  detections: Detection[]
  labels: Label[]
  hidden: Period[]
  wakeLock: WakeLockEvent[]
  errors: GeoErrorEvent[]
  battery: { start: number | null; end: number | null }
  memo: string
  /** 「コピーする」が成功した時刻（まだなら無い）。消える前の確認に使う */
  copiedAt?: number
}
