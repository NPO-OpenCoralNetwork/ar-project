// 本番の物語のデータ（src/data/。段階4b）: 点検の問題が無い・6ピースと時間のピース・くらがりと #9 の流れ（逢魔が時・便り・稽古で金）・
// 夜話の場面（どの場面も両方の選択肢で終わりまで・条件つきの場面も選ばれる・順番に回る）・etoki-first・また聞きの便り・ましろの便り
import { isoInToday } from '../src/core/story/clock'
import { activeQuests, etokiHand } from '../src/core/story/dialogue'
import { etokiRecap, needsEtokiScript } from '../src/core/story/etoki-card'
import { deliverDue, letterView, openLetter, type TayoriEnv } from '../src/core/story/letters'
import type { ProgressStore } from '../src/core/story/progress'
import { type Condition, type DialogueScript, TIME_PIECES } from '../src/core/story/types'
import { kehaiLine, tonight } from '../src/core/story/yobanashi'
import { loadStoryPack } from '../src/data/story-pack'
import { clockAt, done, kv, type MemKV, memoOf, ok, snap, store, talk, type TestClock } from './helpers'

const story = loadStoryPack()

/** 1/16（土）の逢魔が時（16:28〜17:18）・1/17（日）の逢魔が時（16:29〜17:19）・1/17 の夜（17:19 から） */
const DUSK1 = '2027-01-16T16:40'
const DUSK2 = '2027-01-17T16:45'
const NIGHT2 = '2027-01-17T17:40'

const kuragari = (p: ProgressStore, c: TestClock, picks: (number | string)[], stopAfter?: number) => talk(story, p, 'kuragari', 'yume', picks, { clock: c.story(), stopAfter })
const env = (p: ProgressStore, c: TestClock, iso?: string): TayoriEnv => {
  if (iso) c.set(iso)
  return { progress: p, story, clock: c.story() }
}
/** 同じ保存を写した、別の進み具合（分かれ道を一つずつ試す） */
const fork = (k: MemKV, c: TestClock): ProgressStore => {
  const k2 = kv()
  for (const [a, b] of k.mem) k2.setItem(a, b)
  return store(k2, c)
}

// 点検
{
  ok(story.problems.length === 0, `loadStoryPack() の点検に問題が無い${story.problems.length ? `（${story.problems.join(' / ')}）` : ''}`)
  const pieces = story.mandala.tiers.flatMap((t) => t.pieces)
  const named = pieces.filter((p) => p.label).map((p) => p.id)
  ok(named.length === 6, `名前のあるピースは6つ（${named.join('・')}）`)
  ok(
    ['fumoto-kozobo', 'sato-game', 'sato-karabozu', 'sato-minomoshi', 'fumoto-kuragari', 'sato-etoki'].every((id) => named.includes(id)),
    '6ピース: 光蔵坊・ガメ・カーラボーズ・ミノモシ・くらがり・絵解き',
  )
  const timeIds = pieces.filter((p) => p.time).map((p) => p.id)
  ok(timeIds.length === TIME_PIECES.size && timeIds.every((id) => TIME_PIECES.has(id)), `時間のピースは TIME_PIECES と同じ（${timeIds.join('・')}）`)
  ok(!pieces.some((p) => p.id === 'fumoto-13' || p.id === 'sato-4'), '空きの枠 fumoto-13・sato-4 は、くらがり・絵解きに置きかわった')
  const kp = pieces.find((p) => p.id === 'fumoto-kuragari')
  ok(kp?.keiko?.join() === 'mandala-1,mandala-2' && kp.cardIds?.join() === 'mandala-1,mandala-2', '時間のピースの札と稽古は mandala-1・mandala-2')
  ok(!story.cards['mandala-2'].yokaiId && story.cards['mandala-1'].yokaiId === 'kuragari', 'mandala-1 はくらがりの札、mandala-2 はだれのものでもない札')
  ok(story.quests.every((q) => !!q.recap), 'どの悩みにも振り返りの一言（recap）がある')
}

