// 画面の表示（HTML のオーバーレイ）。左上に題、右上に回転・速さ・見た目・時間・画質、右下に出典（いつも表示）。
// 左下の fps と描画命令数は、URL に ?debug を付けたときだけ出す。板の色は時間帯に合わせる（夜は暗い地に明るい文字）。
// 初回だけ操作のヒント（PC とスマホで出し分け）。safe-area を考える。
// 段階2: 右上の3段目に「音」と「曼荼羅帳」。出会いと会話の画面は yume/encounter/ui.ts（この root の中に置く）。

const CSS = /* css */ `
:root {
  --washi: rgba(250, 247, 240, 0.86);
  --washi-solid: #faf7f0;
  --ink: #2a2622;
  --ink-soft: rgba(42, 38, 34, 0.62);
  --line: rgba(42, 38, 34, 0.22);
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
  --ui-font: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif;
  --title-font: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
}
html, body { margin: 0; height: 100%; overflow: hidden; background: #f1ece2; overscroll-behavior: none; touch-action: none; }
#app { position: fixed; inset: 0; }
#app canvas { display: block; width: 100%; height: 100%; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; outline: none; }
.yh { position: absolute; inset: 0; pointer-events: none; font-family: var(--ui-font); color: var(--ink); -webkit-font-smoothing: antialiased; }
.yh * { box-sizing: border-box; }
.yh-title { position: absolute; top: calc(10px + var(--sat)); left: calc(12px + var(--sal)); font-family: var(--title-font); font-size: 13px; letter-spacing: 0.08em; padding: 5px 10px; background: var(--washi); border: 1px solid var(--line); border-radius: 8px; max-width: calc(100vw - 230px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.yh-panel { position: absolute; top: calc(10px + var(--sat)); right: calc(12px + var(--sar)); display: flex; flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: auto; }
.yh-row { display: flex; gap: 6px; align-items: center; }
.yh-btn { font: inherit; font-size: 12.5px; color: var(--ink); background: var(--washi); border: 1px solid var(--line); border-radius: 9px; min-height: 36px; min-width: 36px; padding: 0 10px; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.yh-btn:hover { background: var(--washi-hover, var(--washi-solid)); }
.yh-btn:active { transform: translateY(1px); }
.yh-btn:focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 1px; }
.yh-btn.icon { font-size: 17px; padding: 0; width: 38px; line-height: 1; }
.yh-btn small { color: var(--ink-soft); font-size: 11px; margin-right: 4px; }
.yh-compass { width: 38px; height: 38px; border-radius: 50%; background: var(--washi); border: 1px solid var(--line); position: relative; flex: none; }
.yh-compass i { position: absolute; left: 50%; top: 50%; width: 0; height: 0; font-style: normal; }
.yh-compass b { position: absolute; transform: translate(-50%, -50%); font-family: var(--title-font); font-size: 11px; font-weight: 600; }
.yh-compass b.sub { font-size: 9px; color: var(--ink-soft); font-weight: 400; }
.yh-perf { position: absolute; left: calc(10px + var(--sal)); bottom: calc(10px + var(--sab)); pointer-events: auto; font: 11px/1.45 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-soft); background: var(--washi); border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px; cursor: pointer; white-space: pre; -webkit-tap-highlight-color: transparent; text-align: left; }
.yh-credit { position: absolute; right: calc(10px + var(--sar)); bottom: calc(10px + var(--sab)); font-size: 10.5px; line-height: 1.5; color: var(--ink-soft); background: rgba(250, 247, 240, 0.72); border-radius: 6px; padding: 3px 7px; text-align: right; max-width: calc(100vw - 150px); }
.yh-credit span { white-space: nowrap; }
.yh-credit a { color: inherit; text-decoration: none; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
.yh-credit a:hover, .yh-credit a:focus-visible { text-decoration: underline; }
.yh-prompt { position: absolute; left: 50%; bottom: calc(64px + var(--sab)); transform: translate(-50%, 6px); opacity: 0; transition: opacity 0.6s, transform 0.6s; font-family: var(--title-font); font-size: 14px; letter-spacing: 0.06em; padding: 8px 16px; background: var(--washi); border: 1px solid var(--line); border-radius: 999px; white-space: nowrap; }
.yh-prompt small { font-family: var(--ui-font); font-size: 11px; color: var(--ink-soft); margin-left: 6px; letter-spacing: 0; }
.yh-prompt.on { opacity: 1; transform: translate(-50%, 0); }
.yh-toast { position: absolute; left: 50%; top: calc(64px + var(--sat)); transform: translateX(-50%); opacity: 0; transition: opacity 0.8s; font-family: var(--title-font); font-size: 14px; letter-spacing: 0.05em; padding: 8px 16px; background: var(--washi); border: 1px solid var(--line); border-radius: 10px; max-width: calc(100vw - 32px); text-align: center; text-wrap: balance; }
.yh-toast.on { opacity: 1; }
.yh-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; pointer-events: auto; touch-action: none; background: rgba(241, 236, 226, 0.35); transition: opacity 0.5s; }
.yh-hint.off { opacity: 0; pointer-events: none; }
.yh-card { --ink: #2a2622; --ink-soft: rgba(42, 38, 34, 0.62); --line: rgba(42, 38, 34, 0.22); --washi-hover: #faf7f0; color: var(--ink); max-width: 360px; width: 100%; background: var(--washi-solid); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px 16px; box-shadow: 0 8px 30px rgba(60, 50, 40, 0.12); }
.yh-card h2 { margin: 0 0 10px; font-family: var(--title-font); font-weight: 600; font-size: 16px; letter-spacing: 0.08em; }
.yh-card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px; }
.yh-card dt { color: var(--ink-soft); white-space: nowrap; }
.yh-card dd { margin: 0; }
.yh-card p { margin: 12px 0 0; font-family: var(--title-font); font-size: 13px; color: var(--ink-soft); }
.yh-card .yh-btn { margin-top: 14px; width: 100%; font-size: 14px; min-height: 42px; }
.yh-stick { position: absolute; width: 116px; height: 116px; margin: -58px 0 0 -58px; border-radius: 50%; border: 1.5px solid rgba(42, 38, 34, 0.35); background: rgba(250, 247, 240, 0.28); display: none; }
.yh-stick i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(42, 38, 34, 0.55); box-shadow: 0 0 0 6px rgba(42, 38, 34, 0.12); }
.yh-stick.on { display: block; }
.yh-veil { position: absolute; inset: 0; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }
.yh-veil.on { opacity: 1; }
.yh-error { --ink: #2a2622; color: var(--ink); position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; font-family: var(--title-font); font-size: 15px; line-height: 1.8; pointer-events: auto; background: #f1ece2; }
@media (max-width: 520px) {
  .yh-title { font-size: 12px; max-width: calc(100vw - 150px); }
  /* スマホは板を少し低くして、空の帯を広く見せる */
  .yh-panel { gap: 5px; }
  .yh-panel .yh-btn { min-height: 34px; }
  .yh-panel .yh-btn.icon, .yh-compass { width: 36px; height: 36px; }
  /* スマホは見出し（音・時間・見た目・速さ・画質）を値の上に小さく重ねる（幅を増やさずに、何のボタンか分かるように） */
  .yh-panel .yh-btn { line-height: 1.12; padding: 2px 8px; }
  .yh-panel .yh-btn small { display: block; font-size: 9px; line-height: 1.1; margin: 0 0 1px; }
  .yh-credit { font-size: 9.5px; }
  /* お知らせは、右上の板（3段）の下に出す（板と重ならないように） */
  .yh-toast { top: calc(132px + var(--sat)); font-size: 13.5px; }
  /* 開いた性能表示が、右下の出典と重ならないように（行は折り返す） */
  .yh-perf { max-width: calc(100vw - 215px - var(--sal) - var(--sar)); white-space: pre-wrap; word-break: break-all; }
}
`

