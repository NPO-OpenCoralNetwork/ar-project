// 物語の仕組みのテストの道具（npm run test:story。scripts/run-tests.mjs が rolldown で束ねて node で走らせる）。
// - kv(): 端末の保存の代わり（Map）。clockAt(): 止まった時計（JST で合わせる）。store(): 進み具合。talk(): 台本を最後まで（途中まで）進める。
// - fixtureStory(): テスト用の小さな物語（妖怪2人・夜話の台本・札3枚・時間のピース・便り・絵解き）。本番のデータ（src/data/）は読まない。
// - ok() で数え、done() で終わりの数と終了コードを出す。snap() は二つの時間帯で同じになるべき値（走らせる側が見比べる）。
// 文は【創作】のテスト用の言葉で、本番には出ない。

import { type StoryClock, storyClock } from '../src/core/story/clock'
import { type Beat, DialogueRunner } from '../src/core/story/dialogue'
import type { MemoReader } from '../src/core/story/memo'
import { type KeyValueStore, ProgressStore } from '../src/core/story/progress'
import type { StoryCheckInput } from '../src/core/story/validate'
import type { DialogueScript, LoreCard, Travel } from '../src/core/story/types'

let passed = 0
let failed = 0
/** 確かめる（落ちたら FAIL の行を出して数える。止めない） */
export function ok(cond: unknown, msg: string): void {
  if (cond) {
    passed++
    console.log(`ok   ${msg}`)
  } else {
    failed++
    console.log(`FAIL ${msg}`)
  }
}
/** 二つの時間帯で同じになるべき値（「= 名前 JSON」の行。run-tests.mjs が見比べる） */
export function snap(label: string, value: unknown): void {
  console.log(`= ${label} ${JSON.stringify(value)}`)
}
/** 終わり（数を出し、落ちたものがあれば終了コード 1） */
export function done(): void {
  console.log(`-- ${passed} ok, ${failed} fail`)
  if (failed) process.exitCode = 1
}

export type MemKV = KeyValueStore & {
  mem: Map<string, string>
  /** n 回目の setItem で投げる（1 から数える。0 で投げない） */
  failOn(n: number): void
  /** ほかのタブが書いたことにする（subscribe した関数を呼ぶ） */
  emit(key: string, value: string | null): void
}
/** 端末の保存の代わり */
export function kv(): MemKV {
  const mem = new Map<string, string>()
  const subs = new Map<string, Set<(v: string | null) => void>>()
  let writes = 0
  let failAt = 0
  return {
    mem,
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      writes++
      if (failAt && writes === failAt) throw new Error('quota')
      mem.set(k, v)
    },
    removeItem: (k) => void mem.delete(k),
    subscribe: (k, fn) => {
      const s = subs.get(k) ?? new Set()
      s.add(fn)
      subs.set(k, s)
      return () => s.delete(fn)
    },
    failOn(n) {
      failAt = n ? writes + n : 0
    },
    emit(k, v) {
      if (v === null) mem.delete(k)
      else mem.set(k, v)
      for (const fn of subs.get(k) ?? []) fn(v)
    },
  }
}

/** JST の 'YYYY-MM-DDTHH:MM(:SS)' → ms */
export const jst = (isoJst: string): number => Date.parse(`${isoJst}+09:00`)

export interface TestClock {
  now(): Date
  readonly ms: number
  set(isoJst: string): void
  advance(ms: number): void
  /** いまの物語の時計 */
  story(): StoryClock
}
/** 止まった時計（JST で合わせる。進めるのは set・advance だけ） */
export function clockAt(isoJst: string): TestClock {
  let t = jst(isoJst)
  return {
    now: () => new Date(t),
    get ms() {
      return t
    },
    set(iso) {
      t = jst(iso)
    },
    advance(ms) {
      t += ms
    },
    story: () => storyClock(t),
  }
}

/** 進み具合（鍵は 'x'。前の名前から写す鍵ではない） */
export function store(k: KeyValueStore = kv(), c: TestClock = clockAt('2027-01-11T10:00'), key = 'x'): ProgressStore {
  return new ProgressStore(k, key, () => c.now())
}

export interface TalkOptions {
  stopAfter?: number
  clock?: StoryClock
  memo?: MemoReader | null
  entry?: string
  record?: 'talk' | 'visit'
  onFinish?(): void
}
/**
 * 台本を進める。picks は選択肢の順（数は何番目、文字はその字を含む選択肢）。stopAfter で、その拍の数で途中で閉じる。
 * 戻り値: 通った場面（trail）、出た台詞・札・お知らせ（seen）、拍そのもの（beats）、終わりまで来たか（ended）
 */
