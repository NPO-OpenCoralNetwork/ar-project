// 立山の時刻（core/story/clock.ts）: 物語の日の区切り・日の入りと時間帯・夜話の窓。二つの時間帯で同じ結果になること
import { iwakurajiPack } from '../src/data/iwakuraji-pack'
import {
  addDays,
  dayIndex,
  dayKeyOf,
  dayOfIso,
  dayStartMs,
  isoInToday,
  jstDateLabel,
  jstTimeLabel,
  STORY_ORIGIN,
  storyClock,
} from '../src/core/story/clock'
import { done, jst, ok, snap } from './helpers'

const MIN = 60_000
const near = (ms: number, isoJst: string, tolMin = 2) => Math.abs(ms - jst(isoJst)) <= tolMin * MIN

// 物語の日（04:00 区切り）
ok(dayKeyOf(jst('2027-01-12T03:59')) === '2027-01-11', '1/12 03:59 は 1/11 の物語の日')
ok(dayKeyOf(jst('2027-01-12T04:00')) === '2027-01-12', '1/12 04:00 から 1/12')
ok(dayStartMs('2027-01-12') === jst('2027-01-12T04:00'), 'dayStartMs は 04:00 JST')
ok(addDays('2027-01-31', 1) === '2027-02-01' && addDays('2026-12-31', 1) === '2027-01-01' && addDays('2027-03-01', -1) === '2027-02-28', 'addDays は月末・年末をまたぐ')
ok(dayIndex('2027-01-12') - dayIndex('2027-01-11') === 1, 'dayIndex は1日に1つ進む')

// 1/11 の日の入りと窓
const c11 = storyClock(jst('2027-01-11T12:00'))
ok(near(c11.sunset, '2027-01-11T16:53') && near(c11.sunrise, '2027-01-11T07:03'), `1/11 日の出 ${jstTimeLabel(c11.sunrise)}・日の入り ${jstTimeLabel(c11.sunset)}`)
ok(near(c11.oumaStart, '2027-01-11T16:23') && near(c11.nightStart, '2027-01-11T17:13'), `1/11 逢魔が時 ${jstTimeLabel(c11.oumaStart)}〜${jstTimeLabel(c11.nightStart)}`)
ok(c11.dayStart === jst('2027-01-11T04:00') && c11.dayEnd === jst('2027-01-12T04:00'), '1/11 の物語の日は 04:00〜翌04:00')

// 夜中の時計でも、その日（前の晩）の太陽を使う（sunTimes が次の日を返す落とし穴）
const late = storyClock(jst('2027-01-12T01:30'))
ok(late.day === '2027-01-11' && late.sunset === c11.sunset, '夜中（1/12 01:30）は 1/11 の太陽')

// 境目の表（04 §2.1）
const table: [string, string, string, boolean][] = [
  ['2027-01-12T03:59', '2027-01-11', 'night', true],
  ['2027-01-12T04:00', '2027-01-12', 'night', false],
  ['2027-01-12T16:30', '2027-01-12', 'oumagatoki', false],
  ['2027-01-12T17:13', '2027-01-12', 'oumagatoki', false],
  ['2027-01-12T17:15', '2027-01-12', 'night', true],
  ['2027-01-13T01:30', '2027-01-12', 'night', true],
  ['2027-01-12T12:00', '2027-01-12', 'day', false],
  ['2027-01-12T06:30', '2027-01-12', 'night', false],
]
for (const [t, day, phase, open] of table) {
  const c = storyClock(jst(t))
  ok(c.day === day && c.phase === phase && c.yobanashiOpen === open, `${t} → ${day} ${phase} 夜話${open ? 'あり' : 'なし'}（${c.day} ${c.phase} ${c.yobanashiOpen}）`)
}

// テストの週（1/11〜1/17）の値。表（spec §2.1）と ±2分で合うこと。二つの時間帯で同じ値（snap）
const week: [string, string, string][] = [
  ['2027-01-11', '07:03', '16:53'],
  ['2027-01-12', '07:02', '16:54'],
  ['2027-01-13', '07:02', '16:55'],
  ['2027-01-14', '07:02', '16:56'],
  ['2027-01-15', '07:02', '16:57'],
  ['2027-01-16', '07:01', '16:58'],
  ['2027-01-17', '07:01', '16:59'],
]
for (const [day, rise, set] of week) {
  const c = storyClock(jst(`${day}T12:00`))
  ok(near(c.sunrise, `${day}T${rise}`) && near(c.sunset, `${day}T${set}`), `${day} 日の出 ${jstTimeLabel(c.sunrise)}（表 ${rise}）・日の入り ${jstTimeLabel(c.sunset)}（表 ${set}）`)
  snap(`week ${day}`, { rise: jstTimeLabel(c.sunrise), set: jstTimeLabel(c.sunset), ouma: jstTimeLabel(c.oumaStart), night: jstTimeLabel(c.nightStart), c })
}
snap('boundaries', table.map(([t]) => storyClock(jst(t))))

// 原点は立山のふもとの地域パックと同じ（core は data を読まないので、ここで確かめる）
ok(STORY_ORIGIN.lat === iwakurajiPack.origin.lat && STORY_ORIGIN.lon === iwakurajiPack.origin.lon, 'STORY_ORIGIN は iwakurajiPack.origin と同じ')

// 今日か・日付の字
const c = storyClock(jst('2027-01-16T16:40'))
ok(isoInToday(new Date(jst('2027-01-16T05:00')).toISOString(), c) && !isoInToday(new Date(jst('2027-01-16T03:59')).toISOString(), c), 'isoInToday は 04:00 から')
ok(!isoInToday(new Date(jst('2027-01-16T16:41')).toISOString(), c) && !isoInToday(undefined, c) && !isoInToday('zzz', c), 'isoInToday は「いま」まで・読めない時刻は偽')
ok(dayOfIso(new Date(jst('2027-01-17T02:00')).toISOString()) === '2027-01-16' && dayOfIso('zzz') === null, 'dayOfIso')
ok(jstDateLabel(jst('2027-01-16T16:40')) === '1月16日' && jstDateLabel('2027-01-13') === '1月13日' && jstDateLabel(new Date(jst('2027-01-01T00:30')).toISOString()) === '1月1日', 'jstDateLabel')
ok(jstTimeLabel(jst('2027-01-16T16:40')) === '16:40' && jstTimeLabel(jst('2027-01-16T08:05')) === '08:05', 'jstTimeLabel')
snap('labels', [jstDateLabel(jst('2027-01-16T23:59')), jstTimeLabel(jst('2027-01-16T23:59')), dayKeyOf(jst('2027-01-16T23:59'))])

done()
