// 会話の仕組みの段階4b の足し分（core/story/dialogue.ts）: {呼び名}・台詞の条件・metToday・noteSeen・夜話の記録・showCard・timePiece・了承待ち・
// start(entryId)・onFinish・点検（validateScript）
import { storyClock } from '../src/core/story/clock'
import { DialogueRunner, etokiHand, isKnownCondition, isKnownEffect, validateScript } from '../src/core/story/dialogue'
import type { Notice } from '../src/core/story/dialogue'
import type { DialogueScript } from '../src/core/story/types'
import { TIME_PIECES } from '../src/core/story/types'
import { clockAt, done, fixtureStory, jst, memoOf, ok, store, talk } from './helpers'

const story = fixtureStory()
const pieceIds = new Set(story.mandala.tiers.flatMap((t) => t.pieces.map((p) => p.id)))
const itemIds = new Set(Object.keys(story.items))
const check = (s: DialogueScript) => validateScript(s, story.cards, pieceIds, itemIds, { timePieces: TIME_PIECES })

ok(Object.values(story.scripts).every((s) => check(s).length === 0), `テスト用の台本は点検を通る（${Object.values(story.scripts).flatMap(check).join(' / ')}）`)

// {呼び名}（ましろの台詞だけ。無ければ「きみ」）
{
  const c = clockAt('2027-01-11T10:00')
  const named = talk(story, store(undefined, c), 'tengu', 'yume', [0], { memo: memoOf('さくら') })
  ok(named.seen[0] === 'ましろ: さくら、だれかいるよ。', `呼び名を差し込む（${named.seen[0]}）`)
  const plain = talk(story, store(undefined, c), 'tengu', 'yume', [0])
  ok(plain.seen[0] === 'ましろ: きみ、だれかいるよ。', '呼び名が無ければ「きみ」')
  const erased = talk(story, store(undefined, c), 'tengu', 'yume', [0], { memo: memoOf(null, true) })
  ok(erased.seen[0] === 'ましろ: きみ、だれかいるよ。', '消したあとも「きみ」')
}

// 台詞の条件・metToday（時計が要る）
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  talk(story, p, 'tengu', 'yume', [0])
  c.set('2027-01-11T11:00')
  // 夜話と同じく record: 'visit'（この会話そのものの noteSeen で lastMet を書き換えない）
  const yume = talk(story, p, 'tengu', 'yume', ['またね'], { clock: c.story(), record: 'visit' })
  ok(yume.seen.includes('てんぐ: きょうは夢の中じゃな。') && !yume.seen.some((l) => l.includes('歩いて')), `metToday yume（${yume.seen.join(' | ')}）`)
  const none = talk(story, p, 'tengu', 'yume', ['またね'], { record: 'visit' })
  ok(!none.seen.some((l) => l.includes('きょうは')), '時計が無ければ metToday は偽（台詞を飛ばす）')
  // 現地で会った日
  const q = store(undefined, c)
  q.meet('tengu', 'utsutsu')
  q.setFlag('qa-asked', true)
  q.noteTalk('tengu', 'utsutsu')
  c.advance(60_000)
  const site = talk(story, q, 'tengu', 'yume', ['またね'], { clock: c.story(), record: 'visit' })
  ok(site.seen.includes('てんぐ: きょうは歩いて来たな。') && !site.seen.includes('てんぐ: きょうは夢の中じゃな。'), 'metToday utsutsu')
  // 次の日（04:00 を過ぎた）
  c.set('2027-01-12T09:00')
  const next = talk(story, q, 'tengu', 'yume', ['またね'], { clock: c.story(), record: 'visit' })
  ok(!next.seen.some((l) => l.includes('きょうは')), '前の日に会っただけなら、metToday は偽')
  // any
  const anyScript: DialogueScript = {
    ...story.scripts.tengu,
    id: 'any',
    entries: [{ node: 'n' }],
    nodes: { n: { lines: [{ speaker: 'tengu', text: '…' }, { speaker: 'tengu', when: [{ metToday: 'any' }], text: 'きょう会うた。' }], end: true } },
  }
  c.set('2027-01-12T10:00')
  q.noteSeen('tengu', 'utsutsu')
  c.advance(60_000)
  const any = talk({ ...story, scripts: { any: anyScript } }, q, 'any', 'yume', [], { clock: c.story(), record: 'visit' })
  ok(any.seen.includes('てんぐ: きょう会うた。'), 'metToday any')
}

