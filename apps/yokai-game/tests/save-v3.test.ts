// 保存の版3（core/story/progress.ts）: v3 ← v2 ← v1 の写し方・便り/夜話/絵解きの読み方・時間のピース・合わせ方
import { LEGACY_STORY_KEY, LEGACY_TEST_KEY, SIM_KEY, STORY_KEY, TEST_KEY, V2_STORY_KEY, V2_TEST_KEY } from '../src/core/storage-keys'
import { emptyProgress, type Gained, mergeProgress, migrateLegacySave, ProgressStore, sanitize, UnknownVersion } from '../src/core/story/progress'
import { clockAt, done, kv, ok, snap, store } from './helpers'

const G = (travel: 'yume' | 'utsutsu', at = '2027-01-10T01:00:00.000Z'): Gained => ({ at, travel, onsite: travel === 'utsutsu' })
const DONE = (k: string) => `${k}.legacy-done`
const v1 = { v: 1, yokai: { tengu: { bond: 'kaomishiri', met: G('yume') } }, cards: { c1: G('yume') }, pieces: {}, flags: { a: true }, stamps: {} }
const v2 = { v: 2, yokai: { kuragari: { bond: 'kaomishiri', met: G('utsutsu'), bondGained: G('utsutsu') } }, cards: {}, pieces: {}, flags: {}, flagAt: {}, stamps: {}, items: { mochi: { got: G('yume') } } }
const v2flags = { v: 2, yokai: {}, cards: {}, pieces: {}, flags: { 'seen:x': true }, flagAt: {}, stamps: {}, items: {} }

ok(STORY_KEY === 'yume.story.iwakuraji.v3' && TEST_KEY === 'yume.story.test.v3' && SIM_KEY === 'yume.story.sim.v3', '保存の名前は .v3')

// ---- 写し方（v3 ← v2 ← v1）
{
  const k = kv()
  const raw = JSON.stringify(v2)
  k.setItem(V2_STORY_KEY, raw)
  k.setItem(LEGACY_STORY_KEY, JSON.stringify(v1))
  const p = new ProgressStore(k, STORY_KEY)
  ok(p.hasMet('kuragari') && !p.hasMet('tengu') && p.get().v === 3, 'v2 に進み具合があれば v3 へ写す（v1 は見ない）')
  ok(JSON.parse(k.mem.get(STORY_KEY)!).v === 3 && k.mem.get(DONE(STORY_KEY)) === '1', '写した保存は版3・印を残す')
  ok(k.mem.get(V2_STORY_KEY) === raw, 'v2 は書き換えない（同じバイト列）')
  p.meet('tengu', 'yume')
  ok(k.mem.get(V2_STORY_KEY) === raw, '遊んでも v2 には書かない')
}
{
  const k = kv()
  k.setItem(LEGACY_TEST_KEY, JSON.stringify(v1))
  const t = new ProgressStore(k, TEST_KEY)
  ok(t.hasMet('tengu') && t.isCardOpened('c1') && t.flag('a') && k.mem.get(DONE(TEST_KEY)) === '1', 'v1 だけの端末: v1 から v3 へ写す')
}
{
  const k = kv()
  k.setItem(DONE(V2_STORY_KEY), '1')
  k.setItem(LEGACY_STORY_KEY, JSON.stringify(v1))
  const p = new ProgressStore(k, STORY_KEY)
  ok(!p.hasMet('tengu') && !k.mem.has(STORY_KEY) && k.mem.get(DONE(STORY_KEY)) === '1', 'v2 が無く v2 の印があれば、v1 から写さない（4a でやり直した）')
}
{
  const k = kv()
  k.setItem(V2_TEST_KEY, JSON.stringify(v2flags))
  k.setItem(LEGACY_TEST_KEY, JSON.stringify(v1))
  const t = new ProgressStore(k, TEST_KEY)
  ok(!t.hasMet('tengu') && !k.mem.has(TEST_KEY) && k.mem.get(DONE(TEST_KEY)) === '1', 'v2 に進み具合が無ければ写さず、印だけ')
}
{
  const k = kv()
  new ProgressStore(k, STORY_KEY)
  ok(k.mem.size === 0, '何も無い端末には何も書かない')
  k.setItem(V2_STORY_KEY, '{broken')
  migrateLegacySave(k, STORY_KEY)
  ok(!k.mem.has(STORY_KEY) && !k.mem.has(DONE(STORY_KEY)), '読めない v2 は写さず、印も残さない（4a と同じ）')
}
{
  const k = kv()
  k.setItem(V2_STORY_KEY, JSON.stringify(v2))
  const p = new ProgressStore(k, STORY_KEY)
  p.reset()
  ok(!k.mem.has(STORY_KEY) && k.mem.get(DONE(STORY_KEY)) === '1', 'やり直すと保存を消し、印を残す')
  ok(!new ProgressStore(k, STORY_KEY).hasMet('kuragari'), 'やり直したあと、v2 から写し直さない')
  const s = kv()
  new ProgressStore(s, SIM_KEY).reset()
  ok(s.mem.size === 0, 'シミュレーターの保存には印を書かない')
}

