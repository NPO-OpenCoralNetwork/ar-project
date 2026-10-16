// お休みの範囲（境内）の霧。建物も社殿も作らず、地面に沿う柔らかい霧の面と、漂う霧のかたまりで「ここは入らない場所」と示す。
// 光と霞では、霧そのものを内側からほのかに光らせて「中に灯りがある、入らない場所」を示す（06 §3.10。夜は琥珀、縁に朱）。

import * as THREE from 'three'
import { BEND_GLSL, bendUniforms } from '../bend'
import { bboxOf, makeRandom, nearestOnRing, pointInPolygon, polygonArea, type XZ } from '../geom2d'
import type { HeightField } from './heightfield'
import type { FieldRect } from '../data'
import { drapedGeometry, triangulateDraped } from './drape'

export const mistUniforms = {
  uTime: { value: 0 },
  uMistColor: { value: new THREE.Color(0xfbf9f4) },
  uMistOpacity: { value: 1 },
  uGlowColor: { value: new THREE.Color(0xe89a52) },
  uGlowStrength: { value: 0 },
  uEdgeColor: { value: new THREE.Color(0xb84a34) },
  uEdgeStrength: { value: 0 },
  uPulseSec: { value: 9 },
}

const NOISE_GLSL = /* glsl */ `
float mhash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
float mnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mhash(i), mhash(i + vec2(1.0, 0.0)), f.x), mix(mhash(i + vec2(0.0, 1.0)), mhash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float mfbm(vec2 p) { return 0.6 * mnoise(p) + 0.3 * mnoise(p * 2.1 + 3.7) + 0.1 * mnoise(p * 4.3 - 1.3); }
`

export class RestMist {
  readonly group = new THREE.Group()

