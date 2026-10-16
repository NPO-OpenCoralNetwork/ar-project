// 木。林の面の中には杉（円錐を2段）を中心に、家のまわりには屋敷林の広葉樹を少し。
// 種類ごとに InstancedMesh にまとめる（幹・杉・広葉樹で描画命令3回）。

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyBend } from '../bend'
import type { FieldData } from '../data'
import { bboxOf, inBox, makeRandom, nearestOnPolyline, nearestOnRing, pointInPolygon, type XZ } from '../geom2d'
import type { Palette } from '../palette'
import type { HeightField } from './heightfield'

const UP = new THREE.Vector3(0, 1, 0)

interface TreeSpec {
  x: number
  z: number
  y: number
  h: number
  r: number
  broad: boolean
  tint: number
}

export class Trees {
  readonly group = new THREE.Group()
  readonly count: number
  private readonly cedarMat: THREE.MeshLambertMaterial
  private readonly broadMat: THREE.MeshLambertMaterial
  private readonly trunkMat: THREE.MeshLambertMaterial

  constructor(data: FieldData, hf: HeightField, maxTrees: number) {
    const specs = placeTrees(data, hf, maxTrees)
    this.count = specs.length

    const cone1 = new THREE.ConeGeometry(1, 0.6, 8, 1, true).translate(0, 0.3 + 0.28, 0)
    const cone2 = new THREE.ConeGeometry(0.68, 0.6, 8, 1, true).translate(0, 0.3 + 0.62, 0)
    const cedarGeo = mergeGeometries([cone1.toNonIndexed(), cone2.toNonIndexed()])!
    const broadGeo = new THREE.IcosahedronGeometry(1, 0).scale(1, 0.42, 1).translate(0, 0.6, 0)
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.14, 1, 5, 1, true).translate(0, 0.5, 0)

    this.cedarMat = applyBend(new THREE.MeshLambertMaterial({ flatShading: true }), { inkRim: true })
    this.broadMat = applyBend(new THREE.MeshLambertMaterial({ flatShading: true }), { inkRim: true })
    this.trunkMat = applyBend(new THREE.MeshLambertMaterial())

    const cedars = specs.filter((s) => !s.broad)
    const broads = specs.filter((s) => s.broad)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: TreeSpec[], name: string) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
      im.count = list.length
      list.forEach((s, i) => {
        q.setFromAxisAngle(UP, s.tint * 6.28)
        m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.r, s.h, s.r))
        im.setMatrixAt(i, m)
        col.setScalar(0.86 + s.tint * 0.22)
        im.setColorAt(i, col)
      })
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      im.castShadow = true
      im.receiveShadow = true
      im.frustumCulled = false
      im.name = name
      this.group.add(im)
    }
    mk(cedarGeo, this.cedarMat, cedars, 'cedars')
    mk(broadGeo, this.broadMat, broads, 'broadleaf')

    const trunks = new THREE.InstancedMesh(trunkGeo, this.trunkMat, Math.max(1, specs.length))
    trunks.count = specs.length
    specs.forEach((s, i) => {
      const th = s.broad ? s.h * 0.45 : s.h * 0.4
      m.compose(new THREE.Vector3(s.x, s.y - 0.2, s.z), new THREE.Quaternion(), new THREE.Vector3(s.r * 0.9, th, s.r * 0.9))
      trunks.setMatrixAt(i, m)
    })
    trunks.instanceMatrix.needsUpdate = true
    trunks.frustumCulled = false
    trunks.castShadow = true
    trunks.name = 'trunks'
    this.group.add(trunks)
  }

  setPalette(p: Palette): void {
    this.cedarMat.color.set(p.canopy)
    this.broadMat.color.set(p.canopyBroad)
    this.trunkMat.color.set(p.trunk)
  }
}