// くらがり E1（はじめての逢魔が時）: 顔見知り・mandala-1・時間のピースに彩色（家でも）・#9 を頼まれる → ましろの便り「影のこと」
{
  const c = clockAt(DUSK1)
  const k = kv()
  const p = store(k, c)
  ok(c.story().phase === 'oumagatoki', '1/16 16:40 は逢魔が時')
  const r = kuragari(p, c, [0, 0, 0])
  snap('E1 trail', r.trail)
  ok(r.ended && r.trail === 'k1>k2>k3a>k4>k5>q1>qr>qa>cl', `E1 の道すじ（${r.trail}）`)
  const piece = p.get().pieces['fumoto-kuragari']
  ok(piece?.state === 'saishiki' && piece.colored?.time === true, '夢の旅でも、逢魔が時なら時間のピースは彩色（time の印つき）')
  ok(
    r.beats.some((b) => b.kind === 'notice' && b.notice.type === 'piece' && b.notice.piece === 'fumoto-kuragari' && b.notice.time === true),
    'ピースのお知らせに time の印',
  )
  ok(p.isCardOpened('mandala-1') && !p.isCardOpened('mandala-2'), '札は mandala-1 だけ開く')
  ok(p.bondOf('kuragari') === 'kaomishiri' && p.flag('kg-q9-asked'), '顔見知り・#9 を頼まれた（kg-q9-asked）')
  ok(activeQuests(story.quests, p, 'yume').some((q) => q.id === 'q9'), '#9 を抱えている')
  ok(isoInToday(p.get().yokai.kuragari?.lastMet?.at, c.story()) && p.talksWith('kuragari') === 1, '今日会った（lastMet）・会話1回')
  const got = deliverDue(env(p, c))
  ok(got.includes('mashiro-kage'), `会話のすぐあとに、ましろの便り「影のこと」が届く（${got.join()}）`)
  const again = store(k, c)
  ok(again.pieceOf('fumoto-kuragari') === 'saishiki' && again.get().pieces['fumoto-kuragari']?.colored?.time === true, '読み直しても時間のピースの彩色が残る')
}

// 逢魔が時でない時に話しても、時間のピースは白描まで
{
  const c = clockAt('2027-01-16T12:00')
  const p = store(undefined, c)
  const r = kuragari(p, c, [1, 2, 0])
  ok(r.trail === 'k1>k2>k3b>k4>k5>q3>qr>qa>cl', `ほかの選択肢の道すじ（${r.trail}）`)
  ok(p.pieceOf('fumoto-kuragari') === 'hakubyo' && !p.get().pieces['fumoto-kuragari']?.colored, '昼に話したら、時間のピースは白描（色は入らない）')
}

// はじめての会話が途中で閉じても、次の夕暮れに続きから（resume・ask）
{
  const c = clockAt(DUSK1)
  const p = store(undefined, c)
  const r1 = kuragari(p, c, [], 4)
  ok(!r1.ended && p.hasMet('kuragari') && !p.isCardOpened('mandala-1'), 'k1 のあとで閉じた（会った・札はまだ）')
  ok(isoInToday(p.get().yokai.kuragari?.lastMet?.at, c.story()) && p.talksWith('kuragari') === 0, 'くらがりが話したので、今日会ったことになる（回数はまだ0）')
  c.set(DUSK2)
  const r2 = kuragari(p, c, [1, 1, 0])
  ok(r2.trail === 'k2>k3b>k4>k5>q2>qr>qa>cl', `次の夕暮れは入口 resume から（${r2.trail}）`)
  ok(p.isCardOpened('mandala-1') && p.pieceOf('fumoto-kuragari') === 'saishiki' && p.flag('kg-q9-asked'), '続きで、札・彩色・#9')

  const qc = clockAt(DUSK1)
  const q = store(undefined, qc)
  const r3 = kuragari(q, qc, [0], 10)
  ok(q.isCardOpened('mandala-1') && q.pieceOf('fumoto-kuragari') === 'empty' && !q.flag('kg-q9-asked'), `札のあと、ピースの前で閉じた（${r3.trail}）`)
  qc.set(DUSK2)
  const r4 = kuragari(q, qc, [0])
  ok(r4.trail === 's1>qa>cl' && q.flag('kg-q9-asked') && q.pieceOf('fumoto-kuragari') === 'saishiki', `次の夕暮れは入口 ask で頼まれ、彩色も入る（${r4.trail}）`)
}

