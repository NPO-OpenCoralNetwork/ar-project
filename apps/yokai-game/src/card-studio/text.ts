// 札の文字と裏（09 §2.2・§2.4・§4.5）。
// - 表の題だけを CanvasTexture に描く。canvas は題箋の範囲だけ（幅 1024、高さは題箋の縦横比）。
//   使うのは字の覆い（A）だけなので、ミップマップは作らない（main.ts）。
// - 本文と出典は 3D に描かず、札の下の HTML（ゲームの cardHtml と同じ）に出す（09 §1-3、§4.5）。
// - 裏は全札共通の意匠（和紙に霞の文様と、ましろの紙の鳥の小さな印。藍の一色）。512² の1枚（09 §2.2・§2.4）。
// - 書体は Noto Serif JP（Google Fonts）を先に挙げ、ヒラギノ明朝・游明朝へ落とす。描く前に読み込みを待つ。
// - 番号（「札①」）は札に描かない（F-43「題・本文・出典だけ」。HTML で出すかは PO の判断待ち。09 §5.7-7）。

import { type CardLayout } from './geometry'

/** 題の canvas の幅（高さは題箋の縦横比で決める） */
export const TITLE_W = 1024
/** 裏の共通テクスチャ */
export const BACK_SIZE = 512

export const SERIF = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif'

const NO_START = '、。，．・：；？！ー～）」』】〕〉》’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々'
const NO_END = '（「『【〔〈《‘“'

/** 1字ずつ測って折り返す（行頭・行末の禁則を少しだけ） */
export function wrapJa(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    const chars = [...para]
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      if (line && g.measureText(line + ch).width > width) {
        if (NO_START.includes(ch)) {
          // 句読点はぶら下げる
          line += ch
          continue
        }
        const last = line.at(-1) ?? ''
        if (NO_END.includes(last)) {
          lines.push(line.slice(0, -1))
          line = last + ch
          continue
        }
        lines.push(line)
        line = ch
      } else line += ch
    }
    lines.push(line)
  }
  return lines
}

/** 題を1行に収める大きさを探す。収まらなければ2行に分け、行の長さをそろえる */
function fitTitle(g: CanvasRenderingContext2D, title: string, width: number, max: number, min: number, weight = 700): { size: number; lines: string[] } {
  for (let size = max; size >= min; size -= 2) {
    g.font = `${weight} ${size}px ${SERIF}`
    if (g.measureText(title).width <= width) return { size, lines: [title] }
  }
  const size = Math.round((max + min) / 2)
  g.font = `${weight} ${size}px ${SERIF}`
  const chars = [...title]
  // 読点の後ろか、真ん中に近い所で2行に分ける
  let cut = Math.ceil(chars.length / 2)
  const comma = chars.findIndex((c, i) => (c === '、' || c === '，') && Math.abs(i + 1 - chars.length / 2) <= chars.length / 4)
  if (comma >= 0) cut = comma + 1
  const lines = [chars.slice(0, cut).join(''), chars.slice(cut).join('')]
  if (lines.every((l) => g.measureText(l).width <= width)) return { size, lines }
  return { size, lines: wrapJa(g, title, width) }
}

/**
 * 裏（全札共通）: 和紙・藍の細い二重の枠・すやり霞の文様・ましろの紙の鳥の小さな印。藍の一色。
 * 文字は入れない。朱の印・筆書きの字・お札の語・円形の紋は使わない（05 §3.2、09 §2.2）。
 * 札の 63:88 の座標（630 × 880）で描き、正方形の canvas に縮めて入れる（貼ると元の比に戻る）。
 */
