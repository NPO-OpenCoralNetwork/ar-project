// 「光と霞」（夢の旅の基本の見た目）と、時間帯（昼・夕・夜）。
// 値の出どころは docs/yokai-game/06-art-direction.md（§2 のパレット、§3 の光、§8 の TypeScript）。
// 白描（palette.ts の hakubyo）にも時間帯を足し、空と霧と光だけを変える（地面・建物の和紙と墨はそのまま）。
//
// 色は sRGB の16進。光の色・強さは three.js 0.186 の線形の光（ColorManagement 有効、NoToneMapping）での値。

import { type Palette, PALETTES } from './palette'

export type TimeId = 'day' | 'dusk' | 'night'
export type ViewLook = 'hikari' | 'hakubyo'

export const TIMES: { id: TimeId; label: string }[] = [
  { id: 'day', label: '昼' },
  { id: 'dusk', label: '夕' },
  { id: 'night', label: '夜' },
]

/** 画質ごとの数 */
export interface PerQuality {
  low: number
  std: number
  high: number
}

export interface SceneExtras {
  time: TimeId
  /** 空の中ほどの色（skyTop → skyMid → skyHorizon の3段） */
  skyMid: number
  /** 太陽・月のまわりの空の明るみ */
  skyGlow: number
  /** 光の方向を向いたときの霧の色（反対を向いたときは fog） */
  fogToLight: number
  /** 霧のいちばん濃いところの濃さ（0..1） */
  fogMax: number
  /** 霧のかかり方: 0 = three.js の直線（白描のまま）、1 = 「始めはゆっくり、上限で止まる」（§3.4） */
  fogShape: number
  /** rig.fogNear / rig.fogFar に掛ける倍率 */
  fogNearK: number
  fogFarK: number
  /** 主光源（昼・夕は太陽、夜は月）。方位は北=0°・東=90°、高度は地平から */
  light: { azDeg: number; elDeg: number }
  /** 雲海（遠景の霞の帯）。amount 0 で白描のすやり霞のまま */
  cloudSea: { amount: number; lit: number; shade: number; rimNdc: number; billow: number }
  /** 太陽（画面の短辺に対する割合）。elFrac は空の帯の中の高さ（0 = 稜線の裾、1 = 画面の上端） */
  sunDisc: { color: number; radius: number; halo: number; haloRadius: number; haloAlpha: number; elFrac: number } | null
  /** 朱い月。立山（いちばん奥の層）のいちばん高い所の方位 + azOffsetDeg、その方位の稜線の上 clearance×半径 の高さ（1 より小さいと、下の縁が山に隠れる「昇る月」） */
  moon: {
    core: number
    shade: number
    rim: number
    halo: number
    haloOuter: number
    radius: number
    azOffsetDeg: number
    clearance: number
    /** 横長の画面（PC）での半径と高さ。空の帯が細いので、小さめにして上の端で切れないように */
    radiusWide?: number
    clearanceWide?: number
    haloAlpha: number
    alpha: number
  } | null
  /** 星。1画素（2×2 のます）あたりの出やすさ */
  stars: { color: number; density: number } | null
  /** 光の粒（ちり・灯の粒）。2色を混ぜる。大きさは CSS px */
  motes: {
    a: number
    b: number
    mixB: number
    count: PerQuality
    sizePx: [number, number]
    alpha: number
    twinkleHz: [number, number]
    /** 灯りのまわり（8m 以内）に集める割合（0..1） */
    cluster?: number
  }
  /** 舞う紅葉 */
  leaves: { a: number; b: number; count: PerQuality } | null
  /** 道沿いの小さな灯り。intensity 0 で消灯 */
  lamps: { core: number; halo: number; outer: number; pool: number; paper: number; post: number; intensity: number; max: PerQuality }
  /** 家の窓のほのかな灯り（加算の小さな板）。intensity 0 で消す。無ければ消灯 */
  windows?: { color: number; intensity: number }
  /** お休みの範囲の霧のほのかな光 */
  restGlow: {
    color: number
    strength: number
    edge: number
    edgeStrength: number
    pulseSec: number
    /** お休みの範囲の方位だけ、遠景の地平（雲海）を color で明るくする量（霧の向こうに灯りのある場所） */
    horizon?: number
  }
  /** 逆光のふちの光（アバター・ましろ・木） */
  glowRim: { color: number; strength: number; treeScale: number }
  /** ましろのまわりの光の輪と、足元の明かり（player.ts が読む） */
  mashiroGlow: { color: number; alpha: number; poolAlpha: number }
  /** アバターの足元の丸い影（影なしの画質で使う。player.ts が読む。無ければ player の既定） */
  blobShadow?: { color: number; opacity: number }
  /** 合羽の下の着物（player.ts が読む） */
  robeUnder?: number
  /** 建物の根元・木の下を暗くする強さ（頂点の明るさ） */
  ao: number
  /** にじみ（ブルーム。画質「標準」以上）。threshold は線形の明るさ。strength 0 なら後処理をしない（昼は光る物が少ないので使わない） */
  bloom: { threshold: number; strength: number; radius: number }
  /** 出典表示の地と文字 */
  credit: { bg: string; text: string }
}

