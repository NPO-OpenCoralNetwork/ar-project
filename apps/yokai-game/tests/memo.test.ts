// ましろの覚え書き（core/story/memo.ts）: 呼び名の字の決まり・消した印・合わせ方・端末への保存
import { MEMO_KEY } from '../src/core/storage-keys'
import { MemoStore, mergeMemo, sanitizeMemo, validateYobina } from '../src/core/story/memo'
import { clockAt, done, kv, ok } from './helpers'

const BAD = 'ひらがな・カタカナ・漢字・ローマ字で、8文字までにしてください。'
const FORBIDDEN = 'この呼び名は使えません。'

for (const [input, want] of [
  ['さくら', 'さくら'],
  ['サクラ', 'サクラ'],
  ['桜', '桜'],
  ['Sakura', 'Sakura'],
  ['ｓａｋｕｒａ', 'sakura'],
  ['見習いのたま', '見習いのたま'],
  ['ゆう・き', 'ゆう・き'],
  ['  さくら ', 'さくら'],
  ['ｻｸﾗ', 'サクラ'],
  ['ルー', 'ルー'],
  ['佐々木', '佐々木'],
  ['あいうえおかきく', 'あいうえおかきく'],
] as const) {
  const r = validateYobina(input)
  ok(r.ok && r.value === want, `使える: ${JSON.stringify(input)} → ${want}`)
}
for (const [input, err] of [
  ['090', BAD],
  ['ゆうき1', BAD],
  ['a b', BAD],
  ['a@b', BAD],
  ['<b>', BAD],
  ['あいうえおかきくけ', BAD],
  ['', BAD],
  ['   ', BAD],
  ['さくら😀', BAD],
  ['😀', BAD],
  ['権現', FORBIDDEN],
  ['あの権現さま', FORBIDDEN],
  ['御朱印', FORBIDDEN],
  ['a.b', BAD],
  ['ゆうき０', BAD],
] as const) {
  const r = validateYobina(input)
  ok(!r.ok && r.error === err, `使えない: ${JSON.stringify(input)}（${r.ok ? r.value : r.error}）`)
}

// 書く・消す（消した印）・端末に残す
{
  const k = kv()
  const c = clockAt('2027-01-12T08:00')
  const m = new MemoStore(k, () => c.now())
  ok(m.yobina === null && !m.hasYobinaField, 'はじめは呼び名なし・聞いてもいない')
  let told = 0
  m.onChange(() => told++)
  ok(!m.setYobina('a@b').ok && !k.mem.has(MEMO_KEY) && told === 0, '使えない呼び名は書かない')
  const r = m.setYobina(' さくら ')
  ok(r.ok && m.yobina === 'さくら' && m.hasYobinaField && told === 1, '呼び名を書く')
  ok(JSON.parse(k.mem.get(MEMO_KEY)!).yobina.value === 'さくら', '端末に残す（MEMO_KEY）')
  ok(new MemoStore(k).yobina === 'さくら', '読み込み直しても同じ')
  c.advance(60_000)
  m.eraseYobina()
  const doc = JSON.parse(k.mem.get(MEMO_KEY)!)
  ok(m.yobina === null && m.hasYobinaField && doc.yobina.value === null && doc.yobina.at === new Date(c.ms).toISOString(), '消すと消した印（value: null）が残る')
  ok(new MemoStore(k).hasYobinaField && new MemoStore(k).yobina === null, '消した印も読み込み直して残る')
}

// 読めない覚え書き
ok(Object.keys(sanitizeMemo(null)).join() === 'v' && !sanitizeMemo({ yobina: { value: 'a b', at: '2027-01-01T00:00:00Z' } }).yobina, '読めない呼び名は捨てる')
ok(!sanitizeMemo({ yobina: { value: 'さくら', at: 'zzz' } }).yobina && !sanitizeMemo({ yobina: { value: 5, at: '2027-01-01T00:00:00Z' } }).yobina, '時刻・形の違う項目は捨てる')
ok(sanitizeMemo({ yobina: { value: null, at: '2027-01-01T00:00:00Z' } }).yobina?.value === null, '消した印は読める')
{
  const k = kv()
  k.setItem(MEMO_KEY, '{broken')
  ok(new MemoStore(k).yobina === null, '壊れた保存は空として読む')
}

// 合わせ方: 項目ごとに新しいほう（消した印も）
const at = (h: number) => new Date(Date.UTC(2027, 0, 12, h)).toISOString()
const val = (v: string | null, h: number) => ({ v: 1 as const, yobina: { value: v, at: at(h) } })
ok(mergeMemo(val('さくら', 1), val('たま', 2)).yobina?.value === 'たま' && mergeMemo(val('たま', 2), val('さくら', 1)).yobina?.value === 'たま', '新しい呼び名を取る')
ok(mergeMemo(val('さくら', 1), val(null, 2)).yobina?.value === null, '新しい消した印が勝つ')
ok(mergeMemo(val(null, 1), val('たま', 2)).yobina?.value === 'たま', '古い消した印は、新しい呼び名に負ける')
ok(mergeMemo(val('さくら', 1), val(null, 1)).yobina?.value === null, '同じ時なら消した印')
ok(mergeMemo({ v: 1 }, val('たま', 2)).yobina?.value === 'たま' && !mergeMemo({ v: 1 }, { v: 1 }).yobina, '片方だけ・どちらも無し')
{
  const k = kv()
  const m = new MemoStore(k, () => new Date(at(3)))
  m.setYobina('さくら')
  m.mergeFrom(val(null, 5))
  ok(m.yobina === null && m.hasYobinaField, 'mergeFrom も新しいほう')
  // ほかのタブ
  m.follow()
  let told = 0
  m.onChange(() => told++)
  k.emit(MEMO_KEY, JSON.stringify(val('たま', 6)))
  ok(m.yobina === 'たま' && told === 1, 'ほかのタブが書いたら入れ替える')
  k.emit(MEMO_KEY, '{broken')
  ok(m.yobina === 'たま' && told === 1, '読めない値なら、いまのまま')
  k.emit(MEMO_KEY, null)
  ok(m.yobina === null && !m.hasYobinaField && told === 2, 'ほかのタブが消したら空')
}
done()
