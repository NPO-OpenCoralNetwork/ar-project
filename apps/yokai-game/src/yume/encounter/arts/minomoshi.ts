// ミノモシ（仮）の板絵（白描と彩色）。SVG のパスで持ち、3D の板・曼荼羅帳のピース・現地の姿で同じ絵を使う。
//
// ミノモシ: 歩いていると体にくっついてくるもの。払うと、かえって数が増える。漁師は嵐の来るしるしとした。
// 腰に曲尺をさしていると逃れられたという（富山県史 民俗編、1973）。
// 小さく丸い、ふわふわの藁の房（蓑のような三段の房。頭の上で藁を束ね、細い紐でくくる。束ねた先は三本、少し右へなびく）。
// 顔は藁の上にじかに描く。大きくやさしい目（目の光つき）、少し下がった眉、小さな口、頬の赤み。
// 体のまわりに淡い光（半径と太さのちがう、とぎれた三つの弧と、小さな光の粒。少し縦長で、体の真後ろにそろえない）。
// 払うと増える言い伝えから、まわりに小さな分身が四つ浮かぶ（本体を小さくした丸い房。点の目、頭に藁が二本）。足はなく、浮いている。
// 藁の房の姿と淡い光は、名前の「蓑」と、ゲームでの見せ方（やわらかな小さな光）から作った【創作】の姿。
// 性格【創作】: さみしがりのくっつき虫。下がった眉・頬の赤み・分身がみな本体のほうを見ている目線は、この性格から作った【創作】。
// 曲尺は描かない（逃れる道具なので、本人の絵には持たせない）。こわく描かない（歯・赤い目なし）。信仰や売薬にかかわる物は描かない。
// 本番の絵ではない（04 §6.2: 本番の絵は段階5）。
// 彩色: 光と霞（06）のやわらかい色。藁は温かい麦わら色（下の段ほど少し濃く）、光と分身は淡い光の色、くくり紐と頬は淡い琥珀。

import { circle, type InkArt, type InkPart, mirror, part, tint } from '../ink'

type Pt = [number, number]
const r2 = (n: number) => +n.toFixed(2)
const P = (x: number, y: number) => `${r2(x)},${r2(y)}`
const rad = (deg: number) => (deg * Math.PI) / 180