// 悩みが3つのとき: 「また今度」（qf）→ 次の夕暮れも full → 空きができたら ask
{
  const c = clockAt(DUSK1)
  const p = store(undefined, c)
  for (const f of ['tm1-asked', 'kz-q2-asked', 'q11-asked']) p.setFlag(f, true)
  ok(activeQuests(story.quests, p, 'yume').length === 3, '悩みを3つ抱えている')
  const r = kuragari(p, c, [0, 2, 0])
  ok(r.trail === 'k1>k2>k3a>k4>k5>q3>qr>qf>cl', `悩みが3つなら、問いのあと「また今度」（${r.trail}）`)
  ok(!p.flag('kg-q9-asked') && p.pieceOf('fumoto-kuragari') === 'saishiki' && p.isCardOpened('mandala-1'), '頼まれないが、札と彩色は入る')
  ok(deliverDue(env(p, c)).length === 0, '「影のこと」は届かない')
  c.set(DUSK2)
  const r2 = kuragari(p, c, [])
  ok(r2.trail === 'f1>a4', `いっぱいのままなら、次の夕暮れは入口 full（${r2.trail}）`)
  p.setFlag('tm1-done', true)
  c.set('2027-01-18T16:45')
  ok(c.story().phase === 'oumagatoki', '1/18 16:45 も逢魔が時')
  const r3 = kuragari(p, c, [0])
  ok(r3.trail === 's1>qa>cl' && p.flag('kg-q9-asked'), `空きができたら、次の夕暮れに入口 ask で頼まれる（${r3.trail}）`)
  ok(deliverDue(env(p, c)).includes('mashiro-kage'), 'そのあと「影のこと」が届く')
}

// #9: 便りを読む前は wait → 読むと kg-mashiro-read → E2（3つの伝え方）→ なじみ・mandala-2・kg-q9-done → 稽古で金 → again・夜話
{
  const c = clockAt(DUSK1)
  const k = kv()
  const p = store(k, c)
  kuragari(p, c, [0, 0, 0])
  deliverDue(env(p, c))
  c.set('2027-01-16T17:00')
  const w = kuragari(p, c, [])
  ok(w.trail === 'w1>a4', `便りを読む前は入口 wait（${w.trail}）`)
  const view = openLetter('mashiro-kage', p, story)
  ok(p.flag('kg-mashiro-read'), '「影のこと」を読むと kg-mashiro-read')
  ok(view?.title === '影のこと' && view.blocks[0].kind === 'head' && view.blocks[0].text === 'きみへ' && view.blocks.filter((b) => b.kind === 'p').length === 4, '「影のこと」は、きみへ・地の文4つ')
  ok(view?.blocks[view.blocks.length - 1].kind === 'sign', '終わりは「ましろ」')

  for (const [i, x] of ['a', 'b', 'c'].entries()) {
    const ec = clockAt(DUSK2)
    const q = fork(k, ec)
    const r = kuragari(q, ec, [i])
    ok(r.ended && r.trail === `e1>e2${x}>e3>e4>e5`, `E2 の伝え方 ${i + 1}（${r.trail}）`)
    ok(q.bondOf('kuragari') === 'najimi' && q.isCardOpened('mandala-2') && q.flag('kg-q9-done'), `伝え方 ${i + 1}: なじみ・mandala-2・kg-q9-done`)
    ok(!activeQuests(story.quests, q, 'yume').some((qq) => qq.id === 'q9'), `伝え方 ${i + 1}: #9 は解けた`)
    if (i > 0) continue
    // 今日の絵解きの振り返りに、#9 の一言が入る
    const recap = etokiRecap({ progress: q, story, clock: ec.story() }).lines
    ok(recap.includes('影とましろが、はじめて話をした。') && recap[1] === 'きょうは、くらがりに会ったね。', `振り返りに #9 の一言（${recap.join(' / ')}）`)
    // 稽古: 札が2枚そろう → 金（夢の旅でも）。読み直しても金
    const def = story.mandala.tiers.flatMap((t) => t.pieces).find((pc) => pc.id === 'fumoto-kuragari')
    const hand = etokiHand(def?.keiko ?? [], story.cards, q)
    ok(hand.length === 2 && hand.every((h) => 'card' in h), '稽古の手札は、2枚とも開いている')
    ok(q.goldPiece('fumoto-kuragari', 'yume') && q.pieceOf('fumoto-kuragari') === 'kin', '稽古で金（travel: yume）')
    // 同じ日の夜: くらがりが夜話に来る
    ec.set(NIGHT2)
    const t = tonight(ec.story(), q, story)
    ok(t.state === 'offer' && t.yokai === 'kuragari' && t.entry === 'hiroi', `その夜、くらがりが夜話に来る（${JSON.stringify(t)}）`)
    // 次の夕暮れは again（札をもう一度見る・あいさつ）。札は開き直さない
    ec.set('2027-01-18T16:45')
    const a = kuragari(q, ec, [0])
    const shown = a.beats.filter((b) => b.kind === 'card')
    ok(a.trail === 'a1>a2>a4' && shown.length === 2 && shown.every((b) => b.kind === 'card' && !b.first), `again で札を2枚、もう一度見る（${a.trail}）`)
    const a2 = kuragari(q, ec, [1])
    ok(a2.trail === 'a1>a3>a4', `again のあいさつ（${a2.trail}）`)
    ok(q.pieceOf('fumoto-kuragari') === 'kin', 'again の timePiece は金を下げない')
  }
}

