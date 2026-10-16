// PNG を RGBA に開く最小のデコーダー（Node の zlib だけを使う）。
// 地理院の標高タイル（8bit の RGB / パレット）を読むのに足りる範囲だけ実装している。
// 対応: ビット深度 8、カラータイプ 0（グレー）/ 2（RGB）/ 3（パレット）/ 4（グレー+α）/ 6（RGBA）、インターレースなし。

import { inflateSync } from 'node:zlib'

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * @param {Uint8Array} buf
 * @returns {{ width:number, height:number, rgba:Uint8Array }}
 */
export function decodePng(buf) {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('PNG ではない')
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  /** @type {Uint8Array | null} */
  let palette = null
  /** @type {Uint8Array | null} */
  let trns = null
  const idat = []
  while (pos < buf.length) {
    const len = dv.getUint32(pos)
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7])
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = dv.getUint32(pos + 8)
      height = dv.getUint32(pos + 12)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error(`ビット深度 ${bitDepth} には対応していない`)
  if (interlace !== 0) throw new Error('インターレースには対応していない')
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`カラータイプ ${colorType} には対応していない`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const px = new Uint8Array(height * stride)
  const bpp = channels
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = px.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v = src[i]
      switch (ft) {
        case 0:
          break
        case 1:
          v += a
          break
        case 2:
          v += b
          break
        case 3:
          v += (a + b) >> 1
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default:
          throw new Error(`未知のフィルター ${ft}`)
      }
      out[i] = v & 0xff
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0, n = width * height; i < n; i++) {
    let r, g, b, al
    if (colorType === 2) {
      r = px[i * 3]
      g = px[i * 3 + 1]
      b = px[i * 3 + 2]
      al = 255
    } else if (colorType === 6) {
      r = px[i * 4]
      g = px[i * 4 + 1]
      b = px[i * 4 + 2]
      al = px[i * 4 + 3]
    } else if (colorType === 3) {
      const k = px[i]
      if (!palette) throw new Error('PLTE がない')
      r = palette[k * 3]
      g = palette[k * 3 + 1]
      b = palette[k * 3 + 2]
      al = trns && k < trns.length ? trns[k] : 255
    } else if (colorType === 0) {
      r = g = b = px[i]
      al = 255
    } else {
      r = g = b = px[i * 2]
      al = px[i * 2 + 1]
    }
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = al
  }
  return { width, height, rgba }
}
