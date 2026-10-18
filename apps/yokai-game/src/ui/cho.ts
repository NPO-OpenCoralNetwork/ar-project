// 帳（曼荼羅帳と縁帳）。夢の旅の箱庭・現の旅・白描の絵地図の三つのページで、この1つを使う
// （02 F-40・F-41、04 §3.3・§3.6、01-app-ux E1・E2）。three.js は読み込まない。
//
// - 曼荼羅帳: ピース（空白 → 白描 → 彩色 → 金の縁取り）と巻末の旅印。画面は yume/encounter/ui.ts の MandalaView。
// - 稽古（語り返し。04 §3.6）: 彩色済みのピースで、稽古の札（MandalaPieceDef.keiko）が2枚以上開いていれば、ピースの表示から始める。
//   絵解き鎮めの並べる遊び（EtokiGame）を、渦と風の演出を外して（plain）使う。手札は会話の絵解きと同じ作り方
//   （開いた札・まだ拾っていない札は白紙・まだ作っていない札（pending:）も白紙）。並べ終えると金の縁取り（goldPiece。家でも現地でも）。
// - 縁帳（懸場帳が手本。04 §3.3）: 会った妖怪ごとの頁。まだ会っていない妖怪は名前を出さず「まだ会っていない気配」とだけ。
//   - 縁は数字・棒で見せず、糸の形（気配＝糸くず、顔見知り＝一本の糸、なじみ＝より糸、語り仲間＝組紐、えにし＝結び目）と文字のラベルで見せる。
//     糸は抽象的な墨の線にする（房・飾り結び・袋など、お守りや縁結びに見える形は描かない。05・09）。
//   - 会話を最後まで話した回数（talks）は、糸の艶（4段）と小さな字にだけ使う。段階は変えない（F-24）。
//   - 「本作の創作」（人となり・好物・悩みの題）と「伝承の札（出典つき）」を分けて見せる。札の番号は出さない（F-43）。名産の札は伝承の札に並べない。
//   - 好物は、渡したあとで分かる（好物のない妖怪は、好物の行を出さない）。悩みは「抱えている」「解けた」の字だけ（数も進み具合の棒も出さない）。
//   - 一覧の上に持ち物（いま持っているもの）。
// - 「新」の印: 見たピース・縁を、状態ごとにフラグで覚える（seen:<ピース>@<状態>、seen:en:<妖怪>@<縁>）。
//   白描 → 彩色 → 金と上がると、また「新」になる（前の seen:<ピース> は白描を見た印として読む）。数は出さない。
//   帳のボタンの「新」はページが付ける（onNew）。連続の記録や、未読の数は作らない（04 §5.1）。

import { checkConditions, etokiHand } from '../core/story/dialogue'
import type { Gained, ProgressStore } from '../core/story/progress'
import { BOND_LABEL, type BondLevel, type EtokiSpec, type MandalaPieceDef, type PieceState, type Travel } from '../core/story/types'
import type { StoryPack } from '../data/story-pack'
import { ARTS, artToSvg } from '../yume/encounter/art'
import { cardHtml, EtokiGame, escapeHtml, type KeikoState, MandalaView } from '../yume/encounter/ui'

