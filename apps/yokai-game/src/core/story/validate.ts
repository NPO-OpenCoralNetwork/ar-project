// 段階4b の物語データの点検（読み込み時。story-pack.ts が problems に足す。npm run check:story で見る）。描画に依存しない。
// validateScript（台本ごと）・validatePartners（地域パック）とは別に呼ぶ。
//
// 見るもの:
// 1. 監修と了承待ち（02 F-71）: review は下書き・監修中・監修済みだけ。了承待ちは needsConsent（true だけ）。了承待ちの札は題・本文を空に。
// 2. 札の topics: 雷鳥の札は raicho、権現・阿弥陀の札は kami。ピースの札・稽古に、両方を混ぜない（04 §3.6）。
// 3. 曼荼羅: 名前のあるピースは6つ。時間のピース（time）は TIME_PIECES と同じで、稽古の札が2枚以上。hint の鍵は白描・彩色・金だけ。
// 4. 妖怪の夜話の台本: 種類 yobanashi で、同じ妖怪の台本。
// 5. 台本の外の条件（悩み・節・調べる地点・出現の表）: 知っている種類だけ。metToday は使えない（時計が無い）。
// 6. 悩み: 振り返りの一言（recap）がある。
// 7. 便り（validateTayori）・8. 今日の絵解き（validateEtokiFile）。
// 9. 書かない言葉（lintText）: 遊ぶ人に見える文だけ（札の出典・note は見ない）。書かない名前はどこでも。
//    雷鳥は便り・夜話・気配の一行・絵解き、罪悪感・夜の外出の言葉は便り・ましろの便り・気配の一行・夜話・絵解きで見る。

import { isKnownCondition, isPendingConsent } from './dialogue'
import { validateEtokiFile } from './etoki-card'
import { validateTayori } from './letters'
import { lintText } from './text'
import { type AppearanceTable, type ClueDef, type Condition, type SectionDef, type StoryData, TIME_PIECES } from './types'

export interface StoryCheckInput extends StoryData {
  sections: SectionDef[]
  clues: Record<string, ClueDef>
  appearance: AppearanceTable
}

const REVIEW_STATES: readonly unknown[] = ['下書き', '監修中', '監修済み']
const HINT_KEYS: readonly string[] = ['hakubyo', 'saishiki', 'kin']
/** 名前のあるピースの数（6ピース。04 §3.6） */
const NAMED_PIECES = 6

