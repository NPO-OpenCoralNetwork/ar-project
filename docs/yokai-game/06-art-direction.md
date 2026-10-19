# アートディレクション「光と霞」v0.1（夢の旅の3D箱庭）

- 作成: 2026-10-16（PO の要望 10/17 に向けて）
- 状態: 実装担当とアーティストの共通の指針。§7 の4つは 10/17 に PO が決定（推奨どおり）
- 対象: 夢の旅（家から入る3Dの箱庭。岩峅寺は 10/17 に東へ広げて 700m×400m）。現の旅（現地の地図）と妖怪の板絵はこの文書の外
- 関係: 05 §4「見た目の方向」の「家から入る3Dの箱庭」「絵のタッチ」「畏れの度合い」を、この文書で具体にする

> 参考画像は社内参考用で、リポジトリに入れない。この文書にも貼らない。作品名で参照する。
> 色の値は、参考画像の一部の領域の中央値を測って出発点にし、本作の里山に合わせて直したもの（§1.2）。

---

## 1. 目指す雰囲気

**「光と霞」: 金色や ばら色の空気の中に、やわらかい形の里山が溶けていく。夜は深い藍の静けさに、琥珀の灯りと朱い月がひとつ。**

- **Sky 星を紡ぐ子どもたち**から借りる: 淡いグラデーションの空、遠くほど空の色に溶ける空気、雲の海、ふわっと光る粒、逆光で縁が光る人影、色のついたやわらかい影。
- **風ノ旅ビト（Journey）**から借りる: 画面全体を一色の光（金色、雪の青緑）でまとめる強い空気遠近、遠い山を目標として霞の向こうに置く構図、細部を描かない大きな形。
- **A Short Hike**から借りる: 橙の土の道で行き先を読ませる配色、青緑の水、金色の霞が遠景を包む午後、角ばっていても丸く見える素朴な木。
- **Kage（Web サイトのデザイン）**から借りる: ほぼ黒に近い藍の夜、琥珀の灯りと、その外側にうっすら出る朱のにじみ、大きな朱い月、静けさ、細かいざらつき（フィルムの粒）、舞う紅葉。
- **借りないもの**: 各作品のキャラクター造形（Sky のマントと仮面・光る目、Journey の長いスカーフと模様、A Short Hike の鳥の主人公）、固有のロゴ・文字・アイコン・アセット、Sky のろうそく、Journey の山頂の光の柱、Kage の鳥居・社殿・石灯籠・石段の構図。社寺はどの時間帯でも描かない（境内は「お休みの範囲」の霧のまま）。ドット絵の描き方（A Short Hike）も借りない。

### 1.1 本作だけのもの

| もの | 決まり |
|---|---|
| アバター | 笠をかぶった絵解き師の見習い。旅の合羽（藍）、背中に巻物の包み（茜）。顔は笠の影に沈めて描かない |
| 相棒 | 白い紙の鳥「ましろ」。折り紙の面で、ほのかに自分で光る（光の影響を受けない紙の白） |
| 遠景 | 立山連峰の切り絵の書き割り（標高データから作ったもの）。昼は青白く、夕はばら色に染まり（山の端が夕日を受ける）、夜はその上に朱い月 |
| 境内 | 「お休みの範囲」。地面を這う霧と漂う霧のかたまりだけ。夜はその霧が内側から琥珀色にほのかに光る |
| 白描 | 墨の線の見た目は、夢の旅のもうひとつの見た目と、「まだ訪れていない場所」の表し方に残す（§5） |

### 1.2 参考画像で見たこと（測った色）

各作品の画像4枚ずつを1枚ずつ見て、代表的な領域の色（中央値）を測った。値は出発点で、そのまま使ってはいない。

| 作品 | 見たこと | 測った色の例 |
|---|---|---|
| Sky | 雨の森は青緑の光の柱と黒に近い手前で、灯りだけが暖色。昼の丘は青緑と若草で、遠くの崖が水色に溶ける。夕の雲海は空が藤色→地平がばら色、雲の上の面だけが桃色に光り、建物の影は紫。夜は濃紺の空に、白っぽい粒と赤い粒、道だけが明るい灰青 | 昼の草 `#80ae81`・遠い崖 `#446d7f`／夕の空 `#98829e`→地平 `#b67777`・雲の光る面 `#f4c0a2`・影 `#4c425a`／夜の空 `#0a1c3f`・草 `#46777b`・道 `#5c6580` |
| Journey | 空気が一色（黄緑がかったクリーム、金色）で、遠い山は空の色との差がごく小さい。砂丘は桃色がかった砂色で、明暗の差を小さくしている。雪の場面は青緑の霧に白い面 | 空 `#cfd6ad`・`#ead8a3`／遠い山 `#d4c3aa`／砂丘 `#c38f81`／雪の霧 `#799a93` |
| A Short Hike | 金色の霞（`#ffcc64`）が遠景をまるごと覆う。土の道の橙が強く、迷わない。水は青緑。雪景色の影は青紫で、黒を使わない | 霞 `#ffcc64`／道 `#d27d2d`／水 `#48aead`／雪の影 `#b7befe` |
| Kage | ほぼ黒（`#0b0c10`）の夜に、朱い月（`#a6514f`）と、障子の窓の琥珀（`#d0a56b`）、灯りの橙（`#dc8531`）。灯りのまわりに朱のにじみ。画面全体にざらつき。紅葉の葉が舞う | 空 `#0f0d10`／月 `#a45251`／月の暈 `#2a1a1d`／灯り `#db8531`／窓 `#c49a67` |

本作では、Kage の夜の黒を「深い藍」（`#070b1d`〜`#1d2548`）に持ち上げる。スマホの小さな画面で地形が読めることを優先する。

---

## 2. 時間帯ごとのパレット

色はすべて sRGB の16進。**地面・建物・木の色は「素材の色」で、光は日向の平らな面がほぼこの色に見える強さにしてある**（§6.1）。日陰は「素材の色 × 影の色（掛ける色）」になる。アバターとましろの色は時間帯で変えない（光で見え方が変わる）。

時間帯は3つの切り替えにする（連続して変えない。§6.9）。

### 2.1 昼（金色の午後）

| 項目 | 色・値 |
|---|---|
| 空 上 → 中 → 地平 | `#86bfd6` → `#cfe2d4` → `#f4e2b8`（水色から、薄い青緑を経て、クリーム色の金） |
| 太陽のまわりの空 | `#ffe6a0` の光の輪（半径＝画面短辺の 22%、不透明度 0.45）、太陽の円 `#fff6dc`（半径 3%） |
| 太陽の光 | 方位 235°（南西）・高度 32°。色 `#ffe884`・強さ 3.08（半球光と組み合わせた値。§6.1） |
| 半球光 | 空側 `#dae2ff`・地面側 `#f2e2cb`・強さ 2.32 |
| 霧（空気遠近） | 光と反対を向いたとき `#e2e2cf`、太陽を向いたとき `#f6dfa6`。最大の濃さ 0.80 |
| 雲海 | 地の色＝霧の色、上の縁 `#fffaf0`、谷 `#c9d0cc` |
| 田（2色） | `#d6c47f`／`#cdbb74`（実りの金） |
| 草・畦 | `#9cba78`、川の中州 `#a9c27e` |
| 土の道 | `#dcae74`（A Short Hike ほど強くしない橙） |
| 舗装の道 | `#ecdcb8`、広場 `#e2d0a6`、駐車場 `#d8ccb2` |
| 水 | `#63b8b4` |
| 林（地面）・粒 | `#6f9a6a`／濃い粒 `rgba(52,94,72,0.5)`／明るい粒 `rgba(200,218,140,0.45)` |
| 建物 | 壁 `#e4d4bc`、屋根 `#6a7392`（青みの瓦）、平らな屋根 `#a9a49a` |
| 木 | 杉 `#5b8a68`、広葉樹 `#8fb26a`、幹 `#8a5a44` |
| 遠景の山（奥→手前） | 面 `#b9cbd6`・稜線 `#9fb9ca`／`#a7c2c0`・`#8fb0ad`／`#9cb894`・`#84a67e`、雪 `#fbf6ea` |
| 影の色（掛ける色） | 線形で (0.52, 0.56, 0.74)。白い面の影は `#bfc6df`、田の影は `#a0976e`、草の影は `#738f68`（青紫に寄る。黒にしない） |
| 光の粒 | 金のちり `#ffe7a8`（7割）と白 `#fff8e6`（3割） |
| アバター | 合羽 `#3f5f8f`、笠 `#dcc08a`、着物 `#efe6d6`、包み `#b5523b`、肌 `#e8cfb0` |
| ましろ | 紙 `#fbf8f0`（光を受けない）、折り目の線 `#b8aa98`（不透明度 0.5）、光の輪 `#fff1d6`（不透明度 0.18） |

