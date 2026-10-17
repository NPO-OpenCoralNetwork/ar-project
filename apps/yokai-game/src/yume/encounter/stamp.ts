// 旅印（仮）の絵柄（02 F-45・§4.5、04 §3.11）。駅スタンプのような、インク1色（藍）の丸い絵柄スタンプ。
// - 朱の印と墨書きの組み合わせ、お札・袋・紐の形は使わない。字は印の中の題と日付だけ（筆書きにしない）。
// - インクのかすれは SVG のフィルターで出す。押すたびに少しずつ傾きが違う（seed）。
// 絵柄 'yama-uchiwa': 三つの峰と霞、羽団扇（光蔵坊の持ち物【創作】）。社寺や神仏の形は入れない。

export const STAMP_INK = '#2d4a78'

let uidSeq = 0

export interface StampOpts {
  title: string
  /** 「2026.10.17」など */
  date: string
  motif: string
  /** 傾き（度） */
  tilt?: number
}

export function stampSvg(o: StampOpts): string {
  const id = `st${++uidSeq}`
  const ink = STAMP_INK
  const paper = '#fbf8f0'
  const tilt = o.tilt ?? -6
  const motif =
    o.motif === 'yama-uchiwa'
      ? `
    <path d="M24,90 L43,69 L51,75 L66,52 L78,69 L86,63 L104,90 Z" fill="${ink}"/>
    <path d="M66,52 L60,60 L63.5,59 L66,62 L69,59 L72,61 Z M43,69 L39.5,73 L43,72 L46,74 Z M86,63 L82.5,67 L86,66 L89,67.5 Z" fill="${paper}"/>
    <path d="M22,82 C36,78 52,84 66,80 C80,76 96,82 112,78 L112,85 C96,89 80,83 66,87 C52,91 36,85 22,89 Z" fill="${paper}"/>
    <path d="M30,96 C44,92 56,95 70,92 C84,89 98,93 110,90" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>
    <g transform="translate(106,64) rotate(24) scale(0.8)">
      <path d="M0,-17 C-9,-15 -10,-3 -5,3 C-3,6 3,6 5,3 C10,-3 9,-15 0,-17 Z" fill="${ink}"/>
      <path d="M0,-14 L0,2 M-4,-10 L0,-3 M4,-10 L0,-3" stroke="${paper}" stroke-width="1" fill="none"/>
      <path d="M0,5 L0,13" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
    </g>`
      : `<circle cx="70" cy="72" r="18" fill="${ink}"/>`
  return `<svg class="stamp-svg" viewBox="0 0 140 140" role="img" aria-label="旅印 ${escapeAttr(o.title)} ${escapeAttr(o.date)}">
  <defs>
    <filter id="${id}f" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${uidSeq % 9}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="1" seed="${(uidSeq * 3) % 11}" result="m"/>
      <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.7 1.85" result="mask"/>
      <feComposite in="d" in2="mask" operator="in"/>
    </filter>
    <path id="${id}arc" d="M24,72 A46,46 0 0 1 116,72"/>
  </defs>
  <g transform="rotate(${tilt} 70 70)" filter="url(#${id}f)" opacity="0.9">
    <circle cx="70" cy="70" r="64" fill="none" stroke="${ink}" stroke-width="4"/>
    <circle cx="70" cy="70" r="58" fill="none" stroke="${ink}" stroke-width="1.3"/>
    <text font-size="13" font-weight="700" fill="${ink}" letter-spacing="2" font-family="'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif"><textPath href="#${id}arc" startOffset="50%" text-anchor="middle">${escapeAttr(o.title)}</textPath></text>
    ${motif}
    <rect x="34" y="103" width="72" height="17" rx="3" fill="${ink}"/>
    <text x="70" y="115.4" text-anchor="middle" font-size="10" font-weight="700" fill="${paper}" letter-spacing="0.4" font-family="'Hiragino Sans','Noto Sans JP','Helvetica Neue',Arial,sans-serif">${escapeAttr(o.date)}</text>
  </g>
</svg>`
}

/** まだ押していない枠（家では枠だけ見える。02 F-45） */
export function stampFrameSvg(title: string): string {
  return `<svg class="stamp-svg" viewBox="0 0 140 140" role="img" aria-label="旅印の枠 ${escapeAttr(title)}（まだ）">
  <circle cx="70" cy="70" r="62" fill="none" stroke="#8a7f70" stroke-width="1.2" stroke-dasharray="4 4"/>
  <text x="70" y="66" text-anchor="middle" font-size="12" fill="#8a7f70" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">${escapeAttr(title)}</text>
  <text x="70" y="84" text-anchor="middle" font-size="9.5" fill="#8a7f70" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">現地で節を終えると押せる</text>
</svg>`
}

export function stampDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
