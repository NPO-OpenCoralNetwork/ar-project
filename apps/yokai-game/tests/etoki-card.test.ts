// 今日の絵解き（core/story/etoki-card.ts。テスト用の物語）: 札の並び・並べない組み合わせ・振り返り・添え書き・同じ日はつくり直し・etoki-first
import {
  captionKey,
  captionText,
  ETOKI_PIECE,
  type EtokiEnv,
  etokiPairAllowed,
  etokiPool,
  etokiRecap,
  metTodayIds,
  namesText,
  needsEtokiScript,
  questDoneToday,
  saveTodayEtoki,
  validateEtokiFile,
} from '../src/core/story/etoki-card'
import type { ProgressStore } from '../src/core/story/progress'
import type { LoreCard } from '../src/core/story/types'
import { clockAt, done, fixtureStory, memoOf, ok, snap, store, talk, type TestClock } from './helpers'

const base = fixtureStory()
const extra = (id: string, topics?: LoreCard['topics'], more: Partial<LoreCard> = {}): LoreCard => ({ ...base.cards.c1, id, title: `札 ${id}`, ...(topics ? { topics } : {}), ...more })
const story = {
  ...base,
  yokai: { ...base.yokai, kappa: { id: 'kappa', name: 'かっぱ' } },
  cards: { ...base.cards, bird: extra('bird', ['raicho']), god: extra('god', ['kami']), wait: extra('wait', undefined, { title: '', body: '', needsConsent: true }) },
}
const envOf = (p: ProgressStore, c: TestClock, memo = memoOf('さくら')): EtokiEnv => ({ progress: p, story, clock: c.story(), memo })

// 札の並び（今日開いた順 → それより前は新しい順）・了承待ちは出さない
{
  const c = clockAt('2027-01-10T10:00')
  const p = store(undefined, c)
  p.openCard('c1', 'yume')
  c.set('2027-01-10T12:00')
  p.openCard('c3', 'yume')
  p.openCard('wait', 'yume')
  c.set('2027-01-11T09:00')
  p.openCard('bird', 'yume')
  c.set('2027-01-11T08:00')
  p.openCard('c2', 'yume')
  c.set('2027-01-11T20:00')
  const pool = etokiPool(envOf(p, c))
  ok(pool.today.join() === 'c2,bird' && pool.earlier.join() === 'c3,c1', `今日の札が先（開いた順）、そのあと新しい順。了承待ちは出ない（${pool.today.join()} / ${pool.earlier.join()}）`)
  snap('pool', pool)
}

// 並べない組み合わせ（雷鳥と神仏）
ok(!etokiPairAllowed(['bird', 'god'], story.cards) && etokiPairAllowed(['bird', 'c1'], story.cards) && etokiPairAllowed(['god', 'c2'], story.cards) && etokiPairAllowed([], story.cards), '雷鳥の札と神仏の札は並べない')

// 名前の並べ方
ok(namesText([], story) === '' && namesText(['tengu'], story) === 'てんぐ' && namesText(['tengu', 'kuragari'], story) === 'てんぐとくらがり' && namesText(['tengu', 'kuragari', 'kappa'], story) === 'てんぐ、くらがり、かっぱ', '名前: 1人・2人（と）・3人（、）')

// 振り返り
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  const none = etokiRecap(envOf(p, c))
  ok(!none.canMake && none.lines.join('|') === 'さくら、きょうの話を、ふりかえってみよう。|きょうは、だれにも会わなかったね。|まだ、札がないね。', `札が無ければつくれない（${none.lines.join('|')}）`)
  ok(etokiRecap(envOf(p, c, memoOf(null))).lines[0].startsWith('きみ、'), '呼び名が無ければ「きみ」')
  talk(story, p, 'tengu', 'yume', ['またこんど'])
  const one = etokiRecap(envOf(p, c))
  ok(one.canMake && one.lines.join('|') === 'さくら、きょうの話を、ふりかえってみよう。|きょうは、てんぐに会ったね。|新しい札も、ひらいたね。|札を、三枚まで選んでみて。', `1人に会って札が開いた日（${one.lines.join('|')}）`)
  p.meet('kuragari', 'yume')
  p.noteSeen('kuragari', 'yume')
  p.noteSeen('kappa', 'yume')
  ok(metTodayIds(envOf(p, c)).join() === 'tengu,kuragari', 'まだ会っていない（met の無い）妖怪は、名前を出さない')
  p.meet('kappa', 'yume')
  ok(etokiRecap(envOf(p, c)).lines[1] === 'きょうは、てんぐ、くらがり、かっぱに会ったね。' && metTodayIds(envOf(p, c)).join() === 'tengu,kuragari,kappa', '3人（yokai.json の順）')
  c.set('2027-01-12T10:00')
  p.noteSeen('kuragari', 'yume')
  const next = etokiRecap(envOf(p, c))
  ok(next.lines[1] === 'きょうは、くらがりに会ったね。' && next.lines.length === 3 && next.canMake, '次の日: 今日会った妖怪だけ・新しい札の一言は無し')
  ok(captionKey(envOf(p, c)) === 'met:kuragari' && captionText('met:kuragari', story) === 'きょうは、くらがりに会った日。', '添え書き（会った日）')
  ok(captionText('none', story) === 'きょうの話から。' && captionText('met:nobody', story) === 'きょうの話から。' && captionText('q:nope', story) === 'きょうの話から。', '添え書き（無し・知らない鍵）')
}