// noteSeen: 妖怪が最初に話したら、その日に会ったことに（回数は増やさない）
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  const r = talk(story, p, 'tengu', 'yume', [], { stopAfter: 1 })
  const y = p.get().yokai.tengu
  ok(!r.ended && y?.lastMet?.at === new Date(c.ms).toISOString() && (y?.talks ?? 0) === 0 && y?.dreamMet?.at === y?.lastMet?.at, '妖怪の最初の台詞で lastMet（途中で閉じても）・talks は 0')
  const q = store(undefined, c)
  talk(story, q, 'tengu', 'yume', [], { stopAfter: 0 })
  ok(!q.get().yokai.tengu, 'ましろの台詞だけで閉じたら、会ったことにしない')
}

// record: 'visit'（夜話）: talks + 1 だけ
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  talk(story, p, 'tengu', 'yume', [0])
  talk(story, p, 'tengu', 'yume', ['頼みは'])
  const before = structuredClone(p.get().yokai.tengu)
  c.set('2027-01-11T20:00')
  let finished = 0
  const r = talk(story, p, 'yb-tengu', 'yume', [0], { record: 'visit', clock: c.story(), entry: 'a', onFinish: () => finished++ })
  const after = p.get().yokai.tengu
  ok(r.ended && after.talks === (before.talks ?? 0) + 1, `夜話を最後まで聞くと talks + 1（${before.talks} → ${after.talks}）`)
  ok(JSON.stringify(after.lastMet) === JSON.stringify(before.lastMet) && JSON.stringify(after.dreamMet) === JSON.stringify(before.dreamMet) && after.bond === before.bond, '夜話は lastMet・dreamMet・縁を変えない')
  ok(finished === 1, 'onFinish は最後まで来たとき1回')
  let early = 0
  talk(story, p, 'yb-tengu', 'yume', [0], { record: 'visit', entry: 'a', stopAfter: 1, onFinish: () => early++ })
  ok(early === 0 && p.get().yokai.tengu.talks === after.talks, '途中で閉じたら onFinish も回数も無し')
}

// showCard は開かない・timePiece は始めた時の時計で
{
  const c = clockAt('2027-01-11T20:00')
  const p = store(undefined, c)
  p.setFlag('qa-done', true)
  const shown = talk(story, p, 'yb-tengu', 'yume', [], { record: 'visit', entry: 'b' })
  ok(shown.trail === 'b' && !p.isCardOpened('c2') && !shown.seen.some((l) => l.startsWith('[札]')), 'showCard は、開いていない札を開かない（見せない）')
  p.openCard('c2', 'yume')
  const again = talk(story, p, 'yb-tengu', 'yume', [], { record: 'visit', entry: 'b' })
  const cardBeat = again.beats.find((b) => b.kind === 'card')
  ok(cardBeat?.kind === 'card' && cardBeat.first === false && again.seen.includes('[札] ふたつめの札'), 'showCard は開いた札を、もう一度見せる（first: false）')
  // 逢魔が時（1/16 16:40）に始めた
  c.set('2027-01-16T16:40')
  const dusk = c.story()
  const q = store(undefined, c)
  const k = talk(story, q, 'kuragari', 'yume', [], { clock: dusk })
  const n = k.beats.find((b) => b.kind === 'notice' && b.notice.type === 'piece')
  const notice = n?.kind === 'notice' ? (n.notice as Extract<Notice, { type: 'piece' }>) : null
  ok(q.pieceOf('fumoto-kuragari') === 'saishiki' && q.get().pieces['fumoto-kuragari'].colored?.time === true, '逢魔が時なら家でも彩色（time）')
  ok(notice?.state === 'saishiki' && notice.time === true && notice.travel === 'yume', 'お知らせに time')
  // 始めた時が逢魔が時なら、終わりをまたいでも色が入る（会話の時計は始めた時のもの）
  const r = store(undefined, c)
  c.set('2027-01-16T17:17')
  const snapshot = c.story()
  c.set('2027-01-16T17:30')
  talk(story, r, 'kuragari', 'yume', [], { clock: snapshot })
  ok(snapshot.phase === 'oumagatoki' && r.pieceOf('fumoto-kuragari') === 'saishiki', '17:17 に始めた会話は、17:30 に色が入っても彩色')
  // 昼なら白描
  c.set('2027-01-16T12:00')
  const s = store(undefined, c)
  const noon = talk(story, s, 'kuragari', 'yume', [], { clock: c.story() })
  const nn = noon.beats.find((b) => b.kind === 'notice' && b.notice.type === 'piece')
  ok(s.pieceOf('fumoto-kuragari') === 'hakubyo' && nn?.kind === 'notice' && nn.notice.type === 'piece' && nn.notice.time === false, '昼なら白描（time: false）')
  const nightRun = talk(story, s, 'kuragari', 'yume', [], { clock: storyClock(jst('2027-01-16T20:00')) })
  ok(s.pieceOf('fumoto-kuragari') === 'hakubyo' && !nightRun.beats.some((b) => b.kind === 'notice' && b.notice.type === 'piece'), '変わらなければお知らせは出ない')
  ok(talk(story, s, 'kuragari', 'yume', [], { clock: dusk }).beats.some((b) => b.kind === 'notice' && b.notice.type === 'piece') && s.pieceOf('fumoto-kuragari') === 'saishiki', '白描のあと、逢魔が時に会えば彩色')
  // 時計が無ければ白描
  const t = store(undefined, c)
  talk(story, t, 'kuragari', 'yume', [])
  ok(t.pieceOf('fumoto-kuragari') === 'hakubyo', '時計が無ければ白描')
}