// 夜話: どの妖怪のどの場面も、両方の選択肢で終わりまで（夜話は会ったことにしない・札は開かない）
const yobanashiOf = Object.values(story.yokai)
  .filter((y) => y.yobanashi)
  .map((y) => ({ yokai: y.id, script: story.scripts[y.yobanashi ?? ''] }))
ok(yobanashiOf.length === 5 && yobanashiOf.every((x) => x.script?.kind === 'yobanashi'), '夜話の台本は5人分（光蔵坊・ガメ・カーラボーズ・ミノモシ・くらがり）')

/** 入口の条件を満たす（フラグ・持ち物・札だけ。ほかの条件を書いたら、ここで落とす） */
const satisfy = (p: ProgressStore, conds: Condition[] | undefined, travel: 'yume' | 'utsutsu' = 'yume') => {
  for (const w of conds ?? []) {
    if ('flag' in w) p.setFlag(w.flag, w.is)
    else if ('item' in w && w.state === 'given') {
      p.receive(w.item, travel)
      p.deliver(w.item, travel)
    } else if ('card' in w && w.opened) p.openCard(w.card, travel)
    else throw new Error(`入口の条件 ${JSON.stringify(w)} は、このテストで満たせない`)
  }
}
/** なじみで、その日に会った妖怪（夜話に来られる） */
const najimiToday = (p: ProgressStore, c: TestClock, y: string, iso: string, travel: 'yume' | 'utsutsu' = 'yume') => {
  c.set(iso)
  p.meet(y, travel)
  p.raiseBond(y, 'najimi', travel)
  p.noteSeen(y, travel)
}
/** 夜話の場面の終わり: 休む・灯りや家・水辺の用心のどれかで閉じる（04 §3.8） */
const REST = /おやすみ|寝|眠|休|灯り|家|戸締まり|近寄るな|来ちゃだめ|夜はだめ|出歩くでない|歩きすぎるでない/
const endNodeOf = (s: DialogueScript, trail: string) => s.nodes[trail.split('>').pop() ?? '']
/** 入口の場面から行ける場面 */
const reachable = (s: DialogueScript, from: string): string[] => {
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id) || !s.nodes[id]) return
    seen.add(id)
    const n = s.nodes[id]
    if (n.next) walk(n.next)
    for (const c of n.choices ?? []) walk(c.next)
  }
  walk(from)
  return [...seen]
}

