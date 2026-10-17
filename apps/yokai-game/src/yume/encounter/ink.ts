// 妖怪の板絵（白描と彩色）の形と、絵を書くための道具。妖怪ごとの絵は art.ts と arts/*.ts に置く。
// 絵は SVG のパス（絶対座標の M/L/C/Z だけ）で書き、3D の板（Canvas のテクスチャ）・曼荼羅帳のピース・現地の姿で同じものを使う。

export interface InkPart {
  /** 紙の白で塗る面（後の部品が前の部品を隠す） */
  fill?: string
  /** 彩色（現地で会った本当の姿・曼荼羅の彩色のピース）で塗る色。なければ紙の白 */
  color?: string
  /** 墨の線（太さは viewBox の単位） */
  lines: { d: string; w: number }[]
}

export interface InkArt {
  /** viewBox の幅・高さ */
  w: number
  h: number
  /** 奥から順に描く部品（塗り → 線 を部品ごとに。前の部品が奥の線を隠す） */
  parts: InkPart[]
}

/** 「x,y」の組の x だけを cx を軸に反転する（パスは、すべて絶対座標の M/L/C/Z で書く） */
export const mirror = (d: string, cx: number): string =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${+(2 * cx - Number(x)).toFixed(2)},${y}`)

export const part = (fill: string | undefined, w: number, ...extra: [string, number][]): InkPart => ({
  fill,
  lines: [...(fill ? [{ d: fill, w }] : []), ...extra.map(([d, ww]) => ({ d, w: ww }))],
})

/** 円（ベジェ4本） */
export const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} C${cx - r},${cy - r * 0.55} ${cx - r * 0.55},${cy - r} ${cx},${cy - r} C${cx + r * 0.55},${cy - r} ${cx + r},${cy - r * 0.55} ${cx + r},${cy} C${cx + r},${cy + r * 0.55} ${cx + r * 0.55},${cy + r} ${cx},${cy + r} C${cx - r * 0.55},${cy + r} ${cx - r},${cy + r * 0.55} ${cx - r},${cy} Z`

/** 部品に彩色の色を付ける */
export const tint = (p: InkPart, color: string): InkPart => ({ ...p, color })

/** SVG の中身（<g> の中）として書き出す。曼荼羅帳のピースと、現地の姿に使う。colored なら部品の色（彩色）で塗る */
export function artToSvg(art: InkArt, paper: string, ink: string, lineScale = 1, fillOpacity = 1, colored = false): string {
  return art.parts
    .map(
      (p) =>
        (p.fill ? `<path d="${p.fill}" fill="${colored && p.color ? p.color : paper}" fill-opacity="${fillOpacity}"/>` : '') +
        p.lines
          .map((l) => `<path d="${l.d}" fill="none" stroke="${ink}" stroke-width="${(l.w * lineScale).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`)
          .join(''),
    )
    .join('')
}
