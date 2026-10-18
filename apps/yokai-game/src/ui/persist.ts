// 端末の保存を長く残すよう、一度だけ静かに頼む（navigator.storage.persist。結果は見せない）。入口・夢の旅・現の旅・白描の絵地図で使う。
// 札の見た目（transfer-sheet.css）を旅のページへ持ち込まないよう、引き継ぎの札とは分けて置く。
//
// - 頼むのは、進み具合があるときに、押したあとだけ（開いただけでは頼まない。Firefox は許可を尋ねる画面を出すので、わけの分かる時に）。
// - 押すとすぐ別のページへ移る所（入口の旅のボタン）では頼まない。尋ねる画面はページを移ると消え、頼みが届かないまま
//   「頼んだ」印だけが残ってしまう（4a review R2）。旅のページで遊びはじめてから押したとき（persistOnTap）、引き継ぎの札で読み込めたとき、
//   入口で約束の札を出したとき（どれもページはそのまま）に頼む。
// - 許されても許されなくても、もう一度は頼まない（PERSIST_KEY）。

import { PERSIST_KEY } from '../core/storage-keys'
import { browserStorage, migrateLegacySave } from '../core/story/progress'
import { TRANSFER_SAVES } from '../core/story/transfer'

/**
 * 進み具合があれば、端末の保存を長く残すよう、一度だけ頼む。押したあと、ページを離れないときにだけ呼ぶ。
 * 頼んだ・もう頼んである・この端末では頼めないときは true。まだ進み具合が無ければ false（あとで、また呼んでよい）
 */
export function persistOnce(): boolean {
  const storage = browserStorage()
  if (!storage || !navigator.storage?.persist) return true
  const has = (key: string): boolean => {
    migrateLegacySave(storage, key)
    return !!storage.getItem(key)
  }
  try {
    if (storage.getItem(PERSIST_KEY)) return true
    if (!Object.values(TRANSFER_SAVES).some(has)) return false
    storage.setItem(PERSIST_KEY, '1')
  } catch {
    return true
  }
  navigator.storage
    .persisted()
    .then((done) => (done ? true : navigator.storage.persist()))
    .catch(() => false)
  return true
}

/**
 * 旅のページで、遊びはじめたところで一度呼ぶ。このあと押す（指・クリック・キー）たびに persistOnce を試し、頼んだらやめる。
 * はじめての旅でも、妖怪に会って進み具合ができたあとに押したときに頼める。リンク（別のページへ移る）を押したときと、
 * キーを押し続けている間（繰り返し）は試さない。呼んだときの押し（はじめるボタン）は数えない（位置の許可を尋ねる画面と重ねない）
 */
export function persistOnTap(): void {
  const on = (e: Event) => {
    if ((e as KeyboardEvent).repeat || (e.target as Element | null)?.closest?.('a[href]')) return
    if (!persistOnce()) return
    window.removeEventListener('pointerup', on, true)
    window.removeEventListener('keydown', on, true)
  }
  window.addEventListener('pointerup', on, true)
  window.addEventListener('keydown', on, true)
}