### 2.2 夕（逢魔が時。ばら色 → 藍）

東の立山を向いた画面では、夕日は背中側。地平の上に**ばら色の帯**、その下に**藍の「地球の影」**が出る、実際の夕方の東の空の色にする。山の稜線と雪は夕日を受けてばら色に染まる。

| 項目 | 色・値 |
|---|---|
| 空 上 → 中 → 地平 | `#3b3d78` → `#9a86b0` → `#eaa6a2` |
| 太陽のまわりの空（西を向いたとき） | 光の輪 `#ffb08a`（半径 30%、0.55）、太陽 `#ffd0a0`（半径 4%） |
| 太陽の光 | 方位 255°・高度 20°（見た目の太陽はもっと低いが、光は 20° にして地面を暗くしすぎない）。色 `#ffc757`・強さ 3.86 |
| 半球光 | 空側 `#dcd4ff`・地面側 `#e7c7cb`・強さ 2.20 |
| 霧 | 反対向き `#a99ab4`（藤色）、夕日向き `#eeae96`。最大の濃さ 0.85、近い側の始まりを 0.9 倍に |
| 雲海 | 地＝霧の色、上の縁 `#f4c0a2`（Sky の夕の雲の光る面に近い桃）、谷 `#7e6f92` |
| 田 | `#d8ae8c`／`#cfa486` |
| 草・畦 | `#a09a8c`、中州 `#8f9488` |
| 土の道 | `#d49c86` |
| 舗装の道 | `#e2c4b4`、広場 `#dcbcae`、駐車場 `#cbb4b0` |
| 水 | `#9a9cc8`（藤色の空を映す） |
| 林 | `#6a6e80`／`rgba(60,58,96,0.5)`／`rgba(220,170,160,0.35)` |
| 建物 | 壁 `#e6c4b6`、屋根 `#585a80`、平らな屋根 `#9a8e9a`。夕日に向いた壁は `#ffd08c` くらいまで明るく光る |
| 木 | 杉 `#566878`、広葉樹 `#7a8a7a`、幹 `#6a4450` |
| 遠景の山 | 面 `#8e84aa`・稜線 `#d99c9c`（夕日を受けた稜線）／`#7a7598`・`#8f84a6`／`#626686`・`#6c6e8e`、雪 `#f4c2b8` |
| 影の色 | 線形 (0.50, 0.46, 0.70)。白い面の影 `#bab4da`、田の影 `#9e7a77` |
| 光の粒 | 桃金 `#ffc79a`（6割）と ばら `#f7a8b8`（4割）。舞う紅葉 `#c2412d`／`#d9773a` |
| 灯り | 半分の明るさで灯りはじめる。窓の灯り `#f2b866` を家並みの 15% に |

### 2.3 夜（Kage 風。深い藍、灯りの琥珀、朱い月）

カメラは東（立山）を向くので、月は**正面の逆光**になる。家や木はシルエットになり、縁だけがばら色に光る（§3.8）。

| 項目 | 色・値 |
|---|---|
| 空 上 → 中 → 地平 | `#070b1d` → `#0f1633` → `#1d2548` |
| 月のまわりの空 | `#4a2230`（Kage の月の暈を少し明るく） |
| 朱い月 | 本体 `#c4615a`、まだら `#8e3f42`、縁の明るみ `#e3907e`、内の暈 `#7a2e36`（半径の 1.6 倍、0.55）、外の暈 `#3a1a26`（半径の 3.2 倍、0.35） |
| 月の光 | 方位 100°・高度 35°（立山の上）。色 `#ffc3a2`・強さ 2.41 |
| 半球光 | 空側 `#cbd5ff`・地面側 `#a192af`・強さ 2.64 |
| 霧 | 反対向き `#161d3a`、月の方向 `#2a2140`。最大の濃さ 0.90、始まり 0.75 倍・終わり 0.85 倍（近くから霞む） |
| 雲海 | 地＝霧の色、上の縁 `#4a3a5c`（月を受けた藤色）、谷 `#0e1428` |
| 星 | `#dfe6ff`、まばら（§6.4） |
| 田 | `#34416a`／`#303c64` |
| 草・畦 | `#2f4d5e`、中州 `#2a4250` |
| 土の道 | `#66708e`（地面でいちばん明るくして、道を読ませる。Sky の夜の道 `#5c6580` に近い） |
| 舗装の道 | `#56607e`、広場 `#3c4568`、駐車場 `#3a4262` |
| 水 | `#1c3054`（月の映り込みは §3.7） |
| 林 | `#1c2c3c`／`rgba(8,14,30,0.55)`／`rgba(110,140,190,0.25)` |
| 建物 | 壁 `#4a5272`、屋根 `#1e2340`、平らな屋根 `#2c3250`。窓の灯り `#f2b866` を家並みの 30% に |
| 木 | 杉 `#1e3242`、広葉樹 `#2a3e4a`、幹 `#2a2430` |
| 遠景の山 | 面 `#1c2244`・稜線 `#2e2a4c`／`#161c38`・`#22243e`／`#10162c`・`#181c32`、雪 `#3c4466`、稜線の縁の光 `#8a4a58`（月の逆光） |
| 影の色 | 線形 (0.50, 0.56, 0.84)。藍に寄せる。真っ黒にしない |
| 光の粒 | 灯の粒: 青白 `#cfe6ff`（7割）と琥珀 `#ffb866`（3割）。舞う紅葉 `#b8322a`／`#c8502e`（少し） |
| 道沿いの灯り | 芯 `#ffd89a`、光の輪 `#ff9a48`、外のにじみ `#c4402c`（Kage の朱のにじみ）、地面の明かり `#ffae5c` |
| お休みの範囲の霧 | 地 `#4a3c5e`、内側のほのかな光 `#e89a52`（強さ 0.35）、縁の朱 `#b84a34`（0.12）、9秒でゆっくり明滅 |
| ましろ | 光の輪 0.5、足元に `#ffe2b0` の小さな明かり（半径 2.4m、0.16）。夜はましろが旅の灯りになる |
| 出典表示 | 地 `rgba(16,20,40,0.62)`、文字 `#d8d4e4`（コントラスト 4.5:1 以上） |

---

## 3. 光の作り方

### 3.1 主光源

| 時間帯 | 方位・高度 | 向きのベクトル（x=東, y=上, z=南） | 画面での見え方 |
|---|---|---|---|
| 昼 | 235°・32° | (-0.695, 0.530, 0.486) | 東を向いたカメラの右後ろから。西向きの壁が日向。影は北東へ伸びる |
| 夕 | 255°・20° | (-0.908, 0.342, 0.243) | ほぼ真後ろから。壁が橙に光り、影は長く東へ。立山はばら色 |
| 夜 | 100°・35° | (0.807, 0.574, 0.142) | 正面（立山の上の月）から。逆光のシルエット |

