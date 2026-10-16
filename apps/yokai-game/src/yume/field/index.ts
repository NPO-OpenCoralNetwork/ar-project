// 箱庭（フィールド）をまとめて組み立てる。

import * as THREE from 'three'
import { aoUniforms, applyBend, inkRimUniforms } from '../bend'
import { type FieldData, inRect, type RoadData } from '../data'
import { bboxOf, densify, pointInPolygon, type XZ } from '../geom2d'
import type { PerQuality, ScenePalette } from '../hikari'
import { Walkability } from '../walk'
import { backdropUniforms, createBackdrop, setBackdropPalette } from './backdrop'
import { Buildings } from './buildings'
import { drapedGeometry, isConvex, subtractConvex, triangulateDraped } from './drape'
import { GroundTexture } from './ground-texture'
import { HeightField } from './heightfield'
import { Lamps } from './lamps'
import { Motes } from './motes'
import { createInkLineMaterial, InkLineBuilder, inkLineUniforms, LineKind } from './ink-lines'
import { RestMist, mistUniforms } from './rest-mist'
import { clipEdgeRuns, type RibbonInput, RibbonSet } from './ribbons'
import { SpotMarkers } from './spots'
import { addContours, createTerrainMesh, OuterLand } from './terrain'
import { Trees } from './trees'

export interface FieldOptions {
  textureSize: number
  maxTrees: number
  maxPuffs: number
}

const ROAD_LIFT: Record<string, number> = {
  unclassified: 0.1,
  residential: 0.11,
  service: 0.12,
  track: 0.13,
  path: 0.14,
  steps: 0.14,
}

export class Field {
  readonly group = new THREE.Group()
  readonly hf: HeightField
  readonly walk: Walkability
  readonly spots: SpotMarkers
  readonly stats: {
    trees: number
    lineSegments: number
    ribbonTriangles: number
    buildings: number
    placeholders: number
    windows: number
  }
  private readonly ground: GroundTexture
  private readonly outer: OuterLand
  private readonly roads: RibbonSet
  private readonly waters: RibbonSet
  private readonly pondMat: THREE.MeshLambertMaterial
  private readonly buildings: Buildings
  private readonly trees: Trees
  readonly lamps: Lamps
  readonly motes: Motes
  private textureSize: number
  private palette: ScenePalette | null = null

  constructor(
    readonly data: FieldData,
    opts: FieldOptions,
  ) {
    const rect = data.rect
    // 標高の格子が粗い（6m 以上）ときだけ、なめらかに2分割する。5m の格子はそのまま（三角形の数を抑える）
    this.hf = new HeightField(data.dem, data.dem.step > 5.5 ? 2 : 1)
    this.walk = new Walkability(data, this.hf)
    this.textureSize = opts.textureSize
    const lines = new InkLineBuilder()

    // 空・書き割り・霞（画面の上の方。最後に描く）
    this.group.add(createBackdrop(data.skyline))

    // 地面
    this.ground = new GroundTexture(data, opts.textureSize)
    this.group.add(createTerrainMesh(this.hf, rect, this.ground.texture))
    this.outer = new OuterLand(this.hf, rect)
    this.group.add(this.outer.mesh)
    addContours(this.hf, lines, 2)

    // 道と線路
    const roads = data.roads.filter((r) => !r.inRestZone)
    const roadInputs: RibbonInput[] = roads.map((r) => ({
      points: r.points,
      width: r.widthM,
      tone: r.kind === 'path' || r.kind === 'steps' || r.kind === 'track' ? 'path' : 'road',
      lift: ROAD_LIFT[r.kind] ?? 0.12,
      bridge: r.bridge,
    }))
    const railInputs: RibbonInput[] = data.rails.map((r) => ({
      points: r.points,
      width: 3.2,
      tone: 'ballast',
      lift: 0.09,
      bridge: r.bridge,
      walkable: false,
    }))
    this.roads = new RibbonSet([...roadInputs, ...railInputs], this.hf)
    this.group.add(this.roads.mesh)
    this.walk.setSurface((x, z, pad) => this.roads.surfaceAt(x, z, pad))
    this.addRoadEdges(roads, lines)
    this.addRails(lines)

    // 水（境内の中の区間・池は描かない）
    const waterLines = data.waterLines.filter((w) => !w.tunnel && !w.inRestZone)
    this.waters = new RibbonSet(
      waterLines.map((w) => ({ points: w.points, width: w.widthM, tone: 'water', lift: 0.12 })),
      this.hf,
    )
    this.group.add(this.waters.mesh)
    this.waters.edges.forEach((e) => {
      lines.polyline(e.left, LineKind.Edge, 0.9, 0.8)
      lines.polyline(e.right, LineKind.Edge, 0.9, 0.8)
    })
    this.pondMat = applyBend(
      new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    )
    const pondGeos: THREE.BufferGeometry[] = []
    for (const a of data.waterAreas) {
      if (a.kind === 'river') {
        // 河原の縁（箱庭の端に沿う辺は描かない）
        this.addDrapedOutline(a.polygon, lines, LineKind.Edge, 0.8, 0.45, true)
        for (const h of a.holes ?? []) this.addDrapedOutline(h, lines, LineKind.Edge, 0.7, 0.35, true)
        continue
      }
      if (a.inRestZone) continue
      // 一部だけ境内にかかる面は、境内の部分を切り取る
      const tris = this.cutRestZones(triangulateDraped(a.polygon, a.holes ?? [], 3))
      if (tris.length) pondGeos.push(drapedGeometry(tris, (x, z) => this.hf.heightAt(x, z) + 0.14))
      this.addDrapedOutline(a.polygon, lines, LineKind.Edge, 1, 0.9, false)
    }
    if (pondGeos.length) {
      const merged = mergeDraped(pondGeos)
      // 水面は平らに光らせる（三角形ごとの法線の揺れで、面がガラスのかけらのように見えないように）
      const nrm = merged.getAttribute('normal') as THREE.BufferAttribute
      for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0)
      nrm.needsUpdate = true
      const pond = new THREE.Mesh(merged, this.pondMat)
      pond.frustumCulled = false
      pond.renderOrder = 1
      pond.name = 'ponds'
      this.group.add(pond)
    }

