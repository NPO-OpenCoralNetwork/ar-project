// 便り（core/story/letters.ts。テスト用の物語）: ましろの便りは遊んだ日のあと1通・また聞きは1日1通・悩みの便りはすぐ・
// 部品は届いた時のまま・文は読む時に組み立てる・読むことや夜話は「遊んだ」に数えない
import { composeDaily, deliverDue, hasUnreadLetter, lastPlayMs, letterList, letterView, openLetter, type TayoriEnv } from '../src/core/story/letters'
import type { MemoReader } from '../src/core/story/memo'
import type { ProgressStore } from '../src/core/story/progress'
import { clockAt, done, fixtureStory, memoOf, ok, snap, store, talk, type TestClock } from './helpers'

const story = fixtureStory()
const envAt = (p: ProgressStore, c: TestClock, iso: string, memo?: MemoReader): TayoriEnv => {
  c.set(iso)
  return { progress: p, story, clock: c.story(), memo }
}
const daily = (p: ProgressStore) => Object.keys(p.get().letters).filter((id) => id.startsWith('fumi:')).sort()

// はじめて遊んだ日には届かない。次の日にはじめて開くと1通
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  talk(story, p, 'tengu', 'yume', ['またこんど'])
  ok(deliverDue(envAt(p, c, '2027-01-11T20:00')).length === 0, 'はじめて遊んだ日には、何も届かない')
  const got = deliverDue(envAt(p, c, '2027-01-12T08:00'))
  const parts = p.letter('fumi:2027-01-12')?.parts ?? []
  ok(got.join() === 'fumi:2027-01-12', '次の日にはじめて開くと、ましろの便り')
  ok(parts[0] === 'ask' && parts[1].startsWith('open:') && parts.some((x) => /^snip:ta[12]$/.test(x)) && parts[parts.length - 1].startsWith('close:'), `部品: ask・open・言い回し・close（${parts.join(' ')}）`)
  ok(parts.includes('hint:kuragari'), 'くらがりにまだ会っていなければ、そえる一言')
  snap('first daily', parts)
  ok(deliverDue(envAt(p, c, '2027-01-12T21:00')).length === 0, '同じ日にもう一度開いても、何も届かない')
  ok(deliverDue(envAt(p, c, '2027-01-13T08:00')).length === 0, '間に遊ばなければ、次の日も届かない')
  // その日に遊ぶ（届いたあと）→ 次の日に1通
  c.set('2027-01-13T09:00')
  p.noteTalk('tengu', 'yume')
  ok(deliverDue(envAt(p, c, '2027-01-14T08:00')).join() === 'fumi:2027-01-14', '遊んだ次の日に1通')
  ok(!(p.letter('fumi:2027-01-14')?.parts ?? []).includes('ask'), '呼び名を聞くのは、はじめの便りだけ')
  // 届く少し前に話し終えた会話も、次の便りで受ける（届いた日のうちの遊びは、次の便りへ）
  c.set('2027-01-15T07:59')
  p.noteSeen('tengu', 'yume')
  ok(deliverDue(envAt(p, c, '2027-01-15T08:00')).length === 0, '前の日に遊んでいなければ、届かない（その日の遊びは次へ）')
  ok(deliverDue(envAt(p, c, '2027-01-16T08:00')).join() === 'fumi:2027-01-16', '1/15 の朝に遊んだ分で、1/16 に1通')
  // たまった分をまとめて出さない
  for (const d of ['17', '18', '19']) {
    c.set(`2027-01-${d}T09:00`)
    p.noteSeen('tengu', 'yume')
  }
  ok(deliverDue(envAt(p, c, '2027-01-22T08:00')).join() === 'fumi:2027-01-22' && daily(p).join() === 'fumi:2027-01-12,fumi:2027-01-14,fumi:2027-01-16,fumi:2027-01-22', '何日遊んでも、開いた日に1通だけ（たまった分は出さない）')
}

// 読むこと・夜話は「遊んだ」に数えない（便りを読んで開いた札も）
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  p.meet('tengu', 'yume')
  p.raiseBond('tengu', 'najimi', 'yume')
  deliverDue(envAt(p, c, '2027-01-12T08:00'))
  ok(daily(p).length === 1, '1通目')
  c.set('2027-01-12T09:00')
  p.setFlag('qa-done', true)
  const got = deliverDue(envAt(p, c, '2027-01-13T08:00'))
  ok(got.join() === 'mg-tengu', 'また聞きはフラグの次の日（その日はましろの便りを重ねない）')
  c.set('2027-01-13T09:00')
  for (const id of letterList(p, story).map((l) => l.id)) openLetter(id, p, story)
  ok(p.isCardOpened('c1') && !hasUnreadLetter(p, story), '読むと札の部品が開く・「新」が消える')
  c.set('2027-01-13T20:00')
  p.startNight('2027-01-13', 'tengu', 'a')
  p.noteVisit('tengu')
  p.finishNight('2027-01-13')
  ok(lastPlayMs(p.get(), '2027-01-14', story) === Date.parse(p.get().yokai.tengu.bondGained!.at), '読んだ・夜話・その便りで開いた札は、遊んだ印にならない')
  ok(deliverDue(envAt(p, c, '2027-01-14T08:00')).length === 0, 'だから次の日にましろの便りは届かない')
}