const STYLE = /* css */ `
/* 縁帳: 罫の入った帳面（懸場帳） */
.en { position: relative; flex: 1; min-height: 0; width: min(560px, 100%); margin-top: 6px; overflow-y: auto; overscroll-behavior: contain; color: #2a2622;
  background: linear-gradient(170deg, #fbf6e9, #f1e8d4); border-radius: 10px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35); padding: 12px 16px 20px; }
.en h3, .en h4 { margin: 0; font-family: var(--title-font); font-weight: 600; letter-spacing: 0.12em; }
.en .en-sec-h { font-size: 13px; color: rgba(42, 38, 34, 0.7); margin: 4px 0 6px; letter-spacing: 0.2em; }
.en-small { margin: 4px 0 0; font-size: 12px; line-height: 1.6; color: rgba(42, 38, 34, 0.72); }
.en :focus-visible { outline: 2px solid #b0603a; outline-offset: 2px; }
/* 持ち物 */
.en-items { padding-bottom: 10px; border-bottom: 1px solid rgba(42, 38, 34, 0.18); margin-bottom: 8px; }
.en-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.en-chip { font-family: var(--title-font); font-size: 14px; letter-spacing: 0.08em; padding: 3px 12px; border: 1px solid rgba(42, 38, 34, 0.35); border-radius: 4px; background: #fffdf7; }
/* 一覧（一行が一人。行全体がボタン） */
.en-list { list-style: none; margin: 0; padding: 0; }
.en-list li { border-bottom: 1px dashed rgba(42, 38, 34, 0.28); }
.en-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 60px; padding: 8px 4px; font: inherit; color: inherit; text-align: left; background: transparent; border: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.en-row:hover { background: rgba(255, 253, 247, 0.6); }
.en-row.unmet { cursor: default; color: rgba(42, 38, 34, 0.62); font-size: 13px; }
.en-row.unmet:hover { background: transparent; }
.en-th { flex: none; width: 100px; height: 30px; }
.en-th svg { width: 100%; height: 100%; display: block; overflow: visible; }
.en-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.en-name { font-family: var(--title-font); font-size: 16.5px; font-weight: 600; letter-spacing: 0.1em; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.en-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 12px; }
.en-level { font-family: var(--title-font); font-weight: 600; font-size: 13.5px; letter-spacing: 0.08em; }
.en-sheen { color: rgba(42, 38, 34, 0.72); }
.en-sheen::before { content: "艶・"; }
/* 会った所の印（字で「夢」「現地」。枠の形も変える: 夢は点線、現地は実線） */
.en-where { font-size: 11px; line-height: 1; padding: 3px 6px; border-radius: 3px; border: 1px dashed rgba(42, 38, 34, 0.5); color: rgba(42, 38, 34, 0.8); white-space: nowrap; }
.en-where.onsite { border-style: solid; border-color: rgba(42, 38, 34, 0.7); }
.en-orig { font-family: var(--ui-font); font-size: 10.5px; font-weight: 400; letter-spacing: 0.04em; padding: 1px 6px; border: 1px solid #7a4a2a; color: #7a4a2a; border-radius: 3px; }
.en-new { flex: none; min-width: 16px; height: 16px; border-radius: 8px; background: #b5523b; color: #fff; font-size: 10px; line-height: 16px; text-align: center; padding: 0 4px; }
.en-go { flex: none; font-size: 20px; color: rgba(42, 38, 34, 0.5); }
/* 妖怪の頁 */
.en-back { font: inherit; font-size: 13px; color: #2a2622; background: rgba(255, 253, 247, 0.8); border: 1px solid rgba(42, 38, 34, 0.25); border-radius: 9px; min-height: 44px; padding: 0 14px; cursor: pointer; }
.en-hd { display: flex; gap: 14px; align-items: center; margin: 10px 0 6px; }
.en-art { flex: none; width: 72px; height: 108px; background: #fffdf7; border: 1px solid rgba(42, 38, 34, 0.25); border-radius: 4px; }
.en-hd h3 { font-size: 22px; letter-spacing: 0.16em; }
.en-hd h3:focus { outline: none; }
.en-hd h3:focus-visible { outline: 2px solid #b0603a; outline-offset: 2px; }
.en-badges { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
.en-bond { display: grid; grid-template-columns: 150px 1fr; gap: 4px 14px; align-items: center; padding: 10px 0 12px; border-top: 1px solid rgba(42, 38, 34, 0.2); border-bottom: 1px solid rgba(42, 38, 34, 0.2); }
.en-bond .en-th { width: 150px; height: 46px; grid-row: span 2; }
.en-bond-l { margin: 0; display: flex; align-items: baseline; gap: 8px; }
.en-bond-l b { font-family: var(--title-font); font-size: 19px; letter-spacing: 0.12em; }
.en-bond-l span { font-size: 12.5px; color: rgba(42, 38, 34, 0.72); }
.en-bond .en-sheen-l { margin: 0; font-size: 12.5px; color: rgba(42, 38, 34, 0.8); }
.en-bond .en-small { grid-column: 1 / -1; }
.en-sec { margin-top: 14px; }
/* 本作の創作（会話の枠と同じ、角の丸いふつうの枠。右上に「創作」の印） */
.en-sosaku { position: relative; background: rgba(255, 253, 248, 0.92); border: 1px solid rgba(42, 38, 34, 0.22); border-radius: 14px; padding: 10px 14px 12px; }
.en-tag { position: absolute; top: 10px; right: 12px; font-size: 10.5px; color: rgba(42, 38, 34, 0.68); border: 1px solid rgba(42, 38, 34, 0.25); border-radius: 999px; padding: 1px 8px; }
.en-sosaku dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 14px; line-height: 1.7; }
.en-sosaku dt { font-size: 12px; color: rgba(42, 38, 34, 0.7); padding-top: 2px; white-space: nowrap; }
.en-sosaku dd { margin: 0; font-family: var(--title-font); text-wrap: pretty; word-break: auto-phrase; }
.en-sosaku dd.unknown { font-family: var(--ui-font); font-size: 13px; color: rgba(42, 38, 34, 0.62); }
.en-quests { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.en-quests li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.en-qs { font-family: var(--ui-font); font-size: 11px; padding: 1px 7px; border-radius: 3px; border: 1px dashed rgba(42, 38, 34, 0.55); white-space: nowrap; }
.en-qs.done { border-style: solid; }
/* 伝承の札（和紙の札をそのまま並べる。札の番号は出さない） */
.en-cards { display: grid; gap: 10px; }
.en-cards .yc-card { width: 100%; max-height: none; overflow: visible; transform: none; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 4px 12px rgba(30, 20, 10, 0.16); }
.en-cards .yc-card .yc-title { font-size: 17px; margin: 6px 0 8px; }
.en-cards .yc-card .yc-body { font-size: 15px; }
@media (max-width: 420px) {
  .en { padding: 10px 12px 18px; }
  .en-bond { grid-template-columns: 120px 1fr; }
  .en-bond .en-th { width: 120px; height: 36px; }
  .en-th { width: 86px; height: 26px; }
}
`

