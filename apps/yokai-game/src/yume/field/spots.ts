// 妖怪の気配。地点に、墨のにじみのような揺らめく印（Canvas で作ったテクスチャのスプライト）を置く。
// 近く（6m 以内）に来ると、印が濃くなり、画面に「耳を澄ます」が出る（段階2。yume/encounter）。
// 耳を澄ますと印がふくらみ（霞が寄る）、夢の姿が浮かぶと印は消える。会ったあとは、淡く小さな印になる。
// 調べる地点（古い話の気配）は、絵巻の霞のような横長の帯の、小さく淡い印にする（色だけでなく形と大きさで見分ける）。
// 出すかどうかは地点ごとに決められる（調べる地点は、悩みを頼まれてから札を拾うまで）。隠した地点は描かず、近くにも数えない。

import * as THREE from 'three'
import { bendDrop } from '../bend'
import type { SpotLocal } from '../data'
import { makeRandom } from '../geom2d'
import type { HeightField } from './heightfield'

export const SPOT_NEAR_M = 6

/** 動きを減らす設定のときは、印の揺れ・回り・大きさの息づきを止める（濃さのゆらぎと、近づく・耳を澄ますときの変化は残す） */
const MOTION = (() => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1
  } catch {
    return 1
  }
})()

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

/**
 * 霞の帯の輪郭。下の辺はまっすぐ、両端は丸く、上の辺は低い丸い山（lobes 個）が並ぶ。
 * 山を低くして、まっすぐな棒（画面の「≡」の印）にも、漫画の雲にも見えないようにする。
 */
function kasumiBand(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, lobes: number, rnd: () => number): void {
  const r = h / 2
  const x0 = cx - w / 2 + r
  const x1 = cx + w / 2 - r
  ctx.beginPath()
  ctx.moveTo(x0, cy + r)
  ctx.lineTo(x1, cy + r)
  ctx.arc(x1, cy, r, Math.PI / 2, -Math.PI / 2, true)
  const step = (x1 - x0) / lobes
  for (let i = 0; i < lobes; i++) {
    // 弦 step・高さ s の円弧（右から左へ）
    const s = r * (0.45 + rnd() * 0.25)
    const R = (step * step) / (8 * s) + s / 2
    const th = Math.asin(Math.min(1, step / 2 / R))
    ctx.arc(x1 - step * (i + 0.5), cy - r - s + R, R, -Math.PI / 2 + th, -Math.PI / 2 - th, true)
  }
  ctx.arc(x0, cy, r, -Math.PI / 2, Math.PI / 2, true)
  ctx.closePath()
}

/**
 * 調べる地点の印。絵巻の場面の切れ目に引く霞のような横長の帯を、上下左右にずらして3本重ねる。
 * 帯の中は淡い紙の色（夜・夕の暗い地面の上でも形が見える）、縁は墨。妖怪の丸いにじみとは形で見分ける。
 */
