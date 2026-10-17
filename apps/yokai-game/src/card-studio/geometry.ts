// 札の形（09 §4.1）。角を丸めた長方形を ExtrudeGeometry で薄く押し出し、自前の UVGenerator で
// 表と裏の UV を 0〜1 に正規化する。面は「表・裏・縁」の3つの group に分け直す。
//
// - 標準の UV（WorldUVGenerator）は形の x, y をそのまま UV にするので、0.63 × 0.88 の札では
//   −0.315〜0.315 / −0.44〜0.44 になる。幅と高さで割って 0.5 を足せば 0〜1。
// - ExtrudeGeometry は面取りなしのとき、group 0 の前半が裏（z=0）、後半が表、group 1 が側面。
// - 裏は u を 1−u にする。札を Y 軸で π 回すと、裏の文字が左右反転せずに読める。

import * as THREE from 'three'

export interface CardSize {
  /** 幅・高さ・厚み・角の丸み（札だけの場面の単位） */
  w: number
  h: number
  depth: number
  r: number
}

/** 63:88（約 5:7。09 §2.3）。厚みは縁の色が見える程度 */
export const CARD: CardSize = { w: 0.63, h: 0.88, depth: 0.008, r: 0.035 }

/**
 * 角を四分円で丸めた長方形。シェーダーの距離関数（sdRR、半径 r の円弧）と同じ形にするため、
 * 二次ベジェ（quadraticCurveTo）ではなく absarc で描く。ベジェだと角の中点が円弧より約 0.06r 外に出る。
 */
function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  const q = Math.PI / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -q, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, q, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, q, 2 * q, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, 2 * q, 3 * q, false)
  return s
}

/** 札の形。materials は [表, 裏, 縁] の順に渡す */
export function makeCardGeometry(size: CardSize = CARD): THREE.ExtrudeGeometry {
  const { w, h, depth, r } = size
  const UVGenerator = {
    generateTopUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) =>
      [a, b, c].map((i) => new THREE.Vector2(v[i * 3] / w + 0.5, v[i * 3 + 1] / h + 0.5)),
    // 縁は厚み方向だけ（u は使わない）
    generateSideWallUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) =>
      [a, b, c, d].map((i) => new THREE.Vector2(0, v[i * 3 + 2] / depth)),
  }
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: false, curveSegments: 10, UVGenerator })
  geo.translate(0, 0, -depth / 2)
  const [caps, side] = geo.groups
  const half = caps.count / 2
  geo.clearGroups()
  geo.addGroup(caps.start + half, half, 0) // 表 → materials[0]
  geo.addGroup(caps.start, half, 1) // 裏 → materials[1]
  geo.addGroup(side.start, side.count, 2) // 縁 → materials[2]
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = caps.start; i < caps.start + half; i++) uv.setX(i, 1 - uv.getX(i)) // 裏の文字が鏡写しにならないように
  uv.needsUpdate = true
  return geo
}

/** 表の中の領域（札の物理単位。左下が 0,0） */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type FrameId = 'karuta' | 'hanafuda'

export interface CardLayout {
  frame: FrameId
  /** 縁の帯の幅 */
  band: number
  /** 絵の窓 */
  win: Rect
  /** 題箋（題を書く細い紙） */
  strip: Rect
}

/**
 * 枠の意匠（09 §5.7-3）。
 * - かるた寄り: 縁の帯が太く、絵の窓は 1:1（曼荼羅のピースと同じ絵を使い回せる）、窓の下に題箋。
 * - 花札寄り: 縁が細く、絵が札いっぱい。題は下の霞の上に小さく。窓は 1:1 でない（約 0.70）ので、
 *   曼荼羅のピースと同じ絵は使い回せない（09 §5.7-3）。
 * 番号は札に描かない（F-43。札の下の HTML で出すかは PO の判断待ち。09 §5.7-7）。
 */
export function cardLayout(frame: FrameId, size: CardSize = CARD): CardLayout {
  const { w, h } = size
  if (frame === 'karuta') {
    const band = w * 0.05
    const g = 0.012
    const x0 = band + g
    const x1 = w - band - g
    const top = h - band - g
    const side = x1 - x0
    const win = { x0, y0: top - side, x1, y1: top }
    const sy1 = win.y0 - 0.018
    const strip = { x0: x0 + 0.03, y0: sy1 - 0.112, x1: x1 - 0.03, y1: sy1 }
    return { frame, band, win, strip }
  }
  const band = w * 0.022
  const g = 0.008
  const win = { x0: band + g, y0: band + g, x1: w - band - g, y1: h - band - g }
  const strip = { x0: w * 0.2, y0: band + g + 0.03, x1: w * 0.8, y1: band + g + 0.03 + 0.07 }
  return { frame, band, win, strip }
}
