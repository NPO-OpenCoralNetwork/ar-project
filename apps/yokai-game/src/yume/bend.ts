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

/** 白描のときの「墨のぼかし」: 輪郭に近い面ほど墨色に寄せる */
export const inkRimUniforms = {
  uRimAmount: { value: 0 },
  uRimColor: { value: new THREE.Color(0x2a2622) },
}

export interface BendOptions {
  /** 曲げる（既定）。CPU で位置を下げる物（アバターなど）は false */
  bend?: boolean
  /** 白描のときに輪郭を墨でぼかす */
  inkRim?: boolean
}

/** three.js の標準マテリアルに曲げ（と墨のぼかし）を足す */
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
    if (opts.inkRim) {
      shader.uniforms.uRimAmount = inkRimUniforms.uRimAmount
      shader.uniforms.uRimColor = inkRimUniforms.uRimColor
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRimAmount;\nuniform vec3 uRimColor;')
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            float facing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
            float rim = 1.0 - smoothstep( 0.18, 0.55, facing );
            outgoingLight = mix( outgoingLight, uRimColor, rim * uRimAmount );
          }
          #include <opaque_fragment>`,
        )
    }
  }
  const key = `${bend ? 'bend' : 'flat'}-${opts.inkRim ? 'rim' : 'plain'}`
  mat.customProgramCacheKey = () => key
  return mat
}