export type ScenePalette = Palette & SceneExtras

const LINES = { lineAlpha: { building: 0.12, edge: 0.05, contour: 0, rail: 0.4 }, lineWidth: 1.0, rim: 0 }
const LAMP_MAX: PerQuality = { low: 10, std: 24, high: 36 }

/** 「光と霞」の時間帯（06 §2・§8 の値から、画面で見て直したもの） */
export const HIKARI: Record<TimeId, ScenePalette> = {
  // 昼（金色の午後）: Journey の金色の霞、A Short Hike の橙の道と青緑の水、Sky のやわらかい空
  day: {
    id: 'hikari',
    label: '光と霞',
    time: 'day',
    paddy: '#cfc67e',
    paddyAlt: '#a9bd7c',
    ridge: '#86b07a',
    yard: '#e2d0a6',
    forest: '#6f9a6a',
    forestDot: 'rgba(52,94,72,0.22)',
    forestDotLight: 'rgba(200,218,140,0.25)',
    parking: '#d8ccb2',
    riverbed: '#e4d8be',
    riverbedDot: 'rgba(150,128,106,0.32)',
    island: '#a9c27e',
    roadUnder: '#d9c092',
    restVeil: 'rgba(255,246,226,0.55)',
    shadow: 'rgba(88,96,160,0.36)',
    grain: 0.012,
    road: 0xecdcb8,
    path: 0xd8915a,
    water: 0x63b8b4,
    wall: 0xe4d4bc,
    roof: 0x6a7392,
    flatRoof: 0x8e98b0,
    canopy: 0x5b8a68,
    canopyBroad: 0x8fb26a,
    trunk: 0x8a5a44,
    ballast: 0xb9ad9a,
    outer: 0xc4cf98,
    ink: 0x4a5068,
    ...LINES,
    skyTop: 0x86bfd6,
    skyMid: 0xbfe0d8,
    skyHorizon: 0xf4e2b8,
    skyGlow: 0xfff0c4,
    fog: 0xd3e3da,
    fogToLight: 0xf6dfa6,
    fogMax: 0.8,
    fogShape: 1,
    fogNearK: 0.84,
    fogFarK: 0.82,
    mist: 0xf8eedc,
    mountains: [
      { fill: 0xb9cbd6, top: 0x9fb9ca },
      { fill: 0xa7c2c0, top: 0x8fb0ad },
      { fill: 0x9cb894, top: 0x84a67e },
    ],
    snow: 0xfbf6ea,
    mountainInk: 0x6d8496,
    light: { azDeg: 235, elDeg: 32 },
    hemiSky: 0xc4ccff,
    hemiGround: 0xf6d8b0,
    hemiIntensity: 2.32,
    sun: 0xffe884,
    sunIntensity: 3.08,
    cloudSea: { amount: 1, lit: 0xfffaf0, shade: 0xc9d0cc, rimNdc: 0.03, billow: 0.5 },
    sunDisc: { color: 0xfff6dc, radius: 0.03, halo: 0xffe6a0, haloRadius: 0.22, haloAlpha: 0.45, elFrac: 0.55 },
    moon: null,
    stars: null,
    motes: { a: 0xffe7a8, b: 0xfff8e6, mixB: 0.3, count: { low: 24, std: 80, high: 140 }, sizePx: [2, 4], alpha: 0.4, twinkleHz: [0.2, 0.5] },
    leaves: null,
    lamps: { core: 0xffd89a, halo: 0xff9a48, outer: 0xc4402c, pool: 0xffae5c, paper: 0xf4ead6, post: 0xa88a6c, intensity: 0, max: LAMP_MAX },
    restGlow: { color: 0xfff1d0, strength: 0.08, edge: 0xf2d8b0, edgeStrength: 0, pulseSec: 12 },
    glowRim: { color: 0xffe7a0, strength: 0.25, treeScale: 0.5 },
    mashiroGlow: { color: 0xfff1d6, alpha: 0.18, poolAlpha: 0 },
    blobShadow: { color: 0x4a5288, opacity: 0.32 },
    robeUnder: 0xefe6d6,
    ao: 1,
    bloom: { threshold: 1.0, strength: 0, radius: 0.5 },
    robe: 0x3f5f8f,
    hat: 0xc49558,
    skin: 0xe8cfb0,
    pack: 0xb5523b,
    credit: { bg: 'rgba(250,247,240,0.72)', text: '#5a5246' },
  },

  // 夕（逢魔が時）: Sky の ばら色の雲海。東の立山を向くと、ばら色の帯の下に藍の地球の影
  dusk: {
    id: 'hikari',
    label: '光と霞',
    time: 'dusk',
    paddy: '#b88884',
    paddyAlt: '#ae7f80',
    ridge: '#9a8890',
    yard: '#dcbcae',
    forest: '#6a6e80',
    forestDot: 'rgba(60,58,96,0.5)',
    forestDotLight: 'rgba(220,170,160,0.35)',
    parking: '#cbb4b0',
    riverbed: '#dcc4bc',
    riverbedDot: 'rgba(120,96,120,0.32)',
    island: '#8f9488',
    roadUnder: '#d2ab9a',
    restVeil: 'rgba(246,214,204,0.5)',
    shadow: 'rgba(80,70,130,0.28)',
    grain: 0.014,
    road: 0xf2d6c0,
    path: 0xf0c49a,
    water: 0x9a9cc8,
    wall: 0xe6c4b6,
    roof: 0x3e3a5e,
    flatRoof: 0x5e5874,
    canopy: 0x3e4660,
    canopyBroad: 0x55607a,
    trunk: 0x6a4450,
    ballast: 0xa8949a,
    outer: 0x9c8ea4,
    ink: 0x3e3858,
    ...LINES,
    skyTop: 0x3b3d78,
    skyMid: 0x9a86b0,
    skyHorizon: 0xeaa6a2,
    skyGlow: 0xffc9a0,
    fog: 0xa99ab4,
    fogToLight: 0xeeae96,
    fogMax: 0.85,
    fogShape: 1,
    fogNearK: 0.8,
    fogFarK: 0.78,
    mist: 0xf6d2c6,
    mountains: [
      { fill: 0x8e84aa, top: 0xd99c9c },
      { fill: 0x7a7598, top: 0x8f84a6 },
      { fill: 0x626686, top: 0x6c6e8e },
    ],
    snow: 0xf4c2b8,
    mountainInk: 0x4a4466,
    light: { azDeg: 255, elDeg: 20 },
    hemiSky: 0xdcd4ff,
    hemiGround: 0xe7c7cb,
    hemiIntensity: 1.8,
    sun: 0xffc757,
    sunIntensity: 3.86,
    cloudSea: { amount: 1, lit: 0xf4c0a2, shade: 0x5e5076, rimNdc: 0.035, billow: 0.6 },
    sunDisc: { color: 0xffd0a0, radius: 0.04, halo: 0xffb08a, haloRadius: 0.3, haloAlpha: 0.55, elFrac: 0.18 },
    moon: { core: 0xf4d6cc, shade: 0xd9b4b0, rim: 0xfff0ea, halo: 0xd8a0b0, haloOuter: 0xb090b0, radius: 0.045, azOffsetDeg: -12, clearance: 1.3, radiusWide: 0.036, clearanceWide: 1.4, haloAlpha: 0.25, alpha: 0.55 },
    stars: null,
    motes: { a: 0xffc79a, b: 0xf7a8b8, mixB: 0.4, count: { low: 24, std: 80, high: 140 }, sizePx: [2, 4], alpha: 0.6, twinkleHz: [0.3, 0.7] },
    leaves: { a: 0xc2412d, b: 0xd9773a, count: { low: 0, std: 16, high: 28 } },
    lamps: { core: 0xffd89a, halo: 0xff9a48, outer: 0xc4402c, pool: 0xffae5c, paper: 0xf0dcc8, post: 0x5a4048, intensity: 0.5, max: LAMP_MAX },
    // 夕の終わり: 灯りはじめた窓が少し
    windows: { color: 0xffb46a, intensity: 0.45 },
    restGlow: { color: 0xf6c9a8, strength: 0.15, edge: 0xd9775a, edgeStrength: 0.06, pulseSec: 10 },
    glowRim: { color: 0xffb48a, strength: 0.4, treeScale: 0.5 },
    mashiroGlow: { color: 0xfff1d6, alpha: 0.36, poolAlpha: 0.12 },
    blobShadow: { color: 0x3e3a6e, opacity: 0.32 },
    robeUnder: 0xefe6d6,
    ao: 1,
    bloom: { threshold: 0.8, strength: 0.35, radius: 0.55 },
    robe: 0x3f5f8f,
    hat: 0xdcc08a,
    skin: 0xe8cfb0,
    pack: 0xb5523b,
    credit: { bg: 'rgba(250,244,240,0.72)', text: '#5a4c52' },
  },

  // 夜（Kage 風）: 深い藍、琥珀の灯り、立山の上の朱い月。社寺は描かない
  night: {
    id: 'hikari',
    label: '光と霞',
    time: 'night',
    paddy: '#232c4c',
    paddyAlt: '#20294a',
    ridge: '#2f4d5e',
    yard: '#3c4568',
    forest: '#1c2c3c',
    forestDot: 'rgba(8,14,30,0.55)',
    forestDotLight: 'rgba(110,140,190,0.25)',
    parking: '#3a4262',
    riverbed: '#444c6c',
    riverbedDot: 'rgba(10,14,34,0.35)',
    island: '#2a4250',
    roadUnder: '#424a6c',
    restVeil: 'rgba(74,60,94,0.5)',
    shadow: 'rgba(8,10,30,0.35)',
    grain: 0.03,
    road: 0x56607e,
    path: 0x66708e,
    water: 0x1c3054,
    wall: 0x4a5272,
    roof: 0x1e2340,
    flatRoof: 0x1a1e36,
    canopy: 0x1e3242,
    canopyBroad: 0x2a3e4a,
    trunk: 0x2a2430,
    ballast: 0x3a4058,
    outer: 0x1e263e,
    ink: 0x0a0c1c,
    lineAlpha: { building: 0.18, edge: 0.08, contour: 0, rail: 0.5 },
    lineWidth: 1.0,
    rim: 0,
    skyTop: 0x070b1d,
    skyMid: 0x0f1633,
    skyHorizon: 0x1d2548,
    skyGlow: 0x4a2230,
    fog: 0x161d3a,
    fogToLight: 0x2a2140,
    fogMax: 0.9,
    fogShape: 1,
    fogNearK: 0.78,
    fogFarK: 0.76,
    mist: 0x4a3c5e,
    mountains: [
      { fill: 0x1c2244, top: 0x2e2a4c },
      { fill: 0x161c38, top: 0x22243e },
      { fill: 0x10162c, top: 0x181c32 },
    ],
    snow: 0x3c4466,
    mountainInk: 0x8a4a58,
    light: { azDeg: 100, elDeg: 35 },
    hemiSky: 0xcbd5ff,
    hemiGround: 0xa192af,
    hemiIntensity: 1.8,
    sun: 0xffc3a2,
    sunIntensity: 1.7,
    cloudSea: { amount: 1, lit: 0x5e4a70, shade: 0x0e1428, rimNdc: 0.025, billow: 0.5 },
    sunDisc: null,
    moon: { core: 0xc4615a, shade: 0x8e3f42, rim: 0xe3907e, halo: 0x7a2e36, haloOuter: 0x3a1a26, radius: 0.06, azOffsetDeg: -12, clearance: 0.9, radiusWide: 0.045, clearanceWide: 1.2, haloAlpha: 0.55, alpha: 1 },
    stars: { color: 0xdfe6ff, density: 0.0015 },
    motes: { a: 0xcfe6ff, b: 0xffb866, mixB: 0.6, count: { low: 24, std: 70, high: 110 }, sizePx: [2, 3.5], alpha: 0.6, cluster: 0.5, twinkleHz: [0.4, 1.2] },
    leaves: { a: 0xb8322a, b: 0xc8502e, count: { low: 0, std: 12, high: 20 } },
    lamps: { core: 0xffd89a, halo: 0xff9a48, outer: 0xc4402c, pool: 0xffae5c, paper: 0xffe2b0, post: 0x2a2430, intensity: 1, max: LAMP_MAX },
    windows: { color: 0xffbb70, intensity: 0.9 },
    restGlow: { color: 0xe89a52, strength: 0.55, edge: 0xb84a34, edgeStrength: 0.2, pulseSec: 9, horizon: 0.25 },
    glowRim: { color: 0xff9a8a, strength: 0.55, treeScale: 0.5 },
    mashiroGlow: { color: 0xffe2b0, alpha: 0.6, poolAlpha: 0.16 },
    blobShadow: { color: 0x05081a, opacity: 0.4 },
    robeUnder: 0xefe6d6,
    ao: 1,
    bloom: { threshold: 0.45, strength: 0.7, radius: 0.6 },
    robe: 0x3f5f8f,
    hat: 0xdcc08a,
    skin: 0xe8cfb0,
    pack: 0xb5523b,
    credit: { bg: 'rgba(16,20,40,0.62)', text: '#d8d4e4' },
  },
}

