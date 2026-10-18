// 夜話（core/story/yobanashi.ts。テスト用の物語）: 来られる妖怪・一晩に一つ・つづき・順番に回す・気配の一行・開かなかった夜
import type { ProgressStore } from '../src/core/story/progress'
import { eligibleTonight, kehaiLine, pickEntry, tonight, yobanashiNews } from '../src/core/story/yobanashi'
import { clockAt, done, fixtureStory, ok, snap, store, talk, type TestClock } from './helpers'

const story = fixtureStory()
const najimi = (p: ProgressStore, y: string) => {
  p.meet(y, 'yume')
  p.raiseBond(y, 'najimi', 'yume')
}
/** その時刻に会った（妖怪が話した） */
const seeAt = (p: ProgressStore, c: TestClock, y: string, iso: string) => {
  c.set(iso)
  p.noteSeen(y, 'yume')
}
/** 今夜の夜話を最後まで聞く（画面と同じ手順: startNight → 会話（visit）→ onFinish で finishNight） */
const listen = (p: ProgressStore, c: TestClock, picks: number[] = [0], stopAfter?: number) => {
  const clock = c.story()
  const t = tonight(clock, p, story)
  if (t.state !== 'offer' && t.state !== 'resume') return { t, ended: false }
  p.startNight(clock.day, t.yokai, t.entry)
  const r = talk(story, p, t.script, 'yume', picks, { record: 'visit', entry: t.entry, clock, stopAfter, onFinish: () => p.finishNight(clock.day) })
  return { t, ended: r.ended, trail: r.trail }
}

// 来られる妖怪
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  najimi(p, 'tengu')
  p.meet('kuragari', 'yume') // 顔見知りでもない（気配）
  seeAt(p, c, 'kuragari', '2027-01-11T11:00')
  seeAt(p, c, 'tengu', '2027-01-11T12:00')
  c.set('2027-01-11T20:00')
  ok(eligibleTonight(c.story(), p, story).join() === 'tengu', 'なじみ＋今日会った＋夜 → 来られる（なじみでない妖怪は来ない）')
  c.set('2027-01-11T16:00')
  const later = tonight(c.story(), p, story)
  ok(later.state === 'later' && later.nightStart === c.story().nightStart, '日が暮れる前（16:00）は later（夜話の始まる時刻つき）')
  c.set('2027-01-11T17:12')
  ok(tonight(c.story(), p, story).state === 'later', '17:12（逢魔が時）も later')
  c.set('2027-01-12T04:30')
  ok(tonight(c.story(), p, story).state === 'none' && eligibleTonight(c.story(), p, story).length === 0, '04:30 は次の物語の日（前の日に会っただけ）→ none')
  c.set('2027-01-12T20:00')
  ok(tonight(c.story(), p, story).state === 'quiet', '次の夜、その日に会っていなければ quiet')
  const q = store(undefined, c)
  q.meet('tengu', 'yume')
  q.raiseBond('tengu', 'kaomishiri', 'yume')
  seeAt(q, c, 'tengu', '2027-01-12T12:00')
  c.set('2027-01-12T20:00')
  ok(tonight(c.story(), q, story).state === 'quiet', '顔見知りは来ない')
  c.set('2027-01-12T12:30')
  ok(tonight(c.story(), q, story).state === 'none', '来られる妖怪がいなければ、昼は none')
  // 夜話の台本が了承待ちなら来ない
  const pending = { ...story, scripts: { ...story.scripts, 'yb-tengu': { ...story.scripts['yb-tengu'], needsConsent: true as const } } }
  c.set('2027-01-11T20:00')
  ok(eligibleTonight(c.story(), p, pending).length === 0, '了承待ちの夜話の台本なら来ない')
}

// 一晩に一つ・聞き終えたら done・次の夜は次の場面
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  najimi(p, 'tengu')
  seeAt(p, c, 'tengu', '2027-01-11T12:00')
  c.set('2027-01-11T20:00')
  const first = tonight(c.story(), p, story)
  ok(first.state === 'offer' && first.yokai === 'tengu' && first.entry === 'a' && yobanashiNews(first), 'offer（てんぐ・場面 a）。「新」に入る')
  const before = p.talksWith('tengu')
  const l = listen(p, c)
  ok(l.ended && p.night('2027-01-11')?.done === true && p.flag('yb:tengu:a') && p.talksWith('tengu') === before + 1, '聞き終えると done・yb:tengu:a・talks + 1')
  const d = tonight(c.story(), p, story)
  ok(d.state === 'done' && d.yokai === 'tengu' && !yobanashiNews(d), 'その夜はもう done（「新」なし）')
  c.set('2027-01-12T01:30')
  ok(tonight(c.story(), p, story).state === 'done', '夜中（翌 01:30）も同じ夜')
  seeAt(p, c, 'tengu', '2027-01-12T12:00')
  c.set('2027-01-12T20:00')
  const second = tonight(c.story(), p, story)
  ok(second.state === 'offer' && second.entry === 'c', `次の夜は次の場面（b は条件なしで飛ばし c。${second.state === 'offer' ? second.entry : ''}）`)
  p.setFlag('qa-done', true)
  const third = tonight(c.story(), p, story)
  ok(third.state === 'offer' && third.entry === 'b', '条件が成り立てば上の場面（b）から')
}