for (const { yokai, script } of yobanashiOf) {
  for (const e of script.entries) {
    const first = script.nodes[e.node]
    const options = first.choices?.length ?? 0
    // 1つの場面に選択肢は1回まで・2つ（04 §3.8）
    const choiceNodes = reachable(script, e.node).filter((id) => script.nodes[id].choices?.length)
    ok(e.id === 'again' ? options === 0 : choiceNodes.length === 1 && options === 2, `${script.id} ${e.id}: 選択肢は${e.id === 'again' ? '無し' : '1回・2つ'}`)
    for (let pick = 0; pick < Math.max(options, 1); pick++) {
      const c = clockAt('2027-01-16T10:00')
      const p = store(undefined, c)
      satisfy(p, e.when)
      najimiToday(p, c, yokai, '2027-01-16T11:00')
      c.set('2027-01-16T20:00')
      const before = JSON.stringify({ y: { ...p.get().yokai[yokai], talks: 0 }, cards: p.get().cards, pieces: p.get().pieces, items: p.get().items })
      const r = talk(story, p, script.id, 'yume', [pick], { clock: c.story(), record: 'visit', entry: e.id })
      const after = JSON.stringify({ y: { ...p.get().yokai[yokai], talks: 0 }, cards: p.get().cards, pieces: p.get().pieces, items: p.get().items })
      const end = endNodeOf(script, r.trail)
      ok(r.ended && r.trail.split('>')[0] === e.node && !!end?.end, `${script.id} ${e.id} 選択肢${pick + 1}: 終わりまで（${r.trail}）`)
      ok(p.talksWith(yokai) === 1 && before === after, `${script.id} ${e.id} 選択肢${pick + 1}: 回数だけ1つ増え、会った時・縁・札・ピース・持ち物は変わらない`)
      ok((end?.lines ?? []).some((l) => REST.test(l.text)), `${script.id} ${e.id}: 休む・灯り・家・水辺の用心の言葉で閉じる`)
      ok(r.seen.every((s) => !s.includes('{')), `${script.id} ${e.id}: 差し込みが残らない`)
    }
  }
}

// 夜話: 条件つきの場面は、その条件だけでも選ばれる（上から、まだ聞いていない場面）
for (const { yokai, script } of yobanashiOf) {
  for (const e of script.entries) {
    if (!e.when?.length) continue
    const c = clockAt('2027-01-16T10:00')
    const p = store(undefined, c)
    satisfy(p, e.when)
    najimiToday(p, c, yokai, '2027-01-16T11:00')
    c.set('2027-01-16T20:00')
    const t = tonight(c.story(), p, story)
    ok(t.state === 'offer' && t.yokai === yokai && t.entry === e.id, `${script.id}: 条件つきの場面 ${e.id} が選ばれる（${'entry' in t ? t.entry : t.state}）`)
  }
}

// 夜話: 条件を満たせば、一週間で同じ場面をくり返さずに回り、聞き終えたら again。気配の一行もある
for (const { yokai, script } of yobanashiOf) {
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  for (const e of script.entries) satisfy(p, e.when)
  const heard: string[] = []
  for (const d of ['11', '12', '13', '14', '15', '16', '17']) {
    najimiToday(p, c, yokai, `2027-01-${d}T12:00`)
    c.set(`2027-01-${d}T20:00`)
    const clock = c.story()
    const t = tonight(clock, p, story)
    if (t.state !== 'offer') {
      heard.push(t.state)
      continue
    }
    p.startNight(clock.day, t.yokai, t.entry)
    talk(story, p, t.script, 'yume', [0], { clock, record: 'visit', entry: t.entry, onFinish: () => p.finishNight(clock.day) })
    heard.push(t.entry)
  }
  const scenes = script.entries.map((e) => e.id).filter((id) => id !== 'again')
  const want = [...scenes, ...Array(7 - scenes.length).fill('again')]
  snap(`yobanashi week ${yokai}`, heard)
  ok(heard.join() === want.join(), `${script.id}: 一週間の夜話（${heard.join('・')}）`)
  ok(!!kehaiLine(story, yokai, '2027-01-16') && !!kehaiLine(story, yokai, '2027-01-17'), `${yokai}: 夜の気配の一行がある`)
}

