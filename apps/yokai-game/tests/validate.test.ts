// 段階4b の点検（core/story/validate.ts・letters.ts の validateTayori・region-pack.ts の validatePartners）。
// テスト用の物語は通り、書き違えを1つずつ植えると、それぞれ見つかること
import { type PartnerSlot, type RegionPack, validatePartners } from '../src/core/region-pack'
import { lintText } from '../src/core/story/text'
import type { DialogueScript, StoryData } from '../src/core/story/types'
import { type StoryCheckInput, validateStory4b } from '../src/core/story/validate'
import { iwakurajiPack } from '../src/data/iwakuraji-pack'
import { done, fixtureStory, ok } from './helpers'

const clean = validateStory4b(fixtureStory())
ok(clean.length === 0, `テスト用の物語は点検を通る（${clean.join(' / ')}）`)

/** 書き違えを植えて点検し、want を含む問題があるか */
const reports = (mutate: (d: StoryCheckInput) => void, want: string, label: string) => {
  const d = structuredClone(fixtureStory())
  mutate(d)
  const errs = validateStory4b(d)
  ok(errs.some((m) => m.includes(want)), `${label}（${errs.filter((m) => m.includes(want)).join(' / ') || errs.join(' / ') || '問題なし'}）`)
}
const line = (s: DialogueScript, node: string, text: string) => s.nodes[node].lines!.push({ speaker: Object.keys(s.speakers)[0], text })

// 書かない言葉
reports((d) => line(d.scripts.tengu, 'f4', '権現さまの話じゃ。'), '「権現」', 'ふつうの台本の「権現」')
reports((d) => ((d.tayori.letters[0].parts[0] as { p: string }).p = 'ひさしぶりだね。'), '「ひさしぶり」', '便りの「ひさしぶり」')
reports((d) => (d.etoki.phrases[0].text = '雷鳥がいた'), '「雷鳥」', '一言の「雷鳥」')
reports((d) => (d.tayori.nightKehai.tengu[0] = '夜の散歩に出かけた。'), '「夜の散歩」', '気配の一行の夜の散歩')
reports((d) => line(d.scripts['yb-tengu'], 'c', 'ライチョウを見たか。'), '「ライチョウ」', '夜話のライチョウ')
reports((d) => (d.tayori.daily.close[0] = '毎日、待ってたよ。'), '「毎日」', 'ましろの便りの「毎日」')
reports((d) => (d.yokai.tengu.profile = '芦峅寺の天狗。'), '「芦峅寺」', '人となりの社寺の名')
reports((d) => (d.mandala.tiers[0].pieces[0].label = '布橋'), '「布橋」', 'ピースの名前')
{
  const d = structuredClone(fixtureStory())
  line(d.scripts.tengu, 'f4', 'ひさしぶりに外の気を吸うた。')
  line(d.scripts.tengu, 'f4', '雷鳥が飛んだ。')
  d.cards.c1.source.work = '芦峅寺の文書'
  ;(d.cards.c1 as { note?: string }).note = '権現'
  ok(validateStory4b(d).length === 0, 'ふつうの台本の「ひさしぶり」「雷鳥」・出典・note は見ない（範囲の外）')
}
ok(lintText('岩峅寺の雷鳥、ひさしぶり', { where: 'x' }).length === 1 && lintText('岩峅寺の雷鳥、ひさしぶり', { where: 'x', raicho: true, guilt: true }).length === 3, 'lintText の範囲（raicho・guilt）')

// 監修と了承待ち
reports((d) => ((d.cards.c1 as { review: string }).review = '了承待ち'), '了承待ちは needsConsent で持つ（02 F-71）', '札の review 了承待ち')
reports((d) => ((d.scripts.tengu as { review: string }).review = '了承待ち'), '了承待ちは needsConsent', '台本の review 了承待ち')
reports((d) => ((d.tayori as { review: string }).review = '監修待ち'), '監修の状態', '便りの知らない review')
reports((d) => (d.cards.c3 = { ...d.cards.c3, needsConsent: true }), '題と本文を空に', '了承待ちの札に字がある')
reports((d) => ((d.cards.c3 as { needsConsent: unknown }).needsConsent = false), 'true だけ', 'needsConsent: false')
reports((d) => (d.cards.c1 = { ...d.cards.c1, title: '', body: '', needsConsent: true }), '了承待ちの札 c1 は便りに入れない', '便りが了承待ちの札を使う')

// 札の topics
reports((d) => (d.cards.c1.body = '雷鳥が住む。'), 'raicho', '雷鳥の札に topics が無い')
reports((d) => (d.cards.c2.title = '阿弥陀の話'), 'kami', '阿弥陀の札に topics が無い')
reports(
  (d) => {
    d.cards.c3.topics = ['raicho']
    d.cards.c2.topics = ['kami']
  },
  '混ぜない',
  'ピースに雷鳥と神仏を混ぜる',
)

// 曼荼羅
reports((d) => delete d.mandala.tiers[0].pieces[0].label, '名前のあるピースは6つ', '名前のあるピースが5つ')
reports((d) => (d.mandala.tiers[1].pieces[0].time = true), '時間のピース', '時間のピースが2つ')
reports((d) => (d.mandala.tiers[1].pieces[1].keiko = ['c3']), '稽古の札を2枚以上', '時間のピースの稽古が1枚')
reports((d) => (d.mandala.tiers[1].pieces[1].hint = { gold: 'x' } as never), 'hint の鍵 gold', 'hint の知らない鍵')

