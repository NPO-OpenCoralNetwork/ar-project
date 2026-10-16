// 地面に貼る絵（Canvas）。田の区画・畦・林・河原・駐車場・家まわりの土・焼き込みの影・お休みの範囲の霞を描く。
// 道と水は 3D の帯/面で別に描くが、下地にも少し描いておき、すき間が見えないようにする。

import * as THREE from 'three'
import type { FieldData } from '../data'
import { makeRandom, type XZ } from '../geom2d'
import type { Palette } from '../palette'

const SUN_SHADOW_DIR: XZ = [0.34, -0.94] // 日は南南西。影は北北東へ

export class GroundTexture {
  readonly canvas: HTMLCanvasElement
  readonly texture: THREE.CanvasTexture
  private readonly ctx: CanvasRenderingContext2D
  private scale: number
  private readonly paddyAngle: number

  constructor(
    private readonly data: FieldData,
    size: number,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.canvas.height = size
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d が使えません')
    this.ctx = ctx
    this.scale = size / (data.half * 2)
    this.paddyAngle = dominantRoadAngle(data)
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping
  }

  paint(p: Palette): void {
    const { ctx, data } = this
    const S = this.canvas.width
    const half = data.half
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, S, S)
    ctx.setTransform(this.scale, 0, 0, this.scale, S / 2, S / 2)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // 1. 田（区画・畦）
    ctx.fillStyle = p.paddy
    ctx.fillRect(-half, -half, half * 2, half * 2)
    this.paintPaddies(p)

    // 2. 河原と中洲
    for (const a of data.waterAreas) {
      if (a.kind !== 'river') continue
      ctx.fillStyle = p.riverbed
      this.fillPoly(a.polygon, a.holes)
      this.stipple(a.polygon, a.holes ?? [], p.riverbedDot, 0.35, 0.18, 0.45, 11)
      for (const h of a.holes ?? []) {
        ctx.fillStyle = p.island
        this.fillPoly(h)
        this.stipple(h, [], p.forestDotLight, 0.25, 0.5, 1.1, 12)
      }
    }

    // 3〜7 は境内（お休みの範囲）の外だけに描く（境内は作り込まず、霞だけにする）
    ctx.save()
    this.clipOutsideRest()

    // 3. 家まわりの土（建物を少し太らせた形）
    ctx.fillStyle = p.yard
    ctx.strokeStyle = p.yard
    ctx.lineWidth = 9
    for (const b of data.buildings) {
      this.pathPoly(b.polygon)
      ctx.fill()
      ctx.stroke()
    }

    // 4. 林
    for (const a of data.landuse) {
      if (a.kind !== 'forest') continue
      ctx.fillStyle = p.forest
      this.fillPoly(a.polygon)
      this.stipple(a.polygon, [], p.forestDotLight, 0.22, 0.8, 1.6, 21)
      this.stipple(a.polygon, [], p.forestDot, 0.16, 0.35, 0.8, 22)
    }

    // 5. 駐車場（境内のものは描かない）
    ctx.fillStyle = p.parking
    for (const a of data.landuse) {
      if (a.kind === 'parking' && !a.inRestZone) this.fillPoly(a.polygon)
    }

    // 6. 道と水の下地
    ctx.strokeStyle = p.roadUnder
    for (const r of data.roads) {
      if (r.inRestZone) continue
      ctx.lineWidth = r.widthM + 1.4
      this.pathLine(r.points)
      ctx.stroke()
    }
    ctx.strokeStyle = p.riverbedDot
    for (const w of data.waterLines) {
      if (w.tunnel || w.inRestZone) continue
      ctx.lineWidth = w.widthM + 1.2
      this.pathLine(w.points)
      ctx.stroke()
    }

    // 7. 焼き込みの影（建物の北北東側と足元）
    for (const b of data.buildings) {
      const off = 2.6
      const shifted = b.polygon.map(([x, z]): XZ => [x + SUN_SHADOW_DIR[0] * off, z + SUN_SHADOW_DIR[1] * off])
      this.softFill(shifted, p.shadow, 2.2)
      this.softFill(b.polygon, p.shadow, 1.0)
    }
    ctx.restore()

    // 8. 紙の目
    this.paintGrain(p.grain)

    // 9. お休みの範囲の霞
    for (const z of data.restZones) {
      this.softFill(z.polygon, p.restVeil, 9)
      this.softFill(z.polygon, p.restVeil, 3)
    }

    // 10. 箱庭の縁（ここまで）
    ctx.save()
    ctx.strokeStyle = 'rgba(40,36,30,0.28)'
    ctx.lineWidth = 0.35
    ctx.setLineDash([2.2, 2.8])
    ctx.strokeRect(-half + 1.2, -half + 1.2, half * 2 - 2.4, half * 2 - 2.4)
    ctx.restore()

