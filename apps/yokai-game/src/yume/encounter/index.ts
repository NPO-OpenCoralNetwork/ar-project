// 夢の旅の出会い（段階2）: 気配 → 耳を澄ます → 夢の姿 → 台本の会話 → 伝承の札 → 曼荼羅のピース → 縁。
// 会話の進め方と保存は core/story（描画に依存しない）。ここは箱庭（three.js）と画面（HTML）につなぐだけ。
//
// ルール（05 §3、04 §3.1・§5）:
// - 歩いている間は出てこない。動くと途切れる（霞がゆっくり引く）。
// - お休みの範囲（境内）では出会いを起こさない。
// - 夜は、どの地点も気配だけ（04 §2.5「箱庭も夜は気配だけ」。決まりは core の canListenAtHome。白描の絵地図と同じ）。
// - 会話の画面・帳（曼荼羅帳・縁帳。ui/cho.ts）を開いている間は、アバターを止める。
// - 家で上がる縁は「なじみ」まで、曼荼羅は白描まで（ProgressStore が上限で止める）。金の縁取りは、彩色済みのピースを帳の稽古で語り返したときだけ。
//
// 地点の役目（data.ts の SpotLocal.role。決め方は core の spotRole）:
// - yokai: 決まった地点の妖怪。台本と絵のある妖怪だけ夢の姿が浮かぶ（ほかは気配だけ）。
// - clue: 調べる地点（04 §3.4）。悩みを頼まれ、札をまだ拾っていない間だけ印を出す（clues.json）。
//   耳を澄ますと、姿は浮かばず、霞が寄ってましろだけが話し、札が出る。
// - wander: 寄り道の地点（水辺。04 §3.1）。出現の表を、箱庭の時間帯（昼・夕・夜）で引く。出るときだけ夢の姿が浮かび、
//   寄り道の台本（雑談）で話す。出ないとき（夜・まだ会っていない・まだ作っていない妖怪）は気配だけ。
//   表は耳を澄ますたびに引く。会話の途中で時間帯が変わっても、浮かんだ姿は消さない（main.ts は会話の間 T キーを止める）。

import * as THREE from 'three'
import { canListenAtHome, clueActive, clueWords, HOME_NIGHT_KEHAI, resolveAppearance, timeSlotOfDiorama } from '../../core/story/appearance'
import { type Beat, DialogueRunner } from '../../core/story/dialogue'
import { ListenGauge } from '../../core/story/listen'
import type { ProgressStore } from '../../core/story/progress'
import type { DialogueScript } from '../../core/story/types'
import type { StoryPack } from '../../data/story-pack'
import { type Cho, createCho } from '../../ui/cho'
import type { CameraRig } from '../camera'
import type { SpotLocal } from '../data'
import type { Field } from '../field'
import type { ScenePalette, ViewLook } from '../hikari'
import type { Hud } from '../hud'
import type { Player } from '../player'
import { ARTS } from './art'
import { DreamFigure } from './dream-figure'
import type { Sound } from './sound'
import { DialogueView, ListenButton, MistVeil } from './ui'

type Phase = 'roam' | 'appearing' | 'talking' | 'parting'

/** 耳を澄ますと始まる会話（地点の役目ごとに、使う台本と、浮かぶ妖怪）。yokaiId が無いのは調べる地点（姿なし） */
interface Listenable {
  spot: SpotLocal
  script: DialogueScript
  yokaiId?: string
}