// 途中で閉じたら、つづき（同じ妖怪・同じ場面。選び直さない）
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  najimi(p, 'tengu')
  najimi(p, 'kuragari')
  seeAt(p, c, 'tengu', '2027-01-11T12:00')
  seeAt(p, c, 'kuragari', '2027-01-11T13:00')
  c.set('2027-01-11T20:00')
  const t = tonight(c.story(), p, story)
  ok(t.state === 'offer' && t.yokai === 'kuragari' && t.others.join() === 'tengu', `どちらも聞いていなければ、今日あとに会ったほう（くらがり）。others にてんぐ`)
  const l = listen(p, c, [0], 0)
  ok(!l.ended && p.night('2027-01-11')?.done === undefined, '途中で閉じた')
  const r = tonight(c.story(), p, story)
  ok(r.state === 'resume' && r.yokai === 'kuragari' && r.entry === 'x' && r.others.join() === 'tengu' && yobanashiNews(r), 'resume（くらがり・x）。「新」に入る')
  p.setFlag('yb:tengu:a', true) // ほかの記録が変わっても選び直さない
  const r2 = tonight(c.story(), p, story)
  ok(r2.state === 'resume' && r2.yokai === 'kuragari' && r2.entry === 'x', '選び直さない')
  listen(p, c)
  ok(tonight(c.story(), p, story).state === 'done' && p.flag('yb:kuragari:x'), 'つづきを聞き終えて done')
}

// 二人が7晩: 交互に、同じ（妖怪・場面）は聞き終えるまで繰り返さない。そのあと again
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  najimi(p, 'tengu')
  najimi(p, 'kuragari')
  const heard: string[] = []
  const days = ['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15', '2027-01-16', '2027-01-17']
  for (const day of days) {
    seeAt(p, c, 'kuragari', `${day}T11:00`)
    seeAt(p, c, 'tengu', `${day}T12:00`)
    c.set(`${day}T20:00`)
    const t = tonight(c.story(), p, story)
    if (t.state !== 'offer') {
      ok(false, `${day}: offer でない（${t.state}）`)
      continue
    }
    ok(t.others.length === 1 && t.others[0] !== t.yokai, `${day}: others はもう一人（${t.others.join()}）`)
    listen(p, c)
    heard.push(`${t.yokai}:${t.entry}`)
  }
  snap('seven nights', heard)
  ok(heard.join(' ') === 'tengu:a kuragari:x tengu:c kuragari:y tengu:again kuragari:again tengu:again', `交互に回す（${heard.join(' ')}）`)
  const firstAgain = heard.findIndex((h) => h.endsWith(':again'))
  const before = heard.slice(0, firstAgain)
  ok(new Set(before).size === before.length, 'again の前は同じ（妖怪・場面）を繰り返さない')
  ok(Object.keys(p.get().nights).length === 7 && Object.values(p.get().nights).every((n) => n.done), '7晩とも記録')
}

// 開かなかった夜は、何も残さない
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  najimi(p, 'tengu')
  seeAt(p, c, 'tengu', '2027-01-11T12:00')
  c.set('2027-01-11T20:00')
  tonight(c.story(), p, story)
  tonight(c.story(), p, story)
  ok(Object.keys(p.get().nights).length === 0, 'tonight() は書かない（始めたときだけ startNight）')
  seeAt(p, c, 'tengu', '2027-01-13T12:00')
  c.set('2027-01-13T20:00')
  const t = tonight(c.story(), p, story)
  ok(t.state === 'offer' && t.entry === 'a' && Object.keys(p.get().nights).length === 0, '開かなかった夜（1/11・1/12）は何も残らず、次は同じ場面から')
}

// 気配の一行・pickEntry
{
  const a = kehaiLine(story, 'tengu', '2027-01-11')
  const b = kehaiLine(story, 'tengu', '2027-01-12')
  ok(!!a && !!b && a !== b && kehaiLine(story, 'tengu', '2027-01-13') === a, '気配の一行は日で回す')
  ok(kehaiLine(story, 'nobody', '2027-01-11') === null, '気配の一行の無い妖怪は null')
  const c = clockAt('2027-01-11T20:00')
  const p = store(undefined, c)
  for (const e of ['a', 'c']) p.setFlag(`yb:tengu:${e}`, true)
  ok(pickEntry(story.scripts['yb-tengu'], 'tengu', c.story(), p, story) === 'again', '聞ける場面が無ければ again')
  snap('kehai', [a, b])
}
done()