/**
 * 白描の時間帯。地面・建物・木の和紙と墨（palette.ts の hakubyo）はそのままで、空・霧・遠景・光だけを変える。
 * 粒・紅葉・逆光のふちは出さない。夜だけ道沿いの灯りをともす（紙の白に、灯りだけが色を持つ）。
 */
const HAKUBYO_TIME: Record<TimeId, Partial<ScenePalette>> = {
  day: {},
  dusk: {
    skyTop: 0xc8c0d2,
    skyMid: 0xe0d4da,
    skyHorizon: 0xf2e0d8,
    skyGlow: 0xf8e2d2,
    fog: 0xebe0da,
    fogToLight: 0xf2e2d4,
    mist: 0xf8efea,
    mountains: [
      { fill: 0xd2c8cc, top: 0xa89c9e },
      { fill: 0xcac0c4, top: 0x9c9094 },
      { fill: 0xc2b8bc, top: 0x908488 },
    ],
    snow: 0xf6eeec,
    light: { azDeg: 255, elDeg: 20 },
    hemiSky: 0xf4eef8,
    hemiGround: 0xd8ccc8,
    hemiIntensity: 2.0,
    sun: 0xffe2cc,
    sunIntensity: 1.3,
  },
  night: {
    skyTop: 0x10142a,
    skyMid: 0x1c2240,
    skyHorizon: 0x2c3352,
    skyGlow: 0x4a2a38,
    fog: 0x30364e,
    fogToLight: 0x3a3450,
    mist: 0x5a5a70,
    mountains: [
      { fill: 0x2a2f4a, top: 0x6a6e86 },
      { fill: 0x242840, top: 0x5a5e76 },
      { fill: 0x1e2238, top: 0x4c5068 },
    ],
    snow: 0x4a5070,
    mountainInk: 0xc8c4d4,
    light: { azDeg: 100, elDeg: 35 },
    hemiSky: 0xb8c0e8,
    hemiGround: 0x6a6a80,
    hemiIntensity: 1.25,
    sun: 0xe8dcf0,
    sunIntensity: 0.55,
    // 白描の夜も光と霞と同じ空の帯にした（main.ts の wideSky）ので、月も同じ大きさ・高さ
    moon: HIKARI.night.moon,
    stars: HIKARI.night.stars,
    lamps: { ...HIKARI.night.lamps, paper: 0xfbf6ea, post: 0x4a4540 },
    windows: { color: 0xffd9a0, intensity: 0.8 },
    mashiroGlow: { color: 0xffe2b0, alpha: 0.35, poolAlpha: 0.1 },
    restGlow: { ...HIKARI.night.restGlow, strength: 0.18, edgeStrength: 0.05 },
    // 白描の夜は後処理をしない（灯りの輪の板だけで見せる）
    bloom: { ...HIKARI.night.bloom, strength: 0 },
    credit: HIKARI.night.credit,
  },
}

