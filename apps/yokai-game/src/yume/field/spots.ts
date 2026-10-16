// 妖怪の気配。地点に、墨のにじみのような揺らめく印（Canvas で作ったテクスチャのスプライト）を置く。
// 近く（6m 以内）に来ると、印が濃くなり、画面に「ここで耳を澄ます」が出る（段階2で実装）。

import * as THREE from 'three'
import { bendDrop } from '../bend'
import type { SpotLocal } from '../data'
import { makeRandom } from '../geom2d'
import type { HeightField } from './heightfield'

export const SPOT_NEAR_M = 6

function inkBlotTexture(seed: number): THREE.CanvasTexture {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = makeRandom(seed)
  ctx.translate(S / 2, S / 2)
  // にじみ（外側の淡い輪）
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2
    const d = rnd() * 38
    const r = 40 + rnd() * 50
    const g = ctx.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r)
    g.addColorStop(0, 'rgba(24,22,20,0.10)')
    g.addColorStop(0.75, 'rgba(24,22,20,0.06)')
    g.addColorStop(1, 'rgba(24,22,20,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 芯（濃い墨）
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2
    const d = rnd() * 16
    const r = 10 + rnd() * 22
    const g = ctx.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r)
    g.addColorStop(0, 'rgba(18,16,15,0.55)')
    g.addColorStop(0.6, 'rgba(18,16,15,0.3)')
    g.addColorStop(1, 'rgba(18,16,15,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 飛沫
  ctx.fillStyle = 'rgba(18,16,15,0.6)'
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2
    const d = 50 + rnd() * 62
    const r = 1 + rnd() * 3.5
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface SpotView {
  spot: SpotLocal
  ground: number
  core: THREE.Sprite
  halo: THREE.Sprite
  phase: number
  near: number
}

export class SpotMarkers {
  readonly group = new THREE.Group()
  private readonly views: SpotView[] = []

  constructor(spots: SpotLocal[], hf: HeightField) {
    const texA = inkBlotTexture(11)
    const texB = inkBlotTexture(29)
    spots.forEach((spot, i) => {
      const mk = (tex: THREE.Texture, opacity: number) => {
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity, fog: false })
        const s = new THREE.Sprite(m)
        s.renderOrder = 8
        this.group.add(s)
        return s
      }
      this.views.push({
        spot,
        ground: hf.heightAt(spot.x, spot.z),
        halo: mk(texB, 0.35),
        core: mk(texA, 0.75),
        phase: i * 2.1,
        near: 0,
      })
    })
  }

  /** いちばん近い地点（6m 以内）を返す */
  update(time: number, dt: number, px: number, pz: number): SpotLocal | null {
    let nearest: SpotLocal | null = null
    let best = Infinity
    for (const v of this.views) {
      const d = Math.hypot(v.spot.x - px, v.spot.z - pz)
      const isNear = d <= SPOT_NEAR_M
      v.near += ((isNear ? 1 : 0) - v.near) * (1 - Math.exp(-dt * 3))
      if (isNear && d < best) {
        best = d
        nearest = v.spot
      }
      const t = time + v.phase
      const breathe = 1 + 0.08 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 2.9)
      const y = v.ground + 1.7 + 0.25 * Math.sin(t * 0.9) - bendDrop(v.spot.x, v.spot.z)
      const s = (3.6 + v.near * 1.0) * breathe
      v.core.position.set(v.spot.x, y, v.spot.z)
      v.core.scale.set(s, s, 1)
      const cm = v.core.material
      cm.rotation = Math.sin(t * 0.35) * 0.5
      cm.opacity = 0.7 + 0.15 * Math.sin(t * 2.1) + v.near * 0.15
      const hs = s * (1.7 + 0.15 * Math.sin(t * 0.7))
      v.halo.position.set(v.spot.x, y - 0.1, v.spot.z)
      v.halo.scale.set(hs, hs, 1)
      const hm = v.halo.material
      hm.rotation = -t * 0.12
      hm.opacity = 0.22 + 0.1 * Math.sin(t * 1.1 + 1) + v.near * 0.15
    }
    return nearest
  }
}
