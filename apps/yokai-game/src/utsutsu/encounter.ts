// 現の旅の出会い（段階3。02 F-10・F-11・F-14、04 §2.2・§3.1）: 澄む → 色のついた姿が現れる → 台本の会話 → 札・彩色 → 節の旅印。
// 会話の進め方と保存は core/story（夢の旅と同じ）。会話の枠・伝承の札は夢の旅の画面（yume/encounter/ui.ts）をそのまま使う。
//
// - AR 段階0（既定）: 和風の背景（昼の空・立山の連なり・霞・野の道）の上に、切り絵のような板の絵を立てる。PC でも動く。
// - AR 段階1（「カメラで見る」）: カメラの映像の上に同じ板の絵を重ね、スマホの向き（3軸の回転）に合わせて動かす。
//   姿は「カメラを開いたときに向いていた方角」に置く（体を回す操作は求めない。04 §3.1）。カメラは出会いの間だけ開き、常には開かない（01-app-ux §3.3）。
// - 姿は、はじめに墨の線（白描）で浮かび、色が差していく（夢で見た姿に、現地で色が入る）。
// - 姿の出し方（open の form）: color＝色のついた姿（現地）、dream＝墨の線（白描）だけ（夢の姿。家の白描の地図）、
//   none＝姿なし（調べる地点。ましろだけが話す。霞が少し残る）。
// - 寄り道の妖怪は、決まった台本ではなく、出現の表の台本（雑談）で話す（呼ぶ側が script を渡す）。
// - お休みの範囲・道中に入ったら、会話とカメラをすぐ止める（D2・D3）。
// - 出会っていない間は、層ごと inert（透明な層の「カメラで見る」に、Tab で入らないように）。

import { type Beat, DialogueRunner } from '../core/story/dialogue'
import type { ProgressStore } from '../core/story/progress'
import type { Travel } from '../core/story/types'
import type { StoryPack } from '../data/story-pack'
import { ARTS, artToSvg } from '../yume/encounter/art'
import type { Sound } from '../yume/encounter/sound'
import { DialogueView, escapeHtml } from '../yume/encounter/ui'

const INK = '#3a332d'
/** 姿が現れてから会話の枠を開くまで（ms） */
const APPEAR_MS = 1900
/** 姿の無い会話（調べる地点）で、霞が引いてから会話の枠を開くまで（ms） */
const APPEAR_NOFIG_MS = 1200

export interface GenEncounterDeps {
  root: HTMLElement
  story: StoryPack
  progress: ProgressStore
  sound: Sound
  /** 会話が終わった（閉じた）。spotId と、終わり方 */
  onEnd(spotId: string, how: 'finished' | 'closed' | 'stopped'): void
  log(s: string): void
  /** 「カメラで見る」（AR 段階1）を出す。既定 true（家の白描の地図では出さない） */
  camera?: boolean
  /** 背景。scene＝昼の景色（AR 段階0。既定）、paper＝無地の和紙（家の白描の地図） */
  backdrop?: 'scene' | 'paper'
}

export interface GenOpenOptions {
  /** 使う台本（決まった地点は妖怪の台本、寄り道は出現の表の台本、調べる地点は clues.json の台本） */
  script: string
  /** 姿を出す妖怪（調べる地点では無し） */
  yokaiId?: string
  /** 姿の出し方。既定 color。妖怪が無ければ none */
  form?: 'color' | 'dream' | 'none'
  /** 既定 utsutsu */
  travel?: Travel
}

export class GenEncounter {
  private readonly el: HTMLDivElement
  private readonly fig: HTMLDivElement
  private readonly video: HTMLVideoElement
  private readonly camBtn: HTMLButtonElement
  private readonly note: HTMLDivElement
  private readonly dialogue: DialogueView
  private active: { spotId: string; runner: DialogueRunner } | null = null
  private stream: MediaStream | null = null
  private timer = 0
  private orient: { anchor: number | null; yaw: number; pitch: number; x: number; y: number; raf: number } | null = null