いまの `main.ts` の光（方位約200°・高度約42°の固定）は、時間帯ごとに上の向きへ変える。

### 3.2 半球光と「色のある影」

- 影の側は半球光だけで照らされる。**半球光の空側の色が、そのまま影の色になる**。昼は青紫、夕は藤色、夜は藍。
- 日向と日陰の明るさの差は、平らな地面で **日向:日陰 ≒ 1 : 0.55**（線形）。Sky のように影を浅くして、形を色の差で読ませる。
- 値は §6.1 の式で「日向に掛かる色」と「日陰に掛かる色」から出す（パレットの `litTint`・`shadowTint`）。

### 3.3 影

- 画質「影あり」だけ、太陽（夜は月）の影を落とす。PCF、`shadow.radius = 3`、範囲はアバターのまわり 110m 四方（いまのまま）。iPhone では mapSize を 1024 にする。
- 影の色は §3.2 の通り、黒ではなく半球光の色。`shadow.intensity` は 1 のまま（薄くしたいときは `shadowTint` を上げる）。
- 「軽い」「標準」は影なし。アバターの足元だけ丸い影を置く: 昼 `#4a5288`・0.32、夕 `#3e3a6e`・0.32、夜 `#05081a`・0.40（いまの黒っぽい丸を、色のある丸にする）。

### 3.4 空気遠近（遠いほど空の色に溶ける）

- 霧の色は、カメラの向きで2色を混ぜる: `mix(fog, fogToLight, w)`、`w = smoothstep(-0.2, 1.0, dot(カメラの水平の向き, 光の水平の向き))`。CPU で毎フレーム1回計算して `scene.fog.color` に入れる（シェーダーの負担なし）。
- 霧のかかり方は「始めはゆっくり、途中で一気に、最後は上限で止まる」: `f = fogMax × s × (2 − s)`、`s = smoothstep(near, far, 距離)`。上限（昼 0.80・夕 0.85・夜 0.90）で止めて、遠くの家並みや林がうっすら形を残すようにする（Journey の遠景）。
- `near`・`far` はいまのカメラの値（`rig.fogNear = 距離×1.1`、`rig.fogFar`）に、時間帯の倍率（夜は 0.75／0.85）を掛ける。
- 遠景の山の層も、奥ほど空の地平の色に寄せてある（パレットの山の色）。いちばん手前の低い丘は、いまのまま地平の色へ 55% 寄せる。

### 3.5 雲海（遠景の山の裾を雲の海に沈める）

- いまの遠景（`backdrop.ts`）の「すやり霞」を雲海に変える。描画命令は増やさない（同じ1枚の板のシェーダーの中で描く）。
- 雲海の地の色は**霧の色と同じ**にする。地面の遠くが霧に溶ける色と、雲海の色が同じなので、継ぎ目が見えない。
- 上の縁を、丸い雲の頭が並ぶ形にする: 縁の高さ `= 基準 + (fbm(方位×0.045) − 0.5) × 霞の深さ × billow`（billow 昼 0.5・夕 0.6・夜 0.5）。いまの `lobe` より大きくゆっくりした波。
- 縁から下へ `rimNdc`（画面の高さの 3%前後）の帯を `cloudSea.lit` で明るくし、その下は地の色、雲の頭と頭の谷間を `cloudSea.shade` で少し沈める（Sky の夕の雲海の、上だけ光る面）。
- 山の裾（いまの `footDeg`）は雲海の地の色へ溶かす。山が雲の海から立ち上がって見える。

### 3.6 光の粒（ちり・灯の粒・紅葉）

| | 昼 | 夕 | 夜 |
|---|---|---|---|
| 種類 | 金のちり（ゆっくり上へ漂う） | 桃金の粒＋紅葉 | 灯の粒（ふわっと明滅）＋紅葉少し |
| 数（軽い／標準／影あり） | 24／80／140 | 24／80／140、紅葉 0／16／28 | 30／110／180、紅葉 0／12／20 |
| 大きさ（CSS px） | 2〜4 | 2〜4、紅葉 0.18m | 2.5〜5 |
| 不透明度・明滅 | 0.55・0.2〜0.5Hz | 0.6・0.3〜0.7Hz | 0.8・0.4〜1.2Hz |
| 置く範囲 | アバターから 45m 以内、地面から 0.5〜4m。カメラから 8m 以内は消す | 同じ | 同じ。水辺と田の上に多め |

- 粒は1回の描画（`THREE.Points`、加算合成）。紅葉も同じ描画に入れて、種類の属性で形を変える。
- 本当の季節（10月）に合わせて、ホタルは出さない。夜の粒は「夢の灯の粒」として扱う。

### 3.7 にじみ（ブルーム）

**画面全体のブルーム処理は使わない。** にじみは、光る物ごとに「光の輪の板」を加算で重ねて描く（偽のブルーム）。使いどころは次だけ。

| 物 | 光の輪の大きさ・強さ |
|---|---|
| 太陽（昼・夕） | 遠景のシェーダーの中で描く。§2 の値 |
| 朱い月 | 遠景のシェーダーの中。内の暈 1.6 倍・0.55、外の暈 3.2 倍・0.35 |
| 道沿いの灯り | 輪 半径 1.3m・0.55、外のにじみ 3.0m・0.16、地面の明かり 3.2m・0.20 |
| ましろ | 半径 0.9m。昼 0.18・夕 0.30・夜 0.50 |
| 光の粒 | 粒の芯の外に、半径 2 倍のやわらかい輪（粒のシェーダーの中） |
| 窓の灯り（夕・夜） | 壁のシェーダーで発光させるだけ。輪は付けない |
| お休みの範囲の霧（夜） | 霧の色そのものを内側で明るくする（§3.10） |
| 水面の月の映り込み（夜） | 水のシェーダーで、月の方位の縦の帯 `#c4615a` を 0.25 で。影ありだけ |

地面・壁・木の面は光らせない。光るのは「灯り・月・太陽・ましろ・粒」だけにして、画面の中で光る物を少なく保つ（Kage の静けさ）。

### 3.8 逆光のふち（Sky・Journey の光る縁）

- アバター・ましろ・木に、光源の方向を向いたカメラから見たときだけ、輪郭を光源の色で明るくする。
- 強さ: 昼 0.25（`#ffe7a0`）、夕 0.40（`#ffb48a`）、夜 0.55（`#ff9a8a`）。木は半分。
- いまの「墨のぼかし」（`applyBend` の `inkRim`）と同じ場所に足す（§6.8）。建物には付けない。

### 3.9 夜の灯り（道沿いの小さな灯り）

- 社寺の灯籠ではない。**道しるべの小さな行灯**: 高さ 0.9m の細い木の柱（0.08m 角）の上に、0.22×0.30×0.22m の紙の箱、上に丸みのある小さな屋根。装飾なし。
- 置き場所: お休みの範囲の外の道沿いに、22m ごと。道の端から 1.2m 外。建物の正面と、お休みの範囲の縁から 10m 以内には置かない。数は 軽い 10／標準 24／影あり 36 まで（アバターに近い順）。
- 昼は消灯（柱と箱だけ）。夕は 0.5 の明るさで灯りはじめる。夜は 1。ゆらぎ 3%・0.8Hz。
- 本物の点光源（`PointLight`）は使わない（§6.6）。
- **駅**（段階2の後の手直し）: 夜に駅のありかが分かるよう、ホームの両端と駅舎の前にも同じ行灯を置く（道沿いの 22m ごとの決まりの外。数は 3〜4）。駅舎の窓は、候補をすべて灯す（ほかの家は番号で一部だけ）。駅の構内（ホームと駅舎を囲む形）の地面は、田ではなく駐車場と同じ土の色にする。
- **気配の印（墨のにじみ）の夜・夕**: 暗い地面の上では墨の芯が沈むので、外輪だけを淡い月明かりの紙色（`rgb(226,222,238)`）のにじみに替える（加算ではなく、ふつうの重ね方。光ではなく「霞の白さ」。描画命令は増やさない）。昼は墨の外輪のまま。