    this.texture.needsUpdate = true
  }

  private paintPaddies(p: Palette): void {
    const { ctx, data } = this
    const rnd = makeRandom(7)
    const half = data.half
    const a = this.paddyAngle
    const ux = Math.cos(a)
    const uz = Math.sin(a)
    const R = half * 1.5
    const W = 42
    const H = 26
    for (let v = -R; v < R; v += H) {
      let u = -R + rnd() * W
      while (u < R) {
        const w = W * (0.7 + rnd() * 0.7)
        const corners: XZ[] = [
          [u, v],
          [u + w, v],
          [u + w, v + H],
          [u, v + H],
        ].map(([uu, vv]): XZ => [uu * ux - vv * uz, uu * uz + vv * ux])
        ctx.fillStyle = rnd() < 0.45 ? p.paddyAlt : p.paddy
        this.pathPoly(corners)
        ctx.fill()
        ctx.strokeStyle = p.ridge
        ctx.lineWidth = 0.32
        ctx.stroke()
        u += w
      }
    }
  }

  private paintGrain(alpha: number): void {
    if (alpha <= 0) return
    const tile = document.createElement('canvas')
    tile.width = tile.height = 128
    const tctx = tile.getContext('2d')
    if (!tctx) return
    const img = tctx.createImageData(128, 128)
    const rnd = makeRandom(99)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() < 0.5 ? 0 : 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = Math.floor(rnd() * 255 * alpha)
    }
    tctx.putImageData(img, 0, 0)
    const { ctx } = this
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const pat = ctx.createPattern(tile, 'repeat')
    if (pat) {
      ctx.fillStyle = pat
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    ctx.restore()
  }

  /** 多角形の中に点々を打つ（林の葉・河原の石） */
  private stipple(
    poly: readonly XZ[],
    holes: readonly XZ[][],
    color: string,
    density: number,
    rMin: number,
    rMax: number,
    seed: number,
  ): void {
    const { ctx } = this
    const rnd = makeRandom(seed)
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const [x, z] of poly) {
      minX = Math.min(minX, x)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxZ = Math.max(maxZ, z)
    }
    ctx.save()
    this.pathPoly(poly, holes)
    ctx.clip('evenodd')
    ctx.fillStyle = color
    const n = Math.floor((maxX - minX) * (maxZ - minZ) * density)
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const x = minX + rnd() * (maxX - minX)
      const z = minZ + rnd() * (maxZ - minZ)
      const r = rMin + rnd() * (rMax - rMin)
      ctx.moveTo(x + r, z)
      ctx.ellipse(x, z, r, r * (0.7 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.restore()
  }

  /** ぼかした塗り（影の仕組みを使う。blurM はメートル） */
  private softFill(poly: readonly XZ[], color: string, blurM: number): void {
    const { ctx } = this
    const OFF = 10000
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blurM * this.scale
    ctx.shadowOffsetX = OFF * this.scale
    ctx.fillStyle = '#000'
    ctx.translate(-OFF, 0)
    this.pathPoly(poly)
    ctx.fill()
    ctx.restore()
  }

  /** 以後の描画を、お休みの範囲の外に限る（範囲が重なっていてもよいよう、1つずつ切り抜く） */
  private clipOutsideRest(): void {
    const { ctx, data } = this
    const R = data.half * 2
    for (const z of data.restZones) {
      ctx.beginPath()
      ctx.rect(-R, -R, R * 2, R * 2)
      z.polygon.forEach(([x, zz], i) => (i ? ctx.lineTo(x, zz) : ctx.moveTo(x, zz)))
      ctx.closePath()
      ctx.clip('evenodd')
    }
  }

  private fillPoly(poly: readonly XZ[], holes?: readonly XZ[][]): void {
    this.pathPoly(poly, holes)
    this.ctx.fill('evenodd')
  }

  private pathPoly(poly: readonly XZ[], holes?: readonly XZ[][]): void {
    const { ctx } = this
    ctx.beginPath()
    const ring = (r: readonly XZ[]) => {
      r.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)))
      ctx.closePath()
    }
    ring(poly)
    for (const h of holes ?? []) ring(h)
  }

  private pathLine(line: readonly XZ[]): void {
    const { ctx } = this
    ctx.beginPath()
    line.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)))
  }

  /** 解像度を変える（画質の切り替え）。WebGL のテクスチャは大きさを変えられないので作り直させる */
  resize(size: number): void {
    this.canvas.width = this.canvas.height = size
    this.scale = size / (this.data.half * 2)
    this.texture.dispose()
  }

  dispose(): void {
    this.texture.dispose()
  }
}

/** 道の向きの多数決（90°の周期）。田の区画の向きに使う */
function dominantRoadAngle(data: FieldData): number {
  const bins = new Array(18).fill(0)
  for (const r of data.roads) {
    if (r.kind === 'path' || r.kind === 'steps') continue
    for (let i = 1; i < r.points.length; i++) {
      const dx = r.points[i][0] - r.points[i - 1][0]
      const dz = r.points[i][1] - r.points[i - 1][1]
      const len = Math.hypot(dx, dz)
      let a = Math.atan2(dz, dx)
      a = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
      bins[Math.min(17, Math.floor((a / (Math.PI / 2)) * 18))] += len
    }
  }
  let best = 0
  for (let i = 1; i < 18; i++) if (bins[i] > bins[best]) best = i
  return ((best + 0.5) / 18) * (Math.PI / 2)
}
