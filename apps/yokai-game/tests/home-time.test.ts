// 家の箱庭・白描の絵地図の「時間」（ui/home-time.ts）: はじめての回は手で昼、2回目からは「いま」、回す順、立山の時刻での切り替え、ボタンの字と読み上げ
import { createHomeTime } from '../src/ui/home-time'
import { done, jst, ok, snap } from './helpers'

// 1/16 の立山: 逢魔が時 16:28〜、夜 17:18〜（日の入り+20分）。1/17 の日の出は 7時ごろ
let now = jst('2027-01-16T12:00')
const clock = () => now

// はじめて入った: 夜でも、その回は手で昼。いま → 昼 → 夕 → 夜 → いま と回す
{
  now = jst('2027-01-16T20:00')
  const h = createHomeTime({ first: true, now: clock })
  ok(h.mode === 'day' && h.look === 'day', 'はじめて（20:00）→ 手で昼')
  ok(h.label().value === '昼', 'はじめての字は「昼」')
  ok(h.label().aria === '時間を切り替える（いまは昼。立山の時刻に戻すには、夜のあとに「いま」）', '手で選んだときの読み上げ')
  ok(h.tick() === null, '手で選んでいる間は、立山の時刻で変えない')
  ok(h.cycle() === 'dusk' && h.mode === 'dusk', '昼 → 夕')
  ok(h.cycle() === 'night' && h.mode === 'night', '夕 → 夜')
  ok(h.cycle() === 'night' && h.mode === 'auto', '夜 → いま（20:00 なので夜）')
  ok(h.label().value === 'いま（夜）', 'いまの字は「いま（夜）」')
  ok(h.label().aria === '時間を切り替える（いまは立山の時刻に合わせている。夜）', 'いまの読み上げ')
  ok(h.cycle() === 'day' && h.mode === 'day', 'いま → 昼（また回る）')
}

// 2回目から: いま。立山の時刻の時間帯が変わったときだけ、新しい時間帯を返す
{
  now = jst('2027-01-16T12:00')
  const h = createHomeTime({ first: false, now: clock })
  ok(h.mode === 'auto' && h.look === 'day', '2回目（12:00）→ いま（昼）')
  ok(h.tick() === null, '変わらなければ null')
  const seen: [string, string | null][] = []
  for (const t of ['16:27', '16:29', '16:40', '17:17', '17:19', '23:59']) {
    now = jst(`2027-01-16T${t}`)
    seen.push([t, h.tick()])
  }
  ok(JSON.stringify(seen) === JSON.stringify([['16:27', null], ['16:29', 'dusk'], ['16:40', null], ['17:17', null], ['17:19', 'night'], ['23:59', null]]), '逢魔が時で夕、日の入り+20分で夜（一度だけ返す）')
  snap('auto ticks 1/16', seen)
  now = jst('2027-01-17T04:30')
  ok(h.tick() === null, '04:00〜日の出は、まだ夜')
  now = jst('2027-01-17T07:10')
  ok(h.tick() === 'day' && h.label().value === 'いま（昼）', '日の出のあと → 昼')
  // 手で選ぶと、立山の時刻では変わらない。いまに戻すと、その時の時間帯
  ok(h.cycle() === 'day' && h.mode === 'day', 'いま → 手で昼')
  now = jst('2027-01-17T20:00')
  ok(h.tick() === null, '手で昼なら、夜になっても変えない')
  h.cycle()
  h.cycle()
  ok(h.cycle() === 'night' && h.mode === 'auto' && h.tick() === null, 'いまに戻すと、その時の夜（tick はもう変わらない）')
}

// 2回目に夕方に入った: いま（夕）から
{
  now = jst('2027-01-16T16:35')
  const h = createHomeTime({ first: false, now: clock })
  ok(h.look === 'dusk' && h.label().value === 'いま（夕）', '16:35 に入る → いま（夕）')
  snap('auto label 16:35', h.label())
}

done()