// 了承待ち
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  const pendingScript = { ...story.scripts.tengu, id: 'pending', needsConsent: true as const }
  const r = new DialogueRunner(pendingScript, { progress: p, cards: story.cards, travel: 'yume' })
  ok(r.start().kind === 'end' && !p.get().yokai.tengu, '了承待ちの台本は始めない（すぐ end）')
  talk(story, p, 'tengu', 'yume', [0])
  const g = talk(story, p, 'tengu', 'yume', ['またね'])
  ok(g.seen.some((l) => l.startsWith('[選]')) && !g.seen.some((l) => l.includes('ひみつの話')), '了承待ちの選択肢は出さない')
  const cards = { ...story.cards, c1: { ...story.cards.c1, title: '', body: '', needsConsent: true as const } }
  const q = store(undefined, c)
  new DialogueRunner(story.scripts.tengu, { progress: q, cards, travel: 'yume' }).start()
  talk({ ...story, cards }, q, 'tengu', 'yume', [0])
  ok(!q.isCardOpened('c1') && q.hasMet('tengu'), '了承待ちの札は開かない（ほかの効果は進む）')
  q.openCard('c1', 'yume')
  const hand = etokiHand(['c1', 'c2', 'pending:x'], cards, q)
  ok(hand[0].blank === 'pending' && !hand[0].card && hand[1].blank === 'missing' && hand[2].blank === 'pending', '了承待ちの札は、開いていても手札は白紙（pending）')
}

// start(entryId)
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  ok(talk(story, p, 'yb-tengu', 'yume', [], { record: 'visit', entry: 'c' }).trail === 'c', 'start(entryId) でその入口から')
  ok(talk(story, p, 'yb-tengu', 'yume', [0], { record: 'visit', entry: 'b' }).trail.startsWith('a'), '入口の条件が成り立たなければ、上から最初に成り立つ入口')
  ok(talk(story, p, 'yb-tengu', 'yume', [0], { record: 'visit', entry: 'nope' }).trail.startsWith('a'), '知らない入口も、上から')
}

// 選択肢の数の点検（metToday の取りうる値・了承待ちは数えない）
{
  const base = story.scripts.tengu
  const mk = (choices: DialogueScript['nodes'][string]['choices']): DialogueScript => ({
    ...base,
    id: 'mc',
    entries: [{ node: 'n' }],
    nodes: { n: { lines: [{ speaker: 'tengu', text: '…' }], choices }, e: { lines: [{ speaker: 'tengu', text: '…' }], end: true } },
  })
  const okSet = mk([
    { text: 'a', next: 'e', when: [{ metToday: 'yume' }] },
    { text: 'b', next: 'e', when: [{ metToday: 'utsutsu' }] },
    { text: 'c', next: 'e' },
    { text: 'd', next: 'e' },
  ])
  ok(!check(okSet).some((m) => m.includes('同時に')), 'metToday の yume と utsutsu は同時に出ない（3つまで）')
  const anySet = mk([
    { text: 'a', next: 'e', when: [{ metToday: 'yume' }] },
    { text: 'b', next: 'e', when: [{ metToday: 'any' }] },
    { text: 'c', next: 'e' },
    { text: 'd', next: 'e' },
  ])
  ok(check(anySet).some((m) => m.includes('同時に 4 つ')), 'metToday の yume と any は同時に出る（4つ）')
  const consent = mk([
    { text: 'a', next: 'e' },
    { text: 'b', next: 'e' },
    { text: 'c', next: 'e' },
    { text: 'd', next: 'e', needsConsent: true },
  ])
  ok(!check(consent).some((m) => m.includes('同時に')), '了承待ちの選択肢は数えない')
}