let styled = false
function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = STYLE
  document.head.appendChild(s)
}

// ---------------------------------------------------------------- 縁の糸

/** 糸の形の名前（04 §3.3。ラベルと一緒に出す） */
const THREAD_NAME: Record<BondLevel, string> = {
  kehai: '糸くず',
  kaomishiri: '一本の糸',
  najimi: 'より糸',
  katarinakama: '組紐',
  enishi: '結び目',
}

/** 糸の艶の段（会話を最後まで話した回数から。0〜1回: なし、2〜4回、5〜9回、10回から）。縁の段階は変えない */
export function sheenStep(talks: number): 0 | 1 | 2 | 3 {
  return talks >= 10 ? 3 : talks >= 5 ? 2 : talks >= 2 ? 1 : 0
}

/** 艶の小さな字（色だけにしない）。tag は一覧の短い字、line は頁の文 */
const SHEEN: { tag: string; line: string }[] = [
  { tag: '', line: '' },
  { tag: 'ときどき話す', line: '糸に、うっすら艶が出てきた（ときどき話す）。' },
  { tag: 'よく話す', line: '糸に、艶がある（よく話す）。' },
  { tag: '話しなれた', line: '糸が、つややかに光る（話しなれた）。' },
]

const INK = '#3a332d'
/** 縁帳の紙の色（撚りの「上を通る」糸の下に、紙の色の隙間を描いて前後を見せる） */
const PAPER = '#f6efdf'
/** 艶の光（やわらかくにじませる。filter の id は糸ごとに変える） */
const SHEEN_GLOW = '#e2c27a'
let threadUid = 0

const toD = (pts: [number, number][]): string => `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`

/**
 * 撚った糸（n 本の糸が、同じ軸のまわりを回る）。手前を通る区間（front）と奥を通る区間（back）に分けて返す。
 * 全体はゆるく波打ち、撚りは両端で細る（端に房や飾りは付けない）
 */
function twist(n: number, amp: number, period: number): { back: string[]; front: string[]; axis: string } {
  const x0 = 8
  const x1 = 112
  const wave = (x: number) => 19 + Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 2) * 2.6
  const back: string[] = []
  const front: string[] = []
  for (let s = 0; s < n; s++) {
    const ph = (s * Math.PI * 2) / n
    let seg: [number, number][] = []
    let cur: boolean | null = null
    for (let x = x0; x <= x1 + 0.01; x += 0.75) {
      const t = (x - x0) / (x1 - x0)
      const taper = Math.min(1, t * 7, (1 - t) * 7)
      const th = ((x - x0) / period) * Math.PI * 2 + ph
      const y = wave(x) + amp * taper * Math.sin(th)
      const isFront = Math.cos(th) > 0
      if (cur !== null && isFront !== cur) {
        ;(cur ? front : back).push(toD(seg))
        seg = [seg[seg.length - 1]]
      }
      cur = isFront
      seg.push([x, y])
    }
    if (seg.length > 1) (cur ? front : back).push(toD(seg))
  }
  const axis: [number, number][] = []
  for (let x = x0; x <= x1 + 0.01; x += 2) axis.push([x, wave(x)])
  return { back, front, axis: toD(axis) }
}