function placeTrees(data: FieldData, hf: HeightField, maxTrees: number): TreeSpec[] {
  const rnd = makeRandom(1234)
  const out: TreeSpec[] = []
  const half = data.half - 3
  const buildings = data.buildings.map((b) => ({ poly: b.polygon, box: bboxOf(b.polygon, 2) }))
  // 境内（お休みの範囲）の中には木を置かない（作り込まず、霧だけにする）。
  // 境内の道（inRestZone）はよけない（よけると、隠した参道の形が木のない筋として見えてしまう）
  const rests = data.restZones.map((z) => ({ poly: z.polygon, box: bboxOf(z.polygon, 2) }))
  const roads = data.roads.filter((r) => !r.tunnel && !r.inRestZone)
  const waters = data.waterLines.filter((w) => !w.tunnel && !w.inRestZone)
  const waterAreas = data.waterAreas.filter((a) => a.kind !== 'river')
  const blocked = (x: number, z: number, clear: number) => {
    if (Math.abs(x) > half || Math.abs(z) > half) return true
    for (const r of rests) {
      if (!inBox(r.box, x, z)) continue
      if (pointInPolygon(x, z, r.poly) || nearestOnRing(x, z, r.poly).dist < 1) return true
    }
    for (const b of buildings) {
      if (!inBox(b.box, x, z)) continue
      if (pointInPolygon(x, z, b.poly) || nearestOnRing(x, z, b.poly).dist < clear) return true
    }
    for (const r of roads) if (nearestOnPolyline(x, z, r.points).dist < r.widthM / 2 + clear) return true
    for (const w of waters) if (nearestOnPolyline(x, z, w.points).dist < w.widthM / 2 + clear) return true
    for (const a of waterAreas) if (pointInPolygon(x, z, a.polygon)) return true
    return false
  }
  const add = (x: number, z: number, broad: boolean, scale: number) => {
    const h = broad ? (4.5 + rnd() * 3.5) * scale : (9 + rnd() * 6) * scale
    const r = broad ? h * (0.3 + rnd() * 0.08) : h * (0.16 + rnd() * 0.04)
    out.push({ x, z, y: hf.heightAt(x, z), h, r, broad, tint: rnd() })
  }

  // 林
  for (const a of data.landuse) {
    if (a.kind !== 'forest') continue
    const box = bboxOf(a.polygon)
    const step = 5.2
    for (let z = box.minZ; z < box.maxZ; z += step) {
      for (let x = box.minX; x < box.maxX; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9
        const pz = z + (rnd() - 0.5) * step * 0.9
        if (!pointInPolygon(px, pz, a.polygon)) continue
        if (blocked(px, pz, 1.2)) continue
        add(px, pz, rnd() < 0.25, 1)
      }
    }
  }

  // 中洲の木（河原の穴）
  for (const a of data.waterAreas) {
    for (const h of a.holes ?? []) {
      const box = bboxOf(h)
      for (let i = 0; i < 40; i++) {
        const px = box.minX + rnd() * (box.maxX - box.minX)
        const pz = box.minZ + rnd() * (box.maxZ - box.minZ)
        if (pointInPolygon(px, pz, h) && !blocked(px, pz, 1)) add(px, pz, true, 0.9)
      }
    }
  }

  // 屋敷林（家のまわりに数本）
  data.buildings.forEach((b, idx) => {
    const n = 1 + Math.floor(rnd() * 3)
    let cx = 0
    let cz = 0
    for (const [x, z] of b.polygon) {
      cx += x
      cz += z
    }
    cx /= b.polygon.length
    cz /= b.polygon.length
    for (let k = 0; k < n; k++) {
      const ang = rnd() * Math.PI * 2
      const near = nearestOnRing(cx, cz, b.polygon as XZ[]).dist
      const d = near + 4 + rnd() * 5
      const px = cx + Math.cos(ang) * d
      const pz = cz + Math.sin(ang) * d
      if (!blocked(px, pz, 1.8)) add(px, pz, (idx + k) % 3 !== 0, 0.85)
    }
  })

  if (out.length > maxTrees) {
    // 間引くときも見た目が偏らないよう、一定の間隔で選ぶ
    const keep: TreeSpec[] = []
    const stride = out.length / maxTrees
    for (let i = 0; i < maxTrees; i++) keep.push(out[Math.floor(i * stride)])
    return keep
  }
  return out
}