/** 段階4b の点検（problems に足す文）。validateScript・validatePartners とは別に呼ぶ */
export function validateStory4b(d: StoryCheckInput): string[] {
  const errs: string[] = []
  const review = (v: unknown, where: string) => {
    if (v === '了承待ち') errs.push(`${where}: 了承待ちは needsConsent で持つ（02 F-71）`)
    else if (!REVIEW_STATES.includes(v)) errs.push(`${where}: 監修の状態 ${String(v)} は知らない（下書き・監修中・監修済み）`)
  }
  const consent = (v: unknown, where: string) => {
    if (v !== undefined && v !== true) errs.push(`${where}: needsConsent は true だけ`)
  }

  // 1. 監修と了承待ち
  for (const c of Object.values(d.cards)) {
    review(c.review, `札 ${c.id}`)
    consent(c.needsConsent, `札 ${c.id}`)
    if (c.needsConsent === true && (c.title !== '' || c.body !== '')) errs.push(`札 ${c.id}: 了承待ちの札は、題と本文を空にする（04 §5.2）`)
  }
  for (const s of Object.values(d.scripts)) {
    review(s.review, `台本 ${s.id}`)
    consent(s.needsConsent, `台本 ${s.id}`)
  }
  review(d.tayori?.review, '便り（tayori.json）')
  review(d.etoki?.review, '今日の絵解き（etoki.json）')
  for (const l of d.tayori?.letters ?? []) consent(l.needsConsent, `便り ${l.id}`)

  // 2. 札の topics（雷鳥と神仏を並べない）
  const topicOf = (id: string) => d.cards[id]?.topics ?? []
  for (const c of Object.values(d.cards)) {
    const text = `${c.title}\n${c.body}`
    if (/雷鳥|ライチョウ/.test(text) && !c.topics?.includes('raicho')) errs.push(`札 ${c.id}: 雷鳥の札には topics に raicho を書く`)
    if (/権現|阿弥陀/.test(text) && !c.topics?.includes('kami')) errs.push(`札 ${c.id}: 権現・阿弥陀の札には topics に kami を書く`)
    for (const t of c.topics ?? []) if (t !== 'raicho' && t !== 'kami') errs.push(`札 ${c.id}: topics ${String(t)} は知らない`)
  }

  // 3. 曼荼羅（6ピース・時間のピース・hint）
  const pieces = d.mandala.tiers.flatMap((t) => t.pieces)
  const named = pieces.filter((p) => !!p.label)
  if (named.length !== NAMED_PIECES) errs.push(`曼荼羅: 名前のあるピースは${NAMED_PIECES}つ（いま ${named.length}）`)
  const timeIds = new Set(pieces.filter((p) => p.time !== undefined).map((p) => p.id))
  for (const p of pieces) if (p.time !== undefined && p.time !== true) errs.push(`ピース ${p.id}: time は true だけ`)
  const sameTime = timeIds.size === TIME_PIECES.size && [...timeIds].every((id) => TIME_PIECES.has(id))
  if (!sameTime) errs.push(`曼荼羅: 時間のピース（time）は ${[...TIME_PIECES].join('・')} だけ（いま ${[...timeIds].join('・') || 'なし'}。types.ts の TIME_PIECES と同じにする）`)
  for (const p of pieces) {
    if (p.time && (p.keiko?.length ?? 0) < 2) errs.push(`ピース ${p.id}: 時間のピースには、稽古の札を2枚以上`)
    for (const k of Object.keys(p.hint ?? {})) if (!HINT_KEYS.includes(k)) errs.push(`ピース ${p.id}: hint の鍵 ${k} は知らない（hakubyo・saishiki・kin）`)
    for (const [k, v] of Object.entries(p.hint ?? {})) if (typeof v !== 'string' || !v) errs.push(`ピース ${p.id}: hint ${k} が文字でない`)
    for (const [key, list] of [
      ['札', p.cardIds ?? []],
      ['稽古', p.keiko ?? []],
    ] as const) {
      const ts = list.flatMap(topicOf)
      if (ts.includes('raicho') && ts.includes('kami')) errs.push(`ピース ${p.id}: ${key}に、雷鳥の札と神仏の札を混ぜない（04 §3.6）`)
    }
  }

  // 4. 妖怪の夜話の台本
  for (const y of Object.values(d.yokai)) {
    if (y.yobanashi === undefined) continue
    const s = d.scripts[y.yobanashi]
    if (!s) errs.push(`妖怪 ${y.id}: 夜話の台本 ${y.yobanashi} がない`)
    else if (s.kind !== 'yobanashi') errs.push(`妖怪 ${y.id}: 夜話の台本 ${y.yobanashi} の種類が yobanashi でない`)
    else if (s.yokaiId !== y.id) errs.push(`妖怪 ${y.id}: 夜話の台本 ${y.yobanashi} の妖怪が ${s.yokaiId ?? '(なし)'}`)
  }

  // 5. 台本の外の条件（知っている種類だけ。metToday は時計が無いので使えない）
  const outside = (conds: Condition[] | undefined, where: string) => {
    for (const c of (conds ?? []) as unknown[]) {
      if (!isKnownCondition(c)) errs.push(`${where}: 条件 ${JSON.stringify(c)} は知らない（種類か形が違う）`)
      else if ('metToday' in (c as object)) errs.push(`${where}: metToday は台本・便りの中だけ（ここには時計が無い）`)
    }
  }
  for (const q of d.quests) {
    outside(q.start, `悩み ${q.id} の start`)
    outside(q.done, `悩み ${q.id} の done`)
  }
  for (const s of d.sections) outside(s.requires, `節 ${s.id}`)
  for (const c of Object.values(d.clues)) outside(c.showWhen, `調べる地点 ${c.id}`)
  for (const r of d.appearance.rows) for (const [t, slot] of Object.entries(r.slots)) outside(slot?.when, `出現の表 ${r.placeKind}/${t}`)

  // 6. 悩みの振り返り
  for (const q of d.quests) if (typeof q.recap !== 'string' || !q.recap.trim()) errs.push(`悩み ${q.id}: 振り返りの一言（recap）がない`)

  // 7. 便り・8. 今日の絵解き
  const flagsSetByScripts = new Set<string>()
  for (const s of Object.values(d.scripts))
    for (const n of Object.values(s.nodes)) for (const e of n.effects ?? []) if ('flag' in e && e.value === true) flagsSetByScripts.add(e.flag)
  for (const l of d.tayori?.letters ?? []) if (l.onRead?.flag) flagsSetByScripts.add(l.onRead.flag)
  if (d.tayori) errs.push(...validateTayori(d.tayori, { cards: d.cards, yokai: d.yokai, flagsSetByScripts }))
  else errs.push('便り（tayori.json）がない')
  if (d.etoki) errs.push(...validateEtokiFile(d.etoki))
  else errs.push('今日の絵解き（etoki.json）がない')

  // 9. 書かない言葉（遊ぶ人に見える文だけ）
  const lint = (text: unknown, where: string, o: { raicho?: boolean; guilt?: boolean } = {}) => {
    if (typeof text === 'string') errs.push(...lintText(text, { where, ...o }))
  }
  const strict = { raicho: true, guilt: true }
  for (const y of Object.values(d.yokai)) {
    lint(y.name, `妖怪 ${y.id} の名前`)
    lint(y.profile, `妖怪 ${y.id} の人となり`)
  }
  for (const c of Object.values(d.cards)) {
    // 了承待ちの札は空のはず（1. で見る）。出典（source）と note は見ない
    if (isPendingConsent(c)) continue
    lint(c.title, `札 ${c.id} の題`)
    lint(c.body, `札 ${c.id} の本文`)
  }
  for (const s of Object.values(d.scripts)) {
    const o = s.kind === 'yobanashi' ? strict : {}
    for (const [id, n] of Object.entries(s.nodes)) {
      for (const l of n.lines ?? []) lint(l.text, `台本 ${s.id} の場面 ${id}`, o)
      for (const c of n.choices ?? []) lint(c.text, `台本 ${s.id} の場面 ${id} の選択肢`, o)
    }
  }
  for (const q of d.quests) {
    lint(q.title, `悩み ${q.id} の題`)
    // 振り返りの一言は今日の絵解きに出るので、絵解きの文と同じく見る
    lint(q.recap, `悩み ${q.id} の振り返り`, strict)
  }
  for (const it of Object.values(d.items)) lint(it.name, `持ち物 ${it.id} の名前`)
  for (const t of d.mandala.tiers) {
    lint(t.label, `曼荼羅の段 ${t.id}`)
    for (const p of t.pieces) {
      lint(p.label, `ピース ${p.id} の名前`)
      for (const [k, v] of Object.entries(p.hint ?? {})) lint(v, `ピース ${p.id} の hint ${k}`)
    }
  }
  if (d.tayori) {
    for (const l of d.tayori.letters ?? []) {
      lint(l.title, `便り ${l.id} の題`, strict)
      for (const part of l.parts ?? []) {
        const w = `便り ${l.id} の部品 ${part.id}`
        if ('p' in part) lint(part.p, w, strict)
        if ('quote' in part) lint(part.quote, w, strict)
        if ('lead' in part) lint(part.lead, w, strict)
        if ('sheen' in part) for (const x of part.sheen ?? []) lint(x, w, strict)
      }
    }
    const dl = d.tayori.daily
    if (dl) {
      lint(dl.title, 'ましろの便りの題', strict)
      lint(dl.askName, 'ましろの便りの askName', strict)
      for (const x of [...(dl.open ?? []), ...(dl.close ?? [])]) lint(x, 'ましろの便りの open・close', strict)
      for (const h of dl.hints ?? []) lint(h.text, `ましろの便りのそえる一言 ${h.id}`, strict)
      for (const tiers of Object.values(dl.snippets ?? {})) for (const l of [...(tiers?.a ?? []), ...(tiers?.b ?? [])]) lint(l.text, `ましろの便りの言い回し ${l.id}`, strict)
    }
    for (const [y, lines] of Object.entries(d.tayori.nightKehai ?? {})) for (const x of lines ?? []) lint(x, `気配の一行 ${y}`, strict)
  }
  if (d.etoki) {
    const e = d.etoki
    for (const [k, v] of Object.entries(e.recap ?? {})) lint(v, `絵解きの振り返り ${k}`, strict)
    for (const [k, v] of Object.entries(e.caption ?? {})) lint(v, `絵解きの添え書き ${k}`, strict)
    lint(e.phraseLabel, '絵解きの一言の見出し', strict)
    for (const ph of e.phrases ?? []) lint(ph.text, `絵解きの一言 ${ph.id}`, strict)
    for (const [k, v] of Object.entries(e.lines ?? {})) lint(v, `絵解きのましろの言葉 ${k}`, strict)
  }
  return errs
}