export function talk(
  story: Pick<StoryCheckInput, 'scripts' | 'cards' | 'items' | 'quests'>,
  p: ProgressStore,
  scriptId: string,
  travel: Travel,
  picks: (number | string)[] = [],
  o: TalkOptions = {},
): { trail: string; seen: string[]; beats: Beat[]; ended: boolean } {
  const script = story.scripts[scriptId]
  if (!script) throw new Error(`no script ${scriptId}`)
  const r = new DialogueRunner(script, {
    progress: p,
    cards: story.cards,
    travel,
    items: story.items,
    quests: story.quests,
    clock: o.clock,
    memo: o.memo ?? undefined,
    record: o.record,
    onFinish: o.onFinish,
  })
  let b: Beat = r.start(o.entry)
  const seen: string[] = []
  const beats: Beat[] = []
  let k = 0
  for (let i = 0; i < 200 && b.kind !== 'end'; i++) {
    if (i >= (o.stopAfter ?? Infinity)) break
    beats.push(b)
    if (b.kind === 'line') seen.push(`${b.speaker.name}: ${b.text}`)
    else if (b.kind === 'card') seen.push(`[札] ${b.card.title}`)
    else if (b.kind === 'notice') seen.push(`[知] ${b.notice.type} ${'label' in b.notice ? b.notice.label : b.notice.name}`)
    else if (b.kind === 'choices') seen.push(`[選] ${b.options.map((x) => x.text).join(' / ')}`)
    if (b.kind === 'choices') {
      const want = picks[k++]
      const idx = typeof want === 'string' ? b.options.findIndex((x) => x.text.includes(want)) : Math.min(want ?? 0, b.options.length - 1)
      if (idx < 0) throw new Error(`choice ${want} not in ${b.options.map((x) => x.text).join(',')}`)
      b = r.choose(b.options[idx].index)
    } else b = b.kind === 'game' ? r.next({ mistakes: 0, tapped: 0 }) : r.next()
  }
  if (b.kind === 'end') beats.push(b)
  return { trail: r.trail.join('>'), seen, beats, ended: b.kind === 'end' }
}

/** 呼び名の代わり（MemoStore を使わずに） */
export const memoOf = (yobina: string | null, hasField = yobina !== null): MemoReader => ({ yobina, hasYobinaField: hasField })

const card = (id: string, yokaiId: string | undefined, title: string, body: string): LoreCard => ({
  id,
  ...(yokaiId ? { yokaiId } : {}),
  title,
  body,
  source: { work: 'テストの出典' },
  confidence: '確認済',
  researchRef: 'テスト',
  review: '下書き',
})

const sp = { mashiro: { name: 'ましろ', role: 'companion' as const } }
const script = (s: Omit<DialogueScript, 'version' | 'creative' | 'review'>): DialogueScript => ({ version: 1, creative: true, review: '下書き', ...s })

