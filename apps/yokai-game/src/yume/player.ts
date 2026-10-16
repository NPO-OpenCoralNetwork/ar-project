// アバター（笠をかぶった絵解き師の見習い・仮の見た目）と、相棒ましろ（白い紙の鳥）。
// 夢の旅（家のゲームモード）の歩く速さ。現実の歩行（約1.3m/s）より速くして、箱庭を気持ちよく回れるようにする。
// 歩く 3m/s、走る 7m/s。HUD の「速さ」で、さらに 1.8 倍にできる。地面の高さに沿って歩く。

import * as THREE from 'three'
import { applyBend, bendDrop } from './bend'
import type { Palette } from './palette'
import type { Walkability } from './walk'

export const WALK_SPEED = 3
export const RUN_SPEED = 7
/** HUD の「速さ: はやい」のときの倍率 */
export const FAST_SCALE = 1.8
/** 1回の当たり判定で進む最大の距離（速く動いても壁や線路をすり抜けないように分割する） */
const MAX_SUBSTEP = 0.25
const RADIUS = 0.35
/** 小さすぎると見失うので、箱庭の見せ方として少し大きめに描く */
const AVATAR_SCALE = 1.35

export interface MoveIntent {
  /** 水平の移動方向（世界座標、長さ 0〜1） */
  x: number
  z: number
  run: boolean
}

export interface PlayerEvents {
  hitRest: boolean
  hitEdge: boolean
}

export class Player {
  readonly avatar = new THREE.Group()
  readonly mashiro = new THREE.Group()
  /** 曲げる前の位置（y は地面の高さ） */
  readonly pos = new THREE.Vector3()
  /** 向き（方位、ラジアン。北=0、東=π/2） */
  heading = Math.PI / 2
  walkTarget: THREE.Vector2 | null = null
  speed = 0
  /** 速さの倍率（1 = ふつう、FAST_SCALE = はやい） */
  speedScale = 1

  private readonly body: THREE.Group
  private readonly shadow: THREE.Mesh
  private readonly mats: { robe: THREE.MeshLambertMaterial; hat: THREE.MeshLambertMaterial; skin: THREE.MeshLambertMaterial; pack: THREE.MeshLambertMaterial }
  private readonly wingL: THREE.Object3D
  private readonly wingR: THREE.Object3D
  private readonly birdPos = new THREE.Vector3()
  private readonly birdPrev = new THREE.Vector3()
  private readonly birdVel = new THREE.Vector3()
  /** update() の戻り値（毎フレーム作らずに使い回す） */
  private readonly ev: PlayerEvents = { hitRest: false, hitEdge: false }
  private birdHeading = Math.PI / 2
  private bobPhase = 0
  private stuckTime = 0
  private lastDist = Infinity

