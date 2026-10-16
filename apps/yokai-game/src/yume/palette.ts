// 見た目の2つの調子。「白描」は夢の旅の基本の見た目（和紙と墨）、「彩色（仮）」は淡い色の里山。
// 派手にしない。色はすべて sRGB の16進数。

export type LookId = 'hakubyo' | 'saishiki'

export interface Palette {
  id: LookId
  label: string
  // 地面のテクスチャ
  paddy: string
  paddyAlt: string
  ridge: string
  yard: string
  forest: string
  forestDot: string
  forestDotLight: string
  parking: string
  riverbed: string
  riverbedDot: string
  island: string
  roadUnder: string
  restVeil: string
  shadow: string
  grain: number
  // 3D
  road: number
  path: number
  water: number
  wall: number
  roof: number
  flatRoof: number
  canopy: number
  canopyBroad: number
  trunk: number
  ballast: number
  outer: number
  // 墨の線
  ink: number
  lineAlpha: { building: number; edge: number; contour: number; rail: number }
  lineWidth: number
  rim: number
  // 空・霞
  skyTop: number
  skyHorizon: number
  fog: number
  mist: number
  mountains: { fill: number; top: number }[]
  snow: number
  mountainInk: number
  // 光
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  sun: number
  sunIntensity: number
  // アバター
  robe: number
  hat: number
  skin: number
  pack: number
}

export const PALETTES: Record<LookId, Palette> = {
  hakubyo: {
    id: 'hakubyo',
    label: '白描',
    paddy: '#efe9dc',
    paddyAlt: '#ebe4d5',
    ridge: '#e0d8c6',
    yard: '#e8e1d1',
    forest: '#e4ddcc',
    forestDot: 'rgba(48,44,38,0.55)',
    forestDotLight: 'rgba(48,44,38,0.18)',
    parking: '#e9e4da',
    riverbed: '#e6e1d5',
    riverbedDot: 'rgba(60,56,50,0.22)',
    island: '#e1dacb',
    roadUnder: '#e0d7c4',
    restVeil: 'rgba(250,248,242,0.75)',
    shadow: 'rgba(60,52,40,0.20)',
    grain: 0.022,
    road: 0xf7f3ea,
    path: 0xf1ebde,
    water: 0xc9cfcf,
    wall: 0xf4efe5,
    roof: 0xcfc9be,
    flatRoof: 0xd8d2c6,
    canopy: 0xe7e1d3,
    canopyBroad: 0xebe5d8,
    trunk: 0x4a4540,
    ballast: 0xdcd6ca,
    outer: 0xebe5d8,
    ink: 0x26221e,
    lineAlpha: { building: 0.92, edge: 0.7, contour: 0.2, rail: 0.85 },
    lineWidth: 1.5,
    rim: 0.55,
    skyTop: 0xe4e2db,
    skyHorizon: 0xf4f0e7,
    fog: 0xf1ece2,
    mist: 0xfbf9f4,
    mountains: [
      { fill: 0xd6d3cb, top: 0xa8a49b },
      { fill: 0xcfcbc2, top: 0x9c978e },
      { fill: 0xc8c3b9, top: 0x8f8a81 },
    ],
    snow: 0xf7f5f0,
    mountainInk: 0x3a3631,
    hemiSky: 0xffffff,
    hemiGround: 0xd9d2c4,
    hemiIntensity: 2.1,
    sun: 0xfff6e8,
    sunIntensity: 1.1,
    robe: 0xeee8dc,
    hat: 0xe6dccb,
    skin: 0xf3ece2,
    pack: 0xd8cfbf,
  },
  saishiki: {
    id: 'saishiki',
    label: '彩色（仮）',
    paddy: '#bfcd9f',
    paddyAlt: '#b6c696',
    ridge: '#a8b98a',
    yard: '#cfc3a6',
    forest: '#7e9566',
    forestDot: 'rgba(52,72,44,0.55)',
    forestDotLight: 'rgba(160,182,120,0.45)',
    parking: '#bdb7aa',
    riverbed: '#d3cdc0',
    riverbedDot: 'rgba(120,112,100,0.35)',
    island: '#9fb17e',
    roadUnder: '#c4b796',
    restVeil: 'rgba(240,238,232,0.7)',
    shadow: 'rgba(40,46,30,0.25)',
    grain: 0.018,
    road: 0xe2d6b6,
    path: 0xd6c8a4,
    water: 0x6e8593,
    wall: 0xbdb4a6,
    roof: 0x4c515a,
    flatRoof: 0x6d6d6a,
    canopy: 0x5d7b4c,
    canopyBroad: 0x7a9156,
    trunk: 0x5f4a3a,
    ballast: 0xa8a297,
    outer: 0xc4cca8,
    ink: 0x2f2a25,
    lineAlpha: { building: 0.4, edge: 0.18, contour: 0, rail: 0.7 },
    lineWidth: 1.25,
    rim: 0,
    skyTop: 0xb8cddd,
    skyHorizon: 0xece6d8,
    fog: 0xe8e6dd,
    mist: 0xf6f5f0,
    mountains: [
      { fill: 0xb3bfcc, top: 0x8e9cad },
      { fill: 0xa3b0b4, top: 0x7f8f95 },
      { fill: 0x98a796, top: 0x768a77 },
    ],
    snow: 0xf4f6f8,
    mountainInk: 0x4a5058,
    hemiSky: 0xf1f4ff,
    hemiGround: 0xa9a58f,
    hemiIntensity: 1.5,
    sun: 0xfff1dc,
    sunIntensity: 1.9,
    robe: 0x4d5a6e,
    hat: 0xc8a86c,
    skin: 0xe9d2b6,
    pack: 0x8a6a4a,
  },
}
