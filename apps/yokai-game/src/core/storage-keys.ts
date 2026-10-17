// 端末の中（localStorage）に置く保存の名前。どのページでも同じ名前を使う（入口・夢の旅・現の旅・白描の絵地図）。

/** 物語の進み具合（会った・札・ピース・縁・旅印）。立山のふもとの夢の旅と現の旅で共通 */
export const STORY_KEY = 'yume.story.v1'
/** テスト用の土地（地元のパック）の進み具合。現地のテストと、家の白描の絵地図で共通 */
export const TEST_KEY = 'yume.story.test.v1'
/** 位置シミュレーターの進み具合（始めるたびに、その土地の保存を写す。立山のふもとは STORY_KEY、テスト用の土地は TEST_KEY） */
export const SIM_KEY = 'yume.story.sim.v1'
/** 三つの約束を読んだか */
export const PROMISE_KEY = 'yume.promises.v1'
