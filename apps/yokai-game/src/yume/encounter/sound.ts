// 音（Web Audio で、その場で作る。音のファイルは使わない）。
// - まわりの音: 風のような、やわらかいざわめき（低く絞った雑音。ゆっくり揺れる）。
// - 鈴: 気配の近くに来たとき（小さく）と、夢の姿が浮かんだとき。
// - 耳を澄ますと、まわりの音が静まる（duck）。
// ブラウザの決まりで、最初の操作（「歩きはじめる」など）のあとにだけ鳴らせる。右上の「音」で切れる。

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambient: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private enabledFlag: boolean
  private duckLevel = 0
  private lastBell = -10

  constructor(enabled: boolean) {
    this.enabledFlag = enabled
  }

  get enabled(): boolean {
    return this.enabledFlag
  }

  /** 最初の操作のときに呼ぶ（AudioContext を作って、まわりの音を始める） */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
      return
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      this.ctx = ctx
      const master = ctx.createGain()
      master.gain.value = this.enabledFlag ? 1 : 0
      master.connect(ctx.destination)
      this.master = master
      // 風: 茶色の雑音（2秒）をくり返し、低域通過で絞る。
      // つなぎ目: 2秒 + 50ms を作り、ループの終わりの 50ms を「ループの頭の直前の 50ms」へ等パワーで寄せる。
      // こうすると、ループの最後の1標本は生の r[fade-1]、次に鳴る頭は r[fade] で、元の雑音の続きのままつながる。
      const len = ctx.sampleRate * 2
      const fade = Math.floor(ctx.sampleRate * 0.05)
      const r = new Float32Array(len + fade)
      let last = 0
      for (let i = 0; i < r.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        r[i] = last * 3.2
      }
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) {
        const k = i - (len - fade)
        if (k < 0) d[i] = r[i + fade]
        else {
          const t = (k + 1) / fade
          d[i] = r[i + fade] * Math.cos((t * Math.PI) / 2) + r[k] * Math.sin((t * Math.PI) / 2)
        }
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 520
      filter.Q.value = 0.3
      const amb = ctx.createGain()
      amb.gain.value = 0
      src.connect(filter).connect(amb).connect(master)
      // ゆっくり揺れる（風の強弱）
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.07
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 180
      lfo.connect(lfoGain).connect(filter.frequency)
      src.start()
      lfo.start()
      this.ambient = amb
      this.filter = filter
      this.applyAmbient(1.5)
    } catch {
      this.ctx = null
    }
  }

  setEnabled(on: boolean): void {
    this.enabledFlag = on
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.08)
  }

  /** 耳を澄ます（0..1）。1 で、まわりの音がほとんど静まる */
  setDuck(level: number): void {
    const v = Math.max(0, Math.min(1, level))
    if (Math.abs(v - this.duckLevel) < 0.02) return
    this.duckLevel = v
    this.applyAmbient(0.25)
  }

  private applyAmbient(tc: number): void {
    if (!this.ctx || !this.ambient || !this.filter) return
    const t = this.ctx.currentTime
    const base = 0.05
    this.ambient.gain.setTargetAtTime(base * (1 - 0.85 * this.duckLevel), t, tc)
    // 静まるほど、こもった音にする
    this.filter.frequency.setTargetAtTime(520 - 300 * this.duckLevel, t, tc)
  }

  /** 鈴（strength 0..1） */
  bell(strength = 1): void {
    if (!this.ctx || !this.master || !this.enabledFlag) return
    const ctx = this.ctx
    const now = ctx.currentTime
    if (now - this.lastBell < 0.4) return
    this.lastBell = now
    const partials: [number, number, number][] = [
      // 周波数、強さ、減衰（秒）
      [1568, 0.5, 1.6],
      [2349, 0.3, 1.1],
      [3951, 0.18, 0.7],
      [5274, 0.08, 0.45],
    ]
    for (const [f, a, dec] of partials) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004)
      const g = ctx.createGain()
      const peak = 0.05 * a * strength
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(peak, now + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, now + dec)
      o.connect(g).connect(this.master)
      o.start(now)
      o.stop(now + dec + 0.05)
    }
  }

  /** 確認用 */
  get debug(): { running: boolean; duck: number; enabled: boolean; ambientGain: number } {
    return {
      running: this.ctx?.state === 'running',
      duck: this.duckLevel,
      enabled: this.enabledFlag,
      ambientGain: this.ambient?.gain.value ?? 0,
    }
  }
}