function kasumiTexture(seed: number, rgb = '40,36,33'): THREE.CanvasTexture {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rnd = makeRandom(seed)
  ctx.translate(S / 2, S / 2)
  // 下地の淡いにじみ
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 108)
  g.addColorStop(0, `rgba(${rgb},0.09)`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, 108, 0, Math.PI * 2)
  ctx.fill()
  // 帯（中心の横のずれ、縦の位置、長さ、山の数）
  const bands: [number, number, number, number][] = [
    [-30, -38, 140, 3],
    [26, 4, 168, 4],
    [-12, 46, 104, 2],
  ]
  ctx.lineJoin = 'round'
  for (const [dx, y, w, lobes] of bands) {
    kasumiBand(ctx, dx, y, w, 20 + rnd() * 4, lobes, rnd)
    ctx.fillStyle = 'rgba(248,244,234,0.78)'
    ctx.fill()
    ctx.lineWidth = 4.5
    ctx.strokeStyle = `rgba(${rgb},0.72)`
    ctx.stroke()
  }
  // 小さな墨の点（にじみの飛沫より少なく）
  ctx.fillStyle = `rgba(${rgb},0.45)`
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2
    const d = 74 + rnd() * 36
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d * 1.1, Math.sin(a) * d * 0.7, 1 + rnd() * 2, 0, Math.PI * 2)
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
  /** 夢の姿が浮かんでいる間は消す（0..1）。消す方はすぐ、戻す方は update でゆっくり */
  hide: number
  /** setFocus で決めた hide の行き先（耳を澄ます・会話の地点でなければ 0） */
  hideTo: number
  /** 会ったあと（淡く小さく） */
  met: number
  /** 調べる地点（小さく淡い霞の帯の印） */
  quiet: boolean
  /** いま出している地点か（隠した地点は描かず、近くにも数えない） */
  visible: boolean
  /** 出す・隠すの途中（0..1。ゆっくり現れ、ゆっくり消える） */
  shown: number
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
    // 調べる地点の芯（霞の帯）は、調べる地点があるときだけ作る
    const texKasumi = spots.some((s) => s.role === 'clue') ? kasumiTexture(47) : null
    spots.forEach((spot, i) => {
      const mk = (tex: THREE.Texture, opacity: number) => {
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity, fog: false })
        const s = new THREE.Sprite(m)
        s.renderOrder = 8
        this.group.add(s)
        return s
      }
      const quiet = spot.role === 'clue'
      // 調べる地点は、頼まれるまで出さない（出すかどうかは、進み具合を見て yume/encounter が setVisible で決める）
      const visible = !quiet
      const halo = mk(texB, 0.35)
      const core = mk(quiet && texKasumi ? texKasumi : texA, 0.75)
      core.visible = halo.visible = visible
      this.views.push({
        spot,
        ground: hf.heightAt(spot.x, spot.z),
        halo,
        core,
        phase: i * 2.1,
        near: 0,
        listen: 0,
        hide: 0,
        hideTo: 0,
        met: 0,
        quiet,
        visible,
        shown: visible ? 1 : 0,
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

  /**
   * 耳を澄ます進み具合と、夢の姿が浮かんでいる量（0..1）。hide を下げる方は update でゆっくり戻す
   * （姿のない会話（調べる地点）を途中でやめたとき、その場に立ったままでも、印がぱっと戻らないように）
   */
  setFocus(id: string | null, listen: number, hide: number): void {
    for (const v of this.views) {
      const on = v.spot.id === id
      v.listen = on ? listen : 0
      v.hideTo = on ? hide : 0
      if (v.hideTo > v.hide) v.hide = v.hideTo
    }
  }

  /** 会った妖怪の地点（淡く小さく） */
  setMet(isMet: (spot: SpotLocal) => boolean): void {
    for (const v of this.views) v.met = isMet(v.spot) ? 1 : 0
  }

  /** 出す地点（ほかは隠す。隠した地点はゆっくり消えて描かなくなり、update の近くの地点にも返さない） */
  setVisible(isVisible: (spot: SpotLocal) => boolean): void {
    for (const v of this.views) v.visible = isVisible(v.spot)
  }

  /** いま出している地点か（確認用） */
  isVisible(id: string): boolean {
    return this.views.find((v) => v.spot.id === id)?.visible ?? false
  }

  /** いちばん近い地点（6m 以内。出している地点だけ）を返す */
  update(time: number, dt: number, px: number, pz: number): SpotLocal | null {
    let nearest: SpotLocal | null = null
    let best = Infinity
    for (const v of this.views) {
      v.shown += ((v.visible ? 1 : 0) - v.shown) * (1 - Math.exp(-dt * 2.5))
      // 隠す地点（札を拾った調べる地点など）は、会話のあとも hide のまま消えていく（薄く戻ってこないように）
      if (v.visible && v.hide > v.hideTo) v.hide = Math.max(v.hideTo, v.hide - dt * 1.5)
      // 隠した地点は、消えきったら描かない
      const drawn = v.visible || v.shown > 0.01
      v.core.visible = v.halo.visible = drawn
      if (!drawn) {
        v.shown = 0
        v.near = 0
        v.hide = 0
        continue
      }
      const d = Math.hypot(v.spot.x - px, v.spot.z - pz)
      const isNear = v.visible && d <= SPOT_NEAR_M
      v.near += ((isNear ? 1 : 0) - v.near) * (1 - Math.exp(-dt * 3))
      if (isNear && d < best) {
        best = d
        nearest = v.spot
      }
      const t = time + v.phase
      const breathe = 1 + MOTION * (0.08 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 2.9))
      const y = v.ground + (v.quiet ? 1.3 : 1.7) + MOTION * 0.25 * Math.sin(t * 0.9) - bendDrop(v.spot.x, v.spot.z)
      // 会ったあとは淡く小さく、耳を澄ますとふくらみ、夢の姿が浮かぶと消える。調べる地点は、もとから小さく淡い
      const keep = (1 - v.hide) * (1 - 0.45 * v.met) * v.shown * (v.quiet ? 0.8 : 1)
      const s = ((v.quiet ? 2.8 : 3.6) + v.near * 1.0 + v.listen * 3.2) * breathe * (1 - 0.3 * v.met) * (1 + 0.6 * v.hide)
      v.core.position.set(v.spot.x, y, v.spot.z)
      v.core.scale.set(s, s, 1)
      const cm = v.core.material
      // 霞の帯は、ほとんど傾けない（横長の形のまま見せる）
      cm.rotation = MOTION * Math.sin(t * 0.35) * (v.quiet ? 0.08 : 0.5)
      cm.opacity = (0.7 + 0.15 * Math.sin(t * 2.1) + v.near * 0.15 - v.listen * 0.35) * keep
      const hs = s * (v.quiet ? 1.35 : 1.7 + MOTION * 0.15 * Math.sin(t * 0.7))
      v.halo.position.set(v.spot.x, y - 0.1, v.spot.z)
      v.halo.scale.set(hs, hs, 1)
      const hm = v.halo.material
      hm.rotation = -t * 0.12 * MOTION
      hm.opacity = ((v.quiet ? 0.12 : 0.22) + 0.1 * Math.sin(t * 1.1 + 1) + v.near * 0.15 + v.listen * 0.2 + 0.25 * this.pale) * keep
    }
    return nearest
  }
}
