// 引き継ぎコードの版3（core/story/transfer.ts）: 覚え書きを運ぶ・消した印は戻らない・4a のコードも読める・新しい版は断る・書けなければ全部戻す
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { MEMO_KEY, STORY_KEY, TEST_KEY, TESTLAND_KEY, V2_STORY_KEY } from '../src/core/storage-keys'
import { MemoStore } from '../src/core/story/memo'
import { ProgressStore } from '../src/core/story/progress'
import { exportTransferCode, importTransferCode, readTransferCode } from '../src/core/story/transfer'
import { clockAt, done, kv, ok } from './helpers'

const enc = (o: unknown) => 'YU1-' + deflateRawSync(Buffer.from(JSON.stringify(o))).toString('base64url')
const dec = (code: string) => JSON.parse(inflateRawSync(Buffer.from(code.slice(4), 'base64url')).toString())
const G = (travel: 'yume' | 'utsutsu', at = '2026-10-10T01:00:00Z') => ({ at, travel, onsite: travel === 'utsutsu' })
const v2save = { v: 2, yokai: { tengu: { bond: 'kaomishiri', met: G('utsutsu'), bondGained: G('utsutsu') } }, cards: {}, pieces: {}, flags: {}, flagAt: {}, stamps: {}, items: { mochi: { got: G('yume') } } }
const NEWER = '新しい版のゲームで作ったコードのようです'

const c = clockAt('2027-01-12T20:00')
const now = () => c.now()

// 書き出す: 版3 の入れ物・中も版3・覚え書きつき
{
  const pc = kv()
  const p = new ProgressStore(pc, STORY_KEY, now)
  p.meet('tengu', 'yume')
  p.deliverLetter('fumi:2027-01-12', ['open:0'])
  p.saveEtoki('2027-01-12', { cards: ['c1'], caption: 'none' }, 'yume')
  new MemoStore(pc, now).setYobina('さくら')
  pc.setItem(TESTLAND_KEY, JSON.stringify({ version: 4, origin: { lat: 36.6, lon: 137.3 } }))
  const code = await exportTransferCode(pc, new Date('2027-01-12T11:00:00Z'))
  const raw = dec(code!)
  ok(raw.v === 3 && raw.saves.iwakuraji.v === 3 && raw.memo?.yobina?.value === 'さくら', '入れ物も中も版3。覚え書きを運ぶ')
  ok(!!raw.saves.iwakuraji.letters['fumi:2027-01-12'] && !!raw.saves.iwakuraji.etoki['2027-01-12'], '便り・絵解きも運ぶ')
  ok(!JSON.stringify(raw).includes('137.3'), 'テスト用の土地は運ばない')
  const env = await readTransferCode(code!)
  ok(env.v === 3 && env.memo?.yobina?.value === 'さくら', 'readTransferCode も覚え書きを読む')
  // 覚え書きだけでは書き出さない（進み具合のある土地が無ければ null）
  const memoOnly = kv()
  new MemoStore(memoOnly, now).setYobina('たま')
  ok((await exportTransferCode(memoOnly)) === null, '進み具合が無ければ、覚え書きがあってもコードは作らない')
  // 呼び名を書いても消してもいなければ、覚え書きは入れない
  const plain = kv()
  new ProgressStore(plain, STORY_KEY, now).meet('tengu', 'yume')
  ok(dec((await exportTransferCode(plain))!).memo === undefined, '呼び名が無ければ覚え書きは入れない')
  // 消した印は運ぶ
  const erased = kv()
  new ProgressStore(erased, STORY_KEY, now).meet('tengu', 'yume')
  new MemoStore(erased, now).eraseYobina()
  ok(dec((await exportTransferCode(erased))!).memo?.yobina?.value === null, '消した印も運ぶ')
}