### 3.10 お休みの範囲の霧のほのかな光（Kage の雰囲気）

- 鳥居や社殿の代わりに、**霧そのものを内側から光らせて**、「中に灯りがある、入らない場所」を示す。
- 霧の色 = `mix(mist, restGlow.color, restGlow.strength × smoothstep(10, 40, 縁からの距離) × (0.85 + 0.15 × sin(2π t / pulseSec)))`。縁から 6m 以内は `restGlow.edge`（朱）を `edgeStrength` だけ混ぜる。
- 漂う霧のかたまりも、芯を同じ光の色へ 0.3 寄せる。
- 昼はほぼ白い霧（強さ 0.08）、夕は桃（0.15）、夜は琥珀（0.35）。

### 3.11 朱い月の位置

- 方位: 遠景の稜線データで**いちばん高い所の方位 + 4°**（山頂の真上から少しずらす。Kage の月も中心から外して置いている）。
- 高さ: 月の中心を、その方位の稜線の高さから **半径 × 1.8** だけ上（月の下の縁が稜線から少し離れる）。
- 大きさ: 直径は画面の短辺の 13%（本物の月より大きく。絵としての月）。
- 表面: fbm のまだら（`shade` へ最大 0.25 混ぜる）と、縁の明るみ（外側 12% を `rim` へ）。動かさない。
- カメラを回して立山が画面の外へ出たら、月も一緒に外へ出る（方位に貼りつける）。
- 夕にも、同じ位置に白っぽい月 `#f4d6cc`（0.6）を出すと、夕から夜へのつながりが出る（任意）。

---

## 4. 形のルール

**角の丸い単純な形、細部を描き込まない、シルエットで読ませる。** 既定のズーム（62m。10/17 決定。v0.1 の時点は約78m）で、1色で塗りつぶしても何かわかること。

| 物 | 形の決まり |
|---|---|
| 地形 | なめらかに。段差や崖の岩の模様は描かない。色の面の境目（田と道、草と水）で形を見せる |
| 建物 | 箱の壁＋厚みのある屋根。軒を 0.4m ほど出し、軒先だけ面取り（角を落とす）。窓・戸・看板などの細部は作らない（夜の窓の灯りは壁の発光で表す）。名前のない一般的な家並みのまま |
| 木 | 杉は円錐を2〜3段重ね（周りの分割 7〜8）、先を少し丸める。±4° 傾きを散らす。広葉樹は丸い塊（低ポリの球）を2〜4個寄せる。葉の一枚一枚は描かない |
| アバター | 笠（直径が肩幅の 1.4 倍以上。平たい円錐）＋ 合羽（肩から膝へ広がる釣鐘の形。歩くと後ろの裾が 0.03m ゆれる）＋ 細い脚。背中に巻物の包み（茜）。顔は描かず、笠の影に沈める。光る目・仮面・角・長いスカーフ・マントの羽模様は使わない（Sky・Journey と重ならないように） |
| ましろ | 折り紙の鳥。平らな三角の面だけで作る（丸いマスコットの鳥にしない）。紙の白は光の影響を受けない素材で、ほのかに自分で光る。折り目に細い線。アバターの肩の高さ・斜め後ろを飛ぶ |
| 灯り | §3.9 の通り。細い柱と紙の箱だけ |
| 遠景の山 | 切り絵の書き割り（3層＋ぐるりの丘）。稜線は細い1本の線。雪は面の色の違いだけ |

**明暗の決まり**: アバターと地面の明るさの差を、どの時間帯でも 30% 以上にする。昼は藍の合羽が金の田の上で読める。夜は合羽が沈むので、ましろの光の輪・足元の明かり・逆光のふちで読ませる。

---

## 5. 白描（墨の線）との関係

いまの基本の見た目は「白描」（和紙と墨）。PO の要望に合わせて、夢の旅の**基本の見た目を「光と霞」にする**。白描は捨てずに、次の2つの役に残す。

### 案A: 白描を「もうひとつの見た目」として残す

- HUD の「見た目」で「光と霞」⇄「白描」を切り替えられるまま残す（いまの「彩色（仮）」は「光と霞」に置き換える）。
- 白描は、曼荼羅帳・旅の支度の地図・妖怪の「夢の姿」（白描の板絵）と同じ絵の言葉。光と霞の世界に、白描の妖怪が浮かぶと、「夢の中の、まだ色のない姿」として目立つ。妖怪の板絵は、Sky の光る人影のような青い光にはしない（紙の白と墨の線のまま、紙がほのかに明るい程度）。
- 物語の山場（打ち明け話）で、数秒かけて画面を白描に寄せ、また光と霞に戻す演出にも使える。

### 案B: まだ訪れていない場所を、淡く白っぽく見せる

- 箱庭を 64×64 の「訪れた印」の画像（1画素 ≒ 6.25m、R8）で覆う。アバターの通った所の半径 20m を、ゆっくり 1 にしていく。
- 地面・建物・木のシェーダーで、訪れていない所は `mix(光と霞の色, 和紙の色 #f4efe4, 0.7)` にし、墨の線を少し出す。絵巻に色が差していくように、歩いた所から色づく。
- 光の粒と灯りは、訪れた所にだけ出す。
- 費用: テクスチャ1枚の読み込みと、1画素あたり1回の参照。描画命令は増えない。印は端末に保存する（サーバーには送らない。05 の位置情報の扱いと同じ）。

### おすすめ

**案B を基本にし、案A の切り替えも残す。** はじめて入った箱庭はほとんど白描で、歩くほど「光と霞」に色づく。どちらの案も、白描の見た目を作り直す必要はない（いまの白描のパレットを、訪れていない所の色として使う）。

---

## 6. three.js での実装の要点

### 6.1 色の管理と光の式

- `THREE.ColorManagement` は有効のまま（three 0.186 の既定）。トーンマッピングは **`NoToneMapping` のまま**にする（パレットの色が、そのまま画面に出るように）。マテリアルは `MeshLambertMaterial` のまま（PBR にしない）。
- three 0.186 の Lambert では、平らな上向きの面の明るさは `(半球光の空側 × 強さ + 太陽 × 強さ × sin(高度)) / π`（線形）。これを使って、パレットの `litTint`（日向に掛かる色）と `shadowTint`（日陰に掛かる色）から光を出す:
  - 半球光の強さ = `max(shadowTint) × π`、空側の色 = `shadowTint / max(shadowTint)`
  - 太陽の色 = `(litTint − shadowTint)` を最大値で割ったもの、強さ = `max(litTint − shadowTint) × π / sin(高度)`
  - 地面側の色はパレットの `hemiGround`（壁の下の方や軒下を少し暖かく）
- §8 の `deriveLights()` がこの式。§2 の光の値はこの式で出したもの（確かめた結果は §6.11）。
- 日に向いた壁は、平らな地面より 1.5 倍（昼）〜2.6 倍（夕）明るくなる。壁の色は明るさ 85% 以下にしておく（白く飛ばないように）。

### 6.2 主光源と影

