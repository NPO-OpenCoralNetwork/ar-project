// くらがり（仮）の絵（白描と彩色）。SVG のパスで持ち、曼荼羅帳のピース・縁帳・便りの画面の会話で使う。
//
// くらがり【本作オリジナル】: 曼荼羅帳の影に住む、ましろの影のような存在（04 §4.1）。ほんとうの夕暮れにだけ、ふちが見える。
// 姿は、ましろ（紙の鳥。utsutsu/mashiro.ts の絵）の形を 1.6 倍にし、夕方の影のように縦へ 1.8 倍のばした、墨のにじんだ影。
// 目・くちばしの描きこみ・顔は描かない（こわく描かない。影は、だれかの影）。
// 白描では墨の面（inkFill）で塗り、外の輪郭（0.8）と、少し外へにじませた淡い輪郭（0.4）の二重にする。翼は細い線だけ。
// 彩色: 夕暮れの、くすんだ紫（仮）。
// 段階4b では箱庭（3D の板）にも現地にも置かない（3D の板は inkFill を見ない）。本番の絵ではない（04 §6.2: 本番の絵は段階5）。

import type { InkArt } from '../ink'

const r2 = (n: number) => +n.toFixed(2)

// ましろの絵（120×90）の、紙の鳥の形（胴と頭・尾・翼）。目と、地面の影の線は使わない
const BIRD = 'M18,62 C30,40 52,30 70,30 C80,30 86,34 88,40 L100,44 L88,48 C84,60 70,70 50,70 C38,70 26,68 18,62 Z'
const TAIL = 'M18,62 L8,58 L14,66 Z'
const WING = 'M30,60 C40,50 52,46 64,48 C56,56 46,62 30,60 Z'

/** 鳥の形の外枠（x 8〜100、y 30〜70）と、のばし方（横 1.6 倍、縦は 1.6 × 1.8 倍） */
const BX0 = 8
const BX1 = 100
const BY0 = 30
const BY1 = 70
const SX = 1.6
const SY = 1.6 * 1.8
const W = 200
const H = 300
/** のばした形を、絵の真ん中に置く */
const OX = (W - (BX1 - BX0) * SX) / 2
const OY = (H - (BY1 - BY0) * SY) / 2
/** のばした形の真ん中（にじんだ輪郭は、ここから少し外へ広げる） */
const CX = W / 2
const CY = H / 2

/** ましろの絵の「x,y」を、くらがりの絵へ（grow で真ん中から少し広げる） */
const fit = (d: string, grow = 1): string =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => {
    const px = OX + (Number(x) - BX0) * SX
    const py = OY + (Number(y) - BY0) * SY
    return `${r2(CX + (px - CX) * grow)},${r2(CY + (py - CY) * grow)}`
  })

/** 夕暮れの、くすんだ紫（仮） */
const DUSK = '#5b4d6e'

export const KURAGARI_ART: InkArt = {
  w: W,
  h: H,
  // 頭と背（上半身）に寄せる
  pieceBox: [52, 82, 132, 126],
  parts: [
    {
      fill: `${fit(BIRD)} ${fit(TAIL)}`,
      inkFill: 0.7,
      color: DUSK,
      lines: [
        { d: fit(BIRD), w: 0.8 },
        { d: fit(TAIL), w: 0.8 },
        // にじんだ、淡い二つ目の輪郭
        { d: fit(BIRD, 1.035), w: 0.4 },
        { d: fit(TAIL, 1.035), w: 0.4 },
        { d: fit(WING), w: 0.4 },
      ],
    },
  ],
}
