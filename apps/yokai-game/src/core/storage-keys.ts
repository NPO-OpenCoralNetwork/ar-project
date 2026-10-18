// 端末の中（localStorage）に置く保存の名前。どのページでも同じ名前を使う（入口・夢の旅・現の旅・白描の絵地図）。
//
// 名前を変えたわけ（10/18、4a review F1）: 公開中の版（/）と試しの版（/preview/）は同じオリジンなので、保存も同じ所にある。
// 前の版のゲームは、読めない保存（版2 の進み具合・版4 の土地）を空として扱い、次の保存で丸ごと上書きしてしまう。
// そこで、この版からは前の版が読まない名前に置く。前の名前の保存は、いまの名前に保存が無いときだけ写す
// （progress.ts の migrateLegacySave・test-land.ts の migrateTestLand）。前の名前の保存は書き換えず、ふだんは消さない（前の版の保存で、控えにもなる）。
// ただ一つ、テスト用の土地を消す（?cleartest。test-land.ts の clearTestLand）ときは、前の名前（LEGACY_TESTLAND_KEY）にある版4 の土地も消す
// （残すと、次に読むときに写し直してしまう。版3 までの土地は前の版のゲームのものなので残す）。
// 「<いまの名前>.legacy-done」の印は、進み具合の保存（STORY_KEY・TEST_KEY）だけに使う。写したとき（進み具合の無い保存は写さず、印だけ）と、
// この版でやり直したときに残し、もう写さない（やり直しが戻らないように）。テスト用の土地には印が無い（いまの名前に土地が無ければ、また写す）。
//
// 版3（段階4b）: 便り・夜話・絵解きを保存に足したので、進み具合の名前を .v3 にした（4a の版は v:3 の保存を読めず、上書きしてしまうため。
// 4a review F1 と同じ形）。写すのは v3 ← v2 ← v1 の順（progress.ts の migrateLegacySave）。前の名前（v2・v1）には書かない。
// 端末の持ち主の覚え書き（呼び名）は、土地ごとの進み具合の外に、端末に1つだけ置く（MEMO_KEY。04 §3.3「縁と覚え書きは端末の持ち主のもの」）。

/** 物語の進み具合（会った・札・ピース・縁・旅印・持ち物・便り・夜話・絵解き）。立山のふもと（岩峅寺）の夢の旅と現の旅で共通 */
export const STORY_KEY = 'yume.story.iwakuraji.v3'
/** テスト用の土地（地元のパック）の進み具合。現地のテストと、家の白描の絵地図で共通 */
export const TEST_KEY = 'yume.story.test.v3'
/** 位置シミュレーターの進み具合（始めるたびに、その土地の保存を写す。立山のふもとは STORY_KEY、テスト用の土地は TEST_KEY。写し直すので、前の名前から移さない） */
export const SIM_KEY = 'yume.story.sim.v3'
/** ましろの覚え書き（呼び名。端末に1つ。土地のやり直しでは消えない。引き継ぎコードには入る。core/story/memo.ts） */
export const MEMO_KEY = 'yume.memo.v1'
/** テスト用の土地そのもの（家の近くの地図と地点。test-land.ts。引き継ぎコードには入れない） */
export const TESTLAND_KEY = 'yume.testland.v2'
/** 三つの約束を読んだか */
export const PROMISE_KEY = 'yume.promises.v1'
/** 端末の保存を長く残すよう頼んだか（一度だけ頼む。ui/persist.ts の persistOnce） */
export const PERSIST_KEY = 'yume.persist.v1'

/** 4a の名前（この版は読むだけ） */
export const V2_STORY_KEY = 'yume.story.iwakuraji.v2'
export const V2_TEST_KEY = 'yume.story.test.v2'

/** 前の名前（前の版のゲームが読み書きする。この版は読むだけ。ただ ?cleartest では、LEGACY_TESTLAND_KEY にある版4 の土地を消す） */
export const LEGACY_STORY_KEY = 'yume.story.v1'
export const LEGACY_TEST_KEY = 'yume.story.test.v1'
export const LEGACY_TESTLAND_KEY = 'yume.testland.v1'
