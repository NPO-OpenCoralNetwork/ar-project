# yokai-game（妖怪ARゲーム 試作）

企画書は [docs/yokai-game](../../docs/yokai-game/README.md)。作る順番は [05 全体整理とロードマップ](../../docs/yokai-game/05-overview-and-roadmap.md) §6。

| ページ | 入口 | 段階 |
|---|---|---|
| 夢の旅（家の3D箱庭・岩峅寺まわり 東西700m × 南北400m） | `index.html` → `src/yume/` | 2（光蔵坊との出会いと台本の会話） |
| GPS の検証（iPhone を持って歩く） | `gps-test.html` → `src/gps-test/`（PC では `?sim=1` で模擬モード） | 0.5 |

## 動かす

```sh
npm ci
npm run dev            # 開発サーバー（--host 付き。同じ LAN のスマホから開ける）
npm run build          # 型チェック＋ dist/ へビルド（GitHub Pages に公開されるもの）
npm run build:artifact # 夢の旅だけを1つの HTML（dist-artifact/）にまとめる
```

公開: `.github/workflows/yokai-pages.yml` が `dist/` を GitHub Pages に出す（Pages が有効なときだけ）。

## データを作り直す

```sh
node scripts/fetch-osm.mjs   # OpenStreetMap → src/data/iwakuraji-osm.json（--offline で手元の生データから）
node scripts/fetch-dem.mjs --skip-skyline  # 地理院の標高タイル → src/data/iwakuraji-dem.json（稜線 tateyama-skyline.json も作るなら --skip-skyline を外す）
node scripts/make-placeholder-houses.mjs  # 仮の家並み → src/data/iwakuraji-placeholder-houses.json（上の2つのあとに）
```

範囲と原点は `scripts/lib/region.mjs`（原点は前立社壇付近の点のまま、西 -200m・東 +500m・南北 ±200m）。
OSM の建物は空中写真の半分ほどしかないので、道沿いの空き地に名前のない「仮の家」（切妻屋根、1〜2階）を種を固定した乱数で足している。
各棟に `placeholder: true`、件数は `iwakuraji-placeholder-houses.json` の `meta.counts`。下見の結果は [docs/yokai-game/research/2026-10-17-iwakuraji-data-survey.md](../../docs/yokai-game/research/2026-10-17-iwakuraji-data-survey.md)。

## 出会いと会話（段階2）

気配（墨のにじみ）→ 耳を澄ます（6m 以内でボタンか Space を長押し、またはその場で約2秒止まる）→ 夢の姿（白描の板絵）→ 台本の会話 → 伝承の札 → 曼荼羅のピース（白描）→ 縁（顔見知り）。

| 置き場所 | 中身 |
|---|---|
| `src/core/story/` | 描画に依存しない仕組み（現の旅でも使う）。`dialogue.ts` 台本を進める・点検する、`progress.ts` 進み具合の保存（縁は夢では「なじみ」まで、ピースは白描まで、「現地で得たか」の印つき）、`listen.ts` 耳を澄ます／立ち止まるの判定、`types.ts` データの形 |
| `src/data/scripts/kozobo.json` | 光蔵坊の台本（台詞はすべて【創作】。監修前の下書き） |
| `src/data/lore-cards.json` | 伝承の札（03 の確認済の内容だけ。出典・確度・03 の番号・監修の状態） |
| `src/data/mandala.json` | 曼荼羅帳の構図（里・麓・山。【創作】） |
| `src/data/yokai.json`・`story-pack.ts` | 妖怪の名前と夢の姿の大きさ、読み込みと点検 |
| `src/yume/encounter/` | 箱庭と画面へのつなぎ（夢の姿・霞・会話の枠・札・曼荼羅帳・音） |

進み具合は `localStorage` の `yume.story.v1`（見た目などの設定は `yume.v1`）。曼荼羅帳の「最初からやり直す」で消える。

## 性能の目安（段階2。URL に `?debug` を付けると左下に出る）

三角形と描画命令の数は、見ている範囲で変わる。下は **はじめの位置**（PC 1280×800・解像度 ×1・ズーム 62m・東向き。位置 (245.7, 19.3)）で計った値（10/17）。

| 画質・時間帯 | 描画命令 / 三角形 |
|---|---|
| 標準・昼 | 25 / 約 12.2万 |
| 標準・夕／夜 | 28 / 約 12.4万 |
| 影あり・夜 | 50（場面 36＋にじみの後処理 14。06 §6.10 の 40 の予算の外に置くかは PO の確認待ち） |
| 会話中（標準・昼、ズーム 22m） | 28 / 約 12.2万 |

- 数: 道沿いの灯り 245 ＋ 駅のまわり 6 ＝ **251**、家 225（うち仮の家 186）、窓の灯り 916、木 323。
- 地面の絵（canvas のテクスチャ）: 軽い 1792×1024、標準・影あり **3584×2048**（RGBA で約 28MB、ミップマップを含めて約 37MB。ほかに 2D の canvas の分）。範囲を東へ広げたので、段階1a（2048×2048）の約 1.75 倍。中位の Android で測るまでは、このままにしている（測って足りなければ、標準の長い辺を 2048 に抑える）。

## データの出典と義務

- 道・川・建物などは © OpenStreetMap contributors（ODbL 1.0）。箱庭用に加工したデータ（`src/data/iwakuraji-osm.json`）は ODbL で提供する。加工の手順は `scripts/` に公開している。画面には出典を常に表示する。
- 標高は国土地理院の標高タイル（基盤地図情報数値標高モデル）を加工して作成。画面に出典を表示する。
- 社寺の名前や由緒は、了承を得るまでデータにも画面にも入れない（`fetch-osm.mjs` で名前を落としている）。境内は「お休みの範囲」として、中には入れない。
