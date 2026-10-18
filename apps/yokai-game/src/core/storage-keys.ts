// 端末の中（localStorage）に置く保存の名前。どのページでも同じ名前を使う（入口・夢の旅・現の旅・白描の絵地図）。
//
// 名前を変えたわけ（10/18、4a review F1）: 公開中の版（/）と試しの版（/preview/）は同じオリジンなので、保存も同じ所にある。
// 前の版のゲームは、読めない保存（版2 の進み具合・版4 の土地）を空として扱い、次の保存で丸ごと上書きしてしまう。
// そこで、この版からは前の版が読まない名前に置く。前の名前の保存は、いまの名前に保存が無いときだけ写す
// （progress.ts の migrateLegacySave・test-land.ts）。前の名前の保存は消さず、書き換えもしない（前の版の保存で、控えにもなる）。
// 進み具合は、写したときと、この版でやり直したときに「<いまの名前>.legacy-done」の印を残し、もう写さない（やり直しが戻らないように）。

/** 物語の進み具合（会った・札・ピース・縁・旅印・持ち物）。立山のふもと（岩峅寺）の夢の旅と現の旅で共通 */
export const STORY_KEY = 'yume.story.iwakuraji.v2'
/** テスト用の土地（地元のパック）の進み具合。現地のテストと、家の白描の絵地図で共通 */
export const TEST_KEY = 'yume.story.test.v2'
/** 位置シミュレーターの進み具合（始めるたびに、その土地の保存を写す。立山のふもとは STORY_KEY、テスト用の土地は TEST_KEY。写し直すので、前の名前から移さない） */
export const SIM_KEY = 'yume.story.sim.v2'
/** テスト用の土地そのもの（家の近くの地図と地点。test-land.ts。引き継ぎコードには入れない） */
export const TESTLAND_KEY = 'yume.testland.v2'
/** 三つの約束を読んだか */
export const PROMISE_KEY = 'yume.promises.v1'
/** 端末の保存を長く残すよう頼んだか（一度だけ頼む。ui/persist.ts の persistOnce） */
export const PERSIST_KEY = 'yume.persist.v1'

/** 前の名前（前の版のゲームが読み書きする。この版は読むだけ） */
export const LEGACY_STORY_KEY = 'yume.story.v1'
export const LEGACY_TEST_KEY = 'yume.story.test.v1'
export const LEGACY_TESTLAND_KEY = 'yume.testland.v1'
