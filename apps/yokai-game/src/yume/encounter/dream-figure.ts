// 妖怪の「夢の姿」: 白描の絵を、切り絵の板のように地点に立てる（04 §3.1、06 §5 案A）。
// 紙の白と墨の線のまま、紙がほのかに明るい程度（光の影響を受けない）。時間帯の色（ましろの光の色と霧の色）に少しなじませる。
// 浮かぶときは、墨が紙に広がるように中心から現れ、消えるときは逆にほどける。

import * as THREE from 'three'
import { bendDrop } from '../bend'
import type { ScenePalette } from '../hikari'
import type { InkArt } from './art'

const TEX_W = 512
const TEX_H = 768

/** 絵をテクスチャにする。R = 覆い（紙か線）、G = 線、B = 外へのにじみ（ぼかした覆い） */
function artTexture(art: InkArt): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = TEX_W
  c.height = TEX_H
  const ctx = c.getContext('2d')!
  const pad = 0.1
  const s = Math.min((TEX_W * (1 - pad * 2)) / art.w, (TEX_H * (1 - pad)) / art.h)
  const ox = (TEX_W - art.w * s) / 2
  const oy = TEX_H - art.h * s - 6
  ctx.setTransform(s, 0, 0, s, ox, oy)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const part of art.parts) {
    if (part.fill) {
      ctx.fillStyle = '#ff0000'
      ctx.fill(new Path2D(part.fill))
    }
    ctx.strokeStyle = '#ffff00'
    for (const l of part.lines) {
      ctx.lineWidth = l.w * 1.15
      ctx.stroke(new Path2D(l.d))
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // にじみ（覆いをぼかしたもの）
  const g = document.createElement('canvas')
  g.width = TEX_W
  g.height = TEX_H
  const gx = g.getContext('2d')!
  try {
    gx.filter = 'blur(18px)'
  } catch {
    // filter が使えないブラウザでは、にじみなし
  }
  gx.drawImage(c, 0, 0)
  const img = ctx.getImageData(0, 0, TEX_W, TEX_H)
  const glow = gx.getImageData(0, 0, TEX_W, TEX_H).data
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255
    d[i] = Math.round(d[i] * a)
    d[i + 1] = Math.round(d[i + 1] * a)
    d[i + 2] = Math.round(glow[i] * (glow[i + 3] / 255))
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uGlow;
uniform float uFill;
uniform float uLine;
uniform float uGlowAmt;
uniform float uReveal;
uniform float uOpacity;
uniform float uTime;
uniform float uMax;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 t = texture2D(uMap, vUv);
  // 墨が紙に広がるように、中心から現れる（縁はむらのある境目）
  float n = vnoise(vUv * vec2(7.0, 10.0) + vec2(0.0, uTime * 0.12)) * 0.6 + vnoise(vUv * vec2(19.0, 27.0)) * 0.4;
  float d = length((vUv - vec2(0.5, 0.5)) * vec2(1.0, 0.8));
  float th = d * 1.3 + n * 0.55;
  float m = smoothstep(th - 0.14, th + 0.02, uReveal * 1.45);
  float cover = t.r;
  float line = t.g;
  float glow = t.b;
  float flick = 0.92 + 0.08 * sin(uTime * 2.1 + vUv.y * 8.0);
  vec3 col = mix(uPaper, uInk, line);
  float a = (max(cover - line, 0.0) * uFill + line * uLine) * m;
  float ga = clamp(glow * 1.6, 0.0, 1.0) * (1.0 - cover) * uGlowAmt * flick * m;
  float A = a + ga * (1.0 - a);
  // にじみ（ブルーム）のある画質では、しきい値を少し超える程度に抑える（紙が白く飛ばないように）
  vec3 C = min((col * a + uGlow * ga * (1.0 - a)) / max(A, 1e-4), vec3(uMax));
  gl_FragColor = vec4(C, A * uOpacity);
  #include <colorspace_fragment>
}
`

export class DreamFigure {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  private readonly heightM: number
  /** 0..1（浮かぶ途中） */
  private reveal = 0
  private target = 0
  private x = 0
  private z = 0
  private ground = 0
  private readonly paper = new THREE.Color()
  private readonly ink = new THREE.Color()
  private readonly glow = new THREE.Color()

  constructor(art: InkArt, heightM: number) {
    this.heightM = heightM
    const tex = artTexture(art)
    const w = heightM * (TEX_W / TEX_H)
    const geo = new THREE.PlaneGeometry(w, heightM)
    geo.translate(0, heightM / 2, 0)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uPaper: { value: this.paper },
        uInk: { value: this.ink },
        uGlow: { value: this.glow },
        uFill: { value: 0.7 },
        uLine: { value: 0.92 },
        uGlowAmt: { value: 0.55 },
        uReveal: { value: 0 },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
        uMax: { value: 10 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.renderOrder = 20
    this.mesh.visible = false
    this.mesh.frustumCulled = false
  }

  /** 地点に置く（地面の高さ ground） */
  placeAt(x: number, z: number, ground: number): void {
    this.x = x
    this.z = z
    this.ground = ground
  }

  get position(): { x: number; z: number; y: number } {
    return { x: this.x, z: this.z, y: this.ground }
  }

  get height(): number {
    return this.heightM
  }

  show(): void {
    this.target = 1
    this.mesh.visible = true
  }

  hide(): void {
    this.target = 0
  }

  get visibleAmount(): number {
    return this.reveal
  }

  /** 時間帯と見た目に合わせる（紙は光を受けないが、ましろの光の色と霧の色に少し寄せる） */
  setPalette(p: ScenePalette, look: 'hikari' | 'hakubyo'): void {
    const tint = new THREE.Color(p.mashiroGlow.color)
    const fog = new THREE.Color(p.fog)
    this.paper.set('#fbf8f0').lerp(tint, look === 'hikari' ? 0.28 : 0.12)
    this.ink.set('#342d28').lerp(fog, p.time === 'night' ? 0.08 : 0.12)
    this.glow.set('#ffffff').lerp(tint, 0.6)
    const u = this.mat.uniforms
    u.uFill.value = p.time === 'night' ? 0.62 : 0.7
    u.uLine.value = p.time === 'night' ? 0.9 : 0.96
    u.uGlowAmt.value = p.time === 'night' ? 0.85 : p.time === 'dusk' ? 0.7 : 0.55
  }

  /** にじみ（ブルーム）のしきい値（線形の明るさ）。null でにじみなし */
  setBloomThreshold(t: number | null): void {
    this.mat.uniforms.uMax.value = t === null ? 10 : t * 1.25
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    const rate = this.target > this.reveal ? 0.55 : 0.9
    this.reveal += Math.sign(this.target - this.reveal) * Math.min(Math.abs(this.target - this.reveal), dt * rate)
    if (this.reveal <= 0.001 && this.target === 0) {
      this.mesh.visible = false
      return
    }
    const u = this.mat.uniforms
    u.uReveal.value = this.reveal
    u.uTime.value = time
    // 少し浮いて、ゆっくり上下する
    const lift = 0.25 + 0.12 * Math.sin(time * 0.9)
    this.mesh.position.set(this.x, this.ground + lift - bendDrop(this.x, this.z), this.z)
    // 板はカメラの方を向く（縦の軸だけ回す）
    const cp = camera.position
    this.mesh.rotation.set(0, Math.atan2(cp.x - this.x, cp.z - this.z), Math.sin(time * 0.7) * 0.015)
  }
}