/**
 * 縁の糸（墨の線の抽象的な形。04 §3.3）。気配＝糸くず、顔見知り＝一本の糸、なじみ＝より糸（2本を撚る）、語り仲間＝組紐（3本を組む）、
 * えにし＝結び目（1本の糸が、ひと巻きして自分の上を通る）。
 * sheen は艶の段（0〜3）: 糸のまわりにやわらかな光がにじみ、糸の上の白い照りが段ごとに広がる（濃さだけでなく、照りの長さでも分かる）。
 * お守りの紐・縁結びの飾りに見えないよう、房・蝶結び・袋は描かない。
 */
export function threadSvg(level: BondLevel, sheen: number): string {
  const step = Math.max(0, Math.min(3, sheen))
  const frac = [0, 0.34, 0.67, 1][step]
  const line = (d: string, w: number, op = 1) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>`
  // 手前を通る糸の下の、紙の色の隙間（奥の糸がそこで途切れて見える）
  const gap = (d: string, w: number) => `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${w + 1.8}"/>`
  const shine = (d: string, w: number, extra = '') => `<path d="${d}" fill="none" stroke="#fffaf0" stroke-width="${w}" stroke-opacity="0.95" stroke-linecap="round"${extra}/>`
  // 一本の線の照り（真ん中から、段ごとに長く）
  const streak = (d: string) => shine(d, 0.8, ` pathLength="100" stroke-dasharray="0 ${(50 - frac * 40).toFixed(1)} ${(frac * 80).toFixed(1)} 200"`)
  const paths: string[] = []
  const shines: string[] = []
  let axis = ''
  if (level === 'kehai') {
    // 糸くず: ちいさく縮れた、ほどけた繊維（艶は付けない）
    paths.push(
      line('M46,21 C49,13 58,13 58,19 C58,25 50,26 49,21 C48,15 60,12 65,17 C70,21 67,27 62,26 C57,25 60,18 67,18 C72,18 74,22 77,20', 1.4, 0.75),
      line('M38,24 C41,23 43,24 46,23', 1.1, 0.5),
    )
  } else if (level === 'kaomishiri') {
    axis = 'M6,21 C26,13 44,27 62,19 C80,11 98,23 114,17'
    paths.push(line(axis, 2.2))
    if (frac) shines.push(streak(axis))
  } else if (level === 'najimi' || level === 'katarinakama') {
    const tw = level === 'najimi' ? twist(2, 3.2, 15) : twist(3, 4.4, 17)
    const w = level === 'najimi' ? 1.8 : 1.7
    axis = tw.axis
    for (const d of tw.back) paths.push(line(d, w, 0.85))
    for (const d of tw.front) paths.push(gap(d, w), line(d, w))
    // 照りは、手前を通る区間ごとに（真ん中から、段ごとに広く）
    if (frac)
      for (const d of tw.front) {
        const xs = d
          .slice(1)
          .split('L')
          .map((p) => Number(p.split(',')[0]))
        if (Math.abs((xs[0] + xs[xs.length - 1]) / 2 - 60) <= frac * 52) shines.push(shine(d, 0.6))
      }
  } else {
    axis = 'M6,23 C22,24 38,24 52,22 C63,20 68,9 60,6 C52,3 45,10 49,16 C53,23 62,27 72,25 C88,22 101,20 114,20'
    // 巻いた糸が、自分の上を通る所だけ描き直す（紙の色の隙間で、上下が分かる）
    paths.push(line(axis, 2.2), gap('M50,17.5 C52,21 55,23 59,24.6', 2.2), line('M49.5,16.5 C52,21 56,24 61,25.5', 2.2))
    if (frac) shines.push(streak(axis))
  }
  let glow = ''
  if (frac && axis) {
    const id = `en-sheen-${++threadUid}`
    // にじみの範囲は、図の座標で広めに取る（割合で取ると、細い糸では上下が四角く切れて見える）
    glow =
      `<defs><filter id="${id}" filterUnits="userSpaceOnUse" x="-14" y="-16" width="148" height="68"><feGaussianBlur stdDeviation="${(1.6 + step * 0.4).toFixed(1)}"/></filter></defs>` +
      `<path d="${axis}" fill="none" stroke="${SHEEN_GLOW}" stroke-opacity="${[0, 0.45, 0.6, 0.75][step]}" stroke-width="${4 + step * 1.5}" stroke-linecap="round" filter="url(#${id})"/>`
  }
  // data-thread・data-sheen は確認用（Playwright から読む）
  return `<svg viewBox="0 0 120 36" aria-hidden="true" focusable="false" data-thread="${level}" data-sheen="${frac ? step : 0}">${glow}${paths.join('')}${shines.join('')}</svg>`
}

