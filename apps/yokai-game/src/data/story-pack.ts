// 物語のデータ（台本・伝承の札・曼荼羅の構図・妖怪）をまとめて読み込み、点検する。
// ゲーム独自のデータなので、OSM 由来のデータ（ODbL）とは別のファイルに分けている（05 §5.1）。
// 点検は、データ（F-70。コードを変えずに直す）の書き違いで地点や札が黙って消えないように、見つけた問題を problems に文で並べる。
// 段階4b: 便り（tayori.json）・今日の絵解き（etoki.json）・くらがりと夜話の台本を足し、validateStory4b・validatePartners でも見る。

import { validatePartners } from '../core/region-pack'
import { validateAppearance } from '../core/story/appearance'
import { validateEtokiKeys, validateScript } from '../core/story/dialogue'
import {
  type AppearanceTable,
  type ClueDef,
  type ClueFile,
  type Condition,
  type DialogueScript,
  type EtokiFile,
  type ItemDef,
  type ItemFile,
  type LoreCard,
  type LoreCardFile,
  type MandalaDef,
  type QuestDef,
  type QuestFile,
  type SectionDef,
  type SectionFile,
  type StoryData,
  TIME_PIECES,
  type TayoriFile,
  type YokaiDef,
} from '../core/story/types'
import { validateStory4b } from '../core/story/validate'
import { TEST_CLUES, TEST_PICKUPS } from '../utsutsu/test-land-clues'
import appearanceJson from './appearance.json'
import cluesJson from './clues.json'
import etokiJson from './etoki.json'
import { iwakurajiPack } from './iwakuraji-pack'
import itemsJson from './items.json'
import cardsJson from './lore-cards.json'
import mandalaJson from './mandala.json'
import questsJson from './quests.json'
import etokiFirstScript from './scripts/etoki-first.json'
import gameScript from './scripts/game.json'
import gameYorimichiScript from './scripts/game-yorimichi.json'
import karabozuScript from './scripts/karabozu.json'
import kozoboScript from './scripts/kozobo.json'
import kozoboShirabe1Script from './scripts/kozobo-shirabe-1.json'
import kozoboShirabe2Script from './scripts/kozobo-shirabe-2.json'
import kuragariScript from './scripts/kuragari.json'
import minomoshiScript from './scripts/minomoshi.json'
import shiroebiSpotScript from './scripts/shiroebi-spot.json'
import yobanashiGameScript from './scripts/yobanashi-game.json'
import yobanashiKarabozuScript from './scripts/yobanashi-karabozu.json'
import yobanashiKozoboScript from './scripts/yobanashi-kozobo.json'
import yobanashiKuragariScript from './scripts/yobanashi-kuragari.json'
import yobanashiMinomoshiScript from './scripts/yobanashi-minomoshi.json'
import sectionsJson from './sections.json'
import tayoriJson from './tayori.json'
import yokaiJson from './yokai.json'

/** 物語のデータ一式（core の仕組みが読む StoryData を満たす） */
export interface StoryPack extends StoryData {
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
  /** 便り（決まった便り・ましろの便りの部品・夜の気配の一行） */
  tayori: TayoriFile
  /** 今日の絵解き（ましろの振り返り・添え書き・一言） */
  etoki: EtokiFile
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
    kuragariScript,
    etokiFirstScript,
    yobanashiKozoboScript,
    yobanashiGameScript,
    yobanashiKarabozuScript,
    yobanashiMinomoshiScript,
    yobanashiKuragariScript,
  ] as unknown as DialogueScript[]
  for (const s of scriptList) scripts[s.id] = s
  const yokai: Record<string, YokaiDef> = {}
  for (const y of yokaiJson.yokai as YokaiDef[]) yokai[y.id] = y

  const items: Record<string, ItemDef> = {}
  for (const it of (itemsJson as unknown as ItemFile).items) items[it.id] = it
  const quests = (questsJson as unknown as QuestFile).quests
  const tayori = tayoriJson as unknown as TayoriFile
  const etoki = etokiJson as unknown as EtokiFile

  const pieceIds = new Set(mandala.tiers.flatMap((t) => t.pieces.map((p) => p.id)))
  const itemIds = new Set(Object.keys(items))
  const problems: string[] = []
  // 台本の id が2回あると、あとのほうが前のを黙って上書きする
  if (Object.keys(scripts).length !== scriptList.length) problems.push('台本の id が重なっている')
  for (const s of Object.values(scripts)) problems.push(...validateScript(s, cards, pieceIds, itemIds, { timePieces: TIME_PIECES }))
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
      // 稽古の札は、絵解き鎮めと同じ決まり（4枚まで・同じ札は1回・知らない札がない）。稽古は札2枚から
      if (p.keiko) problems.push(...validateEtokiKeys(p.keiko, cards, 2).map((m) => `ピース ${p.id} の稽古の${m}`))
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
  // 地域パックの地点が引く調べる地点（書き違えると、その地点は黙って出ない）
  for (const s of iwakurajiPack.spots) {
    if (s.clueId && !clues[s.clueId]) problems.push(`地点 ${s.id} の調べる地点 ${s.clueId} がない`)
    if (s.yokaiId && !yokai[s.yokaiId]) problems.push(`地点 ${s.id} の妖怪 ${s.yokaiId} がいない`)
  }
  // テスト用の土地に置く調べる地点・持ち物を受け取る地点（utsutsu/test-land-clues.ts の決まった id。土地は端末の中で作るので、ここでは id だけ見る）
  for (const id of [...TEST_CLUES, ...TEST_PICKUPS]) if (!clues[id]) problems.push(`テスト用の土地の調べる地点 ${id} がない`)
  const appearance = appearanceJson as unknown as AppearanceTable
  problems.push(...validateAppearance(appearance, new Set(Object.keys(yokai)), new Set(Object.keys(scripts))))
  // 段階4b の点検（監修・了承待ち・6ピースと時間のピース・夜話・便り・今日の絵解き・書かない言葉）と、協力先の枠（02 F-72）
  problems.push(...validateStory4b({ yokai, scripts, cards, quests, items, mandala, tayori, etoki, sections, clues, appearance }))
  problems.push(...validatePartners(iwakurajiPack, itemIds))
  return { yokai, scripts, cards, mandala, sections, clues, appearance, items, quests, tayori, etoki, problems }
}
