// 標高の格子（6.25m）を、なめらかに細かくした高さの格子にする。
// 地面のメッシュと heightAt() は同じ三角形の分け方を使うので、歩く高さと見た目の地面がずれない。

import type { DemData } from '../data'

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

export class HeightField {
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly z0: number
  readonly step: number
  readonly h: Float32Array
  readonly minH: number
  readonly maxH: number

  /** subdiv: 元の1マスを何分割するか */
  constructor(dem: DemData, subdiv = 2) {
    this.step = dem.step / subdiv
    this.cols = (dem.cols - 1) * subdiv + 1
    this.rows = (dem.rows - 1) * subdiv + 1
    this.x0 = dem.x0
    this.z0 = dem.z0
    this.h = new Float32Array(this.cols * this.rows)
    const src = (c: number, r: number) => {
      const cc = Math.max(0, Math.min(dem.cols - 1, c))
      const rr = Math.max(0, Math.min(dem.rows - 1, r))
      return dem.heights[rr * dem.cols + cc]
    }
    let minH = Infinity
    let maxH = -Infinity
    for (let r = 0; r < this.rows; r++) {
      const fr = r / subdiv
      const r1 = Math.floor(fr)
      const tr = fr - r1
      for (let c = 0; c < this.cols; c++) {
        const fc = c / subdiv
        const c1 = Math.floor(fc)
        const tc = fc - c1
        const row = (rr: number) =>
          catmullRom(src(c1 - 1, rr), src(c1, rr), src(c1 + 1, rr), src(c1 + 2, rr), tc)
        const v = catmullRom(row(r1 - 1), row(r1), row(r1 + 1), row(r1 + 2), tr)
        this.h[r * this.cols + c] = v
        minH = Math.min(minH, v)
        maxH = Math.max(maxH, v)
      }
    }
    this.minH = minH
    this.maxH = maxH
  }

  get(c: number, r: number): number {
    const cc = Math.max(0, Math.min(this.cols - 1, c))
    const rr = Math.max(0, Math.min(this.rows - 1, r))
    return this.h[rr * this.cols + cc]
  }

  /** 範囲の外は端の値をのばす。三角形の分け方は terrain.ts と同じ（左上→右下の対角線） */
  heightAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.step
    const fz = (z - this.z0) / this.step
    const maxC = this.cols - 1
    const maxR = this.rows - 1
    const cx = Math.max(0, Math.min(maxC - 1e-6, fx))
    const cz = Math.max(0, Math.min(maxR - 1e-6, fz))
    const c = Math.floor(cx)
    const r = Math.floor(cz)
    const tx = cx - c
    const tz = cz - r
    const h00 = this.get(c, r)
    const h10 = this.get(c + 1, r)
    const h01 = this.get(c, r + 1)
    const h11 = this.get(c + 1, r + 1)
    if (tz >= tx) return h00 + (h11 - h01) * tx + (h01 - h00) * tz
    return h00 + (h10 - h00) * tx + (h11 - h10) * tz
  }
}