export interface HudHooks {
  rotate(dir: -1 | 1): void
  toggleLook(): void
  cycleTime(): void
  cycleQuality(): void
  toggleSpeed(): void
  toggleSound(): void
  openMandala(): void
}

export class Hud {
  readonly root: HTMLDivElement
  private readonly perf: HTMLButtonElement
  private readonly prompt: HTMLDivElement
  private readonly toastEl: HTMLDivElement
  private readonly lookBtn: HTMLButtonElement
  private readonly timeBtn: HTMLButtonElement
  private readonly credit: HTMLDivElement
  private readonly veil: HTMLDivElement
  private veilTimer = 0
  private pendingSwap: (() => void) | null = null
  private readonly qualityBtn: HTMLButtonElement
  private readonly compassDial: HTMLElement
  private readonly stick: HTMLDivElement
  private readonly knob: HTMLElement
  private readonly speedBtn: HTMLButtonElement
  private readonly soundBtn: HTMLButtonElement
  private readonly mandalaBtn: HTMLButtonElement
  private mandalaNew = false
  private promptText = ''
  private hint: HTMLDivElement | null = null
  private perfOpen = false
  private toastTimer = 0
  private compassYaw = NaN

  constructor(host: HTMLElement, title: string, attributions: string[], hooks: HudHooks, showPerf = false) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    this.root = el('div', 'yh')
    host.appendChild(this.root)