  constructor(private readonly d: GenEncounterDeps) {
    injectStyle()
    this.el = document.createElement('div')
    this.el.className = 'ue'
    this.el.innerHTML = `
      <div class="ue-bg">${d.backdrop === 'paper' ? paperSvg() : backdropSvg()}</div>
      <video class="ue-cam" playsinline muted autoplay></video>
      <div class="ue-fig"></div>
      <div class="ue-veil"></div>
      <div class="ue-note" aria-live="polite"></div>
      <button class="ue-cam-btn" type="button">カメラで見る</button>`
    this.fig = this.el.querySelector('.ue-fig') as HTMLDivElement
    this.video = this.el.querySelector('.ue-cam') as HTMLVideoElement
    this.camBtn = this.el.querySelector('.ue-cam-btn') as HTMLButtonElement
    this.note = this.el.querySelector('.ue-note') as HTMLDivElement
    this.camBtn.addEventListener('click', () => void (this.stream ? this.stopCamera() : this.startCamera()))
    this.el.inert = true
    d.root.appendChild(this.el)
    this.dialogue = new DialogueView(
      d.root,
      {
        next: (r) => this.onBeat(this.active?.runner.next(r) ?? { kind: 'end' }),
        choose: (i) => this.onBeat(this.active?.runner.choose(i) ?? { kind: 'end' }),
        close: () => this.end('closed'),
      },
      { yokaiName: (id) => d.story.yokai[id]?.name ?? id, sound: d.sound },
    )
  }

  get isOpen(): boolean {
    return this.active !== null
  }