  constructor(zones: { polygon: XZ[] }[], hf: HeightField, rect: FieldRect, maxPuffs: number) {
    const rnd = makeRandom(4242)
    const inField = zones.filter((z) => {
      const b = bboxOf(z.polygon)
      return b.maxX > rect.minX && b.minX < rect.maxX && b.maxZ > rect.minZ && b.minZ < rect.maxZ
    })
    if (!inField.length) return

    // 1. 地面に沿う霧の面
    const geos: THREE.BufferGeometry[] = []
    for (const z of inField) {
      const tris = triangulateDraped(z.polygon, [], 5)
      const g = drapedGeometry(tris, (x, zz) => hf.heightAt(x, zz) + 1.8)
      const pos = g.getAttribute('position') as THREE.BufferAttribute
      const edge = new Float32Array(pos.count)
      for (let i = 0; i < pos.count; i++) edge[i] = nearestOnRing(pos.getX(i), pos.getZ(i), z.polygon).dist
      g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1))
      geos.push(g)
    }
    const layerGeo = geos.length === 1 ? geos[0] : mergeSimple(geos)
    const mkLayerMat = (seed: number, strength: number) => new THREE.ShaderMaterial({
      uniforms: { ...mistUniforms, ...bendUniforms, uSeed: { value: seed }, uStrength: { value: strength } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aEdge;
        varying float vEdge;
        varying vec2 vXZ;
        ${BEND_GLSL}
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vXZ = w.xz;
          w.y -= bendDrop(w.xz);
          vEdge = aEdge;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uMistColor;
        uniform float uMistOpacity;
        uniform float uSeed;
        uniform float uStrength;
        uniform vec3 uGlowColor;
        uniform float uGlowStrength;
        uniform vec3 uEdgeColor;
        uniform float uEdgeStrength;
        uniform float uPulseSec;
        varying float vEdge;
        varying vec2 vXZ;
        ${NOISE_GLSL}
        void main() {
          float n = mfbm(vXZ * 0.03 + vec2(uTime * 0.012 + uSeed, uTime * 0.007 - uSeed));
          float a = smoothstep(0.0, 16.0, vEdge) * smoothstep(0.2, 0.75, n) * uStrength * uMistOpacity;
          // 内側からのほのかな光（ゆっくり明滅）と、縁の朱
          float pulse = 0.85 + 0.15 * sin(6.2832 * uTime / max(uPulseSec, 1.0) + uSeed);
          float g = uGlowStrength * smoothstep(2.0, 14.0, vEdge) * pulse * (0.75 + 0.5 * n);
          vec3 col = mix(uMistColor, uGlowColor, clamp(g, 0.0, 1.0));
          col = mix(col, uEdgeColor, uEdgeStrength * (1.0 - smoothstep(4.0, 14.0, vEdge)));
          // 光っている所は霧も少し濃く見せる
          a = min(1.0, a * (1.0 + g * 0.6));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    })
    // 低い霧と、少し上の霧の2枚
    for (const [i, lift, strength] of [
      [0, 0, 0.95],
      [1, 4.5, 0.7],
    ] as const) {
      const layer = new THREE.Mesh(layerGeo, mkLayerMat(i * 17.3, strength))
      layer.position.y = lift
      layer.frustumCulled = false
      layer.renderOrder = 5 + i
      layer.name = `rest-mist-layer-${i}`
      this.group.add(layer)
    }

    // 2. 漂う霧のかたまり（四角い板を常にカメラへ向ける）
    const centers: number[] = []
    const sizes: number[] = []
    const seeds: number[] = []
    const totalArea = inField.reduce((s, z) => s + Math.abs(polygonArea(z.polygon)), 0)
    for (const z of inField) {
      const share = Math.abs(polygonArea(z.polygon)) / totalArea
      const n = Math.max(4, Math.round(Math.min(maxPuffs, totalArea / 420) * share))
      const box = bboxOf(z.polygon)
      let tries = 0
      let placed = 0
      while (placed < n && tries++ < n * 40) {
        const x = box.minX + rnd() * (box.maxX - box.minX)
        const zz = box.minZ + rnd() * (box.maxZ - box.minZ)
        if (!pointInPolygon(x, zz, z.polygon)) continue
        const d = nearestOnRing(x, zz, z.polygon).dist
        if (d < 4) continue
        // 板の大きさ（半分の幅）は 8〜20m。大きすぎると、近くで画面の大半を覆って重くなる
        const s = 8 + rnd() * 6 + Math.min(6, d * 0.2)
        centers.push(x, hf.heightAt(x, zz) + 2.5 + rnd() * 5, zz)
        sizes.push(s)
        seeds.push(rnd())
        placed++
      }
    }
    const quad = new THREE.InstancedBufferGeometry()
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    quad.setIndex([0, 1, 2, 0, 2, 3])
    quad.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3))
    quad.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1))
    quad.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
    quad.instanceCount = sizes.length
    const puffMat = new THREE.ShaderMaterial({
      uniforms: { ...mistUniforms, ...bendUniforms },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 iCenter;
        attribute float iSize;
        attribute float iSeed;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        ${BEND_GLSL}
        void main() {
          float t = uTime * (0.03 + iSeed * 0.03) + iSeed * 40.0;
          vec3 c = iCenter + vec3(sin(t) * 3.5, sin(t * 1.7) * 0.6, cos(t * 0.8) * 3.5);
          c.y -= bendDrop(c.xz);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float s = iSize * (0.9 + 0.1 * sin(t * 2.3));
          mv.xy += position.xy * s;
          vUv = position.xy;
          // カメラに近い板は早めに消す（近い板ほど画面を広く覆うので）
          vFade = smoothstep(12.0, 40.0, -mv.z) * (0.75 + 0.25 * sin(t * 1.3 + 1.0));
          gl_Position = projectionMatrix * mv;
          // 見えない板は画面の外へ（描き込みをしない）
          if (vFade < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uMistColor;
        uniform float uMistOpacity;
        uniform vec3 uGlowColor;
        uniform float uGlowStrength;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          float r2 = dot(vUv, vUv);
          if (r2 > 1.0) discard;
          float a = (1.0 - r2);
          // 芯を光の色へ寄せる
          vec3 col = mix(uMistColor, uGlowColor, 0.3 * a * min(1.0, uGlowStrength * 4.0));
          a = a * a * 0.5 * vFade * uMistOpacity;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    })
    const puffs = new THREE.Mesh(quad, puffMat)
    puffs.frustumCulled = false
    puffs.renderOrder = 7
    puffs.name = 'rest-mist-puffs'
    this.group.add(puffs)
  }
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const edge: number[] = []
  for (const g of geos) {
    pos.push(...(g.getAttribute('position').array as Float32Array))
    nrm.push(...(g.getAttribute('normal').array as Float32Array))
    edge.push(...(g.getAttribute('aEdge').array as Float32Array))
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  out.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1))
  return out
}