// 点検（validateScript）
{
  const base = story.scripts.tengu
  const yb = story.scripts['yb-tengu']
  const errsOf = (s: DialogueScript) => check(s).join(' / ')
  const withNode = (s: DialogueScript, node: string, patch: object): DialogueScript => ({ ...s, nodes: { ...s.nodes, [node]: { ...s.nodes[node], ...patch } } })
  ok(errsOf({ ...base, entries: [{ when: [{ moon: true } as never], node: 'f1' }, ...base.entries.slice(1)] }).includes('は知らない'), '知らない条件')
  ok(errsOf(withNode(base, 'f3', { effects: [{ dance: 1 } as never] })).includes('効果'), '知らない効果')
  ok(errsOf({ ...base, entries: [{ when: [{ flag: 'x' } as never], node: 'f1' }, ...base.entries.slice(1)] }).includes('は知らない'), 'is の無い flag の条件')
  ok(errsOf(withNode(base, 'f1', { lines: [{ speaker: 'mashiro', text: '{名前}、こんにちは。' }] })).includes('{名前}'), '知らない差し込み {名前}')
  ok(errsOf(withNode(base, 'f1', { lines: [{ speaker: 'tengu', text: '{呼び名}、来たか。' }] })).includes('ましろだけ'), '妖怪の台詞に {呼び名}')
  ok(errsOf(withNode(base, 'f2', { choices: [{ text: '{呼び名}だよ', next: 'f3' }, { text: 'いや', next: 'f4' }] })).includes('選択肢'), '選択肢に {呼び名}')
  ok(errsOf(withNode(base, 'f1', { lines: [{ speaker: 'mashiro', text: '{呼び名' }] })).includes('{'), '対の無い {')
  ok(errsOf(withNode(yb, 'c', { effects: [{ meet: true }] })).includes('showCard だけ'), '夜話に meet')
  ok(errsOf({ ...yb, entries: [...yb.entries.slice(0, 3)] }).includes('again'), '夜話の最後の入口が again でない')
  ok(errsOf({ ...yb, entries: [...yb.entries.slice(0, 3), { id: 'again', when: [{ flag: 'x', is: true }], node: 'z' }] }).includes('again'), '夜話の again に条件')
  ok(errsOf({ ...yb, entries: [{ node: 'a' }, ...yb.entries.slice(1)] }).includes('id がない'), '夜話の入口に id が無い')
  ok(errsOf({ ...yb, yokaiId: undefined }).includes('yokaiId'), '夜話に妖怪が無い')
  ok(errsOf(withNode(base, 'f3', { effects: [{ timePiece: 'fumoto-tengu' }] })).includes('時間のピースでない'), 'timePiece が時間のピースでない')
  ok(errsOf(withNode(base, 'f3', { effects: [{ showCard: 'nope' }] })).includes('札 nope がない'), 'showCard の札が無い')
  ok(errsOf({ ...base, entries: [{ id: 'x', node: 'f1' }, { id: 'x', node: 'a1' }, { id: 'again', node: 'g1' }] }).includes('2回'), '入口の id が重なる')
  ok(errsOf({ ...story.scripts['etoki-first'], entries: [{ when: [{ metToday: 'yume' }], node: 'f1' }] }).includes('妖怪を書く'), '妖怪のいない台本の metToday に妖怪が無い')
  ok(errsOf(withNode(base, 'g1', { lines: [{ speaker: 'tengu', text: '…', when: [{ when: 1 } as never] }] })).includes('台詞の条件'), '台詞の条件も見る')
  ok(isKnownCondition({ metToday: 'any' }) && !isKnownCondition({ metToday: 'boat' }) && !isKnownCondition({ flag: 'a', is: true, extra: 1 }) && !isKnownCondition({ met: true, card: 'x', opened: true }), 'isKnownCondition')
  ok(isKnownEffect({ showCard: 'c1' }) && isKnownEffect({ piece: 'p', state: 'hakubyo' }) && !isKnownEffect({ piece: 'p' }) && !isKnownEffect({ flag: 'x', value: 'yes' }), 'isKnownEffect')
}
done()
