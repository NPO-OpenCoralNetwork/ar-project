// 墨の線。建物の輪郭・道や水の縁・等高線・線路を、1回の描画命令でまとめて描く。
// 線の太さは画面のピクセルで決め、場所ごとに少し太さを揺らして筆の線らしくする。

import * as THREE from 'three'
import { BEND_GLSL, bendUniforms } from '../bend'

export const LineKind = { Building: 0, Edge: 1, Contour: 2, Rail: 3 } as const
export type LineKind = (typeof LineKind)[keyof typeof LineKind]

export class InkLineBuilder {
  private start: number[] = []
  private end: number[] = []
  private corner: number[] = []
  private style: number[] = []
  private index: number[] = []
  private count = 0

  get segments(): number {
    return this.count
  }

  segment(a: THREE.Vector3Like, b: THREE.Vector3Like, kind: LineKind, width = 1, alpha = 1): void {
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 1e-4) return
    const base = this.count * 4
    for (let k = 0; k < 4; k++) {
      this.start.push(a.x, a.y, a.z)
      this.end.push(b.x, b.y, b.z)
      this.style.push(kind, width, alpha)
    }
    // (t, side): t = 0 始点 / 1 終点、side = -1 / 1
    this.corner.push(0, -1, 0, 1, 1, -1, 1, 1)
    this.index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    this.count++
  }

  polyline(pts: THREE.Vector3Like[], kind: LineKind, width = 1, alpha = 1, closed = false): void {
    for (let i = 1; i < pts.length; i++) this.segment(pts[i - 1], pts[i], kind, width, alpha)
    if (closed && pts.length > 2) this.segment(pts[pts.length - 1], pts[0], kind, width, alpha)
  }

  build(material: THREE.ShaderMaterial): THREE.Mesh {
    const g = new THREE.BufferGeometry()
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(this.start, 3))
    g.setAttribute('aEnd', new THREE.Float32BufferAttribute(this.end, 3))
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(this.corner, 2))
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.style, 3))
    // three.js が頂点数を知るために position が要る（中身は始点）
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.start, 3))
    g.setIndex(this.index)
    g.computeBoundingSphere()
    const mesh = new THREE.Mesh(g, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    return mesh
  }
}

export const inkLineUniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  /** 線の太さ（描画バッファのピクセル） */
  uWidth: { value: 1.5 },
  uInk: { value: new THREE.Color(0x26221e) },
  /** 種類ごとの濃さ（建物・縁・等高線・線路） */
  uKindAlpha: { value: new THREE.Vector4(1, 0.7, 0.2, 0.8) },
  uFogColor: { value: new THREE.Color(0xffffff) },
  uFogNear: { value: 100 },
  uFogFar: { value: 400 },
}

export function createInkLineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...inkLineUniforms, ...bendUniforms },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aStart;
      attribute vec3 aEnd;
      attribute vec2 aCorner;
      attribute vec3 aStyle;
      uniform vec2 uResolution;
      uniform float uWidth;
      uniform vec4 uKindAlpha;
      uniform float uFogNear;
      uniform float uFogFar;
      varying float vAlpha;
      varying float vSide;
      varying float vFog;
      varying float vHalfCore;
      varying float vHalfQuad;
      ${BEND_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      vec4 toView(vec3 p) {
        vec4 w = vec4(p, 1.0);
        w.y -= bendDrop(w.xz);
        vec4 v = viewMatrix * w;
        v.xyz *= 0.997; // 面に埋もれないよう、ほんの少し手前へ
        return v;
      }
      void main() {
        vec4 vs = toView(aStart);
        vec4 ve = toView(aEnd);
        // 片方の端がカメラの後ろ（near 面より手前）にある線分は、near 面で切ってから投影する
        // （w ≤ 0 の点で割ると、画面の端でくさび形に崩れるため。three の LineMaterial と同じ考え方）
        float nearZ = -projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0);
        if (vs.z > -nearZ && ve.z > -nearZ) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vAlpha = 0.0;
          return;
        }
        if (vs.z > -nearZ) vs = mix(vs, ve, (vs.z + nearZ) / (vs.z - ve.z));
        else if (ve.z > -nearZ) ve = mix(ve, vs, (ve.z + nearZ) / (ve.z - vs.z));
        vec4 cs = projectionMatrix * vs;
        vec4 ce = projectionMatrix * ve;
        vec2 halfRes = uResolution * 0.5;
        vec2 ss = cs.xy / cs.w * halfRes;
        vec2 se = ce.xy / ce.w * halfRes;
        vec2 dir = se - ss;
        float len = length(dir);
        dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float t = aCorner.x;
        float side = aCorner.y;
        vec4 c = t < 0.5 ? cs : ce;
        vec3 wp = t < 0.5 ? aStart : aEnd;
        float brush = 0.7 + 0.6 * noise(wp.xz * 0.45 + wp.y * 0.3);
        // 線の太さ。1px を下回る線はちらつく（とぎれる）ので、太さは 1px にとどめて薄さで表す。
        // 縁のぼかしのために、四角は芯より片側 0.5px ずつ広げる
        // 0.78 は、前の「外側 45% をぼかす」描き方と見た目の濃さ（線の幅の積分）をそろえるための係数
        float w0 = uWidth * aStyle.y * brush * 0.78;
        float wc = max(w0, 1.0);
        float w = wc + 1.0;
        vHalfCore = wc * 0.5;
        vHalfQuad = w * 0.5;
        vec2 off = (nrm * side + dir * (t * 2.0 - 1.0) * 0.5) * w * 0.5;
        c.xy += off / halfRes * c.w;
        gl_Position = c;
        float k = aStyle.x;
        float ka = k < 0.5 ? uKindAlpha.x : k < 1.5 ? uKindAlpha.y : k < 2.5 ? uKindAlpha.z : uKindAlpha.w;
        vAlpha = aStyle.z * ka * min(1.0, w0);
        vSide = side;
        float depth = -(t < 0.5 ? vs.z : ve.z);
        vFog = smoothstep(uFogNear, uFogFar, depth);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      uniform vec3 uFogColor;
      varying float vAlpha;
      varying float vSide;
      varying float vFog;
      varying float vHalfCore;
      varying float vHalfQuad;
      void main() {
        // 中心からの距離（px）。芯の縁で 1px 幅のぼかし
        float d = abs(vSide) * vHalfQuad;
        float edge = 1.0 - smoothstep(vHalfCore - 0.5, vHalfCore + 0.5, d);
        // 遠い線は面より早く消す（霧に溶けた面の上に、線だけが残らないように）
        float a = vAlpha * edge * (1.0 - vFog) * (1.0 - vFog);
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uInk, uFogColor, vFog * 0.6), a);
        #include <colorspace_fragment>
      }
    `,
  })
}