```ts
const L = deriveLights(p)
sunDir.set(...L.dir)
hemi.color.setRGB(...L.hemiSky, THREE.LinearSRGBColorSpace)
hemi.groundColor.set(p.hemiGround)
hemi.intensity = L.hemiIntensity
sun.color.setRGB(...L.sun, THREE.LinearSRGBColorSpace)
sun.intensity = L.sunIntensity
// 影の格子合わせ（lightX / lightY）は sunDir が変わったら作り直す
```

影ありのとき: `sun.shadow.mapSize` はタッチ端末で 1024、PC で 2048。`radius = 3`、`bias = -0.0006`、`normalBias = 0.04`（いまの値）。

### 6.3 霧（空気遠近）

`applyBend()` の `onBeforeCompile` で、`#include <fog_fragment>` を次に置き換える（地面・建物・木・アバターに効く。共有の uniform を1つ足すだけ）。

```glsl
#ifdef USE_FOG
  float s = smoothstep( fogNear, fogFar, vFogDepth );
  float fogFactor = uFogMax * s * ( 2.0 - s );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
```

`uFogMax` は時間帯の `fogMax`。墨の線（`ink-lines.ts`）にも同じ式を入れる。霧の色はカメラの向きで CPU 側で混ぜる（§3.4）。`renderer.setClearColor` と `body` の背景色も霧の色に合わせる（夜に白い背景が一瞬見えないように）。

### 6.4 遠景（backdrop.ts）の足し算

1枚の板のシェーダーの中で全部描く。描画命令は増えない。

- 空を3段に: `t < 0.55` で `skyTop → skyMid`、その上で `skyMid → skyHorizon`（`pow(t, 0.75)` はそのまま）。
- 太陽・月: 中心の方位から画面の x を出す `x = tan(az − yaw) / uTanHalfX`。y は稜線の高さから。画面の縦横比で距離を直して、円・まだら・縁・暈を描く。カメラの後ろ（`cos(az − yaw) < 0`）は描かない。
- 太陽・月のまわりの空を `skyGlow` へ寄せる: `col = mix(col, skyGlow, 0.6 × exp(−d / 0.25))`（d は画面の短辺で割った距離）。
- 星（夜）: `h1(floor(画素座標 / 2))` が `1 − density` を超えた所だけ点。明るさ 0.5〜0.9、0.3Hz でまたたき。稜線より上・月の暈の外だけ。
- 稜線の線: 光と霞では `uRidgeAlpha = 0.4` のまま、色は `mountainInk`（夜は `#8a4a58` の逆光の縁）。
- 雲海: §3.5。`uMist` に霧の色、`uCloudLit`・`uCloudShade`・`uRimNdc`・`uBillow` を足す。`uMistEdgeInk` は光と霞では 0。

### 6.5 光の粒

```ts
// 1回の描画。位置はアバターのまわり 45m の箱に置き、外へ出た粒は反対側へ回す（CPU で毎フレーム数百個だけ）
const mat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime, uPixelRatio, uColorA, uColorB, uAlpha, ...bendUniforms },
  // 頂点: 曲げ（bendDrop）を引く。gl_PointSize = clamp(aSize * uPixelRatio * 60.0 / -mv.z, 1.5, 12.0)
  //       カメラから 8m 以内と、霧の far の先は vFade = 0（画面の外へ出す）
  // 断片: r = length(gl_PointCoord - 0.5) * 2.0; a = (1 - smoothstep(0.0, 0.45, r)) + 0.35 * (1 - smoothstep(0.45, 1.0, r))
  //       紅葉（aKind = 1）は回転した葉の形（2つの円の重なり）で、加算でなく不透明寄りに（a * 0.9）
})
```

- 数は画質で変える（§3.6）。「軽い」は 24〜30 個まで、紅葉なし。

### 6.6 道沿いの灯り

- 柱と紙の箱は1つの形にまとめ、`InstancedMesh` で1回の描画。
- 光の輪・外のにじみ・地面の明かりは、1つの `InstancedBufferGeometry`（四角い板）で1回の描画。属性で「カメラを向く板」と「地面に寝た板」を分ける。加算合成、`depthWrite: false`、`fog: false`（霧の分は自分で弱める）。
- カメラに近すぎる輪は消す（お休みの範囲の霧のかたまりと同じ、`smoothstep(6, 18, 距離)`）。画面を大きく覆うと重いため。
- **`PointLight` は使わない。** 1つ足すだけで、すべての Lambert のシェーダーが作り直しになり、全画素の計算が増える。
- 「軽い」では地面の明かりを消し、輪だけにする。

### 6.7 お休みの範囲の霧

`rest-mist.ts` の霧の面の断片シェーダーに、§3.10 の式を足す（`uGlowColor`・`uGlowStrength`・`uEdgeColor`・`uEdgeStrength`・`uPulse`）。霧のかたまりの断片シェーダーも芯を `uGlowColor` へ寄せる。描画命令は増えない。

### 6.8 逆光のふち

`applyBend()` の `inkRim` の差し込みに、加える光を足す（光と霞では `uRimAmount = 0` で墨のぼかしは消え、こちらが効く）。

```glsl
float facing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
float rim = 1.0 - smoothstep( 0.18, 0.55, facing );
// 光源の向き（ビュー座標）と、視線の向きが向かい合うほど強く
float back = clamp( dot( normalize( -vViewPosition ), -uLightDirView ) * 0.5 + 0.5, 0.0, 1.0 );
outgoingLight += uGlowRimColor * rim * back * back * uGlowRim;
```

`uLightDirView` は毎フレーム `sunDir` をカメラの向きに変換して入れる。木は `uGlowRim × treeScale`。マテリアルの作り直しは起きない（uniform だけ）。

### 6.9 時間帯の切り替え

- 昼・夕・夜の3つ。HUD に「時間」ボタンを足し、順に回す。**段階4b（10/19）からは**、いま（立山の時刻）→昼→夕→夜→いま と回す（T キーも同じ）。ボタンの字は「いま（夜）」「昼」のように出す。手で選んだ時間帯は、そのページの間だけ（`yume.v1` の time は段階4a の版のために書くが、もう読まない）。
- **2回目以降に入ったときの時間帯は「いま」に決まった**（04 §7 10/18。段階4b で作った。04 §3.9・§7.1）。はじめて入った回（操作のヒントをまだ閉じていない）は昼。いまのときは1分ごとに立山の時刻の時間帯（昼→昼、逢魔が時→夕、夜→夜）を見て、変わっていれば下の覆いで切り替える（会話・帳・札の間は待ち、閉じたらすぐ）。手動の切り替えは、開発用だけでなく、遊ぶ人の設定として残す（01-app-ux G1）。白描の絵地図（`ezu.html`）も同じ決まり（はじめての回は、まだ一度も耳を澄ましていない回）。
- 見た目の時間帯は見た目だけ。夜話・くらがり（逢魔が時）・時間のピースは、いつも立山の時刻で決まる（手で夕にしても、くらがりは来ない）。
- 切り替えのときは、0.3秒で画面を霧の色に寄せ（HUD の上に重ねる DOM の板。CSS の opacity）、その間に `field.setPalette()`（地面の絵を描き直す。2048 四方で数十ms）、光、霧、遠景、粒の色を入れ替え、0.3秒で戻す。
- 毎フレーム色を補間して地面の絵を描き直すことはしない（重い）。
- 夢の旅の夜は、現実で「夜は出歩かない」約束（04 の「三つの約束」）とぶつからない。夢の中だけの夜として扱う。

### 6.10 iPhone での性能の注意

