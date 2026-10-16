// 妖怪の気配。地点に、墨のにじみのような揺らめく印（Canvas で作ったテクスチャのスプライト）を置く。
// 近く（6m 以内）に来ると、印が濃くなり、画面に「耳を澄ます」が出る（段階2。yume/encounter）。
// 耳を澄ますと印がふくらみ（霞が寄る）、夢の姿が浮かぶと印は消える。会ったあとは、淡く小さな印になる。

import * as THREE from 'three'
import { bendDrop } from '../bend'
import type { SpotLocal } from '../data'
import { makeRandom } from '../geom2d'
import type { HeightField } from './heightfield'

export const SPOT_NEAR_M = 6

/** 墨のにじみ。rgb を淡い色にすると、夜・夕の地面の上で印の縁を見せる「淡い光の縁」になる */
function inkBlotTexture(seed: number, rgb = '18,16,15', rgbOuter = '24,22,20'): THREE.CanvasTexture {
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
    g.addColorStop(0, `rgba(${rgbOuter},0.10)`)
    g.addColorStop(0.75, `rgba(${rgbOuter},0.06)`)
    g.addColorStop(1, `rgba(${rgbOuter},0)`)
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
    g.addColorStop(0, `rgba(${rgb},0.55)`)
    g.addColorStop(0.6, `rgba(${rgb},0.3)`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 飛沫
  ctx.fillStyle = `rgba(${rgb},0.6)`
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
  /** 耳を澄ます進み具合（0..1） */
  listen: number
  /** 夢の姿が浮かんでいる間は消す（0..1） */
  hide: number
  /** 会ったあと（淡く小さく） */
  met: number
}

export class SpotMarkers {
  readonly group = new THREE.Group()
  private readonly views: SpotView[] = []
  private readonly texHalo: THREE.Texture
  private readonly texHaloPale: THREE.Texture
  /** 夜・夕の淡い縁（0 = 昼の墨の外輪のまま） */
  private pale = 0

  constructor(spots: SpotLocal[], hf: HeightField) {
    const texA = inkBlotTexture(11)
    const texB = inkBlotTexture(29)
    this.texHalo = texB
    // 夜・夕は外輪だけを淡い月明かりの色にして、暗い地面の上で墨の芯の形が浮くようにする（描画命令は増やさない）
    this.texHaloPale = inkBlotTexture(29, '226,222,238', '214,210,230')
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
        listen: 0,
        hide: 0,
        met: 0,
      })
    })
  }

  /**
   * 時間帯に合わせる。夜と夕は外輪を淡い色に替える（06 §2.3「光るのは灯り・月・粒だけ」に触れないよう、
   * 加算ではなくふつうの重ね方の淡い紙色。光ではなく「霞の白さ」として見せる）
   */
  setTime(time: 'day' | 'dusk' | 'night'): void {
    this.pale = time === 'night' ? 1 : time === 'dusk' ? 0.5 : 0
    const map = this.pale > 0 ? this.texHaloPale : this.texHalo
    for (const v of this.views) {
      if (v.halo.material.map !== map) {
        v.halo.material.map = map
        v.halo.material.needsUpdate = true
      }
    }
  }

  /** 地点の地面の高さ */
  groundOf(id: string): number {
    return this.views.find((v) => v.spot.id === id)?.ground ?? 0
  }

  /** 耳を澄ます進み具合と、夢の姿が浮かんでいる量（0..1） */
  setFocus(id: string | null, listen: number, hide: number): void {
    for (const v of this.views) {
      const on = v.spot.id === id
      v.listen = on ? listen : 0
      v.hide = on ? hide : 0
    }
  }

  /** 会った妖怪の地点（淡く小さく） */
  setMet(isMet: (spot: SpotLocal) => boolean): void {
    for (const v of this.views) v.met = isMet(v.spot) ? 1 : 0
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
      // 会ったあとは淡く小さく、耳を澄ますとふくらみ、夢の姿が浮かぶと消える
      const keep = (1 - v.hide) * (1 - 0.45 * v.met)
      const s = (3.6 + v.near * 1.0 + v.listen * 3.2) * breathe * (1 - 0.3 * v.met) * (1 + 0.6 * v.hide)
      v.core.position.set(v.spot.x, y, v.spot.z)
      v.core.scale.set(s, s, 1)
      const cm = v.core.material
      cm.rotation = Math.sin(t * 0.35) * 0.5
      cm.opacity = (0.7 + 0.15 * Math.sin(t * 2.1) + v.near * 0.15 - v.listen * 0.35) * keep
      const hs = s * (1.7 + 0.15 * Math.sin(t * 0.7))
      v.halo.position.set(v.spot.x, y - 0.1, v.spot.z)
      v.halo.scale.set(hs, hs, 1)
      const hm = v.halo.material
      hm.rotation = -t * 0.12
      hm.opacity = (0.22 + 0.1 * Math.sin(t * 1.1 + 1) + v.near * 0.15 + v.listen * 0.2 + 0.25 * this.pale) * keep
    }
    return nearest
  }
}