// 夜話の台本
reports((d) => (d.yokai.tengu.yobanashi = 'tengu'), '種類が yobanashi でない', '夜話の台本が talk')
reports((d) => (d.yokai.tengu.yobanashi = 'yb-kuragari'), '妖怪が kuragari', '夜話の台本の妖怪が違う')
reports((d) => (d.yokai.tengu.yobanashi = 'nope'), '夜話の台本 nope がない', '夜話の台本が無い')

// 台本の外の条件・悩み
reports((d) => d.quests[0].start.push({ metToday: 'any', yokai: 'tengu' }), 'metToday', 'quests の metToday')
reports((d) => d.quests[0].done.push({ moon: 1 } as never), 'は知らない', 'quests の知らない条件')
reports((d) => (d.appearance = { version: 1, rows: [{ placeKind: 'mizube', label: '水辺', slots: { day: { when: [{ flag: 'x' } as never] }, oumagatoki: {}, night: {} } }] }), 'は知らない', '出現の表の形の違う条件')
reports((d) => delete d.quests[1].recap, '振り返りの一言', 'recap の無い悩み')

// 便り（validateTayori）
reports((d) => (d.tayori.letters[0].after.flag = 'never-set'), 'never-set を true にする台本がない', '届く条件のフラグをどの台本も立てない')
reports((d) => ((d.tayori.letters[0].after as { days: number }).days = 2), 'days は 0 か 1', 'days: 2')
reports((d) => ((d.tayori.letters[0].parts[3] as { card: string }).card = 'nope'), '札 nope がない', '知らない札の部品')
reports((d) => ((d.tayori.letters[0].parts[1] as { quote: string }).quote = '{呼び名}、聞け。'), '{呼び名}', '妖怪の言葉に {呼び名}')
reports((d) => (d.tayori.letters[1].id = d.tayori.letters[0].id), '2回ある', '便りの id が重なる')
reports((d) => (d.tayori.daily.snippets.kuragari.a[0].id = 'ta1'), '言い回しの id ta1 が2回', '言い回しの id が重なる')
reports((d) => (d.tayori.daily.snippets.kuragari.b = []), '言い回し（a・b）', '妖怪の言い回しの段が欠ける')
reports((d) => delete d.tayori.nightKehai.kuragari, '気配の一行', '夜話のある妖怪の気配の一行が無い')
reports((d) => (d.tayori.daily.open = []), 'open は1つ以上', 'open が無い')
reports((d) => (d.tayori.daily.hints[0].id = 'weather' as never), 'weather は知らない', '知らないそえる一言')
reports((d) => (d.tayori.daily.close[0] = '{names}によろしく'), '{names}', '便りの知らない差し込み')
reports((d) => ((d.tayori.letters[0].parts[4] as { sheen: string[] }).sheen = ['ひとつ']), 'sheen は2つ', 'sheen が1つ')

// 地域パックの協力先（F-72）
{
  ok(validatePartners(iwakurajiPack, new Set()).length === 0, '立山のふもとのパックは通る（協力先の枠だけ）')
  const origin = { lat: 36.6, lon: 137.3 }
  const pack = (partners: PartnerSlot[]): RegionPack => ({
    id: 'p',
    name: 'テスト',
    origin,
    bounds: { south: 36.59, west: 137.29, north: 36.61, east: 137.31 },
    fieldMapping: { kind: 'identity' },
    spots: [
      { id: 'in-zone', label: 'この地点', position: { lat: 36.6, lon: 137.3 }, placeKind: 'road' },
      { id: 'outside', label: 'この地点', position: { lat: 36.605, lon: 137.305 }, placeKind: 'road' },
    ],
    restZones: [
      {
        id: 'z',
        polygon: [
          { lat: 36.599, lon: 137.299 },
          { lat: 36.599, lon: 137.301 },
          { lat: 36.601, lon: 137.301 },
          { lat: 36.601, lon: 137.299 },
        ],
      },
    ],
    attributions: [],
    partners,
  })
  const slot = (o: Partial<PartnerSlot>): PartnerSlot => ({ id: 'k1', kinds: ['kumotsu'], label: '協力先', name: '', hideUnder13: true, status: 'draft', public: false, ...o })
  ok(validatePartners(pack([slot({ spotId: 'outside', itemId: 'mochi', closed: ['mon'] })]), new Set(['mochi'])).length === 0, '正しい枠は通る')
  const errsOf = (o: Partial<PartnerSlot>) => validatePartners(pack([slot(o)]), new Set(['mochi'])).join(' / ')
  ok(errsOf({ spotId: 'in-zone' }).includes('お休みの範囲'), 'お休みの範囲の中の地点')
  ok(errsOf({ name: '茶屋' }).includes('name を空に'), '合意の前の名前')
  ok(errsOf({ public: true as never }).includes('public は false'), 'public: true')
  ok(errsOf({ status: 'agreed', name: '茶屋' }) === '', '合意したら名前を書いてよい')
  ok(errsOf({ status: 'agreed', name: '岩峅寺の茶屋' }).includes('「岩峅寺」'), '名前も書かない言葉を見る')
  ok(errsOf({ spotId: 'nope' }).includes('地点 nope がない') && errsOf({ itemId: 'nope' }).includes('持ち物 nope がない'), '知らない地点・持ち物')
  ok(errsOf({ label: 'お店' as never }).includes('協力先') && errsOf({ hideUnder13: false as never }).includes('hideUnder13'), 'label・hideUnder13')
}

// StoryData の形（StoryPack が満たすもの）は core の型だけで書ける
const _shape: StoryData = fixtureStory()
ok(!!_shape.tayori && !!_shape.etoki, 'fixtureStory は StoryData')
done()