| 項目 | 決まり |
|---|---|
| 描画命令 | いまは 30（「標準」、スマホの縦画面、確認は §6.11）。光と霞で足すのは 粒 1・灯り 1・灯りの輪 1・ましろの光の輪 1 の **4つまで**。全体で 40 を超えない（**「標準」と「軽い」の予算**）。**「影あり」は別枠**: 段階2では夜・夕で 場面 36＋にじみ（ブルーム）の後処理 14＝50（窓の灯りで、変更前の 49 から1つ増えた）。「影あり」は PC と性能に余裕のある端末向けの任意の画質なので、40 の予算の外に置く案を PO に確かめる（PO の確認待ち）。認めない場合は、にじみの段数を減らす（UnrealBloomPass の mip を減らす）か、「影あり」からにじみを外す |
| 三角形 | いまは約 12万。灯りは1つ 40 三角形程度。15万を超えない |
| ポストエフェクト | **使わない**（EffectComposer を入れない）。ブルーム・色調補正・周辺減光・フィルムの粒は、それぞれ光の輪の板・パレット・遠景のシェーダー・地面の絵の `grain`（夜 0.03）で代わりにする |
| 画面全体に重なる半透明 | 遠景の板（画面の上半分）＋ お休みの範囲の霧2枚＋霧のかたまり＋光の輪。カメラの近くの板は消す決まりを全部に入れる。重なりは平均で画面 2.5 枚分まで |
| 影 | 「影あり」だけ。iPhone は 1024 四方 |
| 画素比 | いまのまま（軽い 1、標準 1.5）。光と霞でも上げない |
| 「軽い」で切るもの | 影、地面の灯りの明かり、紅葉、粒は 30 個まで、水面の月の映り込み、星のまたたき（星は止める） |
| シェーダーの作り直し | 時間帯・見た目の切り替えは uniform とパレットだけで行い、`needsUpdate` を立てない（いまの setLook と同じ）。新しい `#define` を時間帯で変えない |
| ノイズの精度 | `sin` を使う hash は、座標を小さく保つ（方位×0.05 など、いまの値の範囲）。iPhone の mediump で縞が出ないように |
| 測り方 | 実機の HUD（fps・描画）で、3つの時間帯 × 3つの画質を、はじめの位置と、お休みの範囲の縁で測る。標準で 30fps を割ったら、まず粒と灯りの輪の数を減らす |

### 6.11 この文書で確かめたこと

- 参考画像: Sky・Journey・A Short Hike・Kage の各4枚を1枚ずつ見て、領域の色の中央値を測った（§1.2）。
- 光の値: §6.1 の式で、平らな地面・日に向いた壁・日陰の色を計算して、白飛びと黒つぶれがないことを確かめた（例: 昼の田 日向 `#dac276`／日陰 `#a0976e`、夕の壁 夕日向き `#ffd08c`、夜の道 日向 `#63658e`／日陰 `#495583`）。
- §8 の TypeScript は、`palette.ts` の `Palette` 型と合わせて `tsc --strict` で型を確かめ、`deriveLights()` の出力が §2 の光の値と一致することを確かめた。
- いまの描画命令（30）と三角形（約12万）は、ビルド済みの試作を画面 390×844 のヘッドレスブラウザで開いて読んだ値（ソフトウェア描画なので fps は参考にならない）。

---

## 7. 決まったこと（10/17 PO 決定、推奨どおり）

PO は 10/17 に「推奨どおりで順に進める」と決めました。v0.1 で問いにしていた4つは、次のとおり決まりました。

| # | 問い（v0.1） | 決定 |
|---|---|---|
| 1 | 夢の旅の基本の見た目を「光と霞」にしてよいか | **光と霞を標準にする。** 白描は §5 の役（もうひとつの見た目、未訪問の場所の色）に残す |
| 2 | はじめて入ったときの時間帯 | **昼**（金色の午後。§2.1） |
| 3 | 案B（歩いた所から色づく）をいつ入れるか | **段階2（出会いと会話）の後**に入れる。未訪問の場所は白描で淡く見せる |
| 4 | 夜の窓の灯り（名前のない家並みの一部）を入れてよいか | **入れる**（§4「建物」の壁の発光） |

あわせて決まったこと（10/17）:
- カメラの既定の距離を **62m** に寄せる（家並みを近くで見せる）。§4 の「1色で塗りつぶしても何かわかる」は、この距離で確かめる。
- 箱庭の範囲を**東へ広げ、集落と岩峅寺駅を入れる**（原点から西200m・東500m・南北200m）。§5 案B の「訪れた印」の画像の大きさ（v0.1 は 400m 四方に 64×64）は、広げた範囲に合わせて決め直す。
- 建物は **OSM に描き足して取り込む**（アカウントが要る外部への公開作業なので PO の作業）。それまでは、名前のない仮の家並みを置く。どちらも §4 の形の決まり（窓・戸・看板を作らない、名前のない一般的な家並み）に従う。
- 社寺はどの時間帯でも描かず、境内は「お休みの範囲」の霧のまま（§1）。出典表示（© OpenStreetMap contributors／地理院タイル（標高）を加工して作成）は常に表示する。

本文の位置づけ: GDD v0.2（04 §3.6・§3.8）と MVP 要件 v0.2（02 F-28・F-29）に反映しました。

---

## 8. 実装用のパレット（TypeScript）

`src/yume/hikari-palette.ts` として置ける形。`Palette` の項目をそのまま満たし、足りない分を `HikariExtras` に持つ。入れるときは `LookId` に `'hikari'` を足すか、この型のまま `setLook` 側で受ける。