/** テスト用の小さな物語（点検 validateStory4b も通る形） */
export function fixtureStory(): StoryCheckInput {
  const scripts: Record<string, DialogueScript> = {}
  const add = (s: DialogueScript) => (scripts[s.id] = s)
  add(
    script({
      id: 'tengu',
      yokaiId: 'tengu',
      speakers: { tengu: { name: 'てんぐ', role: 'yokai' }, ...sp },
      entries: [
        { id: 'first', when: [{ met: false }], node: 'f1' },
        { id: 'ask', when: [{ flag: 'qa-asked', is: false }], node: 'a1' },
        { id: 'again', node: 'g1' },
      ],
      nodes: {
        f1: {
          lines: [
            { speaker: 'mashiro', text: '{呼び名}、だれかいるよ。' },
            { speaker: 'tengu', text: 'わしは、てんぐじゃ。' },
          ],
          effects: [{ meet: true }, { bond: 'kaomishiri' }, { openCard: 'c1' }, { piece: 'fumoto-tengu', state: 'hakubyo' }],
          next: 'f2',
        },
        f2: { lines: [{ speaker: 'tengu', text: 'ひとつ、頼みがある。' }], choices: [{ text: 'いいよ', next: 'f3' }, { text: 'またこんど', next: 'f4' }] },
        f3: { lines: [{ speaker: 'tengu', text: 'たすかる。' }], effects: [{ flag: 'qa-asked', value: true }], end: true },
        f4: { lines: [{ speaker: 'tengu', text: 'そうか。' }], end: true },
        a1: { lines: [{ speaker: 'tengu', text: 'このあいだの頼みじゃ。' }], choices: [{ text: 'いいよ', next: 'f3' }] },
        g1: {
          lines: [
            { speaker: 'tengu', text: 'また来たか。' },
            { speaker: 'tengu', when: [{ metToday: 'utsutsu' }], text: 'きょうは歩いて来たな。' },
            { speaker: 'tengu', when: [{ metToday: 'yume' }], text: 'きょうは夢の中じゃな。' },
          ],
          choices: [
            { text: '頼みは？', next: 'g2', when: [{ flag: 'qa-asked', is: true }, { flag: 'qa-done', is: false }] },
            { text: 'ひみつの話', next: 'g3', needsConsent: true },
            { text: 'またね', next: 'g4' },
          ],
        },
        g2: { lines: [{ speaker: 'tengu', text: 'かなった。' }], effects: [{ flag: 'qa-done', value: true }, { bond: 'najimi' }, { openCard: 'c2' }], end: true },
        g3: { lines: [{ speaker: 'tengu', text: 'まだ話せぬ。' }], end: true },
        g4: { lines: [{ speaker: 'tengu', text: 'うむ。' }], end: true },
      },
    }),
  )
  add(
    script({
      id: 'kuragari',
      yokaiId: 'kuragari',
      speakers: { kuragari: { name: 'くらがり', role: 'yokai' }, ...sp },
      entries: [
        { id: 'first', when: [{ met: false }], node: 'k1' },
        { id: 'e2', when: [{ flag: 'kg-read', is: true }, { flag: 'kg-done', is: false }], node: 'e1' },
        { id: 'again', node: 'r1' },
      ],
      nodes: {
        k1: {
          lines: [
            { speaker: 'mashiro', text: '帳のすみが、暗い。' },
            { speaker: 'kuragari', text: '話すだけだ。' },
          ],
          effects: [{ meet: true }, { bond: 'kaomishiri' }, { openCard: 'c3' }, { timePiece: 'fumoto-kuragari' }, { flag: 'kg-asked', value: true }],
          end: true,
        },
        e1: { lines: [{ speaker: 'kuragari', text: '……そうか。' }], effects: [{ timePiece: 'fumoto-kuragari' }, { bond: 'najimi' }, { flag: 'kg-done', value: true }], end: true },
        r1: { lines: [{ speaker: 'kuragari', text: '夕暮れだ。' }], effects: [{ timePiece: 'fumoto-kuragari' }, { showCard: 'c3' }], end: true },
      },
    }),
  )
  add(
    script({
      id: 'yb-tengu',
      kind: 'yobanashi',
      yokaiId: 'tengu',
      speakers: { tengu: { name: 'てんぐ', role: 'yokai' }, ...sp },
      entries: [
        { id: 'a', node: 'a' },
        { id: 'b', when: [{ flag: 'qa-done', is: true }], node: 'b' },
        { id: 'c', node: 'c' },
        { id: 'again', node: 'z' },
      ],
      nodes: {
        a: { lines: [{ speaker: 'tengu', text: 'よい夜じゃ。' }], choices: [{ text: 'うん', next: 'a2' }, { text: 'ねむい', next: 'a2' }] },
        a2: { lines: [{ speaker: 'tengu', text: '夜は、家におれ。' }], end: true },
        b: { lines: [{ speaker: 'tengu', text: '頼みの礼じゃ。' }], effects: [{ showCard: 'c2' }], end: true },
        c: { lines: [{ speaker: 'tengu', text: '山の話じゃ。もう寝よ。' }], end: true },
        z: { lines: [{ speaker: 'tengu', text: '顔を見に来ただけじゃ。' }], end: true },
      },
    }),
  )
  add(
    script({
      id: 'yb-kuragari',
      kind: 'yobanashi',
      yokaiId: 'kuragari',
      speakers: { kuragari: { name: 'くらがり', role: 'yokai' }, ...sp },
      entries: [
        { id: 'x', node: 'x' },
        { id: 'y', node: 'y' },
        { id: 'again', node: 'z' },
      ],
      nodes: {
        x: { lines: [{ speaker: 'kuragari', text: '夜は、影がいちばん広い。' }], end: true },
        y: { lines: [{ speaker: 'kuragari', text: '灯りのそばで、眠れ。' }], end: true },
        z: { lines: [{ speaker: 'kuragari', text: '影は、ここにいる。' }], end: true },
      },
    }),
  )
  add(
    script({
      id: 'etoki-first',
      speakers: sp,
      entries: [
        { id: 'color', when: [{ piece: 'sato-etoki', atLeast: 'hakubyo' }], node: 'color' },
        { id: 'first', node: 'f1' },
      ],
      nodes: {
        f1: { lines: [{ speaker: 'mashiro', text: '札にも、絵解きのことが書いてあったよ。' }], effects: [{ openCard: 'c2' }], next: 'f2' },
        f2: { lines: [{ speaker: 'mashiro', text: 'ちょっと似てるね。' }], effects: [{ piece: 'sato-etoki', state: 'saishiki' }], end: true },
        color: { lines: [{ speaker: 'mashiro', text: '色が入るよ。' }], effects: [{ piece: 'sato-etoki', state: 'saishiki' }], end: true },
      },
    }),
  )
  const piece = (id: string, x: number, more: object = {}) => ({ id, x, y: 100, w: 40, h: 40, ...more })
  return {
    yokai: {
      tengu: { id: 'tengu', name: 'てんぐ', script: 'tengu', profile: '山を見ている。', yobanashi: 'yb-tengu' },
      kuragari: { id: 'kuragari', name: 'くらがり', script: 'kuragari', original: true, yobanashi: 'yb-kuragari' },
    },
    scripts,
    cards: {
      c1: card('c1', 'tengu', 'てんぐの札', 'てんぐの話の本文。'),
      c2: card('c2', 'tengu', 'ふたつめの札', 'ふたつめの話の本文。'),
      c3: card('c3', 'kuragari', '影の札', '影の話の本文。'),
    },
    quests: [
      { id: 'qa', number: 1, title: 'てんぐの頼み', type: 'とりもつ', yokai: ['tengu'], start: [{ flag: 'qa-asked', is: true }], done: [{ flag: 'qa-done', is: true }], recap: 'てんぐの頼みが、かなった。' },
      { id: 'qb', number: 2, title: 'もちを届ける', type: '届ける', yokai: ['tengu'], start: [{ item: 'mochi', state: 'held' }], done: [{ item: 'mochi', state: 'given' }], recap: 'てんぐに、もちを届けた。' },
    ],
    items: { mochi: { id: 'mochi', name: 'もち' } },
    mandala: {
      version: 1,
      title: '曼荼羅帳',
      note: 'テスト',
      viewBox: [300, 400],
      tiers: [
        { id: 'yama', label: '山', y0: 0, y1: 100, pieces: [piece('yama-a', 10, { label: '山のあ' })] },
        {
          id: 'fumoto',
          label: '麓',
          y0: 100,
          y1: 200,
          pieces: [
            piece('fumoto-tengu', 10, { label: 'てんぐ', yokaiId: 'tengu', cardIds: ['c1', 'c2'], keiko: ['c1', 'c2'] }),
            piece('fumoto-kuragari', 60, { label: 'くらがり', yokaiId: 'kuragari', time: true, cardIds: ['c3', 'c2'], keiko: ['c3', 'c2'], hint: { hakubyo: '時間のピース。' } }),
            piece('fumoto-b', 110, { label: 'ふもとのい' }),
          ],
        },
        {
          id: 'sato',
          label: '里',
          y0: 200,
          y1: 300,
          pieces: [piece('sato-etoki', 10, { label: '絵解き', cardIds: ['c2'] }), piece('sato-c', 60, { label: 'さとのう' }), piece('sato-empty', 110)],
        },
      ],
    },
    tayori: {
      version: 1,
      creative: true,
      review: '下書き',
      letters: [
        {
          id: 'mg-tengu',
          title: '山の話（また聞き）',
          kind: 'matagiki',
          about: 'tengu',
          after: { flag: 'qa-done', days: 1 },
          parts: [
            { id: 'p1', p: 'ゆうべ、風が声を運んできたよ。' },
            { id: 'q1', yokai: 'tengu', quote: '頼みが、かなった。' },
            { id: 'p2', p: '{呼び名}にも、聞かせたかった。', when: [{ item: 'mochi', state: 'given' }] },
            { id: 'c1', card: 'c1', lead: 'てんぐの昔の話は、この札のとおり。' },
            { id: 's1', yokai: 'tengu', sheen: ['てんぐは、山を見ていた。', 'てんぐ、{呼び名}の話をするとき、うれしそう。'] },
          ],
        },
        {
          id: 'mg-two',
          title: '頼みの話（また聞き）',
          kind: 'matagiki',
          about: 'tengu',
          after: { flag: 'qa-asked', days: 1 },
          parts: [{ id: 'p1', p: '風が、頼みごとの話を運んできた。' }],
        },
        {
          id: 'kage',
          title: '影のこと',
          kind: 'quest',
          about: 'kuragari',
          after: { flag: 'kg-asked', days: 0 },
          onRead: { flag: 'kg-read' },
          parts: [{ id: 'p1', p: '口で言うのは、はずかしいから、書くね。' }],
        },
        { id: 'secret', title: 'まだ出せない便り', kind: 'matagiki', after: { flag: 'qa-asked', days: 0 }, needsConsent: true, parts: [{ id: 'p1', p: 'まだ出せない。' }] },
      ],
      daily: {
        title: 'ましろの便り',
        askName: '{呼び名}のこと、なんて書けばいいか、まだ聞いていなかったね。',
        open: ['ゆうべ、風の音で目がさめたんだ。', 'きょうも、帳の上を風が通ったよ。', '風は、遠くの話を運んでくる。'],
        close: ['ぼくは、帳の中にいるよ。', 'きょうも、いい日になりますように。', 'またね。急がなくていいよ。'],
        hints: [
          { id: 'etoki-before', text: 'この前の絵解き、はさんでおいたよ。', max: 99 },
          { id: 'kuragari', text: '夕暮れに、帳のすみが暗くなることがあるんだ。', max: 2 },
          { id: 'yobanashi', text: 'なじみの妖怪は、夜、話しに来ることがあるよ。', max: 1 },
          { id: 'etoki', text: '「今日はここまで」で、絵解きをつくれるよ。', max: 1 },
        ],
        snippets: {
          tengu: {
            a: [
              { id: 'ta1', text: 'てんぐは、きょうも山を眺めていた。' },
              { id: 'ta2', text: 'てんぐが、空を見上げていた。' },
            ],
            b: [
              { id: 'tb1', text: 'てんぐが、{呼び名}のことを話のわかるやつだって。' },
              { id: 'tb2', when: [{ flag: 'qa-done', is: true }], text: 'てんぐ、頼みがかなって、うれしそう。' },
              { id: 'tb3', text: 'てんぐ、羽のつやがいいんだ。' },
            ],
          },
          kuragari: { a: [{ id: 'ra1', text: '帳のすみが、すこし暗かった。' }], b: [{ id: 'rb1', text: '影が、ぼくの影のふりをしてた。' }] },
        },
      },
      nightKehai: {
        tengu: ['戸の外で、羽の音がひとつした。', '山のほうを、だれかが眺めている。'],
        kuragari: ['灯りの影が、すこし揺れた。', '帳のすみが、ほんの少し暗くなった。'],
      },
    },
    etoki: {
      version: 1,
      creative: true,
      review: '下書き',
      recap: {
        open: '{呼び名}、きょうの話を、ふりかえってみよう。',
        met: 'きょうは、{names}に会ったね。',
        metNone: 'きょうは、だれにも会わなかったね。',
        newCard: '新しい札も、ひらいたね。',
        pick: '札を、三枚まで選んでみて。',
        noCards: 'まだ、札がないね。',
      },
      caption: { met: 'きょうは、{names}に会った日。', none: 'きょうの話から。' },
      phraseLabel: '{呼び名}のひと言',
      phrases: [
        { id: 'hanashitai', text: 'だれかに話したい' },
        { id: 'fushigi', text: 'ふしぎだった' },
        { id: 'yasashii', text: 'やさしい話だった' },
        { id: 'kowai', text: 'すこし、こわかった' },
        { id: 'shiritai', text: 'もっと知りたい' },
        { id: 'aitai', text: 'また会いたい' },
      ],
      lines: { saved: 'はさんでおいたよ。', bye: 'おつかれさま。', pairBlocked: 'この二枚は、同じ絵解きに並べない決まりなんだ。' },
    },
    sections: [],
    clues: {},
    appearance: { version: 1, rows: [] },
  }
}