// 夜話の台詞の出し分け（その日に会ったか・見習いになったか・持ち物・札）
{
  const lines = (p: ProgressStore, c: TestClock, scriptId: string, entry: string, picks: number[] = [0]) =>
    talk(story, p, scriptId, 'yume', picks, { clock: c.story(), record: 'visit', entry }).seen.join('\n')
  {
    const c = clockAt('2027-01-16T10:00')
    const p = store(undefined, c)
    najimiToday(p, c, 'kozobo', '2027-01-16T11:00')
    c.set('2027-01-16T20:00')
    const s = lines(p, c, 'yobanashi-kozobo', 'yama')
    ok(s.includes('起きておったか、人の子') && !s.includes('見習い') && s.includes('夢の中まで来おった') && !s.includes('歩いて来おった'), '光蔵坊 yama: #2 の前は「人の子」・夢で会った日の一言')
    p.setFlag('kz-q2-done', true)
    najimiToday(p, c, 'kozobo', '2027-01-16T21:00', 'utsutsu')
    const s2 = lines(p, c, 'yobanashi-kozobo', 'yama')
    ok(s2.includes('起きておったか、見習い') && s2.includes('歩いて来おった') && !s2.includes('夢の中まで'), '光蔵坊 yama: #2 のあとは「見習い」・現地で会った日の一言')
  }
  {
    const c = clockAt('2027-01-16T10:00')
    const p = store(undefined, c)
    p.setFlag('tm1-game-thanked', true)
    najimiToday(p, c, 'game', '2027-01-16T11:00')
    c.set('2027-01-16T20:00')
    const none = lines(p, c, 'yobanashi-game', 'oishii', [1])
    ok(none.split('まだ食べたことないもの').length === 2 && none.includes('まだ、ないしょ') && !none.includes('白えび'), 'ガメ oishii: 白えびをまだ渡していなければ、好物は言わない（同じ台詞は1回）')
    p.receive('shiroebi', 'yume')
    const held = lines(p, c, 'yobanashi-game', 'oishii', [1])
    ok(held.split('まだ食べたことないもの').length === 2 && held.includes('まだ、ないしょ'), 'ガメ oishii: 持っているだけでも、まだ言わない')
    p.deliver('shiroebi', 'yume')
    const given = lines(p, c, 'yobanashi-game', 'oishii', [1])
    ok(given.includes('白えび、すっごくおいしかった') && given.includes('白えびと') && !given.includes('いっぱいあるんだ') && !given.includes('ないしょ'), 'ガメ oishii: 渡したあとは白えびの話')
    p.setFlag('tm1-done', true)
    ok(!lines(p, c, 'yobanashi-game', 'oyakata').includes('（……あ。）'), 'ガメ oyakata: 札 karabozu-1 を開いていなければ、ましろは黙っている')
    p.openCard('karabozu-1', 'yume')
    ok(lines(p, c, 'yobanashi-game', 'oyakata').includes('（言わないって、約束したもんね）'), 'ガメ oyakata: 札を開いていれば、ましろの心の声')
  }
  {
    const c = clockAt('2027-01-16T10:00')
    const p = store(undefined, c)
    najimiToday(p, c, 'karabozu', '2027-01-16T11:00', 'utsutsu')
    c.set('2027-01-16T20:00')
    ok(lines(p, c, 'yobanashi-karabozu', 'banmade').includes('足で来たそうだな'), 'カーラボーズ banmade: 現地で会った日の一言')
    najimiToday(p, c, 'karabozu', '2027-01-16T21:00')
    ok(!lines(p, c, 'yobanashi-karabozu', 'banmade').includes('足で来たそうだな'), 'カーラボーズ banmade: 夢で会った日は言わない')
  }
  {
    const c = clockAt('2027-01-16T10:00')
    const p = store(undefined, c)
    p.openCard('mino-3', 'yume')
    najimiToday(p, c, 'minomoshi', '2027-01-16T11:00')
    c.set('2027-01-16T20:00')
    const r = talk(story, p, 'yobanashi-minomoshi', 'yume', [1], { clock: c.story(), record: 'visit', entry: 'kanejaku' })
    ok(r.trail === 'kanejaku>kanejaku_b>kanejaku_end' && r.beats.some((b) => b.kind === 'card' && b.card.id === 'mino-3' && !b.first), 'ミノモシ kanejaku: 曲尺は札（showCard）で見せる')
  }
}

// 今日の絵解きのはじめて（etoki-first）: 家では白描と mandala-2、現地で白描から彩色。はじめから現地なら彩色
{
  const c = clockAt('2027-01-16T19:00')
  const p = store(undefined, c)
  ok(needsEtokiScript(p, 'yume'), 'はじめての絵解きの前は etoki-first を走らせる')
  const r = talk(story, p, 'etoki-first', 'yume', [], { clock: c.story() })
  ok(r.trail === 'f1>f2' && p.pieceOf('sato-etoki') === 'hakubyo' && p.isCardOpened('mandala-2'), `家では白描と mandala-2（${r.trail}）`)
  ok(!needsEtokiScript(p, 'yume') && needsEtokiScript(p, 'utsutsu'), '家ではもう走らせない。現地ならもう一度')
  const r2 = talk(story, p, 'etoki-first', 'utsutsu', [], { clock: c.story() })
  ok(r2.trail === 'color' && p.pieceOf('sato-etoki') === 'saishiki' && !needsEtokiScript(p, 'utsutsu'), `現地でつくると、白描から彩色（${r2.trail}）`)
  const q = store(undefined, c)
  const r3 = talk(story, q, 'etoki-first', 'utsutsu', [], { clock: c.story() })
  ok(r3.trail === 'f1>f2' && q.pieceOf('sato-etoki') === 'saishiki' && q.isCardOpened('mandala-2'), 'はじめから現地なら、彩色と mandala-2')
}