// ---- 読み方（版3 の項目）
{
  const c = clockAt('2027-01-12T20:00')
  const p = store(kv(), c)
  p.deliverLetter('fumi:2027-01-12', ['ask', 'open:1', 'snip:ta1', 'close:2'])
  p.readLetter('fumi:2027-01-12')
  p.startNight('2027-01-12', 'tengu', 'a')
  p.finishNight('2027-01-12')
  p.saveEtoki('2027-01-12', { cards: ['c1', 'c2'], phrase: 'fushigi', caption: 'met:tengu' }, 'yume')
  const back = sanitize(JSON.parse(JSON.stringify(p.get())))
  ok(JSON.stringify(back.letters) === JSON.stringify(p.get().letters), '便りは読み込み直しても同じ')
  ok(JSON.stringify(back.nights) === JSON.stringify(p.get().nights) && back.nights['2027-01-12'].done === true, '夜話も同じ')
  ok(JSON.stringify(back.etoki) === JSON.stringify(p.get().etoki), '絵解きも同じ')
  ok(back.flags['yb:tengu:a'] === true && !!back.flagAt['yb:tengu:a'], '夜話を聞き終えた印（yb:）')
  const iso = '2027-01-12T11:00:00.000Z'
  const bad = sanitize({
    v: 3,
    letters: {
      ok1: { got: iso, parts: ['a'] },
      'Bad-Id': { got: iso, parts: [] },
      noGot: { parts: [] },
      badGot: { got: 'zzz', parts: [] },
      parts1: { got: iso, parts: 'a' },
      parts2: { got: iso, parts: [1] },
      parts3: { got: iso, parts: Array.from({ length: 33 }, () => 'x') },
      parts4: { got: iso, parts: ['x'.repeat(65)] },
      'read-bad': { got: iso, parts: [], read: 5 },
      nul: null,
    },
    nights: {
      '2027-01-12': { yokai: 'tengu', entry: 'a', at: iso, done: true },
      '2027-1-13': { yokai: 'tengu', entry: 'a', at: iso },
      '2027-01-14': { yokai: 'tengu', entry: 5, at: iso },
      '2027-01-15': { yokai: 'tengu', entry: 'a', at: iso, done: 'yes' },
    },
    etoki: {
      '2027-01-12': { at: iso, travel: 'yume', cards: ['c1'], caption: 'none' },
      '2027-01-13': { at: iso, travel: 'yume', cards: [] },
      '2027-01-14': { at: iso, travel: 'yume', cards: ['a', 'b', 'c', 'd'] },
      '2027-01-15': { at: iso, travel: 'yume', cards: ['a', 'a'] },
      '2027-01-16': { at: iso, travel: 'boat', cards: ['a'] },
      '2027-01-17': { at: iso, travel: 'yume', cards: ['a'], phrase: 'x'.repeat(33) },
      '2027-01-18': { at: iso, travel: 'yume', cards: ['a'] },
      '2027-01-19': { at: iso, travel: 'yume', cards: ['a'], caption: 'x'.repeat(129) },
    },
  })
  ok(Object.keys(bad.letters).sort().join() === 'ok1,read-bad' && bad.letters['read-bad'].read === undefined, `形の違う便りは捨てる（${Object.keys(bad.letters).join()}）`)
  ok(Object.keys(bad.nights).join() === '2027-01-12', '形の違う夜話は捨てる')
  ok(Object.keys(bad.etoki).sort().join() === '2027-01-12,2027-01-18' && bad.etoki['2027-01-18'].caption === 'none', '形の違う絵解きは捨てる（添え書きが無ければ none）')
  // 60日分まで
  const many: Record<string, unknown> = {}
  const manyE: Record<string, unknown> = {}
  for (let i = 0; i < 70; i++) {
    const d = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10)
    many[d] = { yokai: 'tengu', entry: 'a', at: iso }
    manyE[d] = { at: iso, travel: 'yume', cards: ['c1'], caption: 'none' }
  }
  const trimmed = sanitize({ v: 3, nights: many, etoki: manyE })
  const keys = Object.keys(trimmed.nights).sort()
  ok(keys.length === 60 && keys[0] === '2027-01-11' && keys[59] === '2027-03-11' && Object.keys(trimmed.etoki).length === 60, '夜話・絵解きは新しい60日分だけ')
  // 新しい版は .broken
  const k = kv()
  k.setItem(STORY_KEY, JSON.stringify({ v: 4, yokai: {} }))
  const p4 = new ProgressStore(k, STORY_KEY)
  ok(p4.get().v === 3 && Object.keys(p4.get().yokai).length === 0 && k.mem.get(`${STORY_KEY}.broken`) === '{"v":4,"yokai":{}}', 'v:4 は読まずに .broken へ写す')
  let threw = false
  try {
    sanitize({ v: 4 })
  } catch (e) {
    threw = e instanceof UnknownVersion
  }
  ok(threw, 'v:4 は UnknownVersion')
  ok(sanitize({ v: 1 }).v === 3 && sanitize({ v: 2 }).v === 3 && Object.keys(sanitize({ v: 2 }).letters).length === 0, 'v1・v2 は版3 の形（便りなど空）')
}