  /** 姿が現れ（姿なしなら霞の中で）、台本の会話を始める。台本が無い・姿の絵が無いときは false */
  open(spotId: string, opts: GenOpenOptions): boolean {
    const script = this.d.story.scripts[opts.script]
    const y = opts.yokaiId ? this.d.story.yokai[opts.yokaiId] : undefined
    const form = y ? (opts.form ?? 'color') : 'none'
    const art = y?.art ? ARTS[y.art] : undefined
    if (!script || (opts.yokaiId && !y) || (form !== 'none' && !art)) return false
    const runner = new DialogueRunner(script, {
      progress: this.d.progress,
      cards: this.d.story.cards,
      travel: opts.travel ?? 'utsutsu',
      items: this.d.story.items,
      quests: this.d.story.quests,
    })
    this.active = { spotId, runner }
    if (!y || !art || form === 'none') this.fig.innerHTML = ''
    else if (form === 'dream')
      this.fig.innerHTML = `<svg class="line" viewBox="0 0 ${art.w} ${art.h}" role="img" aria-label="${escapeHtml(y.name)}（夢の姿）">${artToSvg(art, '#fffdf7', INK, 1.25)}</svg>`
    else
      this.fig.innerHTML = `
      <svg class="line" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.25)}</svg>
      <svg class="color" viewBox="0 0 ${art.w} ${art.h}" role="img" aria-label="${escapeHtml(y.name)}（色のついた姿）">${artToSvg(art, '#fffdf7', INK, 1.25, 1, true)}</svg>`
    this.note.textContent = ''
    this.el.classList.remove('parting', 'appeared')
    this.el.classList.toggle('nofig', form === 'none')
    // 姿の無い会話では、カメラで見るものがない
    this.camBtn.hidden = this.d.camera === false || form === 'none'
    this.el.classList.add('on')
    this.el.inert = false
    // 次のフレームで「現れる」動きを始める（霞が晴れ、線のあとに色が差す）
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add('appeared')))
    this.d.sound.bell(1)
    this.d.log(`appear ${spotId}`)
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(
      () => {
        if (!this.active) return
        this.dialogue.open(y ? `${y.name}との会話` : 'ましろの話')
        this.onBeat(runner.start())
      },
      form === 'none' ? APPEAR_NOFIG_MS : APPEAR_MS,
    )
    return true
  }

  /** お休みの範囲・道中に入った: 会話とカメラをすぐ止める */
  stop(): void {
    if (this.active) this.end('stopped')
  }

  private onBeat(beat: Beat): void {
    if (beat.kind === 'end') {
      this.end('finished')
      return
    }
    this.dialogue.show(beat)
  }

  private end(how: 'finished' | 'closed' | 'stopped'): void {
    const a = this.active
    if (!a) return
    this.active = null
    window.clearTimeout(this.timer)
    this.dialogue.close()
    void this.stopCamera()
    this.d.log(`talk:end ${how} trail=${a.runner.trail.join('>')}`)
    // 消えていく間から、Tab で入れない（会話の枠を閉じたあとに。遊びが inert にしていた層を戻すのは、その中で済んでいる）
    this.el.inert = true
    this.el.classList.add('parting')
    window.setTimeout(() => {
      if (this.active) return
      this.el.classList.remove('on', 'appeared', 'parting')
      this.fig.innerHTML = ''
    }, how === 'stopped' ? 50 : 900)
    this.d.onEnd(a.spotId, how)
  }

  // ---------------------------------------------------------------- AR 段階1（カメラ＋向き）

  private async startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.note.textContent = 'この端末ではカメラが使えません。絵の中で会います'
      return
    }
    // iPhone は向きのセンサーにも許可が要る（ボタンを押した中で頼む）
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined
    let orientOk = true
    if (DOE?.requestPermission) {
      try {
        orientOk = (await DOE.requestPermission()) === 'granted'
      } catch {
        orientOk = false
      }
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    } catch {
      this.stream = null
      this.note.textContent = 'カメラを開けませんでした。絵の中で会います'
      return
    }
    if (!this.active) {
      void this.stopCamera()
      return
    }
    this.video.srcObject = this.stream
    void this.video.play().catch(() => {})
    this.el.classList.add('camera')
    this.camBtn.textContent = 'カメラをとじる'
    this.note.textContent = orientOk ? '' : '向きのセンサーが使えないので、姿は画面の中ほどに立ちます'
    this.d.log('camera:on')
    if (orientOk) this.startOrientation()
  }

  private async stopCamera(): Promise<void> {
    this.stopOrientation()
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop()
      this.stream = null
      this.d.log('camera:off')
    }
    this.video.srcObject = null
    this.el.classList.remove('camera')
    this.camBtn.textContent = 'カメラで見る'
    this.fig.style.transform = ''
  }

  private readonly onOrient = (e: DeviceOrientationEvent): void => {
    const o = this.orient
    if (!o) return
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
    const yaw = typeof ios === 'number' && Number.isFinite(ios) ? ios : e.alpha !== null ? 360 - e.alpha : null
    if (yaw === null || e.beta === null) return
    if (o.anchor === null) o.anchor = yaw
    o.yaw = yaw
    o.pitch = e.beta
  }

  private startOrientation(): void {
    this.orient = { anchor: null, yaw: 0, pitch: 90, x: 0, y: 0, raf: 0 }
    window.addEventListener('deviceorientation', this.onOrient)
    const step = () => {
      const o = this.orient
      if (!o) return
      o.raf = requestAnimationFrame(step)
      if (o.anchor === null) return
      // 縦持ちのカメラの横の画角を 60° とみなす。右を向くと姿は左へ、上を向くと下へ
      const pxPerDeg = window.innerWidth / 60
      let dYaw = ((o.yaw - o.anchor + 540) % 360) - 180
      dYaw = Math.max(-80, Math.min(80, dYaw))
      const tx = -dYaw * pxPerDeg
      const ty = Math.max(-window.innerHeight, Math.min(window.innerHeight, (o.pitch - 90) * pxPerDeg))
      o.x += (tx - o.x) * 0.25
      o.y += (ty - o.y) * 0.25
      this.fig.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px)`
    }
    this.orient.raf = requestAnimationFrame(step)
  }

  private stopOrientation(): void {
    if (!this.orient) return
    cancelAnimationFrame(this.orient.raf)
    window.removeEventListener('deviceorientation', this.onOrient)
    this.orient = null
  }
}

/** AR 段階0 の背景（昼の金色の午後。06「光と霞」）。立山の連なりは形をなぞった仮の切り絵（本番の絵は段階5） */
function backdropSvg(): string {
  return `<svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="ueSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bcd6ea"/><stop offset="0.55" stop-color="#e9e6dc"/><stop offset="0.8" stop-color="#f7e6c8"/></linearGradient>
      <linearGradient id="ueGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7e3cc"/><stop offset="1" stop-color="#d8d6b8"/></linearGradient>
      <linearGradient id="ueMist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0" stop-opacity="0"/><stop offset="0.5" stop-color="#fffaf0" stop-opacity="0.9"/><stop offset="1" stop-color="#fffaf0" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="400" height="700" fill="url(#ueSky)"/>
    <path d="M-20,420 L30,372 L62,386 L104,330 L128,348 L150,318 L176,340 L214,300 L240,326 L268,316 L300,348 L336,330 L372,362 L420,350 L420,460 L-20,460 Z" fill="#aebfd4"/>
    <path d="M104,330 L114,339 L121,336 M150,318 L158,327 L166,324 M214,300 L223,311 L232,309 L240,326" fill="none" stroke="#f8f8f4" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M-20,446 L40,420 L96,432 L160,404 L230,424 L300,398 L360,420 L420,410 L420,480 L-20,480 Z" fill="#c4cfd8"/>
    <rect x="-20" y="410" width="440" height="90" fill="url(#ueMist)"/>
    <path d="M-20,478 C80,468 160,486 240,474 C320,464 380,472 420,468 L420,700 L-20,700 Z" fill="url(#ueGround)"/>
    <path d="M150,700 C176,620 190,560 198,486 L204,486 C214,560 236,620 270,700 Z" fill="#efe8d4"/>
    <path d="M-20,560 C40,548 90,556 140,546" fill="none" stroke="#c9c4a6" stroke-width="2" stroke-linecap="round"/>
    <path d="M280,580 C320,570 360,576 420,566" fill="none" stroke="#c9c4a6" stroke-width="2" stroke-linecap="round"/>
  </svg>`
}

/** 家の白描の地図で使う背景（無地の和紙。景色は描かない） */
function paperSvg(): string {
  return `<svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="uePaper" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#fbf7ec"/><stop offset="1" stop-color="#f1e8d4"/></linearGradient>
      <pattern id="ueFiber" width="97" height="71" patternUnits="userSpaceOnUse">
        <path d="M6,9 C13,7 19,10 24,6 M58,22 C62,26 67,27 73,31 M31,47 C36,45 40,49 47,48 M80,58 C84,55 88,57 93,52 M14,63 C18,60 21,62 23,58" fill="none" stroke="#c8bb9c" stroke-opacity="0.22" stroke-width="0.6" stroke-linecap="round"/>
      </pattern>
    </defs>
    <rect width="400" height="700" fill="url(#uePaper)"/>
    <rect width="400" height="700" fill="url(#ueFiber)"/>
  </svg>`
}

const CSS = /* css */ `
.ue { position: absolute; inset: 0; z-index: 20; pointer-events: none; opacity: 0; transition: opacity 0.5s; overflow: hidden; }
.ue.on { opacity: 1; pointer-events: auto; }
.ue.parting { opacity: 0; transition: opacity 0.8s; }
.ue-bg, .ue-bg svg, .ue-cam { position: absolute; inset: 0; width: 100%; height: 100%; }
.ue-cam { object-fit: cover; display: none; background: #000; }
.ue.camera .ue-cam { display: block; }
.ue.camera .ue-bg { display: none; }
.ue-fig { position: absolute; left: 50%; bottom: calc(max(150px, var(--yd-h, 0px) + 28px) + var(--sab)); width: min(62vw, 36vh); aspect-ratio: 2 / 3; margin-left: calc(min(62vw, 36vh) / -2); will-change: transform; filter: drop-shadow(0 10px 10px rgba(60, 50, 40, 0.18)); transition: bottom 0.35s ease-out; }
/* 会話の枠の上に出す（枠は 1120px 以下で下から 50px） */
@media (max-width: 1120px) { .ue-fig { bottom: calc(max(190px, var(--yd-h, 0px) + 64px) + var(--sab)); } }
.ue-fig svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ue-fig .line { opacity: 0; transform: translateY(10px) scale(0.97); transition: opacity 0.7s ease-out, transform 1.2s ease-out; }
.ue-fig .color { opacity: 0; transition: opacity 1.1s ease-in 0.7s; }
.ue.appeared .ue-fig .line { opacity: 1; transform: none; }
.ue.appeared .ue-fig .color { opacity: 1; }
.ue-veil { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 55% at 50% 55%, rgba(255, 252, 244, 0.85), rgba(255, 252, 244, 0.98)); opacity: 1; transition: opacity 1.4s ease-out; pointer-events: none; }
.ue.appeared .ue-veil { opacity: 0; }
.ue-cam-btn { position: absolute; top: calc(12px + var(--sat)); right: calc(12px + var(--sar)); font: inherit; font-size: 13px; color: var(--ink); background: var(--washi); border: 1px solid var(--line); border-radius: 999px; min-height: 44px; padding: 0 14px; cursor: pointer; }
.ue-cam-btn[hidden] { display: none; }
/* 姿の無い会話（調べる地点）: 霞を少し残して、古い話の気配にする */
.ue.nofig.appeared .ue-veil { opacity: 0.55; }
.ue-note { position: absolute; top: calc(60px + var(--sat)); left: 50%; transform: translateX(-50%); font-size: 12.5px; color: var(--ink); background: var(--washi); border-radius: 8px; padding: 0 10px; width: max-content; max-width: calc(100vw - 32px); text-align: center; }
.ue-note:empty { display: none; }
/* 動きを減らす設定: 浮かび上がる動きをやめ、薄く切り替えるだけにする */
@media (prefers-reduced-motion: reduce) {
  .ue-fig .line { transform: none; transition: opacity 0.4s; }
  .ue-fig .color { transition: opacity 0.4s; }
  .ue-veil { transition: opacity 0.4s; }
  .ue-fig { transition: none; }
}
`

let styled = false
function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = CSS
  document.head.appendChild(s)
}
