// 段階0.5 GPS の検証で使う型。DOM に依存しない（Node のテストからも読み込む）。
import type { LatLon } from '../core/geo'

/** 1回分の位置の更新 */
export interface Fix {
  /** 受け取った時刻（ms, epoch。模擬モードでは模擬の時計） */
  t: number
  /** 端末が付けた測位時刻（ms, epoch） */
  pt: number
  lat: number
  lon: number
  /** 精度（m, 半径） */
  acc: number
  /** 端末の速さ（m/s）。分からないときは null */
  spd: number | null
  /** 端末の方位（度, 北=0 時計回り）。分からないときは null */
  hdg: number | null
  /** 開始地点からの相対位置（m）。x = 東, z = 南 */
  x: number
  z: number
  /** 直前の位置との差から計算した速さ（m/s）。最初の1回は null */
  calcSpd: number | null
}

export type StopKind = 'stop' | 'go'

/** 判定が出した「止まった」「歩き出した」 */
export interface Detection {
  type: StopKind
  t: number
  x: number
  z: number
  /** 判定したときの直近の位置の広がり（m）と速さ（m/s）など */
  spreadM: number
  netSpeed: number
  deviceSpeed: number | null
  medianAcc: number
  /** 判定したとき、最後の位置の更新から何 ms 経っていたか */
  lastFixAgeMs: number
}

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