/** 楕円（ベジェ4本） */
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${P(cx - rx, cy)} C${P(cx - rx, cy - ry * 0.55)} ${P(cx - rx * 0.55, cy - ry)} ${P(cx, cy - ry)} C${P(cx + rx * 0.55, cy - ry)} ${P(cx + rx, cy - ry * 0.55)} ${P(cx + rx, cy)} C${P(cx + rx, cy + ry * 0.55)} ${P(cx + rx * 0.55, cy + ry)} ${P(cx, cy + ry)} C${P(cx - rx * 0.55, cy + ry)} ${P(cx - rx, cy + ry * 0.55)} ${P(cx - rx, cy)} Z`

/** 楕円の上の点（角度は度。0 = 右、90 = 下）を、a0 から a1 まで n 等分して並べる */
const along = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(a0 + ((a1 - a0) * i) / n)
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })

/**
 * 藁の房の縁。谷の点を順にたどり、谷と谷のあいだに房の先を作る（先は (ox, oy) から外へ向く。round で先を丸める）。
 * M のない C の続きを返す。長さは少しずつ変えて、そろいすぎないようにする
 */
const tufts = (valleys: Pt[], ox: number, oy: number, len: number, round = 0.7): string => {
  let d = ''
  for (let i = 1; i < valleys.length; i++) {
    const [ax, ay] = valleys[i - 1]
    const [bx, by] = valleys[i]
    const [mx, my] = [(ax + bx) / 2, (ay + by) / 2]
    const n = Math.hypot(mx - ox, my - oy)
    const [ux, uy] = [(mx - ox) / n, (my - oy) / n]
    const l = len * (1 + 0.16 * Math.sin(i * 2.4 + ax * 0.05))
    const [tx, ty] = [mx + ux * l, my + uy * l]
    const [sx, sy] = [(bx - ax) * 0.16, (by - ay) * 0.16]
    // 先の丸み: 谷 A の側から B の側へ、先をまたぐ小さな弧
    const side = Math.sign((bx - ax) * -uy + (by - ay) * ux) || 1
    const [px, py] = [-uy * side * round, ux * side * round]
    const [t1x, t1y, t2x, t2y] = [tx - px, ty - py, tx + px, ty + py]
    const k = round * 1.33
    d += ` C${P(ax + ux * l * 0.5, ay + uy * l * 0.5)} ${P(t1x - ux * l * 0.3 - sx, t1y - uy * l * 0.3 - sy)} ${P(t1x, t1y)}`
    d += ` C${P(t1x + ux * k, t1y + uy * k)} ${P(t2x + ux * k, t2y + uy * k)} ${P(t2x, t2y)}`
    d += ` C${P(t2x - ux * l * 0.3 + sx, t2y - uy * l * 0.3 + sy)} ${P(bx + ux * l * 0.5, by + uy * l * 0.5)} ${P(bx, by)}`
  }
  return d
}

/** 房の谷から内へのびる藁の筋（(ox, oy) へ向かって len だけ） */
const strands = (valleys: Pt[], ox: number, oy: number, len: number): string[] =>
  valleys.map(([x, y], i) => {
    const n = Math.hypot(x - ox, y - oy)
    const l = len * (i % 2 ? 0.7 : 1)
    return `M${P(x, y)} L${P(x - ((x - ox) / n) * l, y - ((y - oy) / n) * l)}`
  })

/** 楕円の弧の帯（淡い光のひとかけら）。半径 R〜r の円の弧を横に k 倍する。両端は丸い */
const arcBand = (cx: number, cy: number, R: number, r: number, a0: number, a1: number, k = 1): string => {
  const T = (x: number, y: number) => P(cx + x * k, cy + y)
  const at = (rho: number, a: number): Pt => [rho * Math.cos(rad(a)), rho * Math.sin(rad(a))]
  const arc = (rho: number, from: number, to: number) => {
    const n = Math.ceil(Math.abs(to - from) / 45)
    let d = ''
    for (let i = 0; i < n; i++) {
      const [a, b] = [from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n]
      const h = (4 / 3) * Math.tan(rad(b - a) / 4) * rho
      const [p0, p3] = [at(rho, a), at(rho, b)]
      d += ` C${T(p0[0] - h * Math.sin(rad(a)), p0[1] + h * Math.cos(rad(a)))} ${T(p3[0] + h * Math.sin(rad(b)), p3[1] - h * Math.cos(rad(b)))} ${T(...p3)}`
    }
    return d
  }
  const cap = (a: number, dir: number, from: Pt, to: Pt) => {
    const h = ((R - r) / 2) * (4 / 3) * dir
    const [tx, ty] = [-Math.sin(rad(a)) * h, Math.cos(rad(a)) * h]
    return ` C${T(from[0] + tx, from[1] + ty)} ${T(to[0] + tx, to[1] + ty)} ${T(...to)}`
  }
  return `M${T(...at(R, a0))}${arc(R, a0, a1)}${cap(a1, 1, at(R, a1), at(r, a1))}${arc(r, a1, a0)}${cap(a0, -1, at(r, a0), at(R, a0))} Z`
}

/** 輪郭を墨で引かない面（頬の赤み・目の光） */
const quiet = (fill: string): InkPart => ({ fill, lines: [] })

/** 彩色の色（仮）。藁は麦わら色（下の段は少し濃く、上の段と束ねた藁は少し淡く）、光と分身は淡い光の色、くくり紐と頬は淡い琥珀、目の光は白 */
const C = {
  glow: '#f4ebb5',
  strawBack: '#c8b27c',
  straw: '#d6c189',
  strawTop: '#dccb98',
  knot: '#e2d3a4',
  cord: '#cba871',
  blush: '#e9bb8e',
  shine: '#fffbef',
  kid: ['#ecdfa9', '#e9dca6', '#efe3b0', '#ebdeab'],
}

// 淡い光（体の後ろ）。少し縦長で、中心を体から少しずらす。半径と太さのちがう三つの弧
const HALO = [
  arcBand(101, 197, 58.5, 55, 152, 230, 0.92),
  arcBand(101, 197, 55.5, 53, 298, 364, 0.92),
  arcBand(101, 197, 57, 55, 52, 84, 0.92),
].join(' ')
// 光の粒（弧のとぎれたところに、小さく）
const MOTES = [circle(61, 140, 1.9), circle(152.5, 222, 1.5), circle(70, 255, 1.3), circle(129, 137, 1.2)].join(' ')

// 三段目（いちばん下・後ろ）の房。二段目の下から、丸くすぼまってのぞく
const LOWER_V = along(100, 215, 28.5, 16, 162, 18, 8)
const LOWER = `M78,191 C73,197 70.5,204 ${P(...LOWER_V[0])}${tufts(LOWER_V, 100, 175, 7.5)} C129.5,204 127,197 122,191 Z`
const LOWER_STRANDS = strands(LOWER_V.slice(1, -1), 100, 175, 6.5)

// 二段目の房（顔のある、体の丸み）。上は一段目の下にかくれる
const MID_V = along(100, 202, 34, 13.5, 170, 10, 7)
const MID = `M84,168 C73,171 67,183 ${P(...MID_V[0])}${tufts(MID_V, 100, 160, 7.5)} C133,183 127,171 116,168 Z`
const MID_STRANDS = strands(MID_V.slice(1, -1), 100, 160, 5.5)

// 頭の上で束ねた藁（先は三本。長さをそろえず、右へなびいて少し垂れる）
const TOPKNOT =
  'M95.4,158.5 C94.7,155 93.8,150.9 93.9,147.9 C94,146 95.8,145.3 96.8,146.5 C97.5,147.3 97.9,148.3 98.3,149.1 C98.8,145.9 101.4,142.7 104.6,141.2 C106.1,140.5 107.6,141.3 107,142.7 C106.2,144.4 104.6,145.8 103.4,147.1 C105.8,146.1 108.8,146.1 110.8,147.2 C112,147.9 111.5,149.5 110.2,149.4 C107.8,149.3 105.7,151.5 105,158.5 Z'
const TOPKNOT_STRANDS = ['M97.6,154.1 C97.3,151.9 96.8,150.1 96,148.3', 'M100.2,154.1 C100.5,150.9 101.8,147.3 104.4,143.7', 'M102.8,154.1 C103.8,151.9 105.8,150.1 108.6,148.5']
// くくり紐（細い帯）
const CORD = 'M94.8,153.9 C98,153.2 102,153.2 105.2,153.9 L105.4,156.6 C102,157.3 98,157.3 94.6,156.6 Z'

// 一段目の房（結び目から肩へ、短い襟のような房）
const TOP_V = along(100, 173, 31, 8.5, 166, 14, 7)
const TOP = `M93,156.5 C83.5,157 74,163 ${P(...TOP_V[0])}${tufts(TOP_V, 100, 150, 5.5)} C126,163 116.5,157 107,156.5 Z`
const TOP_STRANDS = TOP_V.slice(1, -1).map(([x, y]) => `M${P(x, y)} C${P(x + (100 - x) * 0.12, y - 4.5)} ${P(x + (100 - x) * 0.42, y - 9)} ${P(x + (100 - x) * 0.66, y - 12)}`)

// 顔（藁の上にじかに）: 大きなやさしい目（墨の点と、目の光）、少し下がった眉（さみしがり）、小さな口、頬の赤み。左を描いて、右は反転
const EYE_L = 'M90.5,195.4 L90.5,198.2'
const BROW_L = 'M85.6,190.6 C87.6,189.6 90.2,188.9 93.2,188.8'
const BLUSH_L = ellipse(82.5, 203, 4, 2.4)
const BLUSH_LINES_L = ['M80.5,204.4 L81.7,202', 'M83.1,204.4 L84.3,202']
const SHINE_L = circle(91.8, 195.2, 1.3)
const MOUTH = 'M97.4,204.2 C98.8,205.8 101.2,205.8 102.6,204.2'
const FACE: [string, number][] = [
  ...[...BLUSH_LINES_L, ...BLUSH_LINES_L.map((d) => mirror(d, 100))].map((d): [string, number] => [d, 0.6]),
  [EYE_L, 5.6],
  [mirror(EYE_L, 100), 5.6],
  [BROW_L, 1.1],
  [mirror(BROW_L, 100), 1.1],
  [MOUTH, 1.0],
]

/**
 * 小さな分身（本体を小さくした丸い房: 上はなめらかな丸、下半分に先の丸い房が一列。頭に藁が二本、点の目）。
 * look は目線の向き（-1 = 左、1 = 右）。頭の藁は、目線と反対へなびく
 */
const kid = (cx: number, cy: number, s: number, look: number, color: string): InkPart[] => {
  const v = along(cx, cy + s * 0.05, s * 0.86, s * 0.74, -2, 182, 5)
  const body = `M${P(...v[0])}${tufts(v, cx, cy - s * 1.1, s * 0.24, s * 0.17)} C${P(cx - s * 0.9, cy - s * 0.5)} ${P(cx - s * 0.55, cy - s * 0.92)} ${P(cx, cy - s * 0.92)} C${P(cx + s * 0.55, cy - s * 0.92)} ${P(cx + s * 0.9, cy - s * 0.5)} ${P(...v[0])} Z`
  const lean = -look
  const hair: [string, number][] = [
    [`M${P(cx - s * 0.06 * lean, cy - s * 0.9)} C${P(cx, cy - s * 1.15)} ${P(cx + s * 0.18 * lean, cy - s * 1.36)} ${P(cx + s * 0.42 * lean, cy - s * 1.42)}`, 0.8],
    [`M${P(cx + s * 0.12 * lean, cy - s * 0.9)} C${P(cx + s * 0.18 * lean, cy - s * 1.08)} ${P(cx + s * 0.32 * lean, cy - s * 1.18)} ${P(cx + s * 0.52 * lean, cy - s * 1.2)}`, 0.7],
  ]
  const ex = look * s * 0.14
  const ew = Math.max(1.9, s * 0.27)
  return [
    tint(part(body, 1.0, ...hair), color),
    part(
      undefined,
      0,
      [`M${P(cx - s * 0.32 + ex, cy - s * 0.12)} L${P(cx - s * 0.32 + ex, cy - s * 0.02)}`, ew],
      [`M${P(cx + s * 0.32 + ex, cy - s * 0.12)} L${P(cx + s * 0.32 + ex, cy - s * 0.02)}`, ew],
      [`M${P(cx - s * 0.12 + ex, cy + s * 0.22)} C${P(cx - s * 0.05 + ex, cy + s * 0.3)} ${P(cx + s * 0.05 + ex, cy + s * 0.3)} ${P(cx + s * 0.12 + ex, cy + s * 0.22)}`, 0.7],
    ),
  ]
}

// 分身: 左上・右・右下・左下（みな本体のほうを見る）
const KIDS: [number, number, number, number][] = [
  [36, 154, 9, 1],
  [173, 165, 10, -1],
  [155, 249, 7.5, -1],
  [41, 249, 8.5, 1],
]

export const MINOMOSHI_ART: InkArt = {
  w: 200,
  h: 300,
  parts: [
    tint(part(HALO, 0.8), C.glow),
    tint(part(MOTES, 0.7), C.glow),
    tint(part(LOWER, 1.3, ...LOWER_STRANDS.map((d): [string, number] => [d, 0.7])), C.strawBack),
    tint(part(MID, 1.5, ...MID_STRANDS.map((d): [string, number] => [d, 0.7])), C.straw),
    tint(part(TOPKNOT, 1.1, ...TOPKNOT_STRANDS.map((d): [string, number] => [d, 0.7])), C.knot),
    tint(part(TOP, 1.4, ...TOP_STRANDS.map((d): [string, number] => [d, 0.7])), C.strawTop),
    tint(part(CORD, 0.9), C.cord),
    tint(quiet(`${BLUSH_L} ${mirror(BLUSH_L, 100)}`), C.blush),
    part(undefined, 0, ...FACE),
    tint(quiet(`${SHINE_L} ${mirror(SHINE_L, 100)}`), C.shine),
    ...KIDS.flatMap(([x, y, s, look], i) => kid(x, y, s, look, C.kid[i])),
  ],
}
