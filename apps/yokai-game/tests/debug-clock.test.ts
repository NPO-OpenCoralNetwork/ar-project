// テスト用の時計（core/debug-clock.ts）: ?debug&clock= の読み方・セッションに残す差・?debug が無ければ実時刻・時計の札
import { CLOCK_SESSION_KEY, clockParam, clockTag, createAppClock, parseClockParam, type SessionLike } from '../src/core/debug-clock'
import { done, jst, ok, snap } from './helpers'

const REAL = jst('2026-10-18T12:00')
const real = () => REAL
const session = (): SessionLike & { mem: Map<string, string> } => {
  const mem = new Map<string, string>()
  return { mem, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
}

// 読み方
const abs = parseClockParam('2027-01-16T16:40', REAL)
ok(!!abs && abs !== 'off' && 'targetMs' in abs && abs.targetMs === jst('2027-01-16T16:40'), '絶対の時刻（JST）')
const sec = parseClockParam('2027-01-16T16:40:30', REAL)
ok(!!sec && sec !== 'off' && 'targetMs' in sec && sec.targetMs === jst('2027-01-16T16:40:30'), '秒つきも読める')
const rel = (v: string) => {
  const r = parseClockParam(v, REAL)
  return r && r !== 'off' && 'offsetMs' in r ? r.offsetMs : null
}
ok(rel('+90m') === 90 * 60_000 && rel('-2h') === -2 * 3_600_000 && rel('+1d') === 86_400_000, '相対（+90m・-2h・+1d）')
ok(rel(' 90m') === 90 * 60_000, 'URL で空白になった「+」も読む')
ok(parseClockParam('off', REAL) === 'off', 'off')
for (const bad of ['xyz', '2027-02-30T10:00', '2027-01-16T25:00', '2027-01-16', '+5x', '', '2300-01-01T00:00', '+99999999m'])
  ok(parseClockParam(bad, REAL) === null, `読めない: ${JSON.stringify(bad)}`)

// ?debug が無ければ、いつも実時刻（セッションの差も読まない・書かない）
{
  const s = session()
  s.setItem(CLOCK_SESSION_KEY, String(3_600_000))
  const c = createAppClock('?clock=2027-01-16T16:40', s, real)
  ok(c.now() === REAL && c.offsetMs === 0 && s.mem.get(CLOCK_SESSION_KEY) === '3600000', '?debug が無ければ clock も差も無視')
  c.setTarget(jst('2027-01-16T16:40'))
  ok(c.now() === REAL, '?debug が無ければ setTarget も効かない')
  ok(clockTag(c) === null, '差が無ければ時計の札は無し')
}

// 合わせる・残す・戻す
{
  const s = session()
  const a = createAppClock('?debug&clock=2027-01-16T16:40', s, real)
  ok(a.now() === jst('2027-01-16T16:40') && s.mem.get(CLOCK_SESSION_KEY) === String(jst('2027-01-16T16:40') - REAL), '絶対の時刻に合わせ、差をセッションに残す')
  ok(clockTag(a) === '時計: 1月16日 16:40（テスト）', `時計の札（${clockTag(a)}）`)
  const b = createAppClock('?debug', s, real)
  ok(b.now() === jst('2027-01-16T16:40'), 'セッションの差は次の createAppClock でも続く')
  const r = createAppClock('?debug&clock=+90m', s, real)
  ok(r.now() === REAL + 90 * 60_000, '相対は実時刻から（重ねない）')
  const plus = createAppClock(`?debug&clock=${'+1d'}`, s, real)
  ok(plus.now() === REAL + 86_400_000, 'URL の + も相対として読む')
  let told = 0
  plus.onChange(() => told++)
  plus.setTarget(jst('2027-01-17T17:40'))
  ok(plus.now() === jst('2027-01-17T17:40') && told === 1 && s.mem.get(CLOCK_SESSION_KEY) === String(jst('2027-01-17T17:40') - REAL), 'setTarget で合わせ、知らせ、残す')
  plus.setTarget(null)
  ok(plus.now() === REAL && plus.offsetMs === 0 && s.mem.get(CLOCK_SESSION_KEY) === '0' && told === 2 && clockTag(plus) === null, 'setTarget(null) で実時刻へ（セッションには差 0 を残す）')
  s.setItem(CLOCK_SESSION_KEY, '7200000')
  const off = createAppClock('?debug&clock=off', s, real)
  ok(off.now() === REAL && s.mem.get(CLOCK_SESSION_KEY) === '0', '?debug&clock=off で戻す')
  s.setItem(CLOCK_SESSION_KEY, 'garbage')
  ok(createAppClock('?debug', s, real).offsetMs === 0, '読めない差は無視')
  ok(createAppClock('?debug&clock=nonsense', s, real).offsetMs === 0, '読めない clock は、セッションの差（無ければ実時刻）')
  ok(createAppClock('?debug', null, real).now() === REAL, 'セッションが無くても動く')
}
// 入口から旅のページへ渡す差（相対の clock。分に切り上げ: 渡した先で、時刻が巻き戻らない）
{
  ok(clockParam(0) === null && clockParam(-20_000) === null, '差が無い（1分に満たない遅れ）なら渡さない')
  ok(clockParam(90 * 60_000) === '+90m' && clockParam(-2 * 3_600_000) === '-120m', `相対の形（${clockParam(-2 * 3_600_000)}）`)
  for (const off of [jst('2027-01-16T16:40') - REAL + 12_345, -(3 * 86_400_000) - 45_000, 99 * 365 * 86_400_000]) {
    const back = rel(clockParam(off)!)
    ok(back !== null && back >= off && back - off < 60_000, `渡した差を読み直すと、前にならない（${off} → ${back}）`)
  }
  const s = session()
  const a = createAppClock('?debug&clock=2027-01-16T16:40', s, real)
  a.setTarget(jst('2027-01-16T19:05'))
  const next = createAppClock(`?debug&clock=${encodeURIComponent(clockParam(a.offsetMs)!)}`, s, real)
  ok(next.now() === jst('2027-01-16T19:05'), '合わせ直した時刻が、次のページでも続く（URL の clock で戻らない）')
}
// ブラウザの「戻る」「進む」（履歴で読み込んだとき）: ほかのページで合わせ直したセッションの差が、前の URL の clock より先
{
  const s = session()
  const entrance = '?debug&clock=2027-01-16T16:40'
  createAppClock(entrance, s, real)
  const yume = createAppClock(`?debug&clock=${encodeURIComponent(clockParam(jst('2027-01-16T16:40') - REAL)!)}`, s, real)
  yume.setTarget(jst('2027-01-17T16:40'))
  const back = createAppClock(entrance, s, real, { preferSession: true })
  ok(back.now() === jst('2027-01-17T16:40'), '「戻る」: 入口の URL の clock（1月16日）でなく、旅のページで合わせた 1月17日')
  ok(createAppClock(entrance, s, real).now() === jst('2027-01-16T16:40'), 'ふつうに開いたときは、URL の clock が先（これまでどおり）')
  yume.setTarget(null)
  ok(createAppClock(entrance, s, real, { preferSession: true }).now() === REAL, '「戻る」: 旅のページで「いま」に戻したら、実時刻のまま')
  ok(createAppClock(entrance, session(), real, { preferSession: true }).now() === jst('2027-01-16T16:40'), '「戻る」でもセッションに差が無ければ、URL の clock')
  const garbage = session()
  garbage.setItem(CLOCK_SESSION_KEY, 'garbage')
  ok(createAppClock(entrance, garbage, real, { preferSession: true }).now() === jst('2027-01-16T16:40'), '「戻る」でもセッションの差が読めなければ、URL の clock')
  ok(createAppClock('?clock=2027-01-16T16:40', s, real, { preferSession: true }).now() === REAL, '?debug が無ければ「戻る」でも実時刻')
}
// そのまま残っていたページに「戻る」で帰ったとき（resync）
{
  const s = session()
  const entrance = createAppClock('?debug&clock=2027-01-16T16:40', s, real)
  let told = 0
  entrance.onChange(() => told++)
  ok(!entrance.resync() && told === 0, 'セッションの差が同じなら、何もしない')
  createAppClock(`?debug&clock=${encodeURIComponent(clockParam(entrance.offsetMs)!)}`, s, real).setTarget(jst('2027-01-17T12:00'))
  ok(entrance.resync() && entrance.now() === jst('2027-01-17T12:00') && told === 1, '旅のページで合わせ直した差を読み直し、知らせる')
  s.mem.delete(CLOCK_SESSION_KEY)
  ok(!entrance.resync() && entrance.now() === jst('2027-01-17T12:00'), 'セッションに差が無ければ、そのまま')
  const plain = createAppClock('', s, real)
  s.setItem(CLOCK_SESSION_KEY, '3600000')
  ok(!plain.resync() && plain.now() === REAL, '?debug が無ければ読み直さない')
}
snap('parsed', [parseClockParam('2027-01-16T16:40', REAL), rel('+90m'), rel('-2h')])
done()