export function drawBackDesign(c: HTMLCanvasElement) {
  const S = BACK_SIZE
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  const W = 630
  const H = 880
  g.setTransform(S / W, 0, 0, S / H, 0, 0)
  const grd = g.createLinearGradient(0, 0, W * 0.3, H)
  grd.addColorStop(0, '#f8f2e4')
  grd.addColorStop(1, '#f1e8d4')
  g.fillStyle = grd
  g.fillRect(0, 0, W, H)
  const indigo = (a: number) => `rgba(63,95,143,${a})`

  // 細い二重の枠
  g.strokeStyle = indigo(0.55)
  g.lineWidth = 3
  g.beginPath()
  g.roundRect(24, 24, W - 48, H - 48, 16)
  g.stroke()
  g.lineWidth = 1.2
  g.beginPath()
  g.roundRect(33, 33, W - 66, H - 66, 11)
  g.stroke()

  // すやり霞（横に長い帯を2本ずらして重ね、段のある霞にする）。枠の内側だけに描く
  g.save()
  g.beginPath()
  g.roundRect(40, 40, W - 80, H - 80, 9)
  g.clip()
  const bands: [number, number, number, number, number][] = [
    // 上の帯の x, y, 幅, 高さ, 下の帯のずれ（＋で右）
    [-60, 112, 330, 30, 70],
    [280, 196, 420, 26, -90],
    [70, 300, 270, 24, 60],
    [-40, 566, 300, 28, 80],
    [300, 640, 380, 30, -100],
    [100, 748, 380, 26, 70],
  ]
  for (const [x, y, w, h, dx] of bands) {
    const shape = new Path2D()
    shape.roundRect(x, y, w, h, h / 2)
    shape.roundRect(x + dx, y + h * 0.62, w * 0.82, h, h / 2)
    g.fillStyle = indigo(0.17)
    g.fill(shape, 'nonzero')
    // 帯の中の細い横線（霞の筋）
    g.save()
    g.clip(shape, 'nonzero')
    g.strokeStyle = indigo(0.32)
    g.lineWidth = 1.2
    for (const yy of [y + h * 0.5, y + h * 1.15]) {
      g.beginPath()
      g.moveTo(Math.min(x, x + dx) + 8, yy)
      g.lineTo(Math.max(x + w, x + dx + w * 0.82) - 8, yy)
      g.stroke()
    }
    g.restore()
  }
  g.restore()

  // ましろ（紙の鳥）の小さな印。折り紙の面を三角形で簡略に。円で囲まない
  g.save()
  g.translate(W / 2 + 6, H / 2 + 8)
  g.scale(1.5, 1.5)
  g.lineJoin = 'round'
  const facet = (pts: number[], fill: number) => {
    g.beginPath()
    g.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
    g.closePath()
    g.fillStyle = indigo(fill)
    g.fill()
    g.strokeStyle = indigo(0.85)
    g.lineWidth = 1.1
    g.stroke()
  }
  facet([-8, 0, -40, -40, 4, -6], 0.32) // 奥の羽
  facet([-46, 6, 0, -6, 44, 4, 6, 12], 0.1) // 胴（平たい菱形）
  facet([2, -4, 28, -46, 14, 2], 0.2) // 手前の羽
  facet([34, 2, 50, -16, 44, 4], 0.28) // 首と頭
  facet([-46, 6, -62, -8, -32, 3], 0.22) // 尾
  g.restore()
  g.setTransform(1, 0, 0, 1, 0, 0)
}

/**
 * 表の題の層（透明の地。白で字を描き、色と箔はシェーダーで付ける。使うのは A＝字の覆い）。
 * canvas は題箋の範囲だけ。幅 TITLE_W、高さは題箋の縦横比。
 */
export function drawFrontTitle(c: HTMLCanvasElement, title: string, layout: CardLayout) {
  const r = layout.strip
  const sw = r.x1 - r.x0
  const sh = r.y1 - r.y0
  c.width = TITLE_W
  c.height = Math.max(8, Math.round((TITLE_W * sh) / sw))
  const k = TITLE_W / sw / 2000 // 札の幅 1 単位 = 2000px のときの字の大きさを基準にする
  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const pad = 26 * k
  g.letterSpacing = `${(4 * k).toFixed(1)}px`
  const maxSize = (layout.frame === 'karuta' ? 58 : 44) * k
  const fit = fitTitle(g, title, c.width - pad * 2, Math.round(maxSize), Math.round(maxSize * 0.72))
  const lines = fit.lines
  const room = c.height - 16 * k
  const size = lines.length * fit.size * 1.3 > room ? Math.floor(room / (lines.length * 1.3)) : fit.size
  g.font = `700 ${size}px ${SERIF}`
  const lh = size * 1.3
  let y = c.height / 2 - ((lines.length - 1) * lh) / 2
  for (const l of lines) {
    g.fillText(l, c.width / 2, y + 2 * k)
    y += lh
  }
  g.letterSpacing = '0px'
}

/** Web フォントの読み込みを待つ（待たないと代わりの書体で描かれる）。最大 ms まで */
export async function waitFonts(text: string, ms = 4000): Promise<boolean> {
  if (!('fonts' in document)) return false
  const sample = text.slice(0, 400)
  const loads = Promise.all([
    document.fonts.load(`700 60px "Noto Serif JP"`, sample),
    document.fonts.load(`400 50px "Noto Serif JP"`, sample),
    document.fonts.load(`500 40px "Noto Serif JP"`, sample),
  ]).then((r) => r.some((x) => x.length > 0))
  const timeout = new Promise<boolean>((res) => window.setTimeout(() => res(false), ms))
  try {
    return await Promise.race([loads, timeout])
  } catch {
    return false
  }
}