// また聞きの便り: フラグの次の日に届く（1日1通・カーラボーズが先）。白描の頁の言葉と、札の枠（出典つき）がある
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  for (let i = 0; i < 5; i++) p.noteTalk('kozobo', 'yume')
  p.noteSeen('karabozu', 'yume')
  p.setFlag('tm1-done', true)
  p.setFlag('kz-q2-done', true)
  ok(deliverDue(env(p, c, '2027-01-11T20:00')).length === 0, 'フラグの日には、また聞きは届かない')
  const d1 = deliverDue(env(p, c, '2027-01-12T08:00'))
  const d2 = deliverDue(env(p, c, '2027-01-13T08:00'))
  ok(d1.join() === 'matagiki-karabozu' && d2.join() === 'matagiki-kozobo', `次の日から1日1通、カーラボーズが先（${d1.join()} / ${d2.join()}）`)
  ok((p.letter('matagiki-karabozu')?.parts ?? []).includes('s1.a') && (p.letter('matagiki-kozobo')?.parts ?? []).includes('s1.b'), '言い回しは糸の艶で選ぶ（会話5回から b）')
  for (const [id, card, yokai] of [
    ['matagiki-karabozu', 'karabozu-1', 'カーラボーズ'],
    ['matagiki-kozobo', 'kozobo-1', '光蔵坊'],
  ] as const) {
    const v = letterView(id, p, story, memoOf('さくら'))
    const cardBlock = v?.blocks.find((b) => b.kind === 'card')
    ok(cardBlock?.kind === 'card' && cardBlock.card.id === card && !!cardBlock.card.source.work && !!cardBlock.lead, `${id}: 札の枠（${card}・出典・前置き）`)
    ok(!!v?.blocks.some((b) => b.kind === 'quote' && b.name === yokai && !b.text.includes('さくら')), `${id}: 白描の頁の言葉（${yokai}。呼び名は入らない）`)
    ok(v?.blocks[0].kind === 'head' && v.blocks[0].text === 'さくらへ', `${id}: 頭は「さくらへ」`)
    openLetter(id, p, story)
    ok(p.isCardOpened(card) && !!p.letter(id)?.read, `${id}: 読むと札が開く`)
  }
}

// ましろの便り（本番の部品）: 遊んだ次の日に、呼び名を聞く・はじめの一文・妖怪の話・くらがりのそえる一言・結び
{
  const c = clockAt('2027-01-11T10:00')
  const p = store(undefined, c)
  p.meet('kozobo', 'yume')
  p.raiseBond('kozobo', 'kaomishiri', 'yume')
  p.noteSeen('kozobo', 'yume')
  const got = deliverDue(env(p, c, '2027-01-12T08:00'))
  const parts = p.letter('fumi:2027-01-12')?.parts ?? []
  snap('daily parts', parts)
  ok(got.join() === 'fumi:2027-01-12' && parts[0] === 'ask' && parts.some((x) => /^snip:k-a\d$/.test(x)) && parts.includes('hint:kuragari'), `部品（${parts.join(' ')}）`)
  const v = letterView('fumi:2027-01-12', p, story, memoOf(null, false))
  const texts = (v?.blocks ?? []).flatMap((b) => (b.kind === 'p' ? [b.text] : []))
  ok(v?.title === 'ましろの便り' && texts.length === parts.length && texts.every((t) => t.length > 0 && !t.includes('{')), `どの部品も文になる（${texts.length}）`)
  ok(!!v?.blocks.some((b) => b.kind === 'ask'), '呼び名をまだ書いていなければ、聞くボタン')
  ok(!letterView('fumi:2027-01-12', p, story, memoOf('さくら'))?.blocks.some((b) => b.kind === 'ask'), '書いたあとは聞かない')
}

done()