// ---------------------------------------------------------------- 帳

export interface ChoOptions {
  root: HTMLElement
  story: StoryPack
  progress: ProgressStore
  /** このページの旅（稽古の金の縁取りに残す。家の箱庭・白描の絵地図は yume、現地は utsutsu） */
  travel: Travel
  /** 巻末の旅印に出す節の土地（地域パックの id。iwakuraji・test） */
  stampRegion: string
  /** 稽古の鈴（なければ鳴らさない） */
  sound?: { bell(v?: number): void }
  /** 「新」の印が変わった（帳のボタンに「新」の字を出す。数は出さない） */
  onNew?(on: boolean): void
  /** 最初からやり直した（保存はもう消してあり、帳も閉じてある） */
  onReset?(): void
}

export interface Cho {
  /** tab: 'mandala'（曼荼羅帳）か 'en'（縁帳）。省くと前に開いていた頁 */
  open(tab?: 'mandala' | 'en'): void
  close(): void
  readonly isOpen: boolean
  /** まだ見ていないもの（曼荼羅帳のピース・縁帳の縁） */
  news(): { mandala: boolean; en: boolean }
}

/** 稽古のましろの言葉（【創作】。会話の枠と同じ「台本・創作」の印で出る） */
const keikoLines = (name: string): NonNullable<EtokiSpec['lines']> => ({
  start: `おぼえている順に、札を並べて、${name}に語り返してみよう。`,
  right: '……うん。その次は？',
  wrong: 'あれ、順番がちがうみたい。札の言葉を、よく読んでみよう。',
  wrongAgain: '話のはじまりは、どの札だったかな。',
  blank: 'ここは、まだ拾っていない話。……あとで、拾いに行こう。',
  pending: 'この札は、まだ白紙のまま。',
  done: `……語り返せた。${name}にも、ちゃんと届いたと思う。`,
})

