// 妖怪の「夢の姿」の仮の絵（白描。紙の白と墨の線だけ）。SVG のパスで持ち、
// 3D の板（Canvas のテクスチャ）と曼荼羅帳のピース（SVG）の両方で同じ絵を使う。
//
// 光蔵坊（仮）: 山伏の装束の気配（頭襟・結袈裟の房・鈴懸・一本歯の下駄）、たたんだ羽、控えめな鼻、羽団扇。
// 目は伏せ目、眉は少し下がり気味（昔のおごりを恥じている【創作の性格】）。こわく描かない。
// 本番の絵ではない（04 §6.2: 本番の絵は段階5）。
// 彩色（段階3）: 同じ部品に色（color）を持たせ、現地で会った姿と曼荼羅の彩色のピースに使う。光と霞（06）のやわらかい色で、こわくしない。

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

const mirror = (d: string, cx: number): string =>
  // 「x,y」の組の x だけを cx を軸に反転する（このファイルのパスは、すべて絶対座標の M/L/C/Z で書く）
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${+(2 * cx - Number(x)).toFixed(2)},${y}`)

const part = (fill: string | undefined, w: number, ...extra: [string, number][]): InkPart => ({
  fill,
  lines: [...(fill ? [{ d: fill, w }] : []), ...extra.map(([d, ww]) => ({ d, w: ww }))],
})

// 羽（体の後ろ）。左を描いて、右は反転
const WING_L = 'M80,104 C64,84 40,78 24,90 C14,98 13,114 19,127 L15,140 L26,145 L21,160 L33,163 L31,178 L45,177 L47,191 L61,184 C70,168 76,150 80,130 Z'
const WING_L_FEATHERS = ['M77,112 C60,117 42,128 27,142', 'M78,122 C64,132 50,146 38,165', 'M79,132 C70,147 61,163 55,181', 'M70,96 C56,92 40,94 28,104']
// 後ろ髪（肩に届く房。左を描いて、右は反転）
const LOCK_L = 'M88,64 C82,72 80,88 82,104 L92,104 C90,92 90,78 93,68 Z'
// 首
const NECK = 'M94,86 L94,102 L106,102 L106,86 Z'
// 袖（左を描いて、右は反転）
const SLEEVE_L = 'M75,103 C64,110 58,128 56,150 L53,186 C61,193 77,193 85,187 L86,150 Z'
const SLEEVE_HEM_L = 'M62,176 C68,180 76,180 84,176'
// 胴（鈴懸）
const TORSO = 'M74,104 C84,98 116,98 126,104 L131,152 L69,152 Z'
// 袴
const HAKAMA = 'M70,150 L130,150 L140,262 C120,268 80,268 60,262 Z'
// 顔
const FACE = 'M84,74 C84,62 91,56 100,56 C110,56 116,63 116,74 C116,86 108,92 100,92 C92,92 84,86 84,74 Z'
// 頭襟（小さな帽子）
const TOKIN = 'M93,59 L97,50 L104,49 L109,55 L105,60 L96,61 Z'
// 鼻（控えめ。少し左を向く）
const NOSE = 'M97,69 C93,73 88,77 83.5,80 C86,82.6 91,82.6 97.5,79.5 Z'
// 手
const HANDS = 'M91,157 C95,152 105,152 109,157 C107,163 93,163 91,157 Z'
// 羽団扇
const FAN = 'M128,127 C119,112 127,92 141,87 C156,89 160,107 151,121 C145,128 135,130 128,127 Z'
// 下駄（一本歯）
const GETA_L = 'M73,276 L96,276 L96,280 L73,280 Z'
const GETA_TOOTH_L = 'M82,280 L82,291 L87,291 L87,280'

const POMPOMS: [number, number][] = [
  [86, 117],
  [88, 132],
  [90, 146],
]
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} C${cx - r},${cy - r * 0.55} ${cx - r * 0.55},${cy - r} ${cx},${cy - r} C${cx + r * 0.55},${cy - r} ${cx + r},${cy - r * 0.55} ${cx + r},${cy} C${cx + r},${cy + r * 0.55} ${cx + r * 0.55},${cy + r} ${cx},${cy + r} C${cx - r * 0.55},${cy + r} ${cx - r},${cy + r * 0.55} ${cx - r},${cy} Z`

