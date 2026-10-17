// 物語のデータ（台本・伝承の札・曼荼羅の構図・妖怪）をまとめて読み込み、点検する。
// ゲーム独自のデータなので、OSM 由来のデータ（ODbL）とは別のファイルに分けている（05 §5.1）。

import { validateScript } from '../core/story/dialogue'
import type { DialogueScript, LoreCard, LoreCardFile, MandalaDef, SectionDef, SectionFile, YokaiDef } from '../core/story/types'
import cardsJson from './lore-cards.json'
import mandalaJson from './mandala.json'
import gameScript from './scripts/game.json'
import karabozuScript from './scripts/karabozu.json'
import kozoboScript from './scripts/kozobo.json'
import minomoshiScript from './scripts/minomoshi.json'
import sectionsJson from './sections.json'
import yokaiJson from './yokai.json'

export interface StoryPack {
  yokai: Record<string, YokaiDef>
  scripts: Record<string, DialogueScript>
  cards: Record<string, LoreCard>
  mandala: MandalaDef
  /** 節と旅印 */
  sections: SectionDef[]
  /** 点検で見つかった問題（空なら問題なし） */
  problems: string[]
}

export function loadStoryPack(): StoryPack {
  const cardFile = cardsJson as unknown as LoreCardFile
  const cards: Record<string, LoreCard> = {}
  for (const c of cardFile.cards) cards[c.id] = c
  const mandala = mandalaJson as unknown as MandalaDef
  const scripts: Record<string, DialogueScript> = {}
  for (const s of [kozoboScript, gameScript, karabozuScript, minomoshiScript] as unknown as DialogueScript[]) scripts[s.id] = s
  const yokai: Record<string, YokaiDef> = {}
  for (const y of yokaiJson.yokai as YokaiDef[]) yokai[y.id] = y

  const pieceIds = new Set(mandala.tiers.flatMap((t) => t.pieces.map((p) => p.id)))
  const problems: string[] = []
  for (const s of Object.values(scripts)) problems.push(...validateScript(s, cards, pieceIds))
  for (const y of Object.values(yokai)) if (y.script && !scripts[y.script]) problems.push(`妖怪 ${y.id} の台本 ${y.script} がない`)
  for (const t of mandala.tiers)
    for (const p of t.pieces) for (const id of p.cardIds ?? []) if (!cards[id]) problems.push(`ピース ${p.id} の札 ${id} がない`)
  for (const c of Object.values(cards)) {
    // 札にしてよいのは 03 の「確認済」だけ（04 §5.2）。出典を必ず付ける（F-43）
    if (c.confidence !== '確認済') problems.push(`札 ${c.id} の確度が「確認済」でない`)
    if (!c.source?.work) problems.push(`札 ${c.id} に出典がない`)
  }
  const sections = (sectionsJson as unknown as SectionFile).sections
  for (const sec of sections)
    for (const c of sec.requires) if ('piece' in c && !pieceIds.has(c.piece)) problems.push(`節 ${sec.id} のピース ${c.piece} がない`)
  return { yokai, scripts, cards, mandala, sections, problems }
}