// また聞き: 1日1通・フラグの時が分からなければすぐ・了承待ちは届けない・悩みの便りはすぐ
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  p.noteSeen('tengu', 'yume')
  p.setFlag('qa-asked', true)
  p.setFlag('qa-done', true)
  ok(deliverDue(envAt(p, c, '2027-01-11T12:00')).length === 0, '同じ日（days: 1）にはまだ。了承待ちの便り（days: 0）は届けない')
  ok(deliverDue(envAt(p, c, '2027-01-12T08:00')).join() === 'mg-tengu', '二つ届くはずでも、1日1通（データの順）')
  ok(deliverDue(envAt(p, c, '2027-01-13T08:00')).join() === 'mg-two', '次の日にもう1通')
  ok(!p.letter('secret') && !letterList(p, story).some((l) => l.id === 'secret'), '了承待ちの便りは届かない')
  const old = store(undefined, c)
  old.mergeFrom({ ...old.get(), flags: { 'qa-done': true }, flagAt: {} })
  ok(deliverDue(envAt(old, c, '2027-01-13T09:00')).join() === 'mg-tengu', 'フラグの時が分からない古い保存は、すぐ届く')
  // 悩みの便りはすぐ。読んだら onRead のフラグ
  c.set('2027-01-16T16:40')
  const q = store(undefined, c)
  talk(story, q, 'kuragari', 'yume', [], { clock: c.story() })
  const got = deliverDue(envAt(q, c, '2027-01-16T16:45'))
  ok(got.join() === 'kage' && q.flag('kg-asked'), 'はじめて遊んだ日でも、悩みの便りはすぐ')
  ok(!q.flag('kg-read') && hasUnreadLetter(q, story), 'まだ読んでいない')
  const v = openLetter('kage', q, story)
  ok(v?.read === true && q.flag('kg-read') && !hasUnreadLetter(q, story), '読むと read と onRead のフラグ')
  ok(deliverDue(envAt(q, c, '2027-01-17T08:00')).join() === 'fumi:2027-01-17', '次の日にはましろの便り')
}

// 呼び名を聞く・言い回しの段・続けて同じ言い回しにしない・部品は届いた時のまま
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  p.meet('tengu', 'yume')
  const named = deliverDue(envAt(p, c, '2027-01-12T08:00', memoOf(null, true)))
  ok(named.length === 1 && !p.letter(named[0])!.parts.includes('ask'), '呼び名を消した（消した印がある）なら聞かない')
  // 艶2段（5回）から b
  for (let i = 0; i < 5; i++) p.noteTalk('tengu', 'yume')
  // 一日おきに開いて、届いたあとで遊ぶ（届いた便りを比べる）。合う言い回しは tb1・tb3 の2つで、一日おきの日は日の番号の偶奇が
  // 同じなので、前の便りの言い回しを避けなければ、毎回同じ言い回しになる
  const got: string[] = []
  for (const d of ['13', '15', '17', '19']) {
    got.push(...deliverDue(envAt(p, c, `2027-01-${d}T08:00`)))
    c.set(`2027-01-${d}T09:00`)
    p.noteSeen('tengu', 'yume')
  }
  ok(got.join() === 'fumi:2027-01-13,fumi:2027-01-15,fumi:2027-01-17,fumi:2027-01-19', `一日おきに、ましろの便りが1通ずつ（${got.join(' ')}）`)
  const snips = got.map((id) => p.letter(id)?.parts.find((x) => x.startsWith('snip:')) ?? '')
  ok(snips.every((s) => /^snip:tb[13]$/.test(s)), `艶2段からは b の言い回し（条件の合うものだけ。${snips.join(' ')}）`)
  ok(snips.every((s, i) => i === 0 || s !== snips[i - 1]), `続けて同じ言い回しにしない（届いた便りの部品: ${snips.join(' ')}）`)
  p.setFlag('qa-done', true)
  c.set('2027-01-20T07:00')
  const withGate = composeDaily({ progress: p, story, clock: c.story() })
  ok(withGate.some((x) => /^snip:tb[123]$/.test(x)), '条件つきの言い回しも候補に入る')
  // また聞きの部品（言い回しの段）は届いた時のまま
  const q = store(undefined, c)
  q.meet('tengu', 'yume')
  q.setFlag('qa-done', true)
  deliverDue(envAt(q, c, '2027-01-21T08:00'))
  const before = q.letter('mg-tengu')!.parts.join()
  ok(before === 'p1,q1,c1,s1.a', `部品（条件の合わない p2 は入れない。艶0段は s1.a）: ${before}`)
  for (let i = 0; i < 10; i++) q.noteTalk('tengu', 'yume')
  q.deliver('mochi', 'yume')
  ok(q.letter('mg-tengu')!.parts.join() === before, 'あとで艶や持ち物が変わっても、部品は届いた時のまま')
  const view = letterView('mg-tengu', q, story)
  ok(view?.blocks.some((b) => b.kind === 'p' && b.text === 'てんぐは、山を見ていた。') === true, '言い回しは届いた時の段（a）')
}

