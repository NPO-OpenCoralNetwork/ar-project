// 判定の合図の音（Web Audio）。iOS はユーザー操作の中で一度鳴らしておかないと、あとで音が出ない。

let ctx: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function getCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** ボタンを押したときに呼ぶ。無音を一瞬鳴らして、以後音が出るようにする */
export function unlockAudio(): boolean {
  const Ctor = getCtor()
  if (!Ctor) return false
  // 新しめの iOS Safari では、音の種類を「再生」にすると消音スイッチの影響を受けにくい（実機で要確認）
  try {
    const nav = navigator as unknown as { audioSession?: { type: string } }
    if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback'
  } catch {
    /* 対応していなければそのまま */
  }
  if (!ctx) ctx = new Ctor()
  void ctx.resume()
  const buf = ctx.createBuffer(1, 1, 22050)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start(0)
  return true
}

/** 画面が戻ったときなどに呼ぶ */
export function resumeAudio(): void {
  if (ctx && ctx.state !== 'running') void ctx.resume()
}

export function audioState(): string {
  return ctx ? ctx.state : 'none'
}

function tone(freq: number, start: number, dur: number, gain: number): void {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

/** 止まった: 澄んだ2音（鈴のように上がる） */
export function playStopChime(): void {
  if (!ctx) return
  resumeAudio()
  const t = ctx.currentTime + 0.02
  tone(880, t, 1.2, 0.35)
  tone(1318.5, t + 0.18, 1.4, 0.3)
  tone(1760, t + 0.18, 0.9, 0.08)
  try {
    navigator.vibrate?.([80, 60, 80])
  } catch {
    /* iOS は振動に対応しない */
  }
}

/** 歩き出した: 低めの1音 */
export function playGoChime(): void {
  if (!ctx) return
  resumeAudio()
  const t = ctx.currentTime + 0.02
  tone(587.3, t, 0.5, 0.2)
  try {
    navigator.vibrate?.(60)
  } catch {
    /* 同上 */
  }
}

/** ラベルを押したときの短い音 */
export function playTick(): void {
  if (!ctx) return
  resumeAudio()
  tone(1046.5, ctx.currentTime + 0.01, 0.12, 0.15)
}