```ts
// 「光と霞」の時間帯パレット（06-art-direction.md §8 と同じ値）。
// 色は sRGB の16進。光の色・強さは three.js 0.186 の線形の光（ColorManagement 有効、NoToneMapping）での値。
// Palette（palette.ts）の項目はそのまま使え、足りない分を HikariExtras に持つ。

import type { Palette } from './palette'

export type TimeId = 'day' | 'dusk' | 'night'

/** 画質ごとの数 */
export interface PerQuality {
  low: number
  std: number
  high: number
}

export interface HikariExtras {
  time: TimeId
  /** 空の中ほどの色（skyTop → skyMid → skyHorizon の3段） */
  skyMid: number
  /** 太陽・月のまわりの空の明るみ */
  skyGlow: number
  /** 光の方向を向いたときの霧の色（反対を向いたときは fog） */
  fogToLight: number
  /** 霧のいちばん濃いところの濃さ（0..1）。1 にしない（遠くの形がうっすら残る） */
  fogMax: number
  /** rig.fogNear / rig.fogFar に掛ける倍率 */
  fogNearK: number
  fogFarK: number
  /** 主光源（昼・夕は太陽、夜は月）。方位は北=0°・東=90°、高度は地平から */
  light: { azDeg: number; elDeg: number }
  /** 平らな地面が日向・日陰になったときに掛かる色（線形 RGB）。hemi と sun はここから出す（§6.1） */
  litTint: [number, number, number]
  shadowTint: [number, number, number]
  /** 雲海（遠景の霞の帯）。base は fog と同じにして、地面の霧と継ぎ目なくつなぐ */
  cloudSea: { lit: number; shade: number; rimNdc: number; billow: number }
  /** 太陽（昼・夕）。半径・光の輪の大きさは画面の短辺に対する割合 */
  sunDisc: { color: number; radius: number; halo: number; haloRadius: number; haloAlpha: number } | null
  /** 朱い月（夜）。立山のいちばん高い稜線の方位 + azOffsetDeg、稜線の上 clearance×半径 の高さ */
  moon: {
    core: number
    shade: number
    rim: number
    halo: number
    haloOuter: number
    radius: number
    azOffsetDeg: number
    clearance: number
    haloAlpha: number
  } | null
  /** 星（夜）。1画素あたりの出やすさ */
  stars: { color: number; density: number } | null
  /** 光の粒（ちり・灯の粒）。2色を混ぜる。大きさは CSS px */
  motes: { a: number; b: number; mixB: number; count: PerQuality; sizePx: [number, number]; alpha: number; twinkleHz: [number, number] }
  /** 舞う紅葉 */
  leaves: { a: number; b: number; count: PerQuality } | null
  /** 道沿いの小さな灯り。intensity 0 で消灯 */
  lamps: { core: number; halo: number; outer: number; pool: number; intensity: number; spacingM: number; max: PerQuality }
  /** 夜の窓の灯り（家並みの一部だけ） */
  windows: { color: number; share: number } | null
  /** お休みの範囲の霧のほのかな光 */
  restGlow: { color: number; strength: number; edge: number; edgeStrength: number; pulseSec: number }
  /** 逆光のふちの光（アバター・ましろ・木） */
  glowRim: { color: number; strength: number; treeScale: number }
  /** ましろ（光の影響を受けない紙の白＋ほのかな光の輪） */
  mashiro: { paper: number; line: number; lineAlpha: number; glow: number; glowAlpha: number; poolAlpha: number }
  /** アバターの足元の丸い影（影なしの画質で使う） */
  blobShadow: { color: number; opacity: number }
  /** 合羽の下の着物（生成り） */
  robeUnder: number
  /** 出典表示の地と文字 */
  credit: { bg: string; text: string }
}

export type HikariPalette = Omit<Palette, 'id' | 'label'> & { id: 'hikari'; label: string } & HikariExtras

/** アバターとましろの色は時間帯で変えない（光で変わって見える） */
const AVATAR = { robe: 0x3f5f8f, hat: 0xdcc08a, skin: 0xe8cfb0, pack: 0xb5523b, robeUnder: 0xefe6d6 }
const LINES = { lineAlpha: { building: 0.14, edge: 0.06, contour: 0, rail: 0.45 }, lineWidth: 1.0, rim: 0 }

export const HIKARI: Record<TimeId, HikariPalette> = {
  // 昼（金色の午後）: Journey の金色の霞、A Short Hike の橙の道と青緑の水、Sky のやわらかい空
  day: {
    id: 'hikari',
    label: '光と霞・昼',
    time: 'day',
    paddy: '#d6c47f',
    paddyAlt: '#cdbb74',
    ridge: '#9cba78',
    yard: '#e2d0a6',
    forest: '#6f9a6a',
    forestDot: 'rgba(52,94,72,0.5)',
    forestDotLight: 'rgba(200,218,140,0.45)',
    parking: '#d8ccb2',
    riverbed: '#e4d8be',
    riverbedDot: 'rgba(150,128,106,0.32)',
    island: '#a9c27e',
    roadUnder: '#d9c092',
    restVeil: 'rgba(255,246,226,0.55)',
    shadow: 'rgba(88,96,160,0.22)',
    grain: 0.012,
    road: 0xecdcb8,
    path: 0xdcae74,
    water: 0x63b8b4,
    wall: 0xe4d4bc,
    roof: 0x6a7392,
    flatRoof: 0xa9a49a,
    canopy: 0x5b8a68,
    canopyBroad: 0x8fb26a,
    trunk: 0x8a5a44,
    ballast: 0xb9ad9a,
    outer: 0xc4cf98,
    ink: 0x4a5068,
    ...LINES,
    skyTop: 0x86bfd6,
    skyMid: 0xcfe2d4,
    skyHorizon: 0xf4e2b8,
    skyGlow: 0xfff0c4,
    fog: 0xe2e2cf,
    fogToLight: 0xf6dfa6,
    fogMax: 0.8,
    fogNearK: 1.0,
    fogFarK: 1.0,
    mist: 0xfff6e2,
    mountains: [
      { fill: 0xb9cbd6, top: 0x9fb9ca },
      { fill: 0xa7c2c0, top: 0x8fb0ad },
      { fill: 0x9cb894, top: 0x84a67e },
    ],
    snow: 0xfbf6ea,
    mountainInk: 0x6d8496,
    light: { azDeg: 235, elDeg: 32 },
    litTint: [1.04, 0.98, 0.86],
    shadowTint: [0.52, 0.56, 0.74],
    hemiSky: 0xdae2ff,
    hemiGround: 0xf2e2cb,
    hemiIntensity: 2.32,
    sun: 0xffe884,
    sunIntensity: 3.08,
    cloudSea: { lit: 0xfffaf0, shade: 0xc9d0cc, rimNdc: 0.03, billow: 0.5 },
    sunDisc: { color: 0xfff6dc, radius: 0.03, halo: 0xffe6a0, haloRadius: 0.22, haloAlpha: 0.45 },
    moon: null,
    stars: null,
    motes: { a: 0xffe7a8, b: 0xfff8e6, mixB: 0.3, count: { low: 24, std: 80, high: 140 }, sizePx: [2, 4], alpha: 0.55, twinkleHz: [0.2, 0.5] },
    leaves: null,
    lamps: { core: 0xffd89a, halo: 0xff9a48, outer: 0xc4402c, pool: 0xffae5c, intensity: 0, spacingM: 22, max: { low: 10, std: 24, high: 36 } },
    windows: null,
    restGlow: { color: 0xfff1d0, strength: 0.08, edge: 0xf2d8b0, edgeStrength: 0, pulseSec: 12 },
    glowRim: { color: 0xffe7a0, strength: 0.25, treeScale: 0.5 },
    mashiro: { paper: 0xfbf8f0, line: 0xb8aa98, lineAlpha: 0.5, glow: 0xfff1d6, glowAlpha: 0.18, poolAlpha: 0 },
    blobShadow: { color: 0x4a5288, opacity: 0.32 },
    ...AVATAR,
    credit: { bg: 'rgba(250,247,240,0.72)', text: '#5a5246' },
  },

  // 夕（逢魔が時）: Sky の ばら色の雲海。東の立山を向くと、ばら色の帯（ビーナスベルト）の下に藍の地球の影
  dusk: {
    id: 'hikari',
    label: '光と霞・夕',
    time: 'dusk',
    paddy: '#d8ae8c',
    paddyAlt: '#cfa486',
    ridge: '#a09a8c',
    yard: '#dcbcae',
    forest: '#6a6e80',
    forestDot: 'rgba(60,58,96,0.5)',
    forestDotLight: 'rgba(220,170,160,0.35)',
    parking: '#cbb4b0',
    riverbed: '#dcc4bc',
    riverbedDot: 'rgba(120,96,120,0.32)',
    island: '#8f9488',
    roadUnder: '#d2ab9a',
    restVeil: 'rgba(246,214,204,0.5)',
    shadow: 'rgba(80,70,130,0.26)',
    grain: 0.014,
    road: 0xe2c4b4,
    path: 0xd49c86,
    water: 0x9a9cc8,
    wall: 0xe6c4b6,
    roof: 0x585a80,
    flatRoof: 0x9a8e9a,
    canopy: 0x566878,
    canopyBroad: 0x7a8a7a,
    trunk: 0x6a4450,
    ballast: 0xa8949a,
    outer: 0x9c8ea4,
    ink: 0x3e3858,
    ...LINES,
    skyTop: 0x3b3d78,
    skyMid: 0x9a86b0,
    skyHorizon: 0xeaa6a2,
    skyGlow: 0xffc9a0,
    fog: 0xa99ab4,
    fogToLight: 0xeeae96,
    fogMax: 0.85,
    fogNearK: 0.9,
    fogFarK: 0.95,
    mist: 0xf6d2c6,
    mountains: [
      { fill: 0x8e84aa, top: 0xd99c9c },
      { fill: 0x7a7598, top: 0x8f84a6 },
      { fill: 0x626686, top: 0x6c6e8e },
    ],
    snow: 0xf4c2b8,
    mountainInk: 0x4a4466,
    light: { azDeg: 255, elDeg: 20 },
    litTint: [0.92, 0.7, 0.74],
    shadowTint: [0.5, 0.46, 0.7],
    hemiSky: 0xdcd4ff,
    hemiGround: 0xe7c7cb,
    hemiIntensity: 2.2,
    sun: 0xffc757,
    sunIntensity: 3.86,
    cloudSea: { lit: 0xf4c0a2, shade: 0x7e6f92, rimNdc: 0.035, billow: 0.6 },
    sunDisc: { color: 0xffd0a0, radius: 0.04, halo: 0xffb08a, haloRadius: 0.3, haloAlpha: 0.55 },
    moon: null,
    stars: null,
    motes: { a: 0xffc79a, b: 0xf7a8b8, mixB: 0.4, count: { low: 24, std: 80, high: 140 }, sizePx: [2, 4], alpha: 0.6, twinkleHz: [0.3, 0.7] },
    leaves: { a: 0xc2412d, b: 0xd9773a, count: { low: 0, std: 16, high: 28 } },
    lamps: { core: 0xffd89a, halo: 0xff9a48, outer: 0xc4402c, pool: 0xffae5c, intensity: 0.5, spacingM: 22, max: { low: 10, std: 24, high: 36 } },
    windows: { color: 0xf2b866, share: 0.15 },
    restGlow: { color: 0xf6c9a8, strength: 0.15, edge: 0xd9775a, edgeStrength: 0.06, pulseSec: 10 },
    glowRim: { color: 0xffb48a, strength: 0.4, treeScale: 0.5 },
    mashiro: { paper: 0xfbf8f0, line: 0xb8aa98, lineAlpha: 0.5, glow: 0xfff1d6, glowAlpha: 0.3, poolAlpha: 0.08 },
    blobShadow: { color: 0x3e3a6e, opacity: 0.32 },
    ...AVATAR,
    credit: { bg: 'rgba(250,244,240,0.72)', text: '#5a4c52' },
  },

  // 夜（Kage 風）: 深い藍、琥珀の灯り、立山の上の朱い月。社寺は描かない
  night: {
    id: 'hikari',
    label: '光と霞・夜',
    time: 'night',
    paddy: '#34416a',
    paddyAlt: '#303c64',
    ridge: '#2f4d5e',
    yard: '#3c4568',
    forest: '#1c2c3c',
    forestDot: 'rgba(8,14,30,0.55)',
    forestDotLight: 'rgba(110,140,190,0.25)',
    parking: '#3a4262',
    riverbed: '#444c6c',
    riverbedDot: 'rgba(10,14,34,0.35)',
    island: '#2a4250',
    roadUnder: '#424a6c',
    restVeil: 'rgba(74,60,94,0.5)',
    shadow: 'rgba(8,10,30,0.35)',
    grain: 0.03,
    road: 0x56607e,
    path: 0x66708e,
    water: 0x1c3054,
    wall: 0x4a5272,
    roof: 0x1e2340,
    flatRoof: 0x2c3250,
    canopy: 0x1e3242,
    canopyBroad: 0x2a3e4a,
    trunk: 0x2a2430,
    ballast: 0x3a4058,
    outer: 0x1e263e,
    ink: 0x0a0c1c,
    lineAlpha: { building: 0.18, edge: 0.08, contour: 0, rail: 0.5 },
    lineWidth: 1.0,
    rim: 0,
    skyTop: 0x070b1d,
    skyMid: 0x0f1633,
    skyHorizon: 0x1d2548,
    skyGlow: 0x4a2230,
    fog: 0x161d3a,
    fogToLight: 0x2a2140,
    fogMax: 0.9,
    fogNearK: 0.75,
    fogFarK: 0.85,
    mist: 0x4a3c5e,
    mountains: [
      { fill: 0x1c2244, top: 0x2e2a4c },
      { fill: 0x161c38, top: 0x22243e },
      { fill: 0x10162c, top: 0x181c32 },
    ],
    snow: 0x3c4466,
    mountainInk: 0x8a4a58,
    light: { azDeg: 100, elDeg: 35 },
    litTint: [0.94, 0.8, 1.0],
    shadowTint: [0.5, 0.56, 0.84],
    hemiSky: 0xcbd5ff,
    hemiGround: 0xa192af,
    hemiIntensity: 2.64,
    sun: 0xffc3a2,
    sunIntensity: 2.41,
    cloudSea: { lit: 0x4a3a5c, shade: 0x0e1428, rimNdc: 0.025, billow: 0.5 },
    sunDisc: null,
    moon: {
      core: 0xc4615a,
      shade: 0x8e3f42,
      rim: 0xe3907e,
      halo: 0x7a2e36,
      haloOuter: 0x3a1a26,
      radius: 0.065,
      azOffsetDeg: 4,
      clearance: 1.8,
      haloAlpha: 0.55,
    },
    stars: { color: 0xdfe6ff, density: 0.0015 },
    motes: { a: 0xcfe6ff, b: 0xffb866, mixB: 0.3, count: { low: 30, std: 110, high: 180 }, sizePx: [2.5, 5], alpha: 0.8, twinkleHz: [0.4, 1.2] },
    leaves: { a: 0xb8322a, b: 0xc8502e, count: { low: 0, std: 12, high: 20 } },
    lamps: { core: 0xffd89a, halo: 0xff9a48, outer: 0xc4402c, pool: 0xffae5c, intensity: 1, spacingM: 22, max: { low: 10, std: 24, high: 36 } },
    windows: { color: 0xf2b866, share: 0.3 },
    restGlow: { color: 0xe89a52, strength: 0.35, edge: 0xb84a34, edgeStrength: 0.12, pulseSec: 9 },
    glowRim: { color: 0xff9a8a, strength: 0.55, treeScale: 0.5 },
    mashiro: { paper: 0xfbf8f0, line: 0xb8aa98, lineAlpha: 0.5, glow: 0xfff1d6, glowAlpha: 0.5, poolAlpha: 0.16 },
    blobShadow: { color: 0x05081a, opacity: 0.4 },
    ...AVATAR,
    credit: { bg: 'rgba(16,20,40,0.62)', text: '#d8d4e4' },
  },
}

/**
 * litTint / shadowTint と光の向きから、HemisphereLight と DirectionalLight の値を出す（§6.1）。
 * 平らな地面の日向 = 素材の色 × litTint、日陰 = 素材の色 × shadowTint になる。
 * hemi の地面側の色はパレットの hemiGround（sRGB）をそのまま使う。戻り値の色は線形 RGB（THREE.Color#setRGB(r, g, b, THREE.LinearSRGBColorSpace) で入れる）。
 */
export function deriveLights(p: HikariPalette): {
  dir: [number, number, number]
  hemiSky: [number, number, number]
  hemiIntensity: number
  sun: [number, number, number]
  sunIntensity: number
} {
  const az = (p.light.azDeg * Math.PI) / 180
  const el = (p.light.elDeg * Math.PI) / 180
  // x = 東、y = 上、z = 南（北は -z）
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
  const sh = p.shadowTint
  const hemiIntensity = Math.max(...sh) * Math.PI
  const hemiSky = sh.map((v) => (v * Math.PI) / hemiIntensity) as [number, number, number]
  const d = p.litTint.map((v, i) => Math.max(0, v - sh[i])) as [number, number, number]
  const dMax = Math.max(...d, 1e-4)
  const sun = d.map((v) => v / dMax) as [number, number, number]
  const sunIntensity = (dMax * Math.PI) / Math.max(0.15, Math.sin(el))
  // 地面からの照り返し（hemi の地面側）は、パレットの hemiGround をそのまま使う
  return { dir, hemiSky, hemiIntensity, sun, sunIntensity }
}
```