  constructor(private readonly walk: Walkability) {
    const mk = () => applyBend(new THREE.MeshLambertMaterial({ flatShading: true }), { bend: false, inkRim: true })
    this.mats = { robe: mk(), hat: mk(), skin: mk(), pack: mk() }

    // アバター（-z が前）
    this.body = new THREE.Group()
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.33, 0.95, 8, 1), this.mats.robe)
    robe.position.y = 0.48
    const sleeves = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.18, 8, 1), this.mats.robe)
    sleeves.position.y = 0.86
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), this.mats.skin)
    head.position.y = 1.1
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.24, 12, 1), this.mats.hat)
    hat.position.y = 1.27
    const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.06, 6, 1), this.mats.hat)
    hatTop.position.y = 1.41
    // 背中の巻物の包み
    const pack = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6, 1), this.mats.pack)
    pack.rotation.z = Math.PI / 2 - 0.35
    pack.position.set(0, 0.78, 0.2)
    this.body.add(robe, sleeves, head, hat, hatTop, pack)
    this.body.scale.setScalar(AVATAR_SCALE)
    for (const m of [robe, sleeves, head, hat, hatTop, pack]) m.castShadow = true
    // 笠の縁の墨の線
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(hat.geometry, 30),
      new THREE.LineBasicMaterial({ color: 0x26221e, transparent: true, opacity: 0.85 }),
    )
    rim.position.copy(hat.position)
    this.body.add(rim)

    // 足元の影（柔らかい円）
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: softDotTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.45,
        // 道の帯（polygonOffset -2）より手前に描く
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    )
    this.shadow.renderOrder = 3
    this.avatar.add(this.body, this.shadow)

    // ましろ（白い紙の鳥）
    const paper = new THREE.MeshLambertMaterial({ color: 0xfbfaf5, flatShading: true, side: THREE.DoubleSide })
    const ink = new THREE.LineBasicMaterial({ color: 0x26221e, transparent: true, opacity: 0.9 })
    const bodyGeo = new THREE.BufferGeometry()
    bodyGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        // 細長い折り紙の胴（-z が頭）
        [0, 0, -0.26, -0.05, 0, 0.12, 0, 0.06, 0.04, 0, 0, -0.26, 0, 0.06, 0.04, 0.05, 0, 0.12, 0, 0, -0.26, 0.05, 0, 0.12, -0.05, 0, 0.12, 0, 0.06, 0.04, -0.05, 0, 0.12, 0.05, 0, 0.12],
        3,
      ),
    )
    bodyGeo.computeVertexNormals()
    const birdBody = new THREE.Mesh(bodyGeo, paper)
    birdBody.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo, 1), ink))
    const wingGeo = (side: 1 | -1) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.1, side * 0.34, 0, 0.06, 0, 0, 0.1], 3))
      g.computeVertexNormals()
      return g
    }
    const mkWing = (side: 1 | -1) => {
      const pivot = new THREE.Object3D()
      const g = wingGeo(side)
      const w = new THREE.Mesh(g, paper)
      w.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), ink))
      pivot.add(w)
      return pivot
    }
    this.wingL = mkWing(-1)
    this.wingR = mkWing(1)
    this.mashiro.add(birdBody, this.wingL, this.wingR)
    this.mashiro.scale.setScalar(1.5)
  }

  setPalette(p: Palette): void {
    this.mats.robe.color.set(p.robe)
    this.mats.hat.color.set(p.hat)
    this.mats.skin.color.set(p.skin)
    this.mats.pack.color.set(p.pack)
  }

  place(x: number, z: number, heading: number): void {
    this.pos.set(x, this.walk.groundY(x, z), z)
    this.heading = heading
    this.walkTarget = null
    this.speed = 0
    this.birdPos.set(x + 0.6, this.pos.y + 2.2, z)
  }

  /** 1フレーム進める。intent があれば歩く。なければ walkTarget へ向かう。戻り値のオブジェクトは使い回す */
  update(dt: number, time: number, intent: MoveIntent): PlayerEvents {
    let dirX = intent.x
    let dirZ = intent.z
    let mag = Math.min(1, Math.hypot(dirX, dirZ))
    let run = intent.run
    if (mag > 0.05) {
      this.walkTarget = null
    } else if (this.walkTarget) {
      const dx = this.walkTarget.x - this.pos.x
      const dz = this.walkTarget.y - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.25) {
        this.walkTarget = null
      } else {
        dirX = dx / d
        dirZ = dz / d
        mag = Math.min(1, d / 0.6)
        run = run || d > 15
        // 進まなくなったら（建物などにぶつかったら）あきらめる
        if (d > this.lastDist - 0.02 * dt * 60) this.stuckTime += dt
        else this.stuckTime = 0
        this.lastDist = d
        if (this.stuckTime > 1.5) {
          this.walkTarget = null
          this.stuckTime = 0
        }
      }
    }
    if (!this.walkTarget) this.lastDist = Infinity

    const want = mag > 0.05 ? (run ? RUN_SPEED : WALK_SPEED) * Math.max(mag, 0.35) * this.speedScale : 0
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want > this.speed ? 6 : 10)))
    const ev = this.ev
    ev.hitRest = false
    ev.hitEdge = false
    if (mag > 0.05) {
      const len = Math.hypot(dirX, dirZ) || 1
      dirX /= len
      dirZ /= len
      const targetHeading = Math.atan2(dirX, -dirZ)
      let dh = targetHeading - this.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      this.heading += dh * (1 - Math.exp(-dt * 12))
    }
    if (this.speed > 0.01) {
      const mx = Math.sin(this.heading)
      const mz = -Math.cos(this.heading)
      const total = this.speed * Math.min(dt, 0.1)
      // 向きを変えている途中は、進みたい方向へ動く（滑らかさのため）
      const vx = mag > 0.05 ? dirX : mx
      const vz = mag > 0.05 ? dirZ : mz
      const steps = Math.max(1, Math.ceil(total / MAX_SUBSTEP))
      const step = total / steps
      for (let i = 0; i < steps; i++) {
        let r = this.walk.resolve(this.pos.x + vx * step, this.pos.z + vz * step, RADIUS)
        // 目的地へ歩いている途中で塀や建物に当たったら、左右に少しそれて回り込む（簡単なよけ方）
        if (this.walkTarget && step > 1e-4) {
          const progress = ((r.x - this.pos.x) * vx + (r.z - this.pos.z) * vz) / step
          if (progress < 0.4) {
            const tx = this.walkTarget.x
            const tz = this.walkTarget.y
            let bestD = Math.hypot(tx - r.x, tz - r.z)
            for (const ang of [0.8, -0.8, 1.4, -1.4]) {
              const ca = Math.cos(ang)
              const sa = Math.sin(ang)
              const ax = vx * ca - vz * sa
              const az = vx * sa + vz * ca
              const alt = this.walk.resolve(this.pos.x + ax * step, this.pos.z + az * step, RADIUS)
              const moved = Math.hypot(alt.x - this.pos.x, alt.z - this.pos.z)
              const d = Math.hypot(tx - alt.x, tz - alt.z)
              if (moved > step * 0.5 && d < bestD + step * 0.6) {
                bestD = d
                r = alt
                break
              }
            }
          }
        }
        ev.hitRest = ev.hitRest || r.hitRest
        ev.hitEdge = ev.hitEdge || r.hitEdge
        const movedSq = (r.x - this.pos.x) ** 2 + (r.z - this.pos.z) ** 2
        this.pos.x = r.x
        this.pos.z = r.z
        if (movedSq < 1e-8) break
      }
      this.pos.y = this.walk.groundY(this.pos.x, this.pos.z)
      // 走るときは歩幅が大きいので、揺れの周期を少しゆっくりにする
      this.bobPhase += total * (this.speed > WALK_SPEED * 1.2 ? 3.4 : 4.6)
    }

    // アバターの見た目
    const drop = bendDrop(this.pos.x, this.pos.z)
    this.avatar.position.set(this.pos.x, this.pos.y - drop, this.pos.z)
    this.body.rotation.y = -this.heading
    const walking = Math.min(1, this.speed / WALK_SPEED)
    this.body.position.y = Math.abs(Math.sin(this.bobPhase)) * 0.07 * walking
    this.body.rotation.z = Math.sin(this.bobPhase) * 0.04 * walking
    this.body.rotation.x = 0
    // 足元の影は、道の帯の上でも隠れないよう、帯の面より少し上に置く
    this.shadow.position.y = this.walk.decalY(this.pos.x, this.pos.z) - this.pos.y + 0.06

    this.updateMashiro(dt, time)
    return ev
  }

  private updateMashiro(dt: number, time: number): void {
    // 右肩の少し上。歩いていると少し後ろへ
    const hx = Math.sin(this.heading)
    const hz = -Math.cos(this.heading)
    const rx = -hz
    const rz = hx
    const lag = Math.min(1, this.speed / WALK_SPEED)
    const s = AVATAR_SCALE
    const tx = this.pos.x + rx * 0.8 * s - hx * 0.35 * lag * s + Math.sin(time * 0.9) * 0.15
    const tz = this.pos.z + rz * 0.8 * s - hz * 0.35 * lag * s + Math.cos(time * 0.7) * 0.15
    const ty = this.pos.y + 1.95 * s + Math.sin(time * 2.1) * 0.08
    const prev = this.birdPrev.copy(this.birdPos)
    const k = 1 - Math.exp(-dt * (3.5 + this.speed * 0.6))
    this.birdPos.x += (tx - this.birdPos.x) * k
    this.birdPos.y += (ty - this.birdPos.y) * k
    this.birdPos.z += (tz - this.birdPos.z) * k
    if (dt > 0) this.birdVel.copy(this.birdPos).sub(prev).divideScalar(dt)
    const v = Math.hypot(this.birdVel.x, this.birdVel.z)
    const want = v > 0.3 ? Math.atan2(this.birdVel.x, -this.birdVel.z) : this.heading
    let dh = want - this.birdHeading
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    this.birdHeading += dh * (1 - Math.exp(-dt * 5))
    const drop = bendDrop(this.birdPos.x, this.birdPos.z)
    this.mashiro.position.set(this.birdPos.x, this.birdPos.y - drop, this.birdPos.z)
    this.mashiro.rotation.set(0, -this.birdHeading, 0)
    // はばたき（動いているときは速く、止まると時々滑空）
    const fast = Math.min(1, v / 1.5)
    const glide = 0.5 + 0.5 * Math.sin(time * 0.8)
    const amp = 0.25 + 0.45 * Math.max(fast, glide * 0.6)
    const flap = Math.sin(time * (7 + fast * 6)) * amp
    this.wingL.rotation.z = -flap
    this.wingR.rotation.z = flap
    this.mashiro.rotation.z = Math.sin(time * 1.3) * 0.08
  }
}

function softDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(30,26,22,0.8)')
  g.addColorStop(0.5, 'rgba(30,26,22,0.35)')
  g.addColorStop(1, 'rgba(30,26,22,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}
