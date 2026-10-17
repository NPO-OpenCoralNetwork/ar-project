// 夢の旅の出会い（段階2）: 気配 → 耳を澄ます → 夢の姿 → 台本の会話 → 伝承の札 → 曼荼羅のピース → 縁。
// 会話の進め方と保存は core/story（描画に依存しない）。ここは箱庭（three.js）と画面（HTML）につなぐだけ。
//
// ルール（05 §3、04 §3.1・§5）:
// - 歩いている間は出てこない。動くと途切れる（霞がゆっくり引く）。
// - お休みの範囲（境内）では出会いを起こさない。
// - 会話の画面・曼荼羅帳を開いている間は、アバターを止める。
// - 家で上がる縁は「なじみ」まで、曼荼羅は白描まで（ProgressStore が上限で止める）。

import * as THREE from 'three'
import { type Beat, DialogueRunner } from '../../core/story/dialogue'
import { ListenGauge } from '../../core/story/listen'
import type { ProgressStore } from '../../core/story/progress'
import type { StoryPack } from '../../data/story-pack'
import type { CameraRig } from '../camera'
import type { SpotLocal } from '../data'
import type { Field } from '../field'
import type { ScenePalette, ViewLook } from '../hikari'
import type { Hud } from '../hud'
import type { Player } from '../player'
import { ARTS } from './art'
import { DreamFigure } from './dream-figure'
import type { Sound } from './sound'
import { DialogueView, ListenButton, MandalaView, MistVeil } from './ui'

type Phase = 'roam' | 'appearing' | 'talking' | 'parting'

/** 夢の姿が浮かんでから、会話の枠を開くまで（秒） */
const APPEAR_SEC = 1.7
/** 会話の間のカメラの距離（m） */
const TALK_DIST = 22
const TALK_DIST_PORTRAIT = 17
/** 夢の姿とアバターの間（m）。地点の上に立っていたら、この距離だけ離れた所（画面の奥の側）に浮かぶ */
const FIGURE_GAP = 4.5

export interface EncounterDeps {
  field: Field
  hud: Hud
  player: Player
  rig: CameraRig
  scene: THREE.Scene
  story: StoryPack
  progress: ProgressStore
  sound: Sound
  /** はじめの位置へ戻す（最初からやり直すとき） */
  respawn(): void
}

export class Encounters {
  private readonly gauge = new ListenGauge()
  private readonly listenBtn: ListenButton
  private readonly mist: MistVeil
  private readonly dialogue: DialogueView
  private readonly mandala: MandalaView
  private readonly figures = new Map<string, DreamFigure>()
  private phase: Phase = 'roam'
  private phaseT = 0
  private active: { spot: SpotLocal; figure: DreamFigure; runner: DialogueRunner } | null = null
  private nearSpot: SpotLocal | null = null
  private spaceHeld = false
  private savedDist: number | null = null
  /** 会話の間だけ向きを変えたら、元の向き（会話が終わったら戻す） */
  private savedYaw: number | null = null
  private readonly focus = new THREE.Vector3()
  private mistAmount = 0
  /** 霧を寄せる量（0..1。main.ts が scene.fog の近い側・遠い側を縮める） */
  fogPull = 0
  /** 確認用（Playwright から読む） */
  readonly log: string[] = []