// 読み込む: 覚え書きは項目ごとに新しいほう
{
  const t = (h: number) => `2027-01-12T0${h}:00:00.000Z`
  const code = (value: string | null, h: number) =>
    enc({ format: 'yumeutsutsu-save', v: 3, exportedAt: '', saves: { iwakuraji: { ...v2save, v: 3 } }, memo: { v: 1, yobina: { value, at: t(h) } } })
  const device = kv()
  device.setItem(MEMO_KEY, JSON.stringify({ v: 1, yobina: { value: null, at: t(5) } }))
  const r = await importTransferCode(code('さくら', 3), device)
  ok(r.memo && JSON.parse(device.mem.get(MEMO_KEY)!).yobina.value === null, 'この端末の消した印が新しければ、消したまま')
  const device2 = kv()
  device2.setItem(MEMO_KEY, JSON.stringify({ v: 1, yobina: { value: null, at: t(1) } }))
  await importTransferCode(code('さくら', 3), device2)
  ok(new MemoStore(device2).yobina === 'さくら', '古い消した印は、新しい呼び名に負ける')
  const device3 = kv()
  device3.setItem(MEMO_KEY, JSON.stringify({ v: 1, yobina: { value: 'たま', at: t(1) } }))
  await importTransferCode(code(null, 3), device3)
  ok(new MemoStore(device3).yobina === null && new MemoStore(device3).hasYobinaField, '新しい消した印は、古い呼び名を消す')
  // 読めない覚え書きは、黙って捨てる（コードは断らない）
  const device4 = kv()
  const bad = enc({ format: 'yumeutsutsu-save', v: 3, exportedAt: '', saves: { iwakuraji: v2save }, memo: { v: 1, yobina: { value: 'a b', at: 'zzz' } } })
  const r4 = await importTransferCode(bad, device4)
  ok(r4.merged.join() === 'iwakuraji' && !r4.memo && !device4.mem.has(MEMO_KEY), '読めない覚え書きは捨てる（土地は合わせる）')
  const r5 = await importTransferCode(enc({ format: 'yumeutsutsu-save', v: 3, exportedAt: '', saves: { iwakuraji: v2save }, memo: 'garbage' }), kv())
  ok(r5.merged.join() === 'iwakuraji' && !r5.memo, '形の違う覚え書きも捨てる')
}

// 4a（版2）のコードも読める
{
  const fresh = kv()
  const r = await importTransferCode(enc({ format: 'yumeutsutsu-save', v: 2, exportedAt: '2026-10-18T05:00:00Z', saves: { iwakuraji: v2save, test: v2save } }), fresh)
  const m = new ProgressStore(fresh, STORY_KEY)
  ok(r.merged.join() === 'iwakuraji,test' && !r.memo && m.hasMet('tengu') && m.get().v === 3 && JSON.parse(fresh.mem.get(TEST_KEY)!).v === 3, '4a のコード（版2）を読み込んで版3 で書く')
  // 4a の保存（v2 の名前）だけの端末: 先に写してから合わせる
  const old = kv()
  old.setItem(V2_STORY_KEY, JSON.stringify({ ...v2save, cards: { 'old-card': G('yume') } }))
  await importTransferCode(enc({ format: 'yumeutsutsu-save', v: 3, exportedAt: '', saves: { iwakuraji: { v: 3, yokai: { kuragari: { bond: 'kaomishiri', met: G('yume') } } } } }), old)
  const om = new ProgressStore(old, STORY_KEY)
  ok(om.isCardOpened('old-card') && om.hasMet('kuragari') && old.mem.get(V2_STORY_KEY)!.includes('old-card'), '4a の保存だけの端末にも、写してから合わせる（v2 はそのまま）')
}

// 新しい版のコードは断る（端末には何も書かない）
for (const [name, env] of [
  ['入れ物 v:4', { format: 'yumeutsutsu-save', v: 4, exportedAt: '', saves: { iwakuraji: v2save } }],
  ['中の保存 v:4', { format: 'yumeutsutsu-save', v: 3, exportedAt: '', saves: { iwakuraji: { ...v2save, v: 4 } } }],
] as const) {
  const k = kv()
  let msg = ''
  try {
    await importTransferCode(enc(env), k)
  } catch (e) {
    msg = (e as Error).message
  }
  ok(msg.startsWith(NEWER) && k.mem.size === 0, `${name} は「新しい版」（${msg.slice(0, 16)}…）`)
}

// 書く途中で止まったら、覚え書きも含めて全部戻す
{
  const k = kv()
  const p = new ProgressStore(k, STORY_KEY, now)
  p.meet('kuragari', 'yume')
  new MemoStore(k, now).setYobina('たま')
  const before = new Map(k.mem)
  const code = enc({
    format: 'yumeutsutsu-save',
    v: 3,
    exportedAt: '',
    saves: { iwakuraji: v2save, test: v2save },
    memo: { v: 1, yobina: { value: 'さくら', at: '2099-01-01T00:00:00.000Z' } },
  })
  k.failOn(3)
  let err = ''
  try {
    await importTransferCode(code, k)
  } catch (e) {
    err = (e as Error).message
  }
  ok(err === 'quota' && [...before].every(([key, v]) => k.mem.get(key) === v) && k.mem.size === before.size, '3つ目（覚え書き）で止まっても、全部の鍵を戻す')
  ok(new MemoStore(k).yobina === 'たま' && !k.mem.has(TEST_KEY), '覚え書きは前のまま・新しい土地の鍵は消す')
}
done()
