// 見本の絵。光蔵坊（仮）の白描の線画（../yume/encounter/art.ts）を Canvas に描き、
// 06「光と霞」の昼のパレットで色を入れる。札スタジオの白描の段階では、この色の絵から
// シェーダーで輪郭線を出す（AI で作った画像と同じ通り道で確かめるため）。
// 本番の絵ではない。

import { KOZOBO_ART } from '../yume/encounter/art'

const INK = '#2b2420'

/** 部品ごとの色（art.ts の parts の並びに合わせる。06 §2.1 の昼の色から） */
function partColor(i: number): string | undefined {
  // 0,1 羽 / 2,3 後ろ髪 / 4 首 / 5 脚 / 6,7 下駄 / 8 袴 / 9 鈴懸 / 10-15 房 / 16,17 袖 / 18 柄 / 19 羽団扇 / 20 手 / 21 顔 / 22 頭襟 / 23 鼻
  if (i <= 1) return '#a88466'
  if (i <= 3) return '#4c4440'
  if (i === 4) return '#e8cfb0'
  if (i === 5) return undefined
  if (i <= 7) return '#c9a477'
  if (i === 8) return '#3f5f8f'
  if (i === 9) return '#efe6d6'
  if (i <= 15) return '#f4c0a2'
  if (i <= 17) return '#efe6d6'
  if (i === 18) return undefined
  if (i === 19) return '#5b8a68'
  if (i === 20) return '#e8cfb0'
  if (i === 21) return '#e8cfb0'
  if (i === 22) return '#3a3632'
  return '#e2c1a0'
}

/** 光蔵坊（仮）の彩色の見本（正方形） */
export function drawSampleArt(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const k = size / 1024

  // 空と霞（昼: 水色 → 薄い青緑 → クリームの金）
  const sky = g.createLinearGradient(0, 0, 0, size)
  sky.addColorStop(0, '#9fcade')
  sky.addColorStop(0.45, '#cfe2d4')
  sky.addColorStop(0.8, '#f4e2b8')
  sky.addColorStop(1, '#efe0bd')
  g.fillStyle = sky
  g.fillRect(0, 0, size, size)

  // 遠景の山（奥ほど空の色に近い）
  const ridge = (y: number, amp: number, seed: number, fill: string) => {
    g.beginPath()
    g.moveTo(0, size)
    for (let x = 0; x <= size; x += 8 * k) {
      const t = x / size
      const yy = y + amp * (Math.sin(t * 5.1 + seed) * 0.6 + Math.sin(t * 11.3 + seed * 2.1) * 0.25 + Math.sin(t * 2.3 + seed * 0.7) * 0.5)
      g.lineTo(x, yy)
    }
    g.lineTo(size, size)
    g.closePath()
    g.fillStyle = fill
    g.fill()
  }
  ridge(520 * k, 70 * k, 1.2, '#b9cbd6')
  ridge(610 * k, 55 * k, 3.4, '#a7c2c0')
  ridge(700 * k, 40 * k, 5.1, '#9cb894')
  // 霞の帯
  g.fillStyle = 'rgba(255,250,240,0.55)'
  for (const [y, h] of [
    [560, 40],
    [660, 34],
  ] as const) {
    g.beginPath()
    g.roundRect(-40 * k, y * k, size * 0.75, h * k, h * k * 0.5)
    g.fill()
    g.beginPath()
    g.roundRect(size * 0.45, (y + 44) * k, size * 0.7, h * k * 0.8, h * k * 0.4)
    g.fill()
  }
  // 足もとの岩と草
  g.fillStyle = '#d6c47f'
  g.beginPath()
  g.ellipse(size / 2, 930 * k, 330 * k, 70 * k, 0, 0, Math.PI * 2)
  g.fill()

  // 人物（200 × 300 の viewBox を 3 倍に）
  const s = 3 * k
  const ox = size / 2 - 100 * s
  const oy = 52 * k
  g.save()
  g.translate(ox, oy)
  g.scale(s, s)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  KOZOBO_ART.parts.forEach((p, i) => {
    if (p.fill) {
      g.fillStyle = partColor(i) ?? '#fbf8f0'
      g.fill(new Path2D(p.fill))
    }
    g.strokeStyle = INK
    for (const l of p.lines) {
      g.lineWidth = l.w
      g.stroke(new Path2D(l.d))
    }
  })
  g.restore()
  return c
}

/**
 * UV の向きと切り抜きを確かめる格子（横長）。左から右へ赤 → 青、下ほど暗い。
 * 四隅に「左上」などの字と、上を指す矢印。
 */
export function drawUvGrid(w = 1600, h = 900): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const hor = g.createLinearGradient(0, 0, w, 0)
  hor.addColorStop(0, '#d9534f')
  hor.addColorStop(0.5, '#f0e2a0')
  hor.addColorStop(1, '#3f5f8f')
  g.fillStyle = hor
  g.fillRect(0, 0, w, h)
  const ver = g.createLinearGradient(0, 0, 0, h)
  ver.addColorStop(0, 'rgba(0,0,0,0)')
  ver.addColorStop(1, 'rgba(0,0,0,0.45)')
  g.fillStyle = ver
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(20,20,20,0.6)'
  g.lineWidth = 2
  const step = h / 9
  for (let x = 0; x <= w; x += step) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, h)
    g.stroke()
  }
  for (let y = 0; y <= h; y += step) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }
  // 中央の円（切り抜きの中心が分かる）
  g.lineWidth = 8
  g.strokeStyle = '#ffffff'
  g.beginPath()
  g.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2)
  g.stroke()
  // 上を指す矢印
  g.fillStyle = '#111'
  g.beginPath()
  g.moveTo(w / 2, h * 0.22)
  g.lineTo(w / 2 + 50, h * 0.36)
  g.lineTo(w / 2 + 18, h * 0.36)
  g.lineTo(w / 2 + 18, h * 0.6)
  g.lineTo(w / 2 - 18, h * 0.6)
  g.lineTo(w / 2 - 18, h * 0.36)
  g.lineTo(w / 2 - 50, h * 0.36)
  g.closePath()
  g.fill()
  g.font = 'bold 64px sans-serif'
  g.textBaseline = 'top'
  g.fillStyle = '#111'
  g.fillText('左上 TL', 24, 20)
  g.textAlign = 'right'
  g.fillText('右上 TR', w - 24, 20)
  g.textBaseline = 'bottom'
  g.fillStyle = '#fff'
  g.fillText('右下 BR', w - 24, h - 20)
  g.textAlign = 'left'
  g.fillText('左下 BL', 24, h - 20)
  return c
}