  constructor(private readonly d: EncounterDeps) {
    const root = d.hud.root
    this.mist = new MistVeil(root)
    this.listenBtn = new ListenButton(root, () => d.sound.unlock())
    this.dialogue = new DialogueView(
      root,
      {
        next: (r) => this.onBeat(this.active?.runner.next(r) ?? { kind: 'end' }),
        choose: (i) => this.onBeat(this.active?.runner.choose(i) ?? { kind: 'end' }),
        close: () => this.endTalk('closed'),
      },
      { yokaiName: (id) => d.story.yokai[id]?.name ?? id },
    )
    this.mandala = new MandalaView(
      root,
      d.story.mandala,
      {
        piece: (id) => d.progress.pieceOf(id),
        isNew: (id) => d.progress.pieceOf(id) !== 'empty' && !d.progress.flag(`seen:${id}`),
        // 開いた札だけ（ピースだけ先に入っても、札の本文は会話で開くまで見せない）
        card: (id) => (d.progress.isCardOpened(id) ? d.story.cards[id] : undefined),
        // 家では枠だけ見える（旅印は現地で節を終えたときだけ。02 F-45）
        stamps: () =>
          d.story.sections
            .filter((s) => s.region === 'iwakuraji')
            .map((s) => ({ id: s.id, title: s.title, stampTitle: s.stampTitle, motif: s.stampMotif, at: d.progress.stampOf(s.id)?.at ?? null })),
      },
      {
        close: () => this.closeMandala(),
        reset: () => this.resetAll(),
        seen: (id) => {
          d.progress.setFlag(`seen:${id}`, true)
          this.refreshBadge()
        },
      },
    )
    // 夢の姿（台本と絵のある妖怪だけ）
    for (const spot of d.field.data.spots) {
      const y = spot.yokaiId ? d.story.yokai[spot.yokaiId] : undefined
      const art = y?.art ? ARTS[y.art] : undefined
      if (!y?.script || !art || !d.story.scripts[y.script]) continue
      const f = new DreamFigure(art, y.heightM ?? 3.6)
      f.placeAt(spot.x, spot.z, d.field.spots.groundOf(spot.id))
      d.scene.add(f.mesh)
      this.figures.set(spot.id, f)
    }
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (this.busy) return
      this.spaceHeld = true
      d.sound.unlock()
      e.preventDefault()
    })
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceHeld = false
    })
    window.addEventListener('blur', () => (this.spaceHeld = false))
    d.progress.onChange(() => this.refreshMet())
    this.refreshMet()
    this.refreshBadge()
    if (d.story.problems.length) console.warn('[story] 台本・データの点検:', d.story.problems)
  }

  /** 会話・曼荼羅帳を開いている（アバターを止める） */
  get busy(): boolean {
    return this.phase === 'appearing' || this.phase === 'talking' || this.mandala.isOpen
  }

  /** カメラが追う点（会話の間は、アバターと夢の姿の間） */
  get cameraFocus(): THREE.Vector3 | null {
    return this.phase === 'roam' ? null : this.focus
  }

  setPalette(p: ScenePalette, look: ViewLook): void {
    for (const f of this.figures.values()) f.setPalette(p, look)
    this.mist.setColor(`#${new THREE.Color(p.fogToLight).lerp(new THREE.Color(0xffffff), 0.35).getHexString()}`)
  }

  /** にじみ（ブルーム）を使う画質か（使うならそのしきい値） */
  setBloomThreshold(t: number | null): void {
    for (const f of this.figures.values()) f.setBloomThreshold(t)
  }

  openMandala(): void {
    if (this.phase === 'appearing' || this.phase === 'talking') return
    this.d.player.walkTarget = null
    this.mandala.open()
  }

  private closeMandala(): void {
    this.mandala.close()
    this.refreshBadge()
  }

  private refreshBadge(): void {
    const p = this.d.progress
    const hasNew = this.d.story.mandala.tiers.some((t) => t.pieces.some((pc) => p.pieceOf(pc.id) !== 'empty' && !p.flag(`seen:${pc.id}`)))
    this.d.hud.setMandalaNew(hasNew)
  }

  private refreshMet(): void {
    this.d.field.spots.setMet((s) => !!s.yokaiId && this.d.progress.hasMet(s.yokaiId))
  }

  /** 毎フレーム。near は 6m 以内のいちばん近い地点 */
  update(dt: number, time: number, near: SpotLocal | null): void {
    const { player, field, sound, hud } = this.d
    this.phaseT += dt
    // 気配の近くに来たら、小さな鈴（04 §2.2）
    if (near && near !== this.nearSpot && this.phase === 'roam') sound.bell(0.35)
    this.nearSpot = near

    const scripted = near && this.figures.has(near.id) ? near : null
    if (this.phase === 'roam') {
      const inRest = field.walk.isInsideRest(player.pos.x, player.pos.z) || (scripted ? field.walk.isInsideRest(scripted.x, scripted.z) : false)
      const ev = this.gauge.update(dt, {
        near: !!scripted,
        held: this.listenBtn.held(this.spaceHeld),
        speed: player.speed,
        inRest,
        blocked: this.mandala.isOpen,
      })
      if (ev === 'start') this.log.push(`listen:start ${scripted?.id}`)
      if (ev === 'interrupted') {
        this.log.push('listen:interrupted')
        hud.toast('……気配が、ふっと遠のいた。止まると、また聞こえる')
      }
      const met = scripted?.yokaiId ? this.d.progress.hasMet(scripted.yokaiId) : false
      this.listenBtn.show(!!scripted && !this.mandala.isOpen, met ? '長押し・また会いに' : '長押し・その場で止まる')
      this.listenBtn.setProgress(this.gauge.progress)
      // 台本のない妖怪の地点は、気配だけ（のちの段階で）
      hud.showPrompt(near && !scripted ? 'かすかな気配。まだ声は遠い' : null)
      field.spots.setFocus(scripted?.id ?? null, this.gauge.progress, 0)
      this.mistAmount = this.gauge.progress
      sound.setDuck(this.gauge.progress)
      if (ev === 'complete' && scripted) this.beginAppear(scripted)
    } else {
      this.listenBtn.show(false)
      hud.showPrompt(null)
    }

    const a = this.active
    if (a) {
      // カメラはアバターと夢の姿の間を見る。会話の枠（画面の下）に隠れないよう、見る点を少し手前に寄せる（二人が画面の上へ上がる）
      const fp = a.figure.position
      const fwd = this.d.rig.forward()
      const back = this.d.rig.dist * (window.innerHeight > window.innerWidth ? 0.14 : 0.1)
      this.focus.set((player.pos.x + fp.x) / 2 - fwd.x * back, (player.pos.y + fp.y) / 2 + 0.6, (player.pos.z + fp.z) / 2 - fwd.y * back)
      field.spots.setFocus(a.spot.id, 0, Math.min(1, a.figure.visibleAmount * 1.5))
    }
    if (this.phase === 'appearing') {
      this.mistAmount += (0.7 - this.mistAmount) * (1 - Math.exp(-dt * 2))
      sound.setDuck(0.9)
      if (this.phaseT >= APPEAR_SEC && a) this.beginTalk()
    } else if (this.phase === 'talking') {
      this.mistAmount += (0.45 - this.mistAmount) * (1 - Math.exp(-dt * 2))
      sound.setDuck(0.75)
    } else if (this.phase === 'parting') {
      this.mistAmount += (0 - this.mistAmount) * (1 - Math.exp(-dt * 1.5))
      sound.setDuck(0)
      if (a && a.figure.visibleAmount <= 0.01) {
        field.spots.setFocus(null, 0, 0)
        this.active = null
        this.phase = 'roam'
        this.phaseT = 0
        player.faceHeading = null
      }
    }
    this.mist.set(this.mistAmount)
    this.fogPull = Math.min(1, this.mistAmount * 1.2)
    for (const f of this.figures.values()) f.update(dt, time, this.d.rig.camera)
  }

  private beginAppear(spot: SpotLocal): void {
    const figure = this.figures.get(spot.id)
    const yokai = spot.yokaiId ? this.d.story.yokai[spot.yokaiId] : undefined
    const script = yokai?.script ? this.d.story.scripts[yokai.script] : undefined
    if (!figure || !script) return
    const { player, rig, progress, story } = this.d
    const runner = new DialogueRunner(script, { progress, cards: story.cards, travel: 'yume' })
    this.active = { spot, figure, runner }
    this.phase = 'appearing'
    this.phaseT = 0
    this.log.push(`appear ${spot.id}`)
    player.walkTarget = null
    // 縦長の画面（スマホ）は横の画角が狭いので、もう少し寄る
    const talkDist = Math.min(rig.distTarget, window.innerHeight > window.innerWidth ? TALK_DIST_PORTRAIT : TALK_DIST)
    // 寄ったカメラの前を、手前の家・木・灯りがふさがない向きを ±90° の中から選ぶ（会話が終わったら元の向きに戻す）
    const pick = this.pickTalkYaw(spot, talkDist)
    if (pick.yaw !== rig.yawTarget) {
      if (this.savedYaw === null) this.savedYaw = rig.yawTarget
      rig.yawTarget = pick.yaw
    }
    this.log.push(`talk-yaw ${pick.yaw} blocked ${pick.scores.join('/')}`)
    const at = pick.at
    figure.placeAt(at.x, at.z, this.d.field.walk.groundY(at.x, at.z))
    player.faceHeading = Math.atan2(at.x - player.pos.x, -(at.z - player.pos.z))
    figure.show()
    this.d.sound.bell(1)
    if (this.savedDist === null) this.savedDist = rig.distTarget
    rig.distTarget = talkDist
  }

  /**
   * 会話のカメラの向き。今の向きと ±45°・±90° を比べ、画面の上 2/3（会話の枠より上）に向けた光線の束のうち、
   * 二人より手前か、すぐ向こうで家・木・灯りに当たる本数がいちばん少ない向きを選ぶ（同じくらいなら今の向きのまま）。
   */
  private pickTalkYaw(spot: SpotLocal, dist: number): { yaw: number; at: { x: number; z: number }; scores: number[] } {
    const { rig, player, field } = this.d
    const occ = field.occluders
    const cam = rig.camera.clone()
    const ray = new THREE.Raycaster()
    const pos = new THREE.Vector3()
    const look = new THREE.Vector3()
    const target = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    const portrait = window.innerHeight > window.innerWidth
    const base = rig.yawTarget
    // 今の向き、±45°、±90°（90° 回すのは、ほかよりはっきりよいときだけ）
    const cands = [base, base - 45, base + 45, base - 90, base + 90]
    const bias = (yaw: number) => (yaw === base ? -2 : Math.abs(yaw - base) > 60 ? 3 : 0)
    let best = { yaw: base, at: this.figureSpot(spot, base), score: Infinity }
    const scores: number[] = []
    for (const yaw of cands) {
      const at = this.figureSpot(spot, yaw)
      const a = (yaw * Math.PI) / 180
      const fx = Math.sin(a)
      const fz = -Math.cos(a)
      const back = dist * (portrait ? 0.14 : 0.1)
      const gy = field.walk.groundY(at.x, at.z)
      target.set((player.pos.x + at.x) / 2 - fx * back, (player.pos.y + gy) / 2 + 0.6, (player.pos.z + at.z) / 2 - fz * back)
      rig.poseFor(yaw, dist, target, pos, look)
      cam.position.copy(pos)
      cam.lookAt(look)
      cam.updateMatrixWorld()
      const subject = pos.distanceTo(target)
      let score = 0
      for (let iy = 0; iy < 6; iy++) {
        for (let ix = 0; ix < 7; ix++) {
          ndc.set(-0.9 + (ix / 6) * 1.8, -0.3 + (iy / 5) * 1.2)
          ray.setFromCamera(ndc, cam)
          // 二人より手前の物は2、二人のすぐ向こう（12m まで）の物は1。寄ったカメラでは、すぐ向こうの家も画面を大きくふさぐ
          ray.far = subject + 12
          const hit = ray.intersectObjects(occ, false)[0]
          if (hit) score += hit.distance < subject * 0.85 ? 2 : 1
        }
      }
      // 二人そのものが隠れるのは、もっと悪い
      for (const p of [player.pos, new THREE.Vector3(at.x, gy + 1.5, at.z)]) {
        const dir = p.clone().sub(pos)
        ray.set(pos, dir.normalize())
        ray.far = pos.distanceTo(p) - 1
        if (ray.intersectObjects(occ, false).length) score += 8
      }
      scores.push(score)
      // 今の向きを少しひいきする（2本以上よくならなければ回さない）
      if (score + bias(yaw) < best.score) best = { yaw, at, score: score + bias(yaw) }
    }
    return { yaw: best.yaw, at: best.at, scores }
  }

  /**
   * 夢の姿を浮かべる所。地点の位置が基本だが、アバターが地点の上に立っていたら重なるので、
   * アバターから FIGURE_GAP 離れた、画面の斜め奥（右か左。会話の枠の上に二人が並んで見えるように）の歩ける所にする。
   */
  private figureSpot(spot: SpotLocal, yawDeg: number): { x: number; z: number } {
    const { player, field } = this.d
    const dx = spot.x - player.pos.x
    const dz = spot.z - player.pos.z
    if (Math.hypot(dx, dz) >= FIGURE_GAP * 0.8) return { x: spot.x, z: spot.z }
    const base = (yawDeg * Math.PI) / 180
    // 離れ方を少しずつ縮めて探す。どれも駄目なら、地点そのもの（公道の上）に浮かべる。確かめていない点は返さない
    for (const gap of [FIGURE_GAP, 3, 2]) {
      for (const off of [1.1, -1.1, 0.7, -0.7, 1.57, -1.57, 0]) {
        const a = base + off
        const x = player.pos.x + Math.sin(a) * gap
        const z = player.pos.z - Math.cos(a) * gap
        if (field.walk.isWalkable(x, z, 0.8) && !field.walk.isInsideRest(x, z)) return { x, z }
      }
    }
    return { x: spot.x, z: spot.z }
  }

  private beginTalk(): void {
    const a = this.active
    if (!a) return
    this.phase = 'talking'
    this.phaseT = 0
    const name = this.d.story.yokai[a.runner.script.yokaiId ?? '']?.name ?? ''
    this.dialogue.open(`${name}との会話`)
    this.onBeat(a.runner.start())
  }

  private onBeat(beat: Beat): void {
    const a = this.active
    if (!a) return
    this.log.push(`beat ${a.runner.node} ${beat.kind}${beat.kind === 'line' ? ' ' + beat.speakerId : ''}${beat.kind === 'card' ? ' ' + beat.card.id : ''}`)
    if (beat.kind === 'end') {
      this.endTalk('end')
      return
    }
    if (beat.kind === 'notice' && beat.notice.type === 'piece') this.refreshBadge()
    this.dialogue.show(beat)
  }

  private endTalk(why: 'end' | 'closed'): void {
    const a = this.active
    this.dialogue.close()
    this.log.push(`talk:${why}`)
    if (!a) return
    this.phase = 'parting'
    this.phaseT = 0
    a.figure.hide()
    this.gauge.disarm()
    if (this.savedDist !== null) {
      this.d.rig.distTarget = this.savedDist
      this.savedDist = null
    }
    if (this.savedYaw !== null) {
      this.d.rig.yawTarget = this.savedYaw
      this.savedYaw = null
    }
    this.refreshBadge()
    if (why === 'end' && this.d.hud.mandalaHasNew) this.d.hud.toast('曼荼羅帳に、ピースが一つ入った（右上の「曼荼羅帳」）', 4200)
  }

  private resetAll(): void {
    this.d.progress.reset()
    this.gauge.reset()
    this.refreshBadge()
    this.refreshMet()
    this.d.respawn()
    // 曼荼羅帳を開いている間はお知らせが隠れるので、閉じてから知らせる（アバターがはじめの位置に戻ったのも見える）
    this.closeMandala()
    this.d.hud.toast('最初からやり直した。はじめの場所に戻った', 4200)
    this.log.push('reset')
  }

  /** 確認用 */
  get debugState(): { phase: Phase; gauge: number; node: string; busy: boolean; figure: number; mist: number } {
    return {
      phase: this.phase,
      gauge: this.gauge.progress,
      node: this.active?.runner.node ?? '',
      busy: this.busy,
      figure: this.active?.figure.visibleAmount ?? 0,
      mist: this.mistAmount,
    }
  }
}