// 今日解けた悩み（flagAt・given.at）
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  p.setFlag('qa-asked', true)
  p.setFlag('qa-done', true)
  ok(questDoneToday(envOf(p, c))?.id === 'qa', '今日フラグが立って解けた悩み')
  const r = etokiRecap(envOf(p, c))
  ok(r.lines.includes('てんぐの頼みが、かなった。'), '振り返りに悩みの一言')
  ok(captionKey(envOf(p, c)) === 'q:qa' && captionText('q:qa', story) === 'てんぐの頼みが、かなった。', '添え書きは悩みの一言')
  c.set('2027-01-12T10:00')
  ok(questDoneToday(envOf(p, c)) === null, '次の日にはもう「今日」ではない')
  p.receive('mochi', 'yume')
  c.set('2027-01-12T11:00')
  p.deliver('mochi', 'yume')
  ok(questDoneToday(envOf(p, c))?.id === 'qb', '渡した時（given.at）が今日なら解けた')
}

// 残す・同じ日はつくり直し
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  for (const id of ['c1', 'c2', 'c3', 'bird', 'god', 'wait']) p.openCard(id, 'yume')
  p.meet('tengu', 'yume')
  p.noteSeen('tengu', 'yume')
  saveTodayEtoki(envOf(p, c), ['c1', 'c1', 'nope', 'wait', 'c2', 'c3', 'bird'], 'fushigi', 'yume')
  const e = p.etokiOf('2027-01-11')
  ok(e?.cards.join() === 'c1,c2,c3' && e.phrase === 'fushigi' && e.caption === 'met:tengu' && e.travel === 'yume', `重ね・知らない札・了承待ちを飛ばし3枚まで（${e?.cards.join()}）`)
  c.set('2027-01-11T11:00')
  saveTodayEtoki(envOf(p, c), ['bird', 'god', 'c2'], 'だれかに話したい', 'utsutsu')
  const e2 = p.etokiOf('2027-01-11')
  ok(e2?.cards.join() === 'bird,c2' && e2.phrase === 'hanashitai' && e2.travel === 'utsutsu' && Object.keys(p.get().etoki).length === 1, '同じ日はつくり直し（並べない札は飛ばす・一言の字は id に直す）')
  saveTodayEtoki(envOf(p, c), ['c1'], 'nonsense', 'yume')
  ok(p.etokiOf('2027-01-11')?.phrase === undefined, '知らない一言は付けない')
  saveTodayEtoki(envOf(p, c), ['nope'], undefined, 'yume')
  ok(p.etokiOf('2027-01-11')?.cards.join() === 'c1', '札が1枚も無ければ残さない（前のまま）')
}

// etoki-first を走らせるか・走らせた結果
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  ok(needsEtokiScript(p, 'yume') && needsEtokiScript(p, 'utsutsu'), '絵解きのピースが空白なら走らせる')
  const r = talk(story, p, 'etoki-first', 'yume')
  ok(r.trail === 'f1>f2' && p.pieceOf(ETOKI_PIECE) === 'hakubyo' && p.isCardOpened('c2'), '家では白描・札が開く')
  ok(!needsEtokiScript(p, 'yume') && needsEtokiScript(p, 'utsutsu'), '白描なら、家では走らせず、現地では走らせる')
  const s = talk(story, p, 'etoki-first', 'utsutsu')
  ok(s.trail === 'color' && p.pieceOf(ETOKI_PIECE) === 'saishiki' && !needsEtokiScript(p, 'utsutsu'), '現地でつくると彩色')
}

// 点検
{
  ok(validateEtokiFile(story.etoki).length === 0, 'テスト用の絵解きのデータは点検を通る')
  const e = story.etoki
  const errs = validateEtokiFile({
    ...e,
    phrases: [...e.phrases.slice(0, 4), { id: 'fushigi', text: 'とてもとても長い一言がここに入る' }],
    recap: { ...e.recap, met: '{名前}に会ったね' },
    lines: { ...e.lines, bye: '' },
  })
  ok(['一言は6〜8', '2回', '14字', '{名前}', 'bye'].every((w) => errs.some((m) => m.includes(w))), `一言の数・id・長さ・差し込み・欠けた文（${errs.join(' / ')}）`)
}
done()