/** 夢の姿が浮かんでから、会話の枠を開くまで（秒） */
const APPEAR_SEC = 1.7
/** 姿のない会話（調べる地点）で、霞が寄ってから会話の枠を開くまで（秒）。浮かぶものがないので短く */
const CLUE_APPEAR_SEC = 1.2
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
  /** 帳（曼荼羅帳・縁帳） */
  private readonly cho: Cho
  /** 夢の姿（妖怪ごとに1つ。決まった地点の妖怪ははじめに作り、寄り道の妖怪は、はじめて浮かぶときに作る） */
  private readonly figures = new Map<string, DreamFigure>()
  private phase: Phase = 'roam'
  private phaseT = 0
  /**
   * 会話の相手。figure が無いのは調べる地点（ましろだけ）。veil はそのときの印の消え方（0..1。姿の浮かび方の代わり）。
   * piece はこの会話でピースが入ったか（別れのお知らせに使う）
   */
  private active: { spot: SpotLocal; figure?: DreamFigure; runner: DialogueRunner; veil: number; piece: boolean } | null = null
  private nearSpot: SpotLocal | null = null
  /** 箱庭の時間帯（出現の表を引く） */
  private timeOfDay: ScenePalette['time'] = 'day'
  /** あとから作る夢の姿に当てる、いまのパレットとにじみのしきい値 */
  private palette: { p: ScenePalette; look: ViewLook } | null = null
  private bloom: number | null = null
  /** 会話のあとに残る霞（姿のない会話は別れを待たないので、ここでゆっくり引く） */
  private mistLinger = 0
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
      { yokaiName: (id) => d.story.yokai[id]?.name ?? id, sound: d.sound },
    )
    // 帳（立山のふもとの保存。旅印は現地で節を終えたときだけなので、家では枠だけ）。「新」の印は右上の「帳」のボタンに出す
    this.cho = createCho({
      root,
      story: d.story,
      progress: d.progress,
      travel: 'yume',
      stampRegion: 'iwakuraji',
      sound: d.sound,
      onNew: (on) => d.hud.setMandalaNew(on),
      onReset: () => this.afterReset(),
    })
    // 決まった地点の夢の姿（台本と絵のある妖怪だけ）
    for (const spot of d.field.data.spots) {
      if (spot.role !== 'yokai' || !spot.yokaiId || !this.scriptOf(spot.yokaiId)) continue
      this.figureOf(spot.yokaiId)?.placeAt(spot.x, spot.z, d.field.spots.groundOf(spot.id))
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
    if (d.story.problems.length) console.warn('[story] 台本・データの点検:', d.story.problems)
  }

  /** 会話・帳を開いている（アバターを止める） */
  get busy(): boolean {
    return this.phase === 'appearing' || this.phase === 'talking' || this.cho.isOpen
  }

  /** 出会いの途中（耳を澄まし終えてから、別れ終わるまで）。この間は時間帯と帳のキーを止める（main.ts） */
  get engaged(): boolean {
    return this.phase !== 'roam'
  }

  /** カメラが追う点（会話の間は、アバターと夢の姿の間） */
  get cameraFocus(): THREE.Vector3 | null {
    return this.phase === 'roam' ? null : this.focus
  }

  setPalette(p: ScenePalette, look: ViewLook): void {
    this.palette = { p, look }
    // 時間帯は、次に耳を澄ますときの出現の表に効く（浮かんでいる姿はそのまま）
    this.timeOfDay = p.time
    for (const f of this.figures.values()) f.setPalette(p, look)
    this.mist.setColor(`#${new THREE.Color(p.fogToLight).lerp(new THREE.Color(0xffffff), 0.35).getHexString()}`)
  }

  /** にじみ（ブルーム）を使う画質か（使うならそのしきい値） */
  setBloomThreshold(t: number | null): void {
    this.bloom = t
    for (const f of this.figures.values()) f.setBloomThreshold(t)
  }

  /** 妖怪の台本（台本と絵のある妖怪だけ。ほかは気配だけ） */
  private scriptOf(yokaiId: string): DialogueScript | undefined {
    const y = this.d.story.yokai[yokaiId]
    if (!y?.script || !y.art || !ARTS[y.art]) return undefined
    return this.d.story.scripts[y.script]
  }

  /** 妖怪の夢の姿。まだ無ければ作る（寄り道の妖怪は、はじめて浮かぶときに作る）。絵の無い妖怪は undefined */
  private figureOf(yokaiId: string): DreamFigure | undefined {
    const have = this.figures.get(yokaiId)
    if (have) return have
    const y = this.d.story.yokai[yokaiId]
    const art = y?.art ? ARTS[y.art] : undefined
    if (!y || !art) return undefined
    const f = new DreamFigure(art, y.heightM ?? 3.6)
    if (this.palette) f.setPalette(this.palette.p, this.palette.look)
    f.setBloomThreshold(this.bloom)
    this.d.scene.add(f.mesh)
    this.figures.set(yokaiId, f)
    return f
  }

  /** 近くの地点で、耳を澄ますと始まる会話（無ければ気配だけ）。夜は、どの役目の地点も気配だけ */
  private listenableAt(spot: SpotLocal): Listenable | null {
    const { story, progress } = this.d
    if (!canListenAtHome(this.timeOfDay)) return null
    if (spot.role === 'clue') {
      const clue = spot.clueId ? story.clues[spot.clueId] : undefined
      const script = clue ? story.scripts[clue.script] : undefined
      return clue && script && clueActive(clue, progress, 'yume') ? { spot, script } : null
    }
    if (spot.role === 'wander') {
      const a = resolveAppearance(story.appearance, spot.placeKind, timeSlotOfDiorama(this.timeOfDay), progress, 'yume')
      if (a.mode !== 'appear') return null
      const y = story.yokai[a.yokaiId]
      const script = story.scripts[a.script]
      // 寄り道の台本で話す（悩みは始めない・縁も上げない）。絵の無い妖怪は気配だけ
      return script && y?.art && ARTS[y.art] ? { spot, script, yokaiId: a.yokaiId } : null
    }
    const script = spot.yokaiId ? this.scriptOf(spot.yokaiId) : undefined
    return script ? { spot, script, yokaiId: spot.yokaiId } : null
  }

  /** 帳を開く（右上の「帳」・M キー） */
  openMandala(): void {
    if (this.phase === 'appearing' || this.phase === 'talking') return
    this.d.player.walkTarget = null
    this.cho.open()
  }

  /** 進み具合が変わったら、印を合わせる（会った妖怪は淡く小さく。調べる地点は、頼まれてから札を拾うまでだけ出す） */
  private refreshMet(): void {
    const { field, progress, story } = this.d
    field.spots.setMet((s) => !!s.yokaiId && progress.hasMet(s.yokaiId))
    field.spots.setVisible((s) => {
      if (s.role !== 'clue') return true
      const clue = s.clueId ? story.clues[s.clueId] : undefined
      return !!clue && clueActive(clue, progress, 'yume')
    })
  }

  /** 毎フレーム。near は 6m 以内のいちばん近い地点 */
  update(dt: number, time: number, near: SpotLocal | null): void {
    const { player, field, sound, hud } = this.d
    this.phaseT += dt
    // 気配の近くに来たら、小さな鈴（04 §2.2）
    if (near && near !== this.nearSpot && this.phase === 'roam') sound.bell(0.35)
    this.nearSpot = near

    // 耳を澄ませる地点か（調べる地点は頼まれている間、寄り道の地点はいまの時間帯に妖怪が出るときだけ）
    const target = near && this.phase === 'roam' ? this.listenableAt(near) : null
    if (this.phase === 'roam') {
      const inRest = field.walk.isInsideRest(player.pos.x, player.pos.z) || (target ? field.walk.isInsideRest(target.spot.x, target.spot.z) : false)
      const ev = this.gauge.update(dt, {
        near: !!target,
        held: this.listenBtn.held(this.spaceHeld),
        speed: player.speed,
        inRest,
        blocked: this.cho.isOpen,
      })
      if (ev === 'start') this.log.push(`listen:start ${target?.spot.id}`)
      if (ev === 'interrupted') {
        this.log.push('listen:interrupted')
        hud.toast('……気配が、ふっと遠のいた。止まると、また聞こえる')
      }
      const met = target?.yokaiId ? this.d.progress.hasMet(target.yokaiId) : false
      const sub = target && !target.yokaiId ? `長押し・${clueWords(target.spot.clueId ? this.d.story.clues[target.spot.clueId] : undefined).kehai}` : met ? '長押し・また会いに' : '長押し・その場で止まる'
      this.listenBtn.show(!!target && !this.cho.isOpen, sub)
      this.listenBtn.setProgress(this.gauge.progress)
      // 夜はどの地点も、ほかは台本のない妖怪の地点と、いまは出ない寄り道の地点が、気配だけ（夜の言葉は白描の絵地図と同じ）
      hud.showPrompt(near && !target ? (canListenAtHome(this.timeOfDay) ? 'かすかな気配。まだ声は遠い' : HOME_NIGHT_KEHAI) : null)
      field.spots.setFocus(target?.spot.id ?? null, this.gauge.progress, 0)
      // 姿のない会話のあとは、残った霞をゆっくり引く（耳を澄ますと、また寄る）
      this.mistLinger *= Math.exp(-dt * 1.5)
      this.mistAmount = Math.max(this.gauge.progress, this.mistLinger)
      sound.setDuck(this.gauge.progress)
      if (ev === 'complete' && target) this.beginAppear(target)
    } else {
      this.listenBtn.show(false)
      hud.showPrompt(null)
    }

    const a = this.active
    if (a) {
      // カメラはアバターと夢の姿の間を見る。会話の枠（画面の下）に隠れないよう、見る点を少し手前に寄せる（二人が画面の上へ上がる）。
      // 姿のない会話（調べる地点）は、アバターとましろだけを、同じように少し上へ上げて見る（寄らない・向きも変えない）
      const fp = a.figure?.position ?? player.pos
      const fwd = this.d.rig.forward()
      const back = this.d.rig.dist * (window.innerHeight > window.innerWidth ? 0.14 : 0.1)
      this.focus.set((player.pos.x + fp.x) / 2 - fwd.x * back, (player.pos.y + fp.y) / 2 + 0.6, (player.pos.z + fp.z) / 2 - fwd.y * back)
      // 姿のない会話は、霞が寄るにつれて印が霞に溶ける
      if (!a.figure && this.phase !== 'parting') a.veil = Math.min(1, a.veil + dt / CLUE_APPEAR_SEC)
      field.spots.setFocus(a.spot.id, 0, Math.min(1, (a.figure ? a.figure.visibleAmount : a.veil) * 1.5))
    }
    if (this.phase === 'appearing') {
      this.mistAmount += (0.7 - this.mistAmount) * (1 - Math.exp(-dt * 2))
      sound.setDuck(0.9)
      if (a && this.phaseT >= (a.figure ? APPEAR_SEC : CLUE_APPEAR_SEC)) this.beginTalk()
    } else if (this.phase === 'talking') {
      this.mistAmount += (0.45 - this.mistAmount) * (1 - Math.exp(-dt * 2))
      sound.setDuck(0.75)
    } else if (this.phase === 'parting') {
      this.mistAmount += (0 - this.mistAmount) * (1 - Math.exp(-dt * 1.5))
      sound.setDuck(0)
      // 姿のない会話は、消える姿を待たずにすぐ終える（残った霞は歩きながら引く）
      if (!a || !a.figure || a.figure.visibleAmount <= 0.01) {
        field.spots.setFocus(null, 0, 0)
        this.mistLinger = this.mistAmount
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

  private beginAppear(target: Listenable): void {
    const { spot, script, yokaiId } = target
    const { player, rig, progress, story } = this.d
    const runner = new DialogueRunner(script, { progress, cards: story.cards, travel: 'yume', items: story.items, quests: story.quests })
    if (!yokaiId) {
      // 調べる地点: 姿は浮かばない。霞が寄り、印が溶けたら、ましろが話しはじめる（カメラは寄らない・向きも変えない）
      this.active = { spot, runner, veil: 0, piece: false }
      this.phase = 'appearing'
      this.phaseT = 0
      this.log.push(`appear ${spot.id} ${spot.role}`)
      player.walkTarget = null
      // 印の方を向いて聞く（印の真上に立っていたら、向きはそのまま）
      if (Math.hypot(spot.x - player.pos.x, spot.z - player.pos.z) > 0.8) player.faceHeading = Math.atan2(spot.x - player.pos.x, -(spot.z - player.pos.z))
      this.d.sound.bell(0.6)
      return
    }
    const figure = this.figureOf(yokaiId)
    if (!figure) return
    this.active = { spot, figure, runner, veil: 0, piece: false }
    this.phase = 'appearing'
    this.phaseT = 0
    this.log.push(spot.role === 'yokai' ? `appear ${spot.id}` : `appear ${spot.id} ${spot.role} ${yokaiId}`)
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
    // 妖怪のいない台本（調べる地点）は、ましろ（連れ）の名前
    const script = a.runner.script
    const name = script.yokaiId
      ? (this.d.story.yokai[script.yokaiId]?.name ?? '')
      : (Object.values(script.speakers).find((s) => s.role === 'companion')?.name ?? '')
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
    if (beat.kind === 'notice' && beat.notice.type === 'piece') a.piece = true
    this.dialogue.show(beat)
  }

  private endTalk(why: 'end' | 'closed'): void {
    const a = this.active
    this.dialogue.close()
    this.log.push(`talk:${why}`)
    if (!a) return
    this.phase = 'parting'
    this.phaseT = 0
    a.figure?.hide()
    this.gauge.disarm()
    if (this.savedDist !== null) {
      this.d.rig.distTarget = this.savedDist
      this.savedDist = null
    }
    if (this.savedYaw !== null) {
      this.d.rig.yawTarget = this.savedYaw
      this.savedYaw = null
    }
    // この会話でピースが入ったときだけ（調べる地点の札だけの会話や、前のピースをまだ見ていないだけのときは出さない）
    if (why === 'end' && a.piece && this.cho.news().mandala) this.d.hud.toast('曼荼羅帳に、ピースが一つ入った（右上の「帳」）', 4200)
  }

  /** 帳の「最初からやり直す」のあと（保存はもう消してあり、帳も閉じてある） */
  private afterReset(): void {
    this.gauge.reset()
    this.refreshMet()
    this.d.respawn()
    // 帳を開いている間はお知らせが隠れるので、閉じてから知らせる（アバターがはじめの位置に戻ったのも見える）
    this.d.hud.toast('最初からやり直した。はじめの場所に戻った', 4200)
    this.log.push('reset')
  }

  /** 確認用（with: 会話の相手の地点と役目。shown: いま印を出している調べる・寄り道の地点） */
  get debugState(): {
    phase: Phase
    gauge: number
    node: string
    busy: boolean
    figure: number
    mist: number
    with: string
    time: string
    shown: string[]
  } {
    const a = this.active
    return {
      phase: this.phase,
      gauge: this.gauge.progress,
      node: a?.runner.node ?? '',
      busy: this.busy,
      figure: a?.figure?.visibleAmount ?? 0,
      mist: this.mistAmount,
      with: a ? `${a.spot.id}:${a.spot.role}${a.figure ? '' : ':nofigure'}` : '',
      time: this.timeOfDay,
      shown: this.d.field.data.spots.filter((s) => s.role !== 'yokai' && this.d.field.spots.isVisible(s.id)).map((s) => s.id),
    }
  }
}
