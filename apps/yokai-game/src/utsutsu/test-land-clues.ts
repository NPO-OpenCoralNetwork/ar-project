// テスト用の土地に置く調べる地点・持ち物を受け取る地点（clues.json の id）。
// 土地を作る test-land.ts と、物語のデータの点検（data/story-pack.ts）の両方が読む。
// 点検のために test-land.ts の全体（OSM の読み込みなど）を夢の旅のページへ持ち込まないよう、id だけをここに分ける。

/** 調べる地点（光蔵坊の悩み #2） */
export const TEST_CLUES: readonly string[] = ['kozobo-shirabe-1', 'kozobo-shirabe-2']
/** 持ち物を受け取る地点（ガメの悩み #11 の白えび。仕組みは調べる地点と同じ） */
export const TEST_PICKUPS: readonly string[] = ['shiroebi']