/** 白描の時間帯の土台（昼の値。白描は手前からの光で、霧は直線で 1 まで） */
const HAKUBYO_BASE: SceneExtras = {
  time: 'day',
  // 前の版（2段のグラデーション）と同じ見え方になるよう、地平と上端の 0.45 の所の色
  skyMid: 0xeceae2,
  skyGlow: 0xfaf6ec,
  fogToLight: PALETTES.hakubyo.fog,
  fogMax: 1,
  fogShape: 0,
  fogNearK: 1,
  fogFarK: 1,
  light: { azDeg: 200, elDeg: 42 },
  cloudSea: { amount: 0, lit: 0xffffff, shade: 0xe8e4dc, rimNdc: 0.03, billow: 0.5 },
  sunDisc: null,
  moon: null,
  stars: null,
  motes: { ...HIKARI.day.motes, count: { low: 0, std: 0, high: 0 } },
  leaves: null,
  lamps: { ...HIKARI.day.lamps, paper: 0xfbf8f0, post: 0x4a4540, intensity: 0 },
  restGlow: { color: 0xfbf9f4, strength: 0, edge: 0xfbf9f4, edgeStrength: 0, pulseSec: 12 },
  glowRim: { color: 0xffffff, strength: 0, treeScale: 0.5 },
  // 白描のましろは、光の輪を控えめに（player.ts の白描の既定と同じ 0.1）
  mashiroGlow: { color: 0xfff1d6, alpha: 0.1, poolAlpha: 0 },
  // 白描は和紙と墨だけ（頂点の暗さを足さない。前の版と同じ）
  ao: 0,
  bloom: { threshold: 1.2, strength: 0, radius: 0.4 },
  credit: { bg: 'rgba(250,247,240,0.72)', text: 'rgba(42,38,34,0.62)' },
}

export function scenePalette(look: ViewLook, time: TimeId): ScenePalette {
  if (look === 'hikari') return HIKARI[time]
  return { ...PALETTES.hakubyo, ...HAKUBYO_BASE, ...HAKUBYO_TIME[time], time }
}

/** 光の向き（x = 東、y = 上、z = 南）。06 §3.1 */
export function lightDir(p: SceneExtras): [number, number, number] {
  const az = (p.light.azDeg * Math.PI) / 180
  const el = (p.light.elDeg * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
}
