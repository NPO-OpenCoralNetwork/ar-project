// 「丸い箱庭」の曲げ。アバターから離れるほど地面をなだらかに下げ、
// 斜め上から見下ろしても、画面の上の方に空と立山の書き割りが見えるようにする（あつまれ どうぶつの森の転がる丸太の見せ方）。
//
// 頂点の「見た目の位置」だけを下げる。当たり判定・影・霧の計算は曲げる前の座標のままでよい。
// 大きな静的メッシュ（地面・建物・木など）は GPU で、少数の動く物（アバター・印）は CPU で同じ式を使う。

import * as THREE from 'three'

export const bendUniforms = {
  uBendCenter: { value: new THREE.Vector2() },
  /** drop = K * max(0, d - D0)^2（d は曲げの中心からの水平距離）。D0 までは平らなまま */
  uBendK: { value: 0 },
  uBendD0: { value: 0 },
}

export const BEND_GLSL = /* glsl */ `
uniform vec2 uBendCenter;
uniform float uBendK;
uniform float uBendD0;
float bendDrop(vec2 p) { float e = max(0.0, length(p - uBendCenter) - uBendD0); return uBendK * e * e; }
`

export function bendDrop(x: number, z: number): number {
  const c = bendUniforms.uBendCenter.value
  const e = Math.max(0, Math.hypot(x - c.x, z - c.y) - bendUniforms.uBendD0.value)
  return bendUniforms.uBendK.value * e * e
}

const BENT_PROJECT_VERTEX = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelMatrix * mvPosition;
mvPosition.y -= bendDrop( mvPosition.xz );
mvPosition = viewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`

/**
 * 輪郭の光と墨。白描のときは「墨のぼかし」（輪郭に近い面ほど墨色に寄せる）、
 * 光と霞のときは「逆光のふち」（光源の方を向いたカメラから見ると、輪郭が光源の色で明るくなる。06 §3.8）
 */
export const inkRimUniforms = {
  uRimAmount: { value: 0 },
  uRimColor: { value: new THREE.Color(0x2a2622) },
  uGlowRim: { value: 0 },
  uGlowRimColor: { value: new THREE.Color(0xffe7a0) },
  /** 光源へ向かう向き（ビュー座標）。毎フレーム main で入れる */
  uLightDirView: { value: new THREE.Vector3(0, 1, 0) },
}

/** 霧のかかり方（06 §3.4）。fogShape 0 は three.js の霧のまま、1 は「始めはゆっくり、途中で一気に、上限で止まる」。霧の終わりの 1.3 倍で 1 まで */
export const fogShapeUniforms = {
  uFogMax: { value: 1 },
  uFogShape: { value: 0 },
}

/** 頂点の明るさ（aAO 属性）で、建物の根元や木の下を暗くする強さ */
export const aoUniforms = {
  uAOAmount: { value: 1 },
}

export const FOG_SHAPE_GLSL = /* glsl */ `
#ifdef USE_FOG
  {
    float fogS = smoothstep( fogNear, fogFar, vFogDepth );
    float fogFactor = uFogMax * mix( fogS, fogS * ( 2.0 - fogS ), uFogShape );
    // 霧の終わりより先（箱庭の縁）は、霧の色（= 遠景の霞の地の色）に溶かしきる
    fogFactor = mix( fogFactor, 1.0, smoothstep( fogFar, fogFar * 1.3, vFogDepth ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif
`

export interface BendOptions {
  /** 曲げる（既定）。CPU で位置を下げる物（アバターなど）は false */
  bend?: boolean
  /** 白描のときに輪郭を墨でぼかす（光と霞のときは逆光のふち） */
  inkRim?: boolean
  /** 逆光のふちの強さの倍率（木は 0.5） */
  glowRimScale?: number
  /** aAO 属性（0..1）で明るさを下げる */
  ao?: boolean
  /** さらにシェーダーを足す（key はプログラムの使い回しの区別に使う） */
  extend?: { key: string; patch: (shader: THREE.WebGLProgramParametersWithUniforms) => void }
}

/** three.js の標準マテリアルに曲げ（と墨のぼかし・逆光のふち・霧のかかり方）を足す */
export function applyBend<T extends THREE.Material>(mat: T, opts: BendOptions = {}): T {
  const bend = opts.bend ?? true
  mat.onBeforeCompile = (shader) => {
    if (bend) {
      shader.uniforms.uBendCenter = bendUniforms.uBendCenter
      shader.uniforms.uBendK = bendUniforms.uBendK
      shader.uniforms.uBendD0 = bendUniforms.uBendD0
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${BEND_GLSL}`)
        .replace('#include <project_vertex>', BENT_PROJECT_VERTEX)
    }
    shader.uniforms.uFogMax = fogShapeUniforms.uFogMax
    shader.uniforms.uFogShape = fogShapeUniforms.uFogShape
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFogMax;\nuniform float uFogShape;')
      .replace('#include <fog_fragment>', FOG_SHAPE_GLSL)
    if (opts.ao) {
      shader.uniforms.uAOAmount = aoUniforms.uAOAmount
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAO;\nvarying float vAO;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = aAO;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uAOAmount;\nvarying float vAO;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix( 1.0, vAO, uAOAmount );')
    }
    if (opts.inkRim) {
      shader.uniforms.uRimAmount = inkRimUniforms.uRimAmount
      shader.uniforms.uRimColor = inkRimUniforms.uRimColor
      shader.uniforms.uGlowRim = inkRimUniforms.uGlowRim
      shader.uniforms.uGlowRimColor = inkRimUniforms.uGlowRimColor
      shader.uniforms.uLightDirView = inkRimUniforms.uLightDirView
      shader.uniforms.uGlowRimScale = { value: opts.glowRimScale ?? 1 }
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uRimAmount;\nuniform vec3 uRimColor;\nuniform float uGlowRim;\nuniform vec3 uGlowRimColor;\nuniform vec3 uLightDirView;\nuniform float uGlowRimScale;',
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            float facing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
            float rim = 1.0 - smoothstep( 0.18, 0.55, facing );
            outgoingLight = mix( outgoingLight, uRimColor, rim * uRimAmount );
            // 逆光のふち: 視線が光源の方を向くほど強く
            float back = clamp( dot( normalize( -vViewPosition ), uLightDirView ) * 0.5 + 0.5, 0.0, 1.0 );
            outgoingLight += uGlowRimColor * ( rim * back * back * uGlowRim * uGlowRimScale );
          }
          #include <opaque_fragment>`,
        )
    }
    opts.extend?.patch(shader)
  }
  const key = `${bend ? 'bend' : 'flat'}-${opts.inkRim ? 'rim' : 'plain'}-${opts.ao ? 'ao' : 'noao'}-${opts.extend?.key ?? ''}`
  mat.customProgramCacheKey = () => key
  return mat
}
