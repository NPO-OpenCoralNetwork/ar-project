// 軌跡を Canvas に描く。外部の地図タイルは使わず、開始地点からの相対位置（m）だけで描く。
import type { SessionLog } from './types'
import { GAP_THRESHOLD_MS } from './stats'

export interface TrackColors {
  bg: string
  grid: string
  path: string
  gap: string
  poor: string
  start: string
  current: string
  stopDet: string
  label: string
  text: string
}

export const TRACK_COLORS: TrackColors = {
  bg: '#ffffff',
  grid: '#e4e1d8',
  path: '#2b2b2b',
  gap: '#c0392b',
  poor: '#e08a1e',
  start: '#1e7a3a',
  current: '#1f4fbf',
  stopDet: '#0b7a75',
  label: '#7a2e8e',
  text: '#1a1a1a',
}

/** 1, 2, 5 × 10^n のうち、max 以下でいちばん大きいもの */
export function niceLength(max: number): number {
  if (!(max > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(max))
  for (const m of [5, 2, 1]) if (m * p <= max) return m * p
  return p
}

function nearestFixPos(log: SessionLog, t: number): { x: number; z: number } | null {
  const f = log.fixes
  if (f.length === 0) return null
  let best = f[0]
  for (const p of f) {
    if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
    if (p.t > t) break
  }
  return best
}

export function drawTrack(
  canvas: HTMLCanvasElement,
  log: SessionLog,
  opt: { showCurrent: boolean; colors?: TrackColors },
): void {
  const c = opt.colors ?? TRACK_COLORS
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const cssW = canvas.clientWidth || 320
  const cssH = canvas.clientHeight || cssW
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
  }
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = c.bg
  g.fillRect(0, 0, cssW, cssH)

  const fixes = log.fixes
  g.font = '600 14px system-ui, -apple-system, "Hiragino Sans", sans-serif'
  if (fixes.length === 0) {
    g.fillStyle = c.text
    g.textAlign = 'center'
    g.fillText('位置が来ると、ここに軌跡を描きます', cssW / 2, cssH / 2)
    return
  }

  // 範囲（少なくとも 40m 四方）
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const f of fixes) {
    minX = Math.min(minX, f.x)
    maxX = Math.max(maxX, f.x)
    minZ = Math.min(minZ, f.z)
    maxZ = Math.max(maxZ, f.z)
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const span = Math.max(40, maxX - minX, maxZ - minZ) * 1.12
  const pad = 18
  const scale = Math.min(cssW - pad * 2, cssH - pad * 2) / span // px / m
  const sx = (x: number) => cssW / 2 + (x - cx) * scale
  const sy = (z: number) => cssH / 2 + (z - cz) * scale

  // 方眼（スケールの長さごと）
  const unit = niceLength((cssW * 0.3) / scale)
  g.strokeStyle = c.grid
  g.lineWidth = 1
  g.beginPath()
  for (let x = Math.floor((cx - span) / unit) * unit; x <= cx + span; x += unit) {
    g.moveTo(sx(x), 0)
    g.lineTo(sx(x), cssH)
  }
  for (let z = Math.floor((cz - span) / unit) * unit; z <= cz + span; z += unit) {
    g.moveTo(0, sy(z))
    g.lineTo(cssW, sy(z))
  }
  g.stroke()

  // 軌跡（空白は赤い点線）
  g.lineJoin = 'round'
  g.lineCap = 'round'
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1]
    const b = fixes[i]
    const gap = b.t - a.t >= GAP_THRESHOLD_MS
    g.strokeStyle = gap ? c.gap : c.path
    g.lineWidth = gap ? 2 : 2.5
    g.setLineDash(gap ? [4, 4] : [])
    g.beginPath()
    g.moveTo(sx(a.x), sy(a.z))
    g.lineTo(sx(b.x), sy(b.z))
    g.stroke()
  }
  g.setLineDash([])

  // 精度の悪い位置（30m超）
  g.fillStyle = c.poor
  for (const f of fixes) {
    if (f.acc <= 30) continue
    g.beginPath()
    g.arc(sx(f.x), sy(f.z), 3.5, 0, Math.PI * 2)
    g.fill()
  }

  // 正解のラベル「いま止まった」（紫の三角）
  for (const l of log.labels) {
    if (l.type !== 'stop') continue
    const p = nearestFixPos(log, l.t)
    if (!p) continue
    const x = sx(p.x)
    const y = sy(p.z)
    g.fillStyle = c.label
    g.beginPath()
    g.moveTo(x, y - 2)
    g.lineTo(x - 7, y - 14)
    g.lineTo(x + 7, y - 14)
    g.closePath()
    g.fill()
  }

  // 判定「止まった」（青緑の輪）
  for (const d of log.detections) {
    if (d.type !== 'stop') continue
    g.strokeStyle = c.stopDet
    g.lineWidth = 3
    g.beginPath()
    g.arc(sx(d.x), sy(d.z), Math.max(7, 6 * scale), 0, Math.PI * 2)
    g.stroke()
  }

  // 開始地点
  const s0 = fixes[0]
  g.fillStyle = c.start
  g.beginPath()
  g.arc(sx(s0.x), sy(s0.z), 6, 0, Math.PI * 2)
  g.fill()

  // いまの位置と精度の円
  if (opt.showCurrent) {
    const f = fixes[fixes.length - 1]
    g.fillStyle = 'rgba(31, 79, 191, 0.12)'
    g.strokeStyle = 'rgba(31, 79, 191, 0.5)'
    g.lineWidth = 1
    g.beginPath()
    g.arc(sx(f.x), sy(f.z), Math.max(4, f.acc * scale), 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.fillStyle = c.current
    g.strokeStyle = '#fff'
    g.lineWidth = 2
    g.beginPath()
    g.arc(sx(f.x), sy(f.z), 6, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }

  // スケール（左下）
  const barPx = unit * scale
  const bx = 12
  const by = cssH - 14
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.fillRect(bx - 6, by - 24, barPx + 60, 32)
  g.strokeStyle = c.text
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(bx, by - 6)
  g.lineTo(bx, by)
  g.lineTo(bx + barPx, by)
  g.lineTo(bx + barPx, by - 6)
  g.stroke()
  g.fillStyle = c.text
  g.textAlign = 'left'
  g.fillText(`${unit >= 1000 ? `${unit / 1000}km` : `${unit}m`}`, bx + barPx + 8, by + 1)

  // 北（右上）
  const nx = cssW - 22
  const ny = 18
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.fillRect(nx - 16, ny - 8, 32, 44)
  g.fillStyle = c.text
  g.beginPath()
  g.moveTo(nx, ny - 4)
  g.lineTo(nx - 7, ny + 12)
  g.lineTo(nx + 7, ny + 12)
  g.closePath()
  g.fill()
  g.textAlign = 'center'
  g.fillText('北', nx, ny + 31)
}
