// ましろの申し出（段階4b。04 §7 10/18 の 497「仕事のあとでも遊べるように」）。家の箱庭・白描の絵地図の、画面の下の案内の場所に出す小さな札。
// three.js は読み込まない。
//
// - いま（立山の時刻）の夜に入ったとき、ページを開くたびに一度だけ（出すかどうかはページが決める。yume/main.ts・ezu/main.ts）。
//   「夜は、みんな気配だけ。」［昼の夢にする］、夜話が来ていれば「夜話に、だれか来ている。」［帳の「便り」をひらく］。
// - ボタンは1つと、とじる（×）。どちらを押しても札は消える（onClose で、ページに知らせる）。急かす言葉・数・点滅は出さない。外へ出かけることはすすめない。
// - ましろの言葉は【創作】なので、会話の枠の外でも「台本・創作」の印をつける。
// - 会話・帳・遊びの間は隠す（画面の root の modal-open・talking・yg-playing）。ページも、そのあいだは close() でしまい、閉じたら出しなおす。
//   キーボードの位置は奪わない（Tab で届く）。札の中にキーボードの位置があるまま消えるときは、returnFocus（時間・帳のボタン）へ移す（<body> に落とさない）。

const STYLE = /* css */ `
.yo-offer { position: absolute; left: 50%; bottom: calc(112px + var(--sab, 0px)); transform: translate(-50%, 6px); opacity: 0; transition: opacity 0.4s, transform 0.4s;
  z-index: 60; box-sizing: border-box; width: max-content; max-width: calc(100vw - 32px); display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px;
  padding: 10px 50px 10px 16px; pointer-events: auto; font-family: var(--ui-font); color: #2a2622; background: #faf7f0;
  border: 1px solid rgba(42, 38, 34, 0.24); border-radius: 14px; box-shadow: 0 8px 26px rgba(40, 30, 20, 0.16); }
.yo-offer.on { opacity: 1; transform: translate(-50%, 0); }
.yo-offer .yo-say { flex: 1 1 auto; min-width: 0; margin: 0; }
.yo-offer .yo-who { display: block; font-size: 11px; letter-spacing: 0.1em; color: rgba(42, 38, 34, 0.68); margin-bottom: 2px; }
.yo-offer .yo-tag { display: inline-block; margin-left: 8px; font-style: normal; font-size: 10px; letter-spacing: 0.04em; line-height: 1.5; border: 1px solid rgba(42, 38, 34, 0.28); border-radius: 999px; padding: 0 7px; }
.yo-offer .yo-text { display: block; font-family: var(--title-font); font-size: 15px; letter-spacing: 0.05em; line-height: 1.6; }
.yo-offer button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.yo-offer .yo-act { flex: none; min-height: 44px; padding: 0 16px; font-family: var(--title-font); font-size: 14.5px; letter-spacing: 0.06em; background: rgba(255, 255, 255, 0.7); border: 1px solid rgba(42, 38, 34, 0.32); border-radius: 10px; }
.yo-offer .yo-x { position: absolute; top: 2px; right: 2px; width: 44px; height: 44px; padding: 0; font-size: 18px; line-height: 1; background: transparent; border: 0; border-radius: 10px; color: rgba(42, 38, 34, 0.7); }
.yo-offer button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
/* 夜の板（暗い地に明るい字。夜の紙の色） */
.yh[data-time="night"] .yo-offer { color: #ebe7f3; background: rgba(32, 37, 64, 0.96); border-color: rgba(235, 231, 243, 0.26); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.35); }
.yh[data-time="night"] .yo-offer .yo-who, .yh[data-time="night"] .yo-offer .yo-x { color: rgba(235, 231, 243, 0.74); }
.yh[data-time="night"] .yo-offer .yo-tag { border-color: rgba(235, 231, 243, 0.32); }
.yh[data-time="night"] .yo-offer .yo-act { background: rgba(255, 255, 255, 0.08); border-color: rgba(235, 231, 243, 0.4); }
.yh.modal-open .yo-offer, .yh.talking .yo-offer, .yh.yg-playing .yo-offer { visibility: hidden; }
@media (prefers-reduced-motion: reduce) {
  .yo-offer { transition: none; transform: translate(-50%, 0); }
}
`

let styled = false
function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = STYLE
  document.head.appendChild(s)
}

/**
 * 申し出を出す。text はましろの言葉、action はボタンの字。ボタンか × を押すと消える（ボタンは onAction も呼ぶ）。
 * onClose: 遊ぶ人がボタンか × で閉じたとき（onAction より先。ページの close() では呼ばない）。
 * returnFocus: 消えるときに札の中にキーボードの位置があれば、ここへ移す（onAction より先なので、帳はここへ戻す）
 */
export function showOffer(
  root: HTMLElement,
  o: { text: string; action: string; onAction(): void; onClose?(): void; returnFocus?: HTMLElement },
): { close(): void } {
  injectStyle()
  const box = document.createElement('div')
  box.className = 'yo-offer'
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', 'ましろの申し出')
  const say = document.createElement('p')
  say.className = 'yo-say'
  const who = document.createElement('small')
  who.className = 'yo-who'
  who.innerHTML = 'ましろ<i class="yo-tag" title="本作の創作の台詞（伝承の事実は「伝承の札」で示します）">台本・創作</i>'
  // 読み上げ: 札を置いてから字を入れる（はじめから字のある知らせの場所は、読まれないことがある）
  const text = document.createElement('span')
  text.className = 'yo-text'
  text.setAttribute('aria-live', 'polite')
  say.append(who, text)
  const act = document.createElement('button')
  act.type = 'button'
  act.className = 'yo-act'
  act.textContent = o.action
  const x = document.createElement('button')
  x.type = 'button'
  x.className = 'yo-x'
  x.setAttribute('aria-label', 'とじる')
  x.title = 'とじる'
  x.innerHTML = '<span aria-hidden="true">×</span>'
  box.append(say, act, x)
  root.appendChild(box)

  let closed = false
  let raf = requestAnimationFrame(() => {
    raf = 0
    text.textContent = o.text
    box.classList.add('on')
  })
  const close = () => {
    if (closed) return
    closed = true
    if (raf) cancelAnimationFrame(raf)
    const had = box.contains(document.activeElement)
    box.remove()
    if (had) o.returnFocus?.focus({ preventScroll: true })
  }
  act.addEventListener('click', () => {
    close()
    o.onClose?.()
    o.onAction()
  })
  x.addEventListener('click', () => {
    close()
    o.onClose?.()
  })
  return { close }
}