// ---- 時間のピース
{
  const c = clockAt('2027-01-16T16:40')
  const k = kv()
  const p = store(k, c)
  const r = p.setPiece('fumoto-kuragari', 'saishiki', 'yume', { time: true })
  ok(r.changed && r.state === 'saishiki' && p.get().pieces['fumoto-kuragari'].colored?.time === true, '時間のピースは家でも彩色（colored.time）')
  ok(store(k, c).pieceOf('fumoto-kuragari') === 'saishiki', '読み込み直しても彩色のまま')
  ok(p.goldPiece('fumoto-kuragari', 'yume') && p.pieceOf('fumoto-kuragari') === 'kin', '稽古で金')
  const again = store(k, c)
  ok(again.pieceOf('fumoto-kuragari') === 'kin' && again.get().pieces['fumoto-kuragari'].colored?.time === true, '読み込み直しても金（time の印も残る）')
  ok(p.setPiece('fumoto-tengu', 'saishiki', 'yume', { time: true }).state === 'hakubyo', 'time でも時間のピースでなければ白描まで')
  ok(store().setPiece('fumoto-kuragari', 'saishiki', 'yume').state === 'hakubyo', '逢魔が時でなければ時間のピースも白描まで')
  const forged = sanitize({ v: 3, pieces: { 'fumoto-tengu': { ...G('yume'), state: 'saishiki', colored: { ...G('yume'), time: true } } } })
  ok(forged.pieces['fumoto-tengu'].state === 'hakubyo' && !forged.pieces['fumoto-tengu'].colored, '時間のピースでない印（colored.time）は読まずに白描へ')
  const noMark = sanitize({ v: 3, pieces: { 'fumoto-kuragari': { ...G('yume'), state: 'kin' } } })
  ok(noMark.pieces['fumoto-kuragari'].state === 'hakubyo', '印の無い時間のピースの金は白描へ')
  const site = store()
  site.setPiece('fumoto-kuragari', 'saishiki', 'utsutsu', { time: true })
  ok(site.get().pieces['fumoto-kuragari'].colored?.onsite === true && !site.get().pieces['fumoto-kuragari'].colored?.time, '現地なら現地の印（time は付けない）')
}