    // 林の縁（白描で淡く）。境内の林は描かない
    for (const a of data.landuse) {
      if (a.kind === 'forest' && !a.inRestZone) this.addDrapedOutline(a.polygon, lines, LineKind.Contour, 1.1, 1.4, true)
    }

    // 建物（お休みの範囲にかかるものは、データの段階で外してある）
    this.buildings = new Buildings(data.buildings, data.platforms, this.hf, lines)
    this.group.add(this.buildings.group)

    // 木
    this.trees = new Trees(data, this.hf, opts.maxTrees)
    this.group.add(this.trees.group)
    this.ground.treeSpots = this.trees.spots

    // 道沿いの小さな灯りと、光の粒（光と霞）
    this.lamps = new Lamps(data, this.hf, (x, z) => this.walk.isInsideRest(x, z))
    this.group.add(this.lamps.group)
    this.motes = new Motes(this.hf)
    this.group.add(this.motes.points)

    // 墨の線（1回の描画）
    const lineMesh = lines.build(createInkLineMaterial())
    lineMesh.name = 'ink-lines'
    this.group.add(lineMesh)

    // お休みの範囲の霧
    this.group.add(new RestMist(data.restZones, this.hf, rect, opts.maxPuffs).group)

    // 妖怪の気配
    this.spots = new SpotMarkers(data.spots, this.hf)
    this.group.add(this.spots.group)

