// キーボードの位置（フォーカス）の小さな決まり。入口・夢の旅・現の旅・白描の絵地図で同じものを使う。

/**
 * 新しく出した札（全面の札・約束の札）の頭へ、キーボードの位置を移す。
 * 見出し（h1・h2）があれば見出しへ（読み上げが札の頭から始まる。Tab で次のボタンへ）、無ければ最初のボタンかリンクへ。
 * 札の中身を入れ替えると、押したボタンが消えて位置が <body> に落ちるので、そのたびに呼ぶ。
 */
export function focusSheet(card: HTMLElement): void {
  const h = card.querySelector<HTMLElement>('h1, h2')
  if (h) {
    if (!h.hasAttribute('tabindex')) h.tabIndex = -1
    h.focus({ preventScroll: true })
    return
  }
  card.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus({ preventScroll: true })
}
