// 位置の更新と、立ち止まりの判定の型。DOM に依存しない（段階0.5 の GPS の検証と、現の旅で同じものを使う）。

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