    this.stats = {
      trees: this.trees.count,
      lineSegments: lines.segments,
      ribbonTriangles: this.roads.triangleCount + this.waters.triangleCount,
      buildings: data.buildings.length,
      placeholders: data.buildings.filter((b) => b.placeholder).length,
      windows: this.buildings.windowCount,
    }
  }

  /** 三角形の列から、お休みの範囲の中の部分を取り除く（凸の範囲は正確に切り、凸でなければ三角形ごとに外す） */
  private cutRestZones(tris: XZ[][]): XZ[][] {
    let cur = tris
    for (const z of this.data.restZones) {
      const box = bboxOf(z.polygon)
      const convex = isConvex(z.polygon)
      const next: XZ[][] = []
      for (const t of cur) {
        const tb = bboxOf(t)
        if (tb.maxX < box.minX || tb.minX > box.maxX || tb.maxZ < box.minZ || tb.minZ > box.maxZ) {
          next.push(t)
          continue
        }
        if (convex) next.push(...subtractConvex(t, z.polygon))
        else if (!pointInPolygon((t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, z.polygon)) next.push(t)
      }
      cur = next
    }
    return cur
  }

  private addRoadEdges(roads: RoadData[], lines: InkLineBuilder): void {
    const others = roads.map((r) => ({ points: r.points, width: r.widthM }))
    this.roads.edges.forEach((e, i) => {
      if (i >= roads.length) return
      const w = roads[i].kind === 'path' || roads[i].kind === 'steps' ? 0.75 : 1
      for (const side of [e.left, e.right]) {
        for (const run of clipEdgeRuns(side, others, i)) lines.polyline(run, LineKind.Edge, w, 1)
      }
    })
  }

  private addRails(lines: InkLineBuilder): void {
    for (const r of this.data.rails) {
      const pts = densify(r.points, 1.2)
      for (const off of [-0.55, 0.55]) {
        const rail: THREE.Vector3[] = []
        pts.forEach((p, i) => {
          const q = pts[Math.min(pts.length - 1, i + 1)]
          const o = pts[Math.max(0, i - 1)]
          const tx = q[0] - o[0]
          const tz = q[1] - o[1]
          const l = Math.hypot(tx, tz) || 1
          const x = p[0] - (tz / l) * off
          const z = p[1] + (tx / l) * off
          rail.push(new THREE.Vector3(x, this.hf.heightAt(x, z) + 0.3, z))
        })
        lines.polyline(rail, LineKind.Rail, 0.9, 1)
      }
      // 枕木
      for (let i = 0; i < pts.length; i++) {
        const q = pts[Math.min(pts.length - 1, i + 1)]
        const o = pts[Math.max(0, i - 1)]
        const tx = q[0] - o[0]
        const tz = q[1] - o[1]
        const l = Math.hypot(tx, tz) || 1
        const nx = -tz / l
        const nz = tx / l
        const y = this.hf.heightAt(pts[i][0], pts[i][1]) + 0.26
        lines.segment(
          new THREE.Vector3(pts[i][0] + nx * 1.0, y, pts[i][1] + nz * 1.0),
          new THREE.Vector3(pts[i][0] - nx * 1.0, y, pts[i][1] - nz * 1.0),
          LineKind.Rail,
          0.6,
          0.6,
        )
      }
    }
  }

  private addDrapedOutline(
    poly: readonly XZ[],
    lines: InkLineBuilder,
    kind: LineKind,
    width: number,
    alpha: number,
    skipBorder: boolean,
  ): void {
    const ring = [...poly, poly[0]]
    const pts = densify(ring, 2.5)
    const onBorder = (p: XZ) => !inRect(this.data.rect, p[0], p[1], 0.6)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if (skipBorder && onBorder(a) && onBorder(b)) continue
      // 境内（お休みの範囲）の中を通る辺は描かない
      if (this.walk.isInsideRest((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue
      lines.segment(
        new THREE.Vector3(a[0], this.hf.heightAt(a[0], a[1]) + 0.08, a[1]),
        new THREE.Vector3(b[0], this.hf.heightAt(b[0], b[1]) + 0.08, b[1]),
        kind,
        width,
        alpha,
      )
    }
  }

  /** カメラの前をふさぎうる物（家の壁と屋根・木・灯りの柱）。会話のときの向き選びの当たり判定に使う */
  get occluders(): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    for (const m of this.buildings.group.children) if (m.name !== 'windows') out.push(m)
    out.push(...this.trees.group.children)
    for (const m of this.lamps.group.children) if (m.name === 'lamps') out.push(m)
    return out
  }

  setAnisotropy(n: number): void {
    this.ground.texture.anisotropy = n
    this.ground.texture.needsUpdate = true
  }

  setPalette(p: ScenePalette): void {
    this.palette = p
    this.ground.paint(p, p.light)
    this.outer.setPalette(p)
    this.roads.setPalette(p)
    this.waters.setPalette(p)
    this.pondMat.color.set(p.water)
    this.buildings.setPalette(p)
    this.trees.setPalette(p)
    setBackdropPalette(p)
    inkLineUniforms.uInk.value.set(p.ink)
    inkLineUniforms.uKindAlpha.value.set(p.lineAlpha.building, p.lineAlpha.edge, p.lineAlpha.contour, p.lineAlpha.rail)
    inkRimUniforms.uRimAmount.value = p.rim
    inkRimUniforms.uRimColor.value.set(p.ink)
    inkRimUniforms.uGlowRim.value = p.glowRim.strength
    inkRimUniforms.uGlowRimColor.value.set(p.glowRim.color)
    aoUniforms.uAOAmount.value = p.ao
    mistUniforms.uMistColor.value.set(p.mist)
    mistUniforms.uGlowColor.value.set(p.restGlow.color)
    mistUniforms.uGlowStrength.value = p.restGlow.strength
    mistUniforms.uEdgeColor.value.set(p.restGlow.edge)
    mistUniforms.uEdgeStrength.value = p.restGlow.edgeStrength
    mistUniforms.uPulseSec.value = p.restGlow.pulseSec
    this.lamps.setPalette(p)
    this.motes.setPalette(p)
    this.spots.setTime(p.time)
  }

  /** 画質ごとの数（灯りの輪・粒・紅葉） */
  setQualityLevel(q: keyof PerQuality): void {
    const max = this.palette?.lamps.max ?? { low: 10, std: 24, high: 36 }
    this.lamps.setQuality(max[q], q !== 'low')
    this.motes.setQuality(q)
  }

  /** 地面の絵の解像度を変える（画質の切り替え） */
  setTextureSize(size: number, p: ScenePalette): void {
    if (size === this.textureSize) return
    this.textureSize = size
    this.ground.resize(size)
    this.ground.paint(p, p.light)
  }

  /** x, z はアバターの位置（灯りの輪を近い順に選び、粒をまわりに散らす） */
  update(time: number, x = 0, z = 0): void {
    mistUniforms.uTime.value = time
    backdropUniforms.uTime.value = time
    this.lamps.update(time, x, z)
    this.motes.update(time, x, z, this.lamps)
  }
}

function mergeDraped(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0]
  const pos: number[] = []
  for (const g of geos) pos.push(...(g.getAttribute('position').array as Float32Array))
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.computeVertexNormals()
  return out
}
