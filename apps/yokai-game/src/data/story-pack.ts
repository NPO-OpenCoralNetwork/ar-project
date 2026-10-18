// 物語のデータ（台本・伝承の札・曼荼羅の構図・妖怪）をまとめて読み込み、点検する。
// ゲーム独自のデータなので、OSM 由来のデータ（ODbL）とは別のファイルに分けている（05 §5.1）。
// 点検は、データ（F-70。コードを変えずに直す）の書き違いで地点や札が黙って消えないように、見つけた問題を problems に文で並べる。

import { validateAppearance } from '../core/story/appearance'
import { validateScript } from '../core/story/dialogue'
import type {
  AppearanceTable,
  ClueDef,
  ClueFile,
  Condition,
  DialogueScript,
  ItemDef,
  ItemFile,
  LoreCard,
  LoreCardFile,
  MandalaDef,
  QuestDef,
  QuestFile,
  SectionDef,
  SectionFile,
  YokaiDef,
} from '../core/story/types'
import appearanceJson from './appearance.json'
import cluesJson from './clues.json'
import { iwakurajiPack } from './iwakuraji-pack'
import itemsJson from './items.json'
import cardsJson from './lore-cards.json'
import mandalaJson from './mandala.json'
import questsJson from './quests.json'
import gameScript from './scripts/game.json'
import gameYorimichiScript from './scripts/game-yorimichi.json'
import karabozuScript from './scripts/karabozu.json'
import kozoboScript from './scripts/kozobo.json'
import kozoboShirabe1Script from './scripts/kozobo-shirabe-1.json'
import kozoboShirabe2Script from './scripts/kozobo-shirabe-2.json'
import minomoshiScript from './scripts/minomoshi.json'
import shiroebiSpotScript from './scripts/shiroebi-spot.json'
import sectionsJson from './sections.json'
import yokaiJson from './yokai.json'

export interface StoryPack {
  yokai: Record<string, YokaiDef>
  scripts: Record<string, DialogueScript>
  cards: Record<string, LoreCard>
  mandala: MandalaDef
  /** 節と旅印 */
  sections: SectionDef[]
  /** 調べる地点（地点は地域パックに置き、clueId でここを引く） */
  clues: Record<string, ClueDef>
  /** 出現の表（寄り道の妖怪。場所の種類 × 時間帯） */
  appearance: AppearanceTable
  /** 持ち物（供物・届け物） */
  items: Record<string, ItemDef>
  /** 悩みごと（帳に出す題と、同時に3つまでの判定） */
  quests: QuestDef[]
  /** 点検で見つかった問題（空なら問題なし） */
  problems: string[]
}