    const t = el('div', 'yh-title')
    t.textContent = title
    this.root.appendChild(t)

    const panel = el('div', 'yh-panel')
    const row1 = el('div', 'yh-row')
    const left = button('⟲', '左へ45°回す（Q）', 'icon')
    const right = button('⟳', '右へ45°回す（E）', 'icon')
    left.onclick = () => hooks.rotate(-1)
    right.onclick = () => hooks.rotate(1)
    const compass = el('div', 'yh-compass')
    compass.setAttribute('aria-hidden', 'true')
    this.compassDial = el('i', '')
    compass.appendChild(this.compassDial)
    const marks: [string, number, boolean][] = [
      ['北', 0, false],
      ['東', 90, true],
      ['南', 180, true],
      ['西', 270, true],
    ]
    for (const [label, az, sub] of marks) {
      const b = el('b', sub ? 'sub' : '')
      b.textContent = label
      b.dataset.az = String(az)
      this.compassDial.appendChild(b)
    }
    row1.append(left, compass, right)
    const row2 = el('div', 'yh-row')
    this.lookBtn = button('', '見た目を切り替える', '')
    this.lookBtn.onclick = () => hooks.toggleLook()
    this.timeBtn = button('', '時間帯を切り替える（T）', '')
    this.timeBtn.onclick = () => hooks.cycleTime()
    this.qualityBtn = button('', '画質を切り替える', '')
    this.qualityBtn.onclick = () => hooks.cycleQuality()
    this.speedBtn = button('', '歩く速さを切り替える', '')
    this.speedBtn.onclick = () => hooks.toggleSpeed()
    row2.append(this.speedBtn, this.lookBtn, this.timeBtn, this.qualityBtn)
    const row3 = el('div', 'yh-row')
    this.soundBtn = button('', '音を切り替える', '')
    this.soundBtn.onclick = () => hooks.toggleSound()
    this.mandalaBtn = button('', '曼荼羅帳をひらく（M）', 'mandala')
    this.mandalaBtn.innerHTML = '曼荼羅帳<span class="ym-badge" aria-hidden="true">新</span>'
    this.mandalaBtn.onclick = () => hooks.openMandala()
    row3.append(this.soundBtn, this.mandalaBtn)
    panel.append(row1, row2, row3)
    this.root.appendChild(panel)

    this.perf = button('', '性能の表示（タップで開閉）', '') as HTMLButtonElement
    this.perf.className = 'yh-perf'
    this.perf.onclick = () => {
      this.perfOpen = !this.perfOpen
    }
    // fps の表示は確認用（?debug のときだけ）
    if (showPerf) this.root.appendChild(this.perf)

    // 時間帯・見た目を切り替えるとき、一瞬だけ霧の色で画面を覆う（地面の絵を描き直す間）
    this.veil = el('div', 'yh-veil')
    this.root.appendChild(this.veil)

    const credit = el('div', 'yh-credit')
    this.credit = credit
    // 出典は、出典元のページへのリンクにする（OSM の帰属表示ガイドライン）
    credit.innerHTML = attributions
      .map((a) => {
        const url = creditUrl(a)
        const text = escapeHtml(a)
        return url ? `<span><a href="${url}" target="_blank" rel="noopener">${text}</a></span>` : `<span>${text}</span>`
      })
      .join('<br>')
    this.root.appendChild(credit)