export function createCho(o: ChoOptions): Cho {
  injectStyle()
  const { story, progress, travel } = o
  const pieces = new Map<string, MandalaPieceDef>()
  for (const t of story.mandala.tiers) for (const p of t.pieces) pieces.set(p.id, p)

  // ---- 「新」の印（状態ごと）
  const pieceSeenKey = (id: string, st: PieceState) => `seen:${id}@${st}`
  const pieceIsNew = (id: string): boolean => {
    const st = progress.pieceOf(id)
    if (st === 'empty') return false
    // 前の印（seen:<ピース>）は、白描を見た印として読む
    return !progress.flag(pieceSeenKey(id, st)) && !(st === 'hakubyo' && progress.flag(`seen:${id}`))
  }
  const bondSeenKey = (id: string, lv: BondLevel) => `seen:en:${id}@${lv}`
  const bondIsNew = (id: string): boolean => progress.hasMet(id) && !progress.flag(bondSeenKey(id, progress.bondOf(id)))
  const met = () => Object.values(story.yokai).filter((y) => progress.hasMet(y.id))
  const news = () => ({
    mandala: [...pieces.keys()].some(pieceIsNew),
    en: met().some((y) => bondIsNew(y.id)),
  })

  // ---- 稽古
  const keikoState = (id: string): KeikoState => {
    const keys = pieces.get(id)?.keiko
    if (!keys?.length) return 'none'
    const held = keys.filter((k) => !k.startsWith('pending:') && !!story.cards[k] && progress.isCardOpened(k)).length
    return held >= 2 ? 'ready' : 'few'
  }
  let game: EtokiGame | null = null
  let gamePiece = ''
  const quitGame = () => {
    if (!game) return
    // 並べ終えて、ましろの終わりの言葉を読んでいる間なら、やめずに終える（「語り返せた」と言ったのに金が入らない、にしない）
    if (game.finishNow()) return
    game.dispose()
    game = null
    view.openPiece(gamePiece)
  }
  const startKeiko = (id: string) => {
    const p = pieces.get(id)
    if (!p?.keiko || keikoState(id) !== 'ready' || game) return
    const name = (p.yokaiId ? story.yokai[p.yokaiId]?.name : undefined) ?? p.label ?? ''
    // 手札（話の順）。会話の絵解きと同じ作り方: 開いた札、まだ拾っていない札は白紙、まだ作っていない札（pending:）も白紙
    const hand = etokiHand(p.keiko, story.cards, progress)
    const spec: EtokiSpec = {
      type: 'etoki',
      title: `${name}の話`,
      slots: p.keiko.map((k) => (k.startsWith('pending:') ? { pending: k.slice('pending:'.length) } : { card: k })),
      plain: true,
      lines: keikoLines(name),
    }
    gamePiece = id
    game = new EtokiGame(
      o.root,
      spec,
      hand,
      () => {
        game = null
        // 彩色のピースなら金の縁取り（家でも現地でも）。もう金なら、語り返しただけ
        const gold = progress.goldPiece(id, travel)
        if (gold) o.sound?.bell(0.9)
        view.openPiece(id, gold ? '語り返したら、ピースに金の縁取りが入った。' : '語り返した。')
      },
      quitGame,
      o.sound,
      { kicker: '語り返しの稽古', quitLabel: '稽古をやめる' },
    )
  }
  // ---- 縁帳
  const en = new EnchoView(o.story, progress, travel, bondSeenKey, bondIsNew)

  const view = new MandalaView(
    o.root,
    story.mandala,
    {
      piece: (id) => progress.pieceOf(id),
      isNew: pieceIsNew,
      // 開いた札だけ（ピースだけ先に入っても、札の本文は会話で開くまで見せない）
      card: (id) => (progress.isCardOpened(id) ? story.cards[id] : undefined),
      // 家では枠だけ見える（旅印は現地で節を終えたときだけ。02 F-45）
      stamps: () =>
        story.sections
          .filter((s) => s.region === o.stampRegion)
          .map((s) => ({ id: s.id, title: s.title, stampTitle: s.stampTitle, motif: s.stampMotif, at: progress.stampOf(s.id)?.at ?? null })),
      keiko: keikoState,
    },
    {
      close: () => cho.close(),
      reset: () => {
        progress.reset()
        en.reset()
        cho.close()
        o.onReset?.()
      },
      seen: (id) => {
        const st = progress.pieceOf(id)
        if (st !== 'empty') progress.setFlag(pieceSeenKey(id, st), true)
      },
      keiko: startKeiko,
    },
    [{ id: 'en', label: '縁帳', panel: en.el, show: () => en.render(), isNew: () => news().en, newLabel: '新しい縁がある' }],
  )

  // 稽古の間の Escape は、稽古をやめてピースの表示へ戻る（帳は閉じない。帳の側は、遊びの間と defaultPrevented の Escape を受けない）
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game && !e.defaultPrevented) {
      e.preventDefault()
      quitGame()
    }
  })

  // 「新」の印: 進み具合が変わるたびに見直す（変わったときだけページへ知らせる）
  let last: boolean | null = null
  const refreshNew = () => {
    const n = news()
    const any = n.mandala || n.en
    if (any !== last) {
      last = any
      o.onNew?.(any)
    }
    if (view.isOpen) view.refreshMarks()
  }
  progress.onChange(refreshNew)
  refreshNew()

  const cho: Cho = {
    open(tab) {
      if (view.isOpen || game) return
      view.open(tab)
    },
    close() {
      // 稽古の途中なら、遊びも閉じる（道中に入ったときなど）
      if (game) {
        game.dispose()
        game = null
      }
      if (!view.isOpen) return
      view.close()
      // 次に開いたときの縁帳は、一覧から（新しい縁が、すぐ見えるように）
      en.reset()
    },
    get isOpen() {
      return view.isOpen || !!game
    },
    news,
  }
  return cho
}

// ---------------------------------------------------------------- 縁帳

/** 縁帳の頁（一覧と、妖怪ごとの頁）。帳のタブの中身 */
class EnchoView {
  readonly el: HTMLDivElement
  private readonly box: HTMLDivElement
  /** いま開いている妖怪の頁（null なら一覧） */
  private yokai: string | null = null