// まだ会っていない（最初の台詞だけで閉じた）妖怪の名前は、言い回しに出さない
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  talk(story, p, 'tengu', 'yume', [], { stopAfter: 1 })
  ok(!p.hasMet('tengu') && !!p.get().yokai.tengu?.lastMet, '最初の台詞だけで閉じた（lastMet はある・会ってはいない）')
  deliverDue(envAt(p, c, '2027-01-12T08:00'))
  const parts = p.letter('fumi:2027-01-12')?.parts ?? []
  ok(parts.length > 0 && !parts.some((x) => x.startsWith('snip:')), `遊んだ印にはなるが、言い回しには出さない（${parts.join(' ')}）`)
}

// 読む時に組み立てる（差し込み・消えた部品）・一覧の順
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  p.noteSeen('tengu', 'yume')
  deliverDue(envAt(p, c, '2027-01-12T08:00'))
  const id = 'fumi:2027-01-12'
  const asked = letterView(id, p, story)!
  ok(asked.blocks[0].kind === 'head' && asked.blocks[0].text === 'きみへ', '頭は「きみへ」（呼び名が無い）')
  ok(asked.blocks.some((b) => b.kind === 'ask') && asked.blocks.some((b) => b.kind === 'p' && b.text.startsWith('きみのこと')), '呼び名を聞く一文とボタン')
  ok(asked.blocks[asked.blocks.length - 1].kind === 'sign' && (asked.blocks[asked.blocks.length - 1] as { text: string }).text === 'ましろ', '終わりは「ましろ」')
  const named = letterView(id, p, story, memoOf('さくら'))!
  ok(named.blocks[0].kind === 'head' && named.blocks[0].text === 'さくらへ' && !named.blocks.some((b) => b.kind === 'ask'), '呼び名を書いたら「さくらへ」・もう聞かない')
  ok(letterView(id, p, story, memoOf(null, true))!.blocks[0].kind === 'head' && !letterView(id, p, story, memoOf(null, true))!.blocks.some((b) => b.kind === 'ask'), '消したら「きみへ」・聞かない')
  // データから消えた部品は飛ばす
  const edited = { ...story, tayori: { ...story.tayori, daily: { ...story.tayori.daily, open: [] as string[] } } }
  const v2 = letterView(id, p, edited)!
  ok(v2.blocks.length === asked.blocks.length - 1, 'データから消えた部品は飛ばす')
  // また聞き: 引用と札
  p.setFlag('qa-done', true)
  deliverDue(envAt(p, c, '2027-01-13T08:00'))
  const mg = letterView('mg-tengu', p, story, memoOf('さくら'))!
  const quote = mg.blocks.find((b) => b.kind === 'quote')
  const cardB = mg.blocks.find((b) => b.kind === 'card')
  ok(quote?.kind === 'quote' && quote.name === 'てんぐ' && quote.text === '頼みが、かなった。', '妖怪の言葉は白描の頁（名前つき）')
  ok(cardB?.kind === 'card' && cardB.card.id === 'c1' && cardB.lead === 'てんぐの昔の話は、この札のとおり。', '札の枠と前置き')
  const pending = { ...story, cards: { ...story.cards, c1: { ...story.cards.c1, title: '', body: '', needsConsent: true as const } } }
  ok(!letterView('mg-tengu', p, pending)!.blocks.some((b) => b.kind === 'card'), '了承待ちになった札は見せない')
  // 一覧: 新しい順・データに無い id は出さない
  p.mergeFrom({ ...p.get(), letters: { ...p.get().letters, 'gone-letter': { got: '2027-01-14T00:00:00.000Z', parts: [] } } })
  const list = letterList(p, story)
  ok(list.map((l) => l.id).join() === 'mg-tengu,fumi:2027-01-12', `新しい順・データに無い便りは出さない（${list.map((l) => l.id).join()}）`)
  ok(list[1].title === 'ましろの便り' && list[1].kind === 'daily' && list[0].kind === 'matagiki' && !list[0].read, '題と種類と読んだか')
  ok(letterView('gone-letter', p, story) === null && openLetter('nope', p, story) === null, 'データに無い・届いていない便りは null')
}

// そえる一言の回数（max）
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  const hints: string[] = []
  for (const d of ['11', '12', '13', '14']) {
    c.set(`2027-01-${d}T10:00`)
    deliverDue({ progress: p, story, clock: c.story() })
    p.noteSeen('tengu', 'yume')
  }
  for (const id of daily(p)) hints.push(p.letter(id)!.parts.find((x) => x.startsWith('hint:')) ?? '-')
  ok(hints.join() === 'hint:kuragari,hint:kuragari,-', `くらがりの一言は2回まで（${hints.join()}）`)
}
done()