const pompoms = [...POMPOMS, ...POMPOMS.map(([x, y]): [number, number] => [200 - x, y])].map(([x, y]) => circle(x, y, 4.6))

/** 彩色の色（仮）。羽は栗皮、髪は焦茶、肌は淡い肌色、袴は藍鼠、鈴懸と袖は生成り、房は柿・山吹・若竹、頭襟は墨 */
const C = {
  wing: '#8a7260',
  hair: '#4b3f37',
  skin: '#f0d7bb',
  geta: '#a07a55',
  hakama: '#6f7891',
  robe: '#ece4cf',
  fan: '#a39467',
  tokin: '#3a3330',
  pompoms: ['#cf7f5f', '#dbb560', '#7fa284'],
}
const tint = (p: InkPart, color: string): InkPart => ({ ...p, color })

export const KOZOBO_ART: InkArt = {
  w: 200,
  h: 300,
  parts: [
    tint(part(WING_L, 1.6, ...WING_L_FEATHERS.map((d): [string, number] => [d, 0.9])), C.wing),
    tint(part(mirror(WING_L, 100), 1.6, ...WING_L_FEATHERS.map((d): [string, number] => [mirror(d, 100), 0.9])), C.wing),
    tint(part(LOCK_L, 1.2), C.hair),
    tint(part(mirror(LOCK_L, 100), 1.2), C.hair),
    tint(part(NECK, 1.1), C.skin),
    // 脚と下駄（袴の下）
    part(undefined, 0, ['M86,262 L86,276', 1.3], ['M114,262 L114,276', 1.3]),
    tint(part(GETA_L, 1.2, [GETA_TOOTH_L, 1.2]), C.geta),
    tint(part(mirror(GETA_L, 100), 1.2, [mirror(GETA_TOOTH_L, 100), 1.2]), C.geta),
    tint(part(HAKAMA, 1.6, ['M86,153 L80,262', 0.9], ['M100,153 L100,266', 0.9], ['M114,153 L120,262', 0.9]), C.hakama),
    // 鈴懸と衿、結袈裟（房をつなぐ帯）、帯
    tint(part(TORSO, 1.5, ['M89,100 L100,124 L111,100', 1.3], ['M84,103 L91,150', 1.1], ['M116,103 L109,150', 1.1], ['M70,151 L130,151', 2.2]), C.robe),
    ...pompoms.map((d, i) => tint(part(d, 1.0), C.pompoms[i % 3])),
    tint(part(SLEEVE_L, 1.6, [SLEEVE_HEM_L, 0.8]), C.robe),
    tint(part(mirror(SLEEVE_L, 100), 1.6, [mirror(SLEEVE_HEM_L, 100), 0.8]), C.robe),
    // 羽団扇と手
    part(undefined, 0, ['M106,156 L129,127', 1.6]),
    tint(part(FAN, 1.4, ['M130,125 L145,90', 0.7], ['M133,126 L154,104', 0.7], ['M130,124 L136,90', 0.7]), C.fan),
    tint(part(HANDS, 1.2), C.skin),
    // 顔: 頭襟、伏せ目と少し下がった眉、小さな口、控えめな鼻
    tint(
      part(
        FACE,
        1.5,
      ['M88,71 C90,73.2 93.5,73.2 95.5,71', 1.2],
      ['M104.5,71 C106.5,73.2 110,73.2 112,71', 1.2],
      ['M87,66 C90,64.6 93,64 96,64.2', 1.4],
      ['M104,64.2 C107,64 110,64.6 113,66', 1.4],
        ['M97,86.5 C99.5,87.6 102.5,87.6 105,86.5', 1.0],
      ),
      C.skin,
    ),
    tint(part(TOKIN, 1.3, ['M94,61 C90,64 88,68 86,71', 0.8]), C.tokin),
    tint(part(NOSE, 1.2), C.skin),
  ],
}

export const ARTS: Record<string, InkArt> = { kozobo: KOZOBO_ART }

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
