// ましろの小さな絵（画面の案内に使う。入口・現の旅・白描の絵地図で共通）。

/** ましろ（紙の鳥【創作】）の小さな絵。眠っている（道中）か起きているか */
export function mashiroSvg(sleeping: boolean): string {
  const eye = sleeping ? '<path d="M64,38 C66,40 69,40 71,38" fill="none" stroke="#3a332d" stroke-width="1.6" stroke-linecap="round"/>' : '<circle cx="67" cy="37" r="2.2" fill="#3a332d"/>'
  const z = sleeping ? '<text x="88" y="22" font-size="12" fill="currentColor" font-family="serif">す…</text>' : ''
  return `<svg class="mashiro" viewBox="0 0 120 90" aria-hidden="true">
    <path d="M18,62 C30,40 52,30 70,30 C80,30 86,34 88,40 L100,44 L88,48 C84,60 70,70 50,70 C38,70 26,68 18,62 Z" fill="#fffdf7" stroke="#3a332d" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M30,60 C40,50 52,46 64,48 C56,56 46,62 30,60 Z" fill="#f1ece0" stroke="#3a332d" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M18,62 L8,58 L14,66 Z" fill="#fffdf7" stroke="#3a332d" stroke-width="1.2" stroke-linejoin="round"/>
    ${eye}${z}
    <path d="M20,74 C46,80 76,80 102,74" fill="none" stroke="#3a332d" stroke-opacity="0.25" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`
}