// ---- 合わせ方
{
  const a = emptyProgress()
  const b = emptyProgress()
  a.letters = { x: { got: '2027-01-12T01:00:00.000Z', parts: ['p1'] }, y: { got: '2027-01-12T02:00:00.000Z', parts: ['a'], read: '2027-01-12T05:00:00.000Z' } }
  b.letters = { x: { got: '2027-01-11T01:00:00.000Z', parts: ['p1', 's1.b'], read: '2027-01-13T01:00:00.000Z' }, z: { got: '2027-01-12T03:00:00.000Z', parts: [] } }
  const m = mergeProgress(a, b)
  ok(m.letters.x.got === '2027-01-11T01:00:00.000Z' && m.letters.x.parts.join() === 'p1,s1.b' && m.letters.x.read === '2027-01-13T01:00:00.000Z', '便り: 早く届いたほう・その部品・どちらかで読んだ印')
  ok(Object.keys(m.letters).sort().join() === 'x,y,z' && m.letters.y.read === '2027-01-12T05:00:00.000Z', '便りは両方を合わせる')
  a.letters.x.read = '2027-01-12T09:00:00.000Z'
  ok(mergeProgress(a, b).letters.x.read === '2027-01-12T09:00:00.000Z', '読んだ印は早いほう')
  a.nights = { '2027-01-12': { yokai: 'tengu', entry: 'a', at: '2027-01-12T11:00:00.000Z' }, '2027-01-13': { yokai: 'tengu', entry: 'b', at: '2027-01-13T11:00:00.000Z' } }
  b.nights = { '2027-01-12': { yokai: 'kuragari', entry: 'x', at: '2027-01-12T12:00:00.000Z', done: true }, '2027-01-14': { yokai: 'tengu', entry: 'c', at: '2027-01-14T11:00:00.000Z' } }
  const n = mergeProgress(a, b).nights
  ok(n['2027-01-12'].yokai === 'kuragari' && n['2027-01-12'].done === true && Object.keys(n).length === 3, '夜話: 日ごとに合わせ、最後まで聞いたほう')
  b.nights['2027-01-13'] = { yokai: 'kuragari', entry: 'y', at: '2027-01-13T10:00:00.000Z' }
  ok(mergeProgress(a, b).nights['2027-01-13'].yokai === 'kuragari', '夜話: どちらも途中なら早く始めたほう')
  a.etoki = { '2027-01-12': { at: '2027-01-12T09:00:00.000Z', travel: 'yume', cards: ['c1'], caption: 'none' } }
  b.etoki = { '2027-01-12': { at: '2027-01-12T10:00:00.000Z', travel: 'utsutsu', cards: ['c2'], caption: 'none' } }
  ok(mergeProgress(a, b).etoki['2027-01-12'].cards.join() === 'c2' && mergeProgress(b, a).etoki['2027-01-12'].cards.join() === 'c2', '絵解き: あとでつくったほう')
  // 彩色: 現地の彩色が、時間のピースの家の彩色より先
  a.pieces = { 'fumoto-kuragari': { ...G('yume', '2027-01-11T08:00:00.000Z'), state: 'kin', colored: { ...G('yume', '2027-01-11T07:30:00.000Z'), time: true } } }
  b.pieces = { 'fumoto-kuragari': { ...G('utsutsu', '2027-01-12T08:00:00.000Z'), state: 'saishiki', colored: G('utsutsu', '2027-01-12T08:00:00.000Z') } }
  const pm = mergeProgress(a, b).pieces['fumoto-kuragari']
  ok(pm.state === 'kin' && pm.colored?.onsite === true, '彩色の印: 現地が先（ピースは高いほう）')
  delete b.pieces['fumoto-kuragari']
  const only = mergeProgress(a, b).pieces['fumoto-kuragari']
  ok(only.colored?.time === true && sanitize(JSON.parse(JSON.stringify(mergeProgress(a, b)))).pieces['fumoto-kuragari'].state === 'kin', '片方だけなら time の印も残り、金のまま')
  // 夜話・絵解きの60日
  const big = emptyProgress()
  for (let i = 0; i < 40; i++) big.nights[new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10)] = { yokai: 't', entry: 'a', at: '2027-01-01T00:00:00.000Z' }
  const big2 = emptyProgress()
  for (let i = 40; i < 80; i++) big2.nights[new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10)] = { yokai: 't', entry: 'a', at: '2027-01-01T00:00:00.000Z' }
  ok(Object.keys(mergeProgress(big, big2).nights).length === 60, '合わせても60日分まで')
  snap('merged-letters', m.letters)
}
done()