  constructor(
    private readonly story: StoryPack,
    private readonly progress: ProgressStore,
    private readonly travel: Travel,
    private readonly seenKey: (id: string, lv: BondLevel) => string,
    private readonly isNew: (id: string) => boolean,
  ) {
    this.el = document.createElement('div')
    this.box = document.createElement('div')
    this.box.className = 'en'
    this.el.appendChild(this.box)
    this.box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-yokai], [data-act="back"]')
      if (!t) return
      if (t.dataset.act === 'back') this.showList(this.yokai)
      else if (t.dataset.yokai) this.showYokai(t.dataset.yokai)
    })
  }

  /** やり直したら、一覧から */
  reset(): void {
    this.yokai = null
  }

  /** 頁を開いたとき（タブを選んだとき・帳を開いたとき） */
  render(): void {
    if (this.yokai && this.progress.hasMet(this.yokai)) this.showYokai(this.yokai, false)
    else this.showList(null, false)
  }

  /** 一覧。from は戻ってきた妖怪の頁（その行へキーボードの位置を戻す） */
  private showList(from: string | null, focus = true): void {
    this.yokai = null
    const p = this.progress
    const items = Object.values(this.story.items).filter((it) => p.itemState(it.id) === 'held')
    const met = Object.values(this.story.yokai).filter((y) => p.hasMet(y.id))
    const unmet = Object.values(this.story.yokai).some((y) => !p.hasMet(y.id))
    const rows = met.map((y) => {
      const lv = p.bondOf(y.id)
      const step = sheenStep(p.talksWith(y.id))
      const w = whereMet(p.get().yokai[y.id])
      const fresh = this.isNew(y.id)
      const said = [
        `${y.name}。縁は「${BOND_LABEL[lv]}」（${THREAD_NAME[lv]}）`,
        step ? SHEEN[step].tag : '',
        y.original ? '本作オリジナル' : '',
        [w.dream ? '夢' : '', w.site ? '現地' : ''].filter(Boolean).join('と') + 'で会った',
        fresh ? '新しい' : '',
      ]
        .filter(Boolean)
        .join('。')
      return `<li><button class="en-row" type="button" data-yokai="${escapeHtml(y.id)}" aria-label="${escapeHtml(said)}">
        <span class="en-th">${threadSvg(lv, step)}</span>
        <span class="en-main">
          <span class="en-name">${escapeHtml(y.name)}${y.original ? '<span class="en-orig">本作オリジナル</span>' : ''}</span>
          <span class="en-meta"><b class="en-level">${escapeHtml(BOND_LABEL[lv])}</b>${step ? `<span class="en-sheen">${escapeHtml(SHEEN[step].tag)}</span>` : ''}${w.dream ? '<span class="en-where">夢</span>' : ''}${w.site ? '<span class="en-where onsite">現地</span>' : ''}</span>
        </span>
        ${fresh ? '<span class="en-new" aria-hidden="true">新</span>' : ''}
        <span class="en-go" aria-hidden="true">›</span>
      </button></li>`
    })
    if (unmet)
      rows.push(`<li><div class="en-row unmet"><span class="en-th">${threadSvg('kehai', 0)}</span><span class="en-main">まだ会っていない気配</span></div></li>`)
    this.box.innerHTML = `
      <section class="en-items" aria-labelledby="en-items-h">
        <h3 class="en-sec-h" id="en-items-h">持ち物</h3>
        ${items.length ? `<ul class="en-chips">${items.map((it) => `<li class="en-chip">${escapeHtml(it.name)}</li>`).join('')}</ul><p class="en-small">持ち物は、会った相手との話の中で渡せる。</p>` : '<p class="en-small">いまは、何も持っていない。</p>'}
      </section>
      <section aria-labelledby="en-list-h">
        <h3 class="en-sec-h" id="en-list-h">縁を結んだ妖怪</h3>
        ${met.length ? '' : '<p class="en-small">まだ、誰とも縁を結んでいない。耳を澄ますと、誰かに会えるかもしれない。</p>'}
        <ul class="en-list">${rows.join('')}</ul>
      </section>`
    this.box.scrollTop = 0
    if (focus) {
      const back = from ? this.box.querySelector<HTMLElement>(`[data-yokai="${CSS.escape(from)}"]`) : null
      ;(back ?? this.box.querySelector<HTMLElement>('.en-row[data-yokai]'))?.focus({ preventScroll: false })
    }
  }

  /** 妖怪の頁。開いたら、いまの縁の段階を見た印をつける（「新」を消す） */
  private showYokai(id: string, focus = true): void {
    const p = this.progress
    const y = this.story.yokai[id]
    if (!y) return
    this.yokai = id
    const lv = p.bondOf(id)
    const step = sheenStep(p.talksWith(id))
    const w = whereMet(p.get().yokai[id])
    // 姿は白描。現地で会っていれば彩色（現地で見た姿）
    const art = y.art ? ARTS[y.art] : undefined
    const artSvg = art ? `<svg class="en-art" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.1, 1, w.site)}</svg>` : ''
    // 伝承の札（開いた札だけ。この妖怪の札。了承待ちの札は開かないので出ない。名産の札は伝承の札の欄に入れない）
    const cards = Object.values(this.story.cards).filter((c) => c.yokaiId === id && c.kind !== '名産' && p.isCardOpened(c.id))
    // 好物（渡したあとで分かる。好物のない妖怪は、行ごと出さない）
    const likes = y.likes && p.itemState(y.likes) === 'given' ? this.story.items[y.likes]?.name : undefined
    // 悩み（この妖怪がかかわる、始まった悩み）。字は「抱えている」「解けた」だけ
    const quests = this.story.quests
      .filter((q) => q.yokai.includes(id))
      .map((q) => {
        const done = checkConditions(q.done, p, this.travel, q.yokai[0])
        const started = checkConditions(q.start, p, this.travel, q.yokai[0])
        return done || started ? { title: q.title, done } : null
      })
      .filter((q): q is { title: string; done: boolean } => !!q)
    const homeCap = this.travel === 'yume' && lv === 'najimi'
    this.box.innerHTML = `
      <button class="en-back" type="button" data-act="back"><span aria-hidden="true">‹ </span>縁帳の一覧へ</button>
      <div class="en-hd">
        ${artSvg}
        <div>
          <h3 tabindex="-1">${escapeHtml(y.name)}</h3>
          <p class="en-badges">${y.original ? '<span class="en-orig">本作オリジナル</span>' : ''}${w.dream ? '<span class="en-where">夢で会った</span>' : ''}${w.site ? '<span class="en-where onsite">現地で会った</span>' : ''}</p>
        </div>
      </div>
      <section class="en-bond" aria-label="縁">
        <span class="en-th">${threadSvg(lv, step)}</span>
        <p class="en-bond-l"><b>${escapeHtml(BOND_LABEL[lv])}</b><span>${escapeHtml(THREAD_NAME[lv])}</span></p>
        <p class="en-sheen-l">${step ? escapeHtml(SHEEN[step].line) : '話すほど、糸に艶が出る。'}</p>
        <p class="en-small">縁は、悩みを解いたり好物を渡したりすると深まることがある。話した数では深まらず、糸の艶だけが増える。${homeCap ? '家（夢の旅）で結べる縁は「なじみ」まで。この先は、現地で。' : ''}</p>
      </section>
      <section class="en-sec en-sosaku" aria-labelledby="en-sosaku-h">
        <h4 class="en-sec-h" id="en-sosaku-h">本作の創作</h4>
        <span class="en-tag" title="本作の創作（伝承の事実は「伝承の札」で示します）">【創作】</span>
        <dl>
          <dt>人となり</dt>${y.profile ? `<dd>${escapeHtml(y.profile)}</dd>` : '<dd class="unknown">まだよく知らない</dd>'}
          ${y.likes ? `<dt>好物</dt>${likes ? `<dd>${escapeHtml(likes)}</dd>` : '<dd class="unknown">まだ知らない</dd>'}` : ''}
          <dt>悩み</dt>${
            quests.length
              ? `<dd><ul class="en-quests">${quests.map((q) => `<li>${escapeHtml(q.title)}<span class="en-qs${q.done ? ' done' : ''}">${q.done ? '解けた' : '抱えている'}</span></li>`).join('')}</ul></dd>`
              : '<dd class="unknown">まだ聞いていない</dd>'
          }
        </dl>
      </section>
      <section class="en-sec" aria-labelledby="en-lore-h">
        <h4 class="en-sec-h" id="en-lore-h">伝承の札（出典つき）</h4>
        ${cards.length ? `<div class="en-cards">${cards.map((c) => `<article class="yc-card">${cardHtml(c, { heading: 'h5' })}</article>`).join('')}</div>` : '<p class="en-small">まだ札は開いていない。話を聞くと、札が開く。</p>'}
      </section>`
    this.box.scrollTop = 0
    // いまの縁の段階を見た（「新」を消す）
    p.setFlag(this.seenKey(id, lv), true)
    if (focus) (this.box.querySelector('.en-hd h3') as HTMLElement | null)?.focus({ preventScroll: true })
  }
}

/**
 * 会った所（夢・現地）。夢は、夢で初めて会った印（dreamMet。現地で会い直しても残る）で分かる。
 * 現地は、現地で得た印（会った・最後に会った・縁が上がった）のどれかで分かる
 */
function whereMet(y: { met?: Gained; dreamMet?: Gained; lastMet?: Gained; bondGained?: Gained } | undefined): { dream: boolean; site: boolean } {
  return { dream: !!y?.dreamMet, site: [y?.met, y?.lastMet, y?.bondGained].some((g) => g?.onsite === true) }
}
