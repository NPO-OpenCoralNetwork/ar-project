// 斜め上から見下ろすカメラ（俯角45°前後、狭い画角）。アバターを滑らかに追い、ズーム（20〜120m）と45°ずつの回転をする。
//
// 画面の上の方は霞（すやり霞）で覆い、その上に立山の書き割りを貼る（field/backdrop.ts）。
// 地面はアバターのまわり（D0）は平らなまま、その先をわずかに下げて（「丸い箱庭」）霞へ沈むように見せる。

import * as THREE from 'three'
import { bendUniforms } from './bend'
import { backdropUniforms } from './field/backdrop'

export const ZOOM_MIN = 20
export const ZOOM_MAX = 120
const DEG = Math.PI / 180

/** 見え方の調整値（確認用に外から変えられるようにしておく） */
export const cameraTune = {
  /** 寄ったとき・引いたときの俯角（度） */
  pitchNear: 40,
  pitchFar: 52,
  /** 横長の画面の縦の画角（度） */
  fov: 33,
  /** 書き割りの裾（霞の上端）の高さ（NDC の y）。寄ったとき・引いたとき */
  horizonNear: 0.55,
  horizonFar: 0.63,
  /** 霞が地面を覆う深さ（NDC） */
  mistDepth: 0.13,
  /** アバターを画面の中心より少し下に置く（前方を広く見せる。ズーム距離に対する割合） */
  lookAhead: 0.17,
  /** 丸みの強さ（曲げの半径 / ズーム距離。大きいほど平ら。0 で曲げなし） */
  roll: 4,
  /** 平らなままにする半径（ズーム距離に対する割合） */
  plateau: 0.5,
  /** 縦長の画面での俯角の上乗せ（度。縦横比 0 のときの値） */
  portraitPitchBoost: 18,
  /** 縦長の画面で書き割りの裾を上げる量（NDC。縦横比 0 のときの値） */
  portraitHorizonLift: 0.3,
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(33, 1, 0.5, 3000)
  /** 向き（方位。北=0°、東=90°）。既定は東＝立山の方角 */
  yaw = 90
  yawTarget = 90
  dist = 78
  distTarget = 78
  readonly target = new THREE.Vector3()
  /** 霧の範囲（scene.fog に写す） */
  fogNear = 60
  fogFar = 300
  pitchDeg = 45
  private aspect = 1
  private viewH = 800
  private initialized = false

  setViewport(w: number, h: number): void {
    this.aspect = w / Math.max(1, h)
    this.viewH = h
    this.camera.aspect = this.aspect
    // 狭い画角。縦長の画面は、横の画角が 30° を下回らないよう縦を広げる
    const base = cameraTune.fov
    const vfov = this.aspect >= 1 ? base : Math.min(64, Math.max(base, (2 * Math.atan(Math.tan(15 * DEG) / this.aspect)) / DEG))
    this.camera.fov = vfov
    this.camera.updateProjectionMatrix()
  }

  rotateStep(dir: -1 | 1): void {
    this.yawTarget += dir * 45
  }

  zoomBy(factor: number): void {
    this.distTarget = THREE.MathUtils.clamp(this.distTarget * factor, ZOOM_MIN, ZOOM_MAX)
  }

  /** 画面の上が向いている方角の、水平の単位ベクトル（x = 東, z = 南） */
  forward(out = new THREE.Vector2()): THREE.Vector2 {
    const a = this.yaw * DEG
    return out.set(Math.sin(a), -Math.cos(a))
  }

  update(dt: number, follow: THREE.Vector3): void {
    if (!this.initialized) {
      this.target.copy(follow)
      this.initialized = true
    }
    const k = (rate: number) => 1 - Math.exp(-dt * rate)
    this.target.lerp(follow, k(5))
    this.yaw += (this.yawTarget - this.yaw) * k(7)
    this.dist += (this.distTarget - this.dist) * k(9)

    const tune = cameraTune
    const t = (this.dist - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)
    // 縦長の画面は縦の画角が広く、遠くの霞ばかりが映るので、少し見下ろし気味にする
    const portrait = Math.min(1, Math.max(0, 1 - this.aspect))
    const pitch = Math.min(66, THREE.MathUtils.lerp(tune.pitchNear, tune.pitchFar, t) + portrait * tune.portraitPitchBoost) * DEG
    this.pitchDeg = pitch / DEG
    const halfFovY = (this.camera.fov * DEG) / 2
    const h = this.dist * Math.sin(pitch)
    const c = this.dist * Math.cos(pitch)
    const fwd = this.forward()
    const ahead = this.dist * tune.lookAhead
    const lx = this.target.x + fwd.x * ahead
    const lz = this.target.z + fwd.y * ahead
    this.camera.position.set(lx - fwd.x * c, this.target.y + h, lz - fwd.y * c)
    this.camera.lookAt(lx, this.target.y, lz)

    // 丸い箱庭（わずかに）
    bendUniforms.uBendK.value = tune.roll > 0 ? 1 / (2 * tune.roll * this.dist) : 0
    bendUniforms.uBendD0.value = this.dist * tune.plateau
    bendUniforms.uBendCenter.value.set(this.target.x, this.target.z)

    // 書き割りと霞
    const H = Math.min(0.8, THREE.MathUtils.lerp(tune.horizonNear, tune.horizonFar, t) + portrait * tune.portraitHorizonLift)
    // 縦長の画面では霞の帯を薄くする（同じ NDC でも画面の割合が大きくなるため）
    const mistDepth = tune.mistDepth * Math.min(1, Math.max(0.6, this.aspect * 1.5))
    const bu = backdropUniforms
    bu.uHorizonNdc.value = H
    bu.uMistDepth.value = mistDepth
    bu.uYaw.value = this.yaw * DEG
    bu.uTanHalfX.value = Math.tan(halfFovY) * this.aspect
    bu.uHalfFovYDeg.value = halfFovY / DEG
    bu.uPxDeg.value = ((halfFovY / DEG) * 2) / Math.max(200, this.viewH)
    bu.uPxNdc.value = 2 / Math.max(200, this.viewH)
    bu.uExag.value = (0.92 * (1 - H) * (halfFovY / DEG)) / 6.3

    // 霧: 霞の下端あたりの地面で、ほぼ霞の色になるように
    const yMist = H - mistDepth * 0.7
    const up = Math.atan(yMist * Math.tan(halfFovY)) // 画面の中心から上向きの角度
    const dep = Math.max(3 * DEG, pitch - up)
    const rayLen = h / Math.sin(dep)
    const depth = rayLen * Math.cos(up)
    this.fogNear = this.dist * 1.1
    this.fogFar = Math.max(this.fogNear + 20, depth * 1.25)
  }
}
