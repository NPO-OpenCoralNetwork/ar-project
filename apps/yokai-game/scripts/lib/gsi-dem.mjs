// 国土地理院の標高タイル（PNG）を取り、緯度経度の標高を返す。
// 仕様: https://maps.gsi.go.jp/development/demtile.html
//   x = 2^16 R + 2^8 G + B
//   x < 2^23 なら h = x * 0.01 m、x = 2^23 は無効値（NA）、x > 2^23 なら h = (x - 2^24) * 0.01 m
// タイル: dem5a_png は z15 まで、dem_png（DEM10B）は z14 まで。
// 出典表示:「地理院タイル（標高）を加工して作成」

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng } from './png.mjs'

export const DEM_LAYERS = {
  dem5a: { url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png', maxZoom: 15, label: 'DEM5A（航空レーザ測量、5mメッシュ）' },
  dem5b: { url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/{z}/{x}/{y}.png', maxZoom: 15, label: 'DEM5B（写真測量、5mメッシュ）' },
  dem10b: { url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png', maxZoom: 14, label: 'DEM10B（10mメッシュ）' },
}

const USER_AGENT = 'yokai-game-dev/0.1 (region data build script)'

/** 緯度経度 → ズーム z の全体ピクセル座標（Web メルカトル、256px タイル） */
export function lonLatToPixel(lat, lon, z) {
  const n = 2 ** z * 256
  const x = ((lon + 180) / 360) * n
  const s = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n
  return { x, y }
}

/** RGB → 標高（m）。無効値は NaN */
export function rgbToHeight(r, g, b) {
  const x = r * 65536 + g * 256 + b
  if (x === 8388608) return NaN
  return x < 8388608 ? x * 0.01 : (x - 16777216) * 0.01
}

/**
 * タイルを取り、キャッシュする標高ソース
 * @param {keyof typeof DEM_LAYERS} layer
 * @param {number} z
 * @param {string} cacheDir 取得した PNG を置く場所
 * @param {{ offline?: boolean }} [opts]
 */
export function createDemSource(layer, z, cacheDir, opts = {}) {
  const def = DEM_LAYERS[layer]
  if (z > def.maxZoom) throw new Error(`${layer} は z${def.maxZoom} まで`)
  mkdirSync(cacheDir, { recursive: true })
  /** @type {Map<string, Float32Array | null>} */
  const tiles = new Map()
  const stats = { fetched: 0, cached: 0, missing: 0 }

  async function loadTile(tx, ty) {
    const key = `${tx}/${ty}`
    if (tiles.has(key)) return tiles.get(key)
    const file = join(cacheDir, `${layer}-${z}-${tx}-${ty}.png`)
    const miss = join(cacheDir, `${layer}-${z}-${tx}-${ty}.404`)
    /** @type {Uint8Array | null} */
    let buf = null
    if (existsSync(file)) {
      buf = readFileSync(file)
      stats.cached++
    } else if (existsSync(miss)) {
      buf = null
    } else if (!opts.offline) {
      const url = def.url.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty))
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.status === 404) {
        writeFileSync(miss, '')
      } else if (!res.ok) {
        throw new Error(`${res.status} ${url}`)
      } else {
        buf = new Uint8Array(await res.arrayBuffer())
        writeFileSync(file, buf)
        stats.fetched++
      }
    }
    if (!buf) {
      stats.missing++
      tiles.set(key, null)
      return null
    }
    const png = decodePng(buf)
    const h = new Float32Array(png.width * png.height)
    for (let i = 0; i < h.length; i++) h[i] = rgbToHeight(png.rgba[i * 4], png.rgba[i * 4 + 1], png.rgba[i * 4 + 2])
    tiles.set(key, h)
    return h
  }

  /** 全体ピクセル (px, py) の値（ピクセルの中心が整数+0.5）。無効なら NaN */
  async function pixel(px, py) {
    const tx = Math.floor(px / 256)
    const ty = Math.floor(py / 256)
    const t = await loadTile(tx, ty)
    if (!t) return NaN
    return t[(py - ty * 256) * 256 + (px - tx * 256)]
  }

  /**
   * 緯度経度の標高（双一次補間）。4 点のどれかが無効なら、有効な点だけで重み付けし、全部無効なら NaN。
   */
  async function heightAt(lat, lon) {
    const p = lonLatToPixel(lat, lon, z)
    const fx = p.x - 0.5
    const fy = p.y - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const v = [
      [await pixel(x0, y0), (1 - tx) * (1 - ty)],
      [await pixel(x0 + 1, y0), tx * (1 - ty)],
      [await pixel(x0, y0 + 1), (1 - tx) * ty],
      [await pixel(x0 + 1, y0 + 1), tx * ty],
    ]
    let s = 0
    let w = 0
    for (const [h, k] of v) {
      if (!Number.isNaN(h)) {
        s += h * k
        w += k
      }
    }
    // 4 点のうち有効な点の重みが半分未満なら、信用しない（水面の縁など）
    return w >= 0.5 ? s / w : NaN
  }

  /** 先に必要なタイルをまとめて取る（並列数を絞る） */
  async function prefetch(latLons, concurrency = 6) {
    const keys = new Set()
    for (const { lat, lon } of latLons) {
      const p = lonLatToPixel(lat, lon, z)
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) keys.add(`${Math.floor((p.x + dx) / 256)}/${Math.floor((p.y + dy) / 256)}`)
    }
    const list = [...keys].map((k) => k.split('/').map(Number))
    let i = 0
    const worker = async () => {
      while (i < list.length) {
        const [tx, ty] = list[i++]
        await loadTile(tx, ty)
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    return list.length
  }

  return { layer, z, label: def.label, heightAt, prefetch, stats }
}