export function loadStoryPack(): StoryPack {
  const cardFile = cardsJson as unknown as LoreCardFile
  const cards: Record<string, LoreCard> = {}
  for (const c of cardFile.cards) cards[c.id] = c
  const mandala = mandalaJson as unknown as MandalaDef
  const scripts: Record<string, DialogueScript> = {}
  const scriptList = [
    kozoboScript,
    kozoboShirabe1Script,
    kozoboShirabe2Script,
    gameScript,
    gameYorimichiScript,
    karabozuScript,
    minomoshiScript,
    shiroebiSpotScript,
  ] as unknown as DialogueScript[]
  for (const s of scriptList) scripts[s.id] = s
  const yokai: Record<string, YokaiDef> = {}
  for (const y of yokaiJson.yokai as YokaiDef[]) yokai[y.id] = y

  const items: Record<string, ItemDef> = {}
  for (const it of (itemsJson as unknown as ItemFile).items) items[it.id] = it
  const quests = (questsJson as unknown as QuestFile).quests

  const pieceIds = new Set(mandala.tiers.flatMap((t) => t.pieces.map((p) => p.id)))
  const itemIds = new Set(Object.keys(items))
  const problems: string[] = []
  for (const s of Object.values(scripts)) problems.push(...validateScript(s, cards, pieceIds, itemIds))
  for (const it of Object.values(items)) if (it.card && !cards[it.card]) problems.push(`持ち物 ${it.id} の札 ${it.card} がない`)
  for (const y of Object.values(yokai)) if (y.likes && !items[y.likes]) problems.push(`妖怪 ${y.id} の好物 ${y.likes} がない`)
  const seenQuest = new Set<string>()
  for (const q of quests) {
    if (seenQuest.has(q.id)) problems.push(`悩み ${q.id} が2回ある`)
    seenQuest.add(q.id)
    for (const y of q.yokai) if (!yokai[y]) problems.push(`悩み ${q.id} の妖怪 ${y} がいない`)
    const check = (c: Condition) => {
      if ('item' in c && !items[c.item]) problems.push(`悩み ${q.id} の持ち物 ${c.item} がない`)
      if ('card' in c && !cards[c.card]) problems.push(`悩み ${q.id} の札 ${c.card} がない`)
    }
    for (const c of [...q.start, ...q.done]) check(c)
  }
  for (const y of Object.values(yokai)) if (y.script && !scripts[y.script]) problems.push(`妖怪 ${y.id} の台本 ${y.script} がない`)
  for (const t of mandala.tiers)
    for (const p of t.pieces) {
      for (const id of p.cardIds ?? []) if (!cards[id]) problems.push(`ピース ${p.id} の札 ${id} がない`)
      for (const id of p.keiko ?? []) if (!id.startsWith('pending:') && !cards[id]) problems.push(`ピース ${p.id} の稽古の札 ${id} がない`)
      if (p.keiko && p.keiko.length < 2) problems.push(`ピース ${p.id} の稽古は札2枚から`)
    }
  for (const c of Object.values(cards)) {
    // 札にしてよいのは 03 の「確認済」だけ（04 §5.2）。出典を必ず付ける（F-43）
    if (c.confidence !== '確認済') problems.push(`札 ${c.id} の確度が「確認済」でない`)
    if (!c.source?.work) problems.push(`札 ${c.id} に出典がない`)
  }
  const sections = (sectionsJson as unknown as SectionFile).sections
  for (const sec of sections)
    for (const c of sec.requires) if ('piece' in c && !pieceIds.has(c.piece)) problems.push(`節 ${sec.id} のピース ${c.piece} がない`)
  const clues: Record<string, ClueDef> = {}
  for (const c of (cluesJson as unknown as ClueFile).clues) {
    clues[c.id] = c
    if (!scripts[c.script]) problems.push(`調べる地点 ${c.id} の台本 ${c.script} がない`)
    else if (scripts[c.script].yokaiId) problems.push(`調べる地点 ${c.id} の台本に妖怪がいる（ましろだけが話す）`)
    // 気配を出す条件の札（書き違えると、いつまでも気配が出るか、出ない）
    for (const w of c.showWhen) if ('card' in w && !cards[w.card]) problems.push(`調べる地点 ${c.id} の条件の札 ${w.card} がない`)
    for (const w of c.showWhen) if ('item' in w && !items[w.item]) problems.push(`調べる地点 ${c.id} の条件の持ち物 ${w.item} がない`)
  }
  // 地域パックの地点が引く調べる地点（書き違えると、その地点は黙って出ない。テスト用の土地の分は test-land.ts が見る）
  for (const s of iwakurajiPack.spots) {
    if (s.clueId && !clues[s.clueId]) problems.push(`地点 ${s.id} の調べる地点 ${s.clueId} がない`)
    if (s.yokaiId && !yokai[s.yokaiId]) problems.push(`地点 ${s.id} の妖怪 ${s.yokaiId} がいない`)
  }
  const appearance = appearanceJson as unknown as AppearanceTable
  problems.push(...validateAppearance(appearance, new Set(Object.keys(yokai)), new Set(Object.keys(scripts))))
  return { yokai, scripts, cards, mandala, sections, clues, appearance, items, quests, problems }
}