    this.prompt = el('div', 'yh-prompt')
    this.prompt.setAttribute('role', 'status')
    this.root.appendChild(this.prompt)

    this.toastEl = el('div', 'yh-toast')
    this.toastEl.setAttribute('role', 'status')
    this.root.appendChild(this.toastEl)

    this.stick = el('div', 'yh-stick')
    this.knob = el('i', '')
    this.stick.appendChild(this.knob)
    this.root.appendChild(this.stick)
    this.setCompass(90)

    // iOS Safari はページの拡大（ピンチ）を viewport の指定だけでは止められないので、ジェスチャーを止める
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
    }
  }

  setLook(label: string): void {
    this.lookBtn.innerHTML = `<small>見た目</small>${escapeHtml(label)}`
  }

  setTime(label: string): void {
    this.timeBtn.innerHTML = `<small>時間</small>${escapeHtml(label)}`
  }

  /** 板の色を時間帯に合わせる（夜は暗い地に明るい文字。夕は薄いばら色の地） */
  setTheme(time: 'day' | 'dusk' | 'night'): void {
    this.root.dataset.time = time
    const t = THEMES[time]
    for (const [k, v] of Object.entries(t)) this.root.style.setProperty(k, v)
  }

  /** 出典表示の地と文字の色（夜は暗い地に明るい文字。いつも表示する） */
  setCreditColors(bg: string, text: string): void {
    this.credit.style.background = bg
    this.credit.style.color = text
  }

  /**
   * 霧の色で画面を 0.3 秒で覆い、覆いきったところで swap を呼び、また 0.3 秒で戻す。
   * 覆いの最中に次の切り替えが来たら、待っている swap を差し替える（最後の要求だけを1回だけ適用する。地面の絵の描き直しも1回）。
   */
  veilSwap(color: string, swap: () => void): void {
    this.veil.style.background = color
    this.pendingSwap = swap
    if (this.veilTimer) return
    this.veil.classList.add('on')
    this.veilTimer = window.setTimeout(() => {
      const run = this.pendingSwap
      this.pendingSwap = null
      this.veilTimer = 0
      run?.()
      // 描き直しの後の1フレームを待ってから戻す（その間に次の切り替えが始まっていたら、覆ったままにする）
      requestAnimationFrame(() => {
        if (!this.veilTimer) this.veil.classList.remove('on')
      })
    }, 300)
  }

  setSpeed(label: string): void {
    this.speedBtn.innerHTML = `<small>速さ</small>${escapeHtml(label)}`
  }

  setQuality(label: string): void {
    this.qualityBtn.innerHTML = `<small>画質</small>${escapeHtml(label)}`
  }

  setCompass(yawDeg: number): void {
    // 向きが変わらないときは書き換えない（毎フレームのスタイルの再計算を避ける）
    if (Math.abs(yawDeg - this.compassYaw) < 0.1) return
    this.compassYaw = yawDeg
    const R = 12.5
    for (const b of Array.from(this.compassDial.children) as HTMLElement[]) {
      const az = Number(b.dataset.az)
      // 画面の上 = 今向いている方角
      const a = ((az - yawDeg) * Math.PI) / 180
      b.style.left = `${Math.sin(a) * R}px`
      b.style.top = `${-Math.cos(a) * R}px`
    }
  }

  get perfExpanded(): boolean {
    return this.perfOpen
  }

  setPerf(text: string): void {
    if (this.perf.textContent !== text) this.perf.textContent = text
  }

  /** 画面の下の小さな案内（null で隠す） */
  showPrompt(text: string | null): void {
    if (text && text !== this.promptText) {
      this.promptText = text
      this.prompt.textContent = text
    }
    this.prompt.classList.toggle('on', !!text)
  }

  setSound(on: boolean): void {
    this.soundBtn.innerHTML = `<small>音</small>${on ? 'あり' : 'なし'}`
  }

  /** 曼荼羅帳に、まだ見ていないピースがある */
  setMandalaNew(on: boolean): void {
    this.mandalaNew = on
    this.mandalaBtn.classList.toggle('has-new', on)
    this.mandalaBtn.setAttribute('aria-label', on ? '曼荼羅帳をひらく（新しいピースがある）' : '曼荼羅帳をひらく（M）')
  }

  get mandalaHasNew(): boolean {
    return this.mandalaNew
  }

  toast(text: string, ms = 3200): void {
    this.toastEl.textContent = text
    this.toastEl.classList.add('on')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms)
  }

  showHint(touch: boolean, onClose: () => void): void {
    const wrap = el('div', 'yh-hint')
    const rows: [string, string][] = touch
      ? [
          ['歩く', '画面の下半分をなぞる（大きく倒すと走る）'],
          ['そこへ歩く', '地面をタップ'],
          ['寄る・引く', '2本指でつまむ'],
          ['向きを変える', '右上の ⟲ ⟳'],
          ['速さ', '右上の「速さ」で、ふつう／はやい'],
          ['時間', '右上の「時間」で、昼・夕・夜'],
          ['耳を澄ます', '気配のそばで、ボタンを長押し（その場で止まっても）'],
        ]
      : [
          ['歩く', 'WASD・矢印キー（Shift で走る）'],
          ['そこへ歩く', '地面をクリック'],
          ['寄る・引く', 'ホイール'],
          ['向きを変える', 'Q・E、右上の ⟲ ⟳'],
          ['速さ', 'F キー、右上の「速さ」で、ふつう／はやい'],
          ['時間', 'T キー、右上の「時間」で、昼・夕・夜'],
          ['耳を澄ます', '気配のそばで、ボタンか Space を長押し（その場で止まっても）'],
        ]
    wrap.innerHTML = `
      <div class="yh-card" role="dialog" aria-label="操作のヒント">
        <h2>夢の旅へ</h2>
        <dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
        <p>墨のにじみは、妖怪の気配です。近くで耳を澄ますと、夢の姿が浮かびます。</p>
        <button class="yh-btn" type="button">歩きはじめる</button>
      </div>`
    const close = () => {
      if (!this.hint) return
      wrap.classList.add('off')
      window.setTimeout(() => wrap.remove(), 600)
      this.hint = null
      onClose()
    }
    wrap.addEventListener('click', close)
    this.root.appendChild(wrap)
    this.hint = wrap
    ;(wrap.querySelector('button') as HTMLButtonElement).focus({ preventScroll: true })
  }

  hideHint(): void {
    this.hint?.click()
  }

  setStick(show: boolean, ox = 0, oy = 0, kx = 0, ky = 0): void {
    this.stick.classList.toggle('on', show)
    if (!show) return
    this.stick.style.left = `${ox}px`
    this.stick.style.top = `${oy}px`
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`
  }

  showError(message: string): void {
    const e = el('div', 'yh-error')
    e.textContent = message
    this.root.appendChild(e)
  }
}

const THEMES: Record<'day' | 'dusk' | 'night', Record<string, string>> = {
  day: {
    '--washi': 'rgba(250, 247, 240, 0.86)',
    '--washi-hover': '#faf7f0',
    '--ink': '#2a2622',
    '--ink-soft': 'rgba(42, 38, 34, 0.62)',
    '--line': 'rgba(42, 38, 34, 0.22)',
  },
  dusk: {
    '--washi': 'rgba(250, 240, 236, 0.6)',
    '--washi-hover': 'rgba(250, 240, 236, 0.85)',
    '--ink': '#4a3e48',
    '--ink-soft': 'rgba(74, 62, 72, 0.66)',
    '--line': 'rgba(74, 62, 72, 0.2)',
  },
  night: {
    '--washi': 'rgba(16, 20, 40, 0.55)',
    '--washi-hover': 'rgba(30, 36, 66, 0.75)',
    '--ink': '#d8d4e4',
    '--ink-soft': 'rgba(216, 212, 228, 0.66)',
    '--line': 'rgba(216, 212, 228, 0.18)',
  },
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

function button(text: string, label: string, cls: string): HTMLButtonElement {
  const b = el('button', `yh-btn ${cls}`.trim())
  b.type = 'button'
  b.textContent = text
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}

function creditUrl(text: string): string | null {
  if (text.includes('OpenStreetMap')) return 'https://www.openstreetmap.org/copyright'
  if (text.includes('地理院')) return 'https://maps.gsi.go.jp/development/ichiran.html'
  return null
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
