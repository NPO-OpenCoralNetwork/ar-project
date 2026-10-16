// 地面に貼る絵（Canvas）。田の区画・畦・林・河原・駐車場・家まわりの土・焼き込みの影・お休みの範囲の霞を描く。
// 道と水は 3D の帯/面で別に描くが、下地にも少し描いておき、すき間が見えないようにする。

import * as THREE from 'three'
import type { FieldData } from '../data'
import { convexHull, makeRandom, type XZ } from '../geom2d'
import type { Palette } from '../palette'

/** 焼き込みの影の向きと長さを決める光（方位は北=0°・東=90°、高度は地平から）。既定は白描の南南西の日 */
export interface GroundLight {
  azDeg: number
  elDeg: number
}
const DEFAULT_LIGHT: GroundLight = { azDeg: 200, elDeg: 42 }
/** size は「400m あたりの画素数」。長い辺の画素はこの割合で決め、GPU の上限を超えないよう 4096 で頭打ちにする */
const REF_M = 400
const MAX_PX = 4096

export class GroundTexture {
  readonly canvas: HTMLCanvasElement
  readonly texture: THREE.CanvasTexture
  private readonly ctx: CanvasRenderingContext2D
  private scale: number
  private readonly paddyAngle: number
  /** 木の根元（木の下の陰を描く） */
  treeSpots: { x: number; z: number; r: number }[] = []

  constructor(
    private readonly data: FieldData,
    size: number,
  ) {
    this.canvas = document.createElement('canvas')
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d が使えません')
    this.ctx = ctx
    this.scale = this.setSize(size)
    this.paddyAngle = dominantRoadAngle(data)
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping
  }

  paint(p: Palette, light: GroundLight = DEFAULT_LIGHT): void {
    const { ctx, data } = this
    const rc = data.rect
    const W = rc.maxX - rc.minX
    const D = rc.maxZ - rc.minZ
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    // 画素の縦横の比は、範囲の縦横の比と同じ（切り上げで少しずれる分は、x と z で別の倍率にして吸収する）
    const sx = this.canvas.width / W
    const sz = this.canvas.height / D
    ctx.setTransform(sx, 0, 0, sz, -rc.minX * sx, -rc.minZ * sz)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // 1. 田（区画・畦）
    ctx.fillStyle = p.paddy
    ctx.fillRect(rc.minX, rc.minZ, W, D)
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
      // 光と霞は、粒を倍の径のやわらかい斑に（数は減らす。水玉に見えないように）
      const soft = p.id === 'hikari' ? 2 : 1
      this.stipple(a.polygon, [], p.forestDotLight, 0.22 / (soft * 1.6), 0.8 * soft, 1.6 * soft, 21)
      this.stipple(a.polygon, [], p.forestDot, 0.16 / (soft * 1.6), 0.35 * soft, 0.8 * soft, 22)
    }

    // 5. 駐車場（境内のものは描かない）
    ctx.fillStyle = p.parking
    for (const a of data.landuse) {
      if (a.kind === 'parking' && !a.inRestZone) this.fillPoly(a.polygon)
    }
    // 駅の構内（ホームと駅舎を囲む凸包）も、田ではなく駐車場と同じ土の色にする
    const yard = stationYard(data)
    if (yard) this.fillPoly(yard)

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

    // 7. 焼き込みの影（建物の、光と反対側と足元）。影は光の反対の向きへ、低い光ほど長く
    const az = THREE.MathUtils.degToRad(light.azDeg)
    const shadowDir: XZ = [-Math.sin(az), Math.cos(az)]
    const off = Math.min(6, 2.34 / Math.tan(THREE.MathUtils.degToRad(Math.max(12, light.elDeg))))
    for (const b of data.buildings) {
      const shifted = b.polygon.map(([x, z]): XZ => [x + shadowDir[0] * off, z + shadowDir[1] * off])
      this.softFill(shifted, p.shadow, 2.2)
      this.softFill(b.polygon, p.shadow, 1.0)
    }
    // 木の下の陰（まとめて1回のぼかし塗り）
    if (this.treeSpots.length && p.id !== 'hakubyo') {
      const k = off * 0.35
      this.softCircles(
        this.treeSpots.map((t) => ({ x: t.x + shadowDir[0] * k, z: t.z + shadowDir[1] * k, r: t.r * 0.8 })),
        p.shadow,
        1.4,
      )
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
    ctx.strokeRect(rc.minX + 1.2, rc.minZ + 1.2, W - 2.4, D - 2.4)
    ctx.restore()

    this.texture.needsUpdate = true
  }

  private paintPaddies(p: Palette): void {
    const { ctx, data } = this
    const rnd = makeRandom(7)
    const a = this.paddyAngle
    const ux = Math.cos(a)
    const uz = Math.sin(a)
    // 原点のまわりに回した区画で、範囲の4隅まで覆う
    const r = data.rect
    const R = Math.max(...[r.minX, r.maxX].flatMap((x) => [r.minZ, r.maxZ].map((z) => Math.hypot(x, z)))) + 30
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

  /** ぼかした丸をまとめて塗る（重なっても濃くならない） */
  private softCircles(spots: { x: number; z: number; r: number }[], color: string, blurM: number): void {
    const { ctx } = this
    const OFF = 10000
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blurM * this.scale
    ctx.shadowOffsetX = OFF * this.scale
    ctx.fillStyle = '#000'
    ctx.translate(-OFF, 0)
    ctx.beginPath()
    for (const s of spots) {
      ctx.moveTo(s.x + s.r, s.z)
      ctx.arc(s.x, s.z, s.r, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.restore()
  }

  /** 以後の描画を、お休みの範囲の外に限る（範囲が重なっていてもよいよう、1つずつ切り抜く） */
  private clipOutsideRest(): void {
    const { ctx, data } = this
    const r = data.rect
    const R = Math.max(Math.abs(r.minX), Math.abs(r.maxX), Math.abs(r.minZ), Math.abs(r.maxZ)) * 2
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
    this.scale = this.setSize(size)
    this.texture.dispose()
  }

  /** 画素の大きさを決める。返り値は 1m あたりの画素数（ぼかしの幅に使う） */
  private setSize(size: number): number {
    const r = this.data.rect
    const W = r.maxX - r.minX
    const D = r.maxZ - r.minZ
    const pxPerM = Math.min(size / REF_M, MAX_PX / Math.max(W, D))
    this.canvas.width = Math.ceil(W * pxPerM)
    this.canvas.height = Math.ceil(D * pxPerM)
    // ぼかしのずらし（softFill）は x の倍率で測るので、x の実際の倍率を返す
    return this.canvas.width / W
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

/** 駅の構内のおおよその形（ホームの面と駅舎を囲む凸包。ホームが無ければ null） */
function stationYard(data: FieldData): XZ[] | null {
  if (!data.platforms.length) return null
  const pts: XZ[] = []
  for (const pl of data.platforms) pts.push(...pl)
  for (const b of data.buildings) if (b.kind === 'train_station') pts.push(...b.polygon)
  const hull = convexHull(pts)
  return hull.length >= 3 ? hull : null
}
