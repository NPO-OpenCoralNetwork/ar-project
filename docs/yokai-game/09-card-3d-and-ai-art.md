# 伝承の札を 3D にし、生成 AI の絵を貼る（設計 v0.1）

> 作成日: 2026-10-17 ／ 状態: **提案**（PO の判断待ちは §5.7）
> きっかけ: PO の要望（10/17）「札のデザインを three.js で 3D にしたい。生成 AI で画像を作り、3D にマッピングして入れたい。UV マッピングはうまくできるか。ツールを作った方がいいか、three.js にいい手法があるか」
> 関係: 04 §3.6（曼荼羅のピース）・§5.2（神仏と見た目のルール）、05 §3.2（お札・御朱印に似せない）、06（光と霞）、02 F-43（札に出すもの）・F-71（監修の状態）
> いまの札: HTML の和紙のカード（`apps/yokai-game/src/yume/encounter/ui.ts` の `cardHtml`）。曼荼羅帳は SVG（同じファイルの `MandalaView`）。
> 表記: 「確かめた」＝ three r186 を手元で動かした結果か、§8 の出典を開いて読んだもの。数字の見込みは「見込み」と書く。

---

## 1. 結論

1. **UV マッピングはうまくできます。** 札は平らな板なので、表と裏の UV は「位置 ÷ 札の幅・高さ ＋ 0.5」の式1つで 0〜1 にぴったり収まります（three r186 で確かめた。§4.1）。Blender などでの UV 展開も、UV のための道具も要りません。
2. **three.js の手法:** 角を丸めた形を `ExtrudeGeometry` で薄く押し出し、自前の `UVGenerator` を渡します。面を「表・裏・縁」の3つに分けて、それぞれに素材を貼ります。表は光を受けない自作のシェーダーにし、和紙・絵・白描の線・金の縁・箔を1枚で重ねます。
3. **文字は画像に入れません。** 生成 AI には文字のない絵だけを作らせます。題は実行時に描き（CanvasTexture）、本文と出典は今の HTML のまま札の下に出します。監修で文が変わっても、絵を作り直さずに済みます。
4. **作る道具は2つです。**「札スタジオ」（開発用のページ。絵の切り抜き・状態の切り替え・傾きと光の確認・書き出し）と、素材を作るスクリプト（白描の線・箔の範囲・圧縮）。既存の道具は、平らな札には出番がありません（§6.4）。
5. **生成 AI は、試作の仮の絵と構図案に使うことを推奨します。** 本番の絵は、契約するイラストレーターに描いてもらうことを推奨します。理由は3つです。AI だけの絵は権利を主張しにくい。補償はうちの規模ではほぼ受けられない。業界での反発が強い（§5.5）。札の仕組みは、どちらの絵でも同じに作れます。PO に決めてほしいことは §5.7 にまとめました。

---

## 2. 札のデザインの方針

### 2.1 系統: 「絵札」（かるた・花札の系統）

- 札は**絵が主役の遊び札**に寄せます。絵の窓が大きく、まわりに色の縁の帯があり、題は小さな題箋（本の題を書く細い紙）に書く形です。
- 曼荼羅帳は「本」なので、題箋は本の世界とつながります。お札・護符の世界とはつながりません。
- 06「光と霞」の色を使います。紙は和紙の生成り、縁の帯は時間帯に左右されない藍か若草の一色にします。
- 本物の札を写しません。特定のかるた・花札の図柄も写しません。

### 2.2 お札・護符・御朱印に似せないための決まり

05 §3.2・04 §5.2・06 の決まりを、札の見た目に当てはめたものです。札スタジオの確認欄（§6.2）にも、同じ項目を入れます。

| 避けること | 札での決まり |
|---|---|
| 縦長の護符の形 | 縦横比は 5:7 前後にします（§2.3）。1:2 より細長くしません。頭を山形や剣先の形にしません |
| 紐・袋・穴 | 紐を通す穴、紐、房、袋（守り袋の形）を描きません。3D の演出でも付けません |
| 朱の印と墨書き | 朱色の丸い印や四角い印を押しません。筆で書いた大きな文字を札の中心に置きません。題は明朝の活字で、題箋の中に小さく書きます |
| お札の文字 | 「御札」「御守」「奉拝」「護符」「御朱印」などの語、日付と社名の組み合わせ、梵字、宝印に見える模様を入れません |
| 神仏の姿 | 今も祀られている神仏（立山権現・刀尾権現・阿弥陀如来・不動明王・姥尊など）は描きません。描くときは光・雲・山の形にします（04 §5.2） |
| 社寺 | 社殿・鳥居・灯籠・神社の紋を描きません。紋に見える丸い意匠も避けます |
| その他 | クタベの札は、文字と薬草の景色だけにして姿を描きません。了承待ちの札（布橋・姥尊・由緒に当たる札）は、絵も了承が出るまで作りません（F-71） |

裏の意匠も同じです。裏は全札共通にし、和紙に霞の文様と、本作の小さな印（ましろの紙の鳥を簡略にしたもの）を、藍の一色で入れます。社紋や家紋に見える円形の紋にはしません。

### 2.3 縦横比と寸法

| 項目 | 値 | 理由 |
|---|---|---|
| 札の縦横比 | **63 : 88**（約 5:7） | 遊び札としてなじみのある縦長で、護符ほど細くない。手元の確認スクリプトもこの比で試した |
| 3D の大きさ | 幅 0.63 × 高さ 0.88 × 厚み 0.008、角の丸み 0.035（四分円。札だけの場面の単位） | 厚みは縁の色が見える程度。面取りは無し。角はシェーダーの距離関数と同じ円弧にする（§4.1）。札スタジオ（`src/card-studio/geometry.ts`）と同じ値 |
| 縁の帯 | 札の幅の 5% 前後 | 絵札らしい色の縁 |
| 絵の窓 | **縦横 1:1**、縁の内側の上寄せ（窓の幅＝縁の内側の幅） | 曼荼羅のピース（いまは 56×54 と 48×48 のほぼ正方形）と**同じ絵を使い回せる** |
| 題箋 | 窓の下。縁の内側の幅 × 札の高さの約 20% | 題は1〜2行 |
| 番号 | **札には描かない**（F-43「題・本文・出典だけ」）。札の下の HTML に出すかは PO の判断待ち（§5.7-7） | 今の `cardHtml` と §2.3 の旧案は番号を出していて、F-43 とそろっていない |
| 絵のテクスチャ | 1024 × 1024（窓の1:1）、色の画像 1枚と、マスク画像 1枚（§4.3） | 札は画面の短辺の約7割に出る。390 CSS px 幅のスマホ（iPhone 12〜14 は画素比 3。renderer は画素比の上限を 2 にしている）なら、窓は約 235 CSS px × 2 ＝ 約 470px なので、1024 で足りる |

### 2.4 表と裏、層

```
表（下から順に重ねる）            裏
 ┌──────────────┐                ┌──────────────┐
 │ 縁の帯（色）      │                │ 和紙              │
 │ ┌──────────┐ │                │ 霞の文様（藍）    │
 │ │ 絵の窓       │ │ ← 和紙→白描→彩色│ ましろの印（藍）  │
 │ │ （1:1）       │ │                │                   │
 │ └──────────┘ │                └──────────────┘
 │ 題箋「おごり高ぶって、天狗になった」│
 │                     │       縁（厚み）: 紙の生成り。金の縁取りの段階で金
 └──────────────┘
 札の下の HTML: 本文・出典（今の cardHtml）
```

| 層 | 中身 | どこで作るか |
|---|---|---|
| 和紙 | 繊維の細かい模様（全札共通の 512² の繰り返し） | シェーダー＋共通テクスチャ |
| 絵 | 白描の線・彩色の絵・箔の範囲 | 札ごとの画像（札スタジオで書き出し） |
| 枠 | 縁の帯・窓の線・題箋の枠 | シェーダー（UV から計算。画像は要らない） |
| 金の縁取り | 窓と札の縁の金の帯 | シェーダー（状態で出す） |
| 題 | 札の題 | CanvasTexture（実行時に描く） |
| 本文・出典 | 札の本文、文献名の1行 | **HTML**（3D の札の下か横。今の `cardHtml` を使う） |

遊ぶ人に見せるのは、題・本文・出典だけです（F-43）。確度・調べ・監修の状態、絵の作り方の記録は、`?debug` のときだけ出します。

---

## 3. 状態ごとの見せ方

### 3.1 曼荼羅のピースの4段階（04 §3.6）

札の絵の段階は、**その札が結びつくピースの状態に合わせる**ことを提案します（PO 判断 §5.7-5）。ピースのない札（供物など）は、夢の旅では白描、現地でその地点に立つと彩色にします。

| 段階 | 絵の窓 | 縁・金 | 入る時の演出 |
|---|---|---|---|
| 空白 | 和紙だけ。窓は点線（今の SVG と同じ） | 縁の帯は淡い墨 | ― |
| 白描（夢・噂・家） | 和紙に墨の線（白描の線の画像） | 縁の帯は淡い墨 | 墨が紙に広がるように、中心から線が現れる（夢の姿 `dream-figure.ts` と同じ考え方） |
| 彩色（現地だけ） | 色の絵。線は残す | 縁の帯に色が入る | 色が筆でにじむように、ノイズの境目で中心から広がる（約 1.2 秒） |
| 金の縁取り（語り返した） | 彩色のまま | 窓と札の縁に金の帯。傾けると光の筋が走り、箔の範囲だけ虹色がのる | 金の帯を光の筋が一周する |

- **色だけにしない:** 今の曼荼羅帳と同じく、状態は形と文字でも示します（窓の右上の「線・彩・金」の小さな印）。
- **夢の旅では白描まで**（`PIECE_CAP.yume`）。夢の旅の札は、色の絵を持っていても白描で出します。

### 3.2 夢の旅と現の旅

| | 夢の旅（箱庭） | 現の旅（地図） |
|---|---|---|
| 札が開く場面 | 会話の後の「伝承の札」 | 地点に立ったとき、ピースに色が入ったとき |
| 札の後ろ | 箱庭の画面を少し暗くする（今の `.yc-wrap` と同じ） | 地図を少し暗くする |
| 札の絵 | 白描まで | 彩色・金まで |

どちらも同じ「札の表示」（§7 の `CardView`）を使います。

### 3.3 時間帯と夜の光り方

- **紙の白は時間帯で濁らせません。** 札の表は光を受けない素材にします。ましろの紙の白と同じ考え方です（06 §1.1）。
- 時間帯は**札のまわり**で表します。
  - 昼: 札の下にやわらかい影。光の筋は金色（`#ffe7a8` 寄り）。
  - 夕: 縁にばら色の照り返し（06 §2.2 の雲の光る面の色寄り）。
  - 夜: 後ろを藍に沈め、札の縁に琥珀の細い光（06 §2.3 の灯りの色）。金の縁取りだけは、うっすら自分で光ります。
- **にじみ（ブルーム）:** 「影あり」の画質で `UnrealBloomPass`（しきい値 0.9）が動いているときだけ、金の帯の明るい所がにじみます。「標準」「軽い」では、光の輪を板で描きます（06 §6.10 の考え方。後処理を増やさない）。
- **動きを減らす設定:** `prefers-reduced-motion` のときは、傾き・光の筋・虹色を止め、静止した光にします。演出はフェードだけにします。

---

## 4. three.js での作り方

### 4.1 形と UV

比べた4つの方法:

| 方法 | 評価 |
|---|---|
| `PlaneGeometry` を表裏2枚 | いちばん簡単。UV は最初から 0〜1。ただし厚みと縁がなく、角の丸みは透明で抜くことになる |
| **`ExtrudeGeometry` ＋ 自前の `UVGenerator`（推奨）** | 角丸の形を押し出して厚みを付ける。表と裏の UV を 0〜1 に正規化し、面を表・裏・縁に分ける |
| `RoundedBoxGeometry` | 薄い札には向かない。半径1つで全部の辺を丸めるので、角の丸みを厚みの半分より大きくできない。丸みの部分にも UV を割るため、表の平らな面が 0〜1 にならない |
| `BufferGeometry` を自作 | 自由だが、ExtrudeGeometry と同じものを作ることになる |

**なぜ自前の UVGenerator が要るか:** 標準の UV の作り方（`WorldUVGenerator`）は、形の x, y 座標をそのまま UV にします。0.63 × 0.88 の札なら、UV は −0.315〜0.315 / −0.44〜0.44 になります（`ShapeGeometry` で確かめた。ソースのコメントも `// world uvs`）。幅と高さで割って 0.5 を足せば 0〜1 になります。

**ExtrudeGeometry の面の並び（r186 のソースで確かめた）:** group 0 が表と裏、group 1 が側面です。面取りなしのとき、group 0 の前半が裏（z=0）、後半が表です。これを使うと、group を分け直すだけで「表・裏・縁」に別々の素材を当てられます。

```ts
// src/yume/card3d/geometry.ts（案。node で three r186 を動かして確かめた形）
import * as THREE from 'three'

// 角は四分円（absarc）。二次ベジェ（quadraticCurveTo）だと角の中点が円弧より約 0.06r 外に出て、
// シェーダーの距離関数（円弧）とずれる（角で縁の光が強くなる）
function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2, q = Math.PI / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -q, 0, false)
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, q, false)
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, q, 2 * q, false)
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, 2 * q, 3 * q, false)
  return s
}

/** 札の形。materials は [表, 裏, 縁] の順 */
export function makeCardGeometry(w = 0.63, h = 0.88, depth = 0.008, r = 0.035): THREE.ExtrudeGeometry {
  const UVGenerator = {
    generateTopUV: (_g: unknown, v: number[], a: number, b: number, c: number) =>
      [a, b, c].map((i) => new THREE.Vector2(v[i * 3] / w + 0.5, v[i * 3 + 1] / h + 0.5)),
    generateSideWallUV: (_g: unknown, v: number[], a: number, b: number, c: number, d: number) =>
      [a, b, c, d].map((i) => new THREE.Vector2(0, v[i * 3 + 2] / depth)), // 縁は厚み方向だけ
  }
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: false, curveSegments: 10, UVGenerator })
  geo.translate(0, 0, -depth / 2)
  const [caps, side] = geo.groups
  const half = caps.count / 2
  geo.clearGroups()
  geo.addGroup(caps.start + half, half, 0) // 表 → materials[0]
  geo.addGroup(caps.start, half, 1) // 裏 → materials[1]
  geo.addGroup(side.start, side.count, 2) // 縁 → materials[2]
  const uv = geo.attributes.uv
  for (let i = caps.start; i < caps.start + half; i++) uv.setX(i, 1 - uv.getX(i)) // 裏の絵が鏡写しにならないように
  return geo
}
```

確かめた結果（旧案の `card-geo-check.mjs` と、上の値で動かした `final-card/geo.mjs`）:
- 上の値（depth 0.008・r 0.035・curveSegments 10・四分円）で、頂点 996（三角形 332。index なし）。表と裏の u・v とも 0〜1。形の頂点は、シェーダーの角丸の距離関数の 0 から 1.5×10⁻⁸ 以内（ずれなし）。
- 表は z=+depth/2、法線 +Z。裏は z=−depth/2、法線 −Z（旧案の値で確かめた）。
- 裏は x が小さい側で u=1 になっていて、裏返したときに絵が正しい向きで見えます。
- 法線は ExtrudeGeometry が自分で計算します（ソース 77 行の `computeVertexNormals`）。
- 面取り（bevel）を入れる場合は、表の面が形より `bevelSize` だけ外に広がります。正規化の幅と高さを `w + 2*bevelSize` に直します。札の厚みなら面取りは要りません。

### 4.2 テクスチャの設定

| 項目 | 設定 |
|---|---|
| 色の絵 | `tex.colorSpace = THREE.SRGBColorSpace`（今の `ground-texture.ts` と同じ） |
| マスク画像・和紙の繊維 | 色空間を付けない（NoColorSpace のまま） |
| ぼやけ | `tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())`。ミップマップは初期設定のまま |
| 縦横比 | **札スタジオで 1:1 に切り抜いて書き出す**（推奨）。実行中に合わせる必要はない |
| 自作シェーダーの色 | 最後に `#include <colorspace_fragment>` を入れる。入れないと、色が他の素材とずれる。シェーダーの中の定数色は linear の値で書く |
| offset・repeat | 組み込みの素材にしか自動で効かない。自作シェーダーで使うなら `tex.matrix` を uniform で渡す（切り抜きを書き出しで済ませれば要らない）。札スタジオの offset・repeat は「窓の座標を縦横比で直した a」に掛ける値なので、組み込みの素材には書き出しの `uv.matrix`（窓の UV から直接引く行列）を使う（§6.3） |
| 片付け | 札を閉じたら `geometry`・`material`・`texture` を `dispose()` する |

### 4.3 札ごとの画像は2枚にまとめる

| 画像 | 中身 | 形式 |
|---|---|---|
| 色の絵 `color` | 彩色の絵（1024²、文字なし） | sRGB |
| マスク `mask` | R＝白描の線、G＝箔の範囲（金・虹色をのせる所）、B＝予備（窓の外の抜きなど） | 色空間なし |

白描の線を別の画像にしておく理由は2つあります。白描は「色の絵から自動で作る」と決まっていて（04 §3.6）、実行中に作るより、書き出しの時に作った方がきれいで軽いからです。また、気に入らない場合に手描きの線画へ差し替えられるからです。

**自動の線には限界があるので、mask.png の R は手で直せるようにします。** 札スタジオの試作は、色の勾配（RGB の各チャンネルの Sobel の最大と明るさの Sobel）と暗い所から線を出します。明るさの近い色どうしの境目も拾うようにしましたが、AI の絵では、霞の帯が人物を横切る線になる、羽が二重の輪郭になる、といった「絵にない線」や「抜け」が残ります（見本の絵で確かめた）。書き出した mask.png を画像編集で直し、それを読み込めるようにします（§6.2 ⑤）。

線の太さは、書き出しの解像度（窓の高さ＝1024 画素）の画素を単位にします。札スタジオでは、元の画像がそれより大きければミップの段を固定して引き（`textureLod`）、元の画像の解像度・拡大・画面の大きさで線が変わらないようにしています。画像の外は端の色を延ばして読み、境目に線を作りません。

### 4.4 表の素材（光を受けない自作シェーダー）

表は `ShaderMaterial` 1つで、和紙・白描・彩色・金の縁・虹色を重ねます。`MeshPhysicalMaterial` は画素あたりの負荷が高く、環境マップがないと金属が黒く沈むので、使いません。

```glsl
// 表の素材（骨組み）。uStage: 0=空白 1=白描 2=彩色 3=金。途中の値で段階の間をつなぐ
uniform sampler2D uArt, uMask, uPaper, uTitle;
uniform float uStage, uAspect, uRadius, uReveal;
uniform vec2 uTilt;      // 傾き（-1〜1）
uniform vec3 uRim;       // 時間帯の縁の照り返しの色（linear）
varying vec2 vUv;
float sdRR(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
void main(){
  vec3 paper = vec3(0.90,0.86,0.79) * (0.93 + 0.07*texture2D(uPaper, vUv*vec2(3.,4.2)).r);
  vec2 wuv = windowUv(vUv);                       // 札の UV → 絵の窓の UV（窓の外は和紙のまま）
  vec4 m = texture2D(uMask, wuv);
  float sLine=clamp(uStage,0.,1.), sCol=clamp(uStage-1.,0.,1.), sGold=clamp(uStage-2.,0.,1.);
  vec3 c = mix(paper, vec3(0.03,0.035,0.05), m.r * sLine);          // 白描
  c = mix(c, texture2D(uArt, wuv).rgb, sCol * inWindow(vUv));         // 彩色
  c = frameBands(c, vUv, sCol);                                       // 縁の帯・窓の線・題箋（UV から計算）
  vec2 p = (vUv-0.5)*vec2(uAspect,1.);
  float d = sdRR(p, vec2(uAspect,1.)*0.5-0.03, uRadius);
  float band = smoothstep(0.010,0.004,abs(d)) * sGold;               // 金の縁取り
  float glint = pow(max(0.,1.-length(p-uTilt*0.4)),8.);
  c = mix(c, vec3(0.72,0.48,0.16)*(0.7+1.2*glint), band);
  vec3 rainbow = 0.5+0.5*cos(6.2832*(dot(vUv,vec2(.7,.3))+dot(uTilt,vec2(.6,.3))+vec3(0.,.33,.67)));
  c += rainbow * 0.18 * m.g * length(uTilt) * sGold;                  // 箔の範囲だけ虹色
  vec4 t = texture2D(uTitle, vUv); c = mix(c, t.rgb, t.a);           // 題（CanvasTexture）
  gl_FragColor = vec4(c,1.);
  #include <colorspace_fragment>
}
```

- `windowUv`・`inWindow`・`frameBands` は §2.3 の寸法から UV で計算します（画像は要りません）。
- 角丸の帯は、角丸の長方形の距離関数（iquilezles.org の 2D distance functions）で作ります。
- 「現れる」演出（`uReveal`）は、ノイズとの比較で境目を動かします。
- 虹色の考え方は pokemon-cards-css（ポインタの位置でグラデーションと重ね方を動かす CSS）を参考にします。ただし GPL-3.0 なので、**コードは写さずシェーダーで作り直します**。
- 裏は和紙と霞の文様の共通テクスチャ1枚（`MeshBasicMaterial`）、縁は紙の生成りの単色（金の段階で金色）にします。札スタジオの試作は、共通の 512² の canvas（すやり霞と、ましろの紙の鳥の小さな印。藍の一色。文字なし）に、和紙の凹凸と夜の縁の光を足す小さなシェーダーです。
- 線・帯・縁は、距離関数と `fwidth` で画面の1画素の幅でなめらかにします。画面の画素より細かい模様（箔のきらめき、空白の段階の点線、線のむら）は、和紙と同じ減衰（`oct`）で消します。56×54 のピースの大きさでの見え方（§6.2 ⑬）は、まだ確かめていません。
- 札スタジオの表のシェーダーは、白描の線（Sobel、テクスチャを9回引く）を、要る段階（白描と、彩色で線を残す時）だけ計算します。和紙の高さは1回だけ計算し、傾きは画面の微分（`dFdx`・`dFdy`）から取ります。実機の fps は**まだ測っていません**（今の数字は PC のソフトウェア描画のもの）。

### 4.5 文字の載せ方

| 文字 | 方法 | 理由 |
|---|---|---|
| 題（1〜2行） | CanvasTexture に描いて、表の素材に重ねる | 絵と一緒に傾く |
| 本文・出典 | **HTML**（3D の札の下に、今の `cardHtml` の本文と出典を出す） | 読み上げ・拡大・縦書き（`writing-mode`）がそのまま効く。three.js の解説も、常に読ませる文字は HTML を勧めている |

CanvasTexture の注意:
- 書体は、今の `--title-font`（ヒラギノ明朝・游明朝・Noto Serif JP）と同じ並びにします。Web フォントを足す場合は、描く前に `await document.fonts.load(...)` で読み込みを待ちます。待たないと代わりの書体で描かれます。
- canvas は、画面上の大きさ × devicePixelRatio 以上にします。描き直したら `needsUpdate = true` にします。
- canvas の大きさを変えると `ctx.font` が消えるので、設定し直します。
- Canvas 2D には縦書きの指定がないので、縦書きの題にする場合は1字ずつ位置を決めて描きます。

### 4.6 動き

- **ばね:** 毎フレーム `a = k*(目標-今) - c*速さ` で動かします（k≈120、c≈2√k×0.6、dt は 1/30 秒で頭打ち）。裏返しは、目標の `rotation.y` に π を足すだけです。単純な追従なら `THREE.MathUtils.damp` があります。
- **開く演出:** 札は裏向きで下から上がり、0.6 秒で表に返ります（今の「札が開いた」）。その後で §3.1 の段階の演出が入ります。
- **ポインタ:** `pointermove` の位置を −1〜1 に直し、目標の傾き（±15° 程度）にします。
- **スマホの傾き（iOS）:**
  - `DeviceOrientationEvent.requestPermission()` は、タップなどの操作の中で呼ぶ必要があります。HTTPS だけで使えます。
  - 「札を傾けて見る」ボタンを押した時に呼び、断られたらポインタ操作だけにします。
  - beta・gamma は、札を開いた時の値を基準にした差で使います。横画面では `screen.orientation.angle` で軸を入れ替えます。
- **iframe の中:** 他のサイトの iframe の中では、WebKit は許可の指定（gyroscope など）がないと傾きを渡しません（WebKit Bug 221399）。claude.ai の Artifact の中で傾きが使えるかは**確かめていません**。ポインタ操作だけでも成り立つように作ります。
- **動きを減らす設定:** §3.3 のとおり。

### 4.7 描き方と性能

- **同じ renderer で、札だけの場面を後から重ねて描きます。** 箱庭（または composer）を描いた後に `renderer.autoClear = false; renderer.clearDepth(); renderer.render(cardScene, cardCamera)` とします。WebGL の文脈は増やしません。
- 札1枚で描画命令が4つ増えます（表・裏・縁と、まわりの光・影の板。札スタジオの HUD で 4 を確かめた）。06 §6.10 の予算は 40 で、今の「標準」は 30 なので、34 に収まる見込みです。§3.3 のとおり「標準」「軽い」でも光の輪を板で描くので、板の1つは数に入れておきます。実機の HUD で確かめます。
- 札を開いている間は、箱庭の動き（粒・アバター）を止めると、その分だけ軽くなります。
- **メモリ（見込みの計算。札スタジオの実装の大きさで計算し直した）:**

| テクスチャ | 大きさ | ミップマップ | 見込み |
|---|---|---|---|
| 色の絵 `color` | 1024² RGBA | あり | 約 5.3MiB |
| マスク `mask` | 1024² RGBA | あり | 約 5.3MiB |
| 裏（全札共通） | 512² RGBA | あり | 約 1.3MiB |
| 題（題箋の範囲だけ） | 1024 × 237（かるた寄り）／1024 × 190（花札寄り）RGBA | なし（字の覆いしか使わない） | 約 0.9MiB／0.7MiB |
| 和紙 | 札スタジオはシェーダーで計算（テクスチャなし）。512² の繰り返しにするなら | あり | （約 1.3MiB） |

  札1枚で約 12.5〜14MiB です。**同時に読むのは開いている札1枚だけ**にし、閉じたら `dispose()` します。札スタジオでは、読み込む画像を長い辺 2048 までに縮めています（2048² でミップマップ込み約 21MiB。縮めないと 4096² で約 85MiB）。

### 4.8 モバイル向けの圧縮（KTX2）

- **まず WebP で始めます。** 1画面に出る札は1枚なので、実機の fps とメモリを見てから KTX2 に移ります。
- KTX2 を使う時:
  - `KTX2Loader` の `setTranscoderPath()` と `detectSupport(renderer)` を、読み込みの前に呼びます。
  - 変換に使う `basis_transcoder.js` と `.wasm` は `node_modules/three/examples/jsm/libs/basis/` にあります（確かめた）。`public/basis/` に写して使います。
  - 圧縮形式は、小ささなら ETC1S、画質なら UASTC です。札の絵は細い線があるので、UASTC から試します。
  - **上下の向き:** 圧縮テクスチャは `flipY=false` に固定されています（`CompressedTexture.js` 67行）。変換の時に上下を反転しておくか、UV の v を反転します。
  - iPhone の WebGL2 で ETC1 が使えず RGBA に戻ったという報告があります。実機で確かめます。
  - 変換には KTX-Software の `ktx` コマンドを使います（§6.3 のスクリプトから呼ぶ）。
- **1ファイルにまとめる版（`build:artifact`）:** singlefile で1つの HTML にまとめるので、wasm と画像を別のファイルに置けません。画像をどう埋め込むか、埋め込むと大きさがどれだけ増えるかは**確かめていません**。この版では、札の絵を WebP で1〜2枚だけ入れるか、仮の絵なしで出すかを、段階3の前に決めます。

---

## 5. AI 画像の作り方と使い方

### 5.1 どのサービスを使うか（試作の仮の絵）

| 順位 | サービス | 理由 | 注意 |
|---|---|---|---|
| 第一 | **Adobe Firefly（Adobe 自社のモデル）** | 学習データの説明が最もはっきりしている（許諾済みの素材と著作権の切れた素材だけ。ウェブからの収集はしない）。商用に安全と明言 | 補償は法人契約だけ。アプリの中の**パートナーモデル（FLUX・GPT Image など）は Adobe の基準の外**なので選ばない。Content Credentials（来歴情報）を消してはいけない決まりがあるので、原本は来歴情報を付けたまま保存する |
| 第二 | Google Gemini の画像モデル（API の**有料枠**） | 参照画像を混ぜられる。ただし枚数はモデルと参照の種類で違う（最大14枚は Gemini 3.1 Flash Lite Image の「物」の参照。**絵柄（スタイル）の参照は Gemini 3 Pro Image だけで、最大3枚**。公式ページのモデルごとの表は文字が崩れていて、列の読み取りは推定）。2:3・3:4 などの比も選べる | **無料枠は使わない**（入力と出力が Google の改良に使われ、人が読むこともある）。出力には SynthID の透かしが入る。Gemini API の規約に補償はない |
| 可 | OpenAI（gpt-image） | 出力の権利は利用者に譲渡される | 補償（Copyright Shield）は、出力を直したり他と組み合わせたりすると対象外。札の絵では当てにしない。公式の規約ページは読めなかった（403） |
| 使わない | Midjourney | Disney と Universal から著作権侵害で訴えられている（2025-06-11 提訴）。利用者を補償する条項が見つからない | ― |
| 使わない | FLUX.1 [dev] を手元で動かす | ライセンスがモデルの使い方を非商用に限っている | 商用ライセンスが別に要る |
| 使わない | 自作の追加学習（LoRA） | 文化庁の「考え方」（概要 p.7）では、特定の作家の作品に共通する創作的表現を出力させる目的の追加学習は、30条の4が適用されない（享受目的が併存する）とされる。作風（アイデア）が共通するだけなら侵害にならないが、アイデアと表現の線引きは個別の判断になる | 使うなら、プロジェクトが権利を持つ絵だけで、作家の書面の同意と契約を前提にする |

### 5.2 プロンプトの型

毎回、同じ部品を同じ順に並べます。雛形は札スタジオの記録欄にも入れます。

```
[主題]   題材（例: 雨上がりの谷川の岩場で、羽を休める山の天狗の気配）。妖怪の姿を描く札は、04 の性格（こわく描かない）に合わせる
[構図]   正方形。主題は中央よりやや下。四辺に余白を残す（窓の線と重ならないように）。背景は単純に
[線と色] やわらかい筆の輪郭線、平らな色面、和紙の地。色は 06 の昼のパレット（例 #d6c47f の田、#63b8b4 の水、#3f5f8f の藍）から
[禁止]   文字・記号・印・判子・お札・護符・紐・袋・鳥居・社殿・灯籠・紋・仏像・神仏の姿・梵字を描かない
```

- **作家名・作品名・キャラクター名は入れません。** 文化庁のチェックリストでは、固有名詞や既存の作品そのものを入力に入れると「依拠性」が認められやすくなるとしています。
- 実在の写真や他の作品を「画像から画像」の入力に使いません。立山曼荼羅の画像を参照に使う場合は、所蔵する館の利用条件を別に確かめます（今回は調べていません）。

### 5.3 絵柄をそろえる方法

1. **基準の絵を3〜4枚決める。** 最初に何枚も作り、PO が「この線・この色」と決めた絵を基準にします。
2. **参照画像として毎回渡す。** Gemini なら、絵柄の参照に対応した Gemini 3 Pro Image で基準の絵を参照に入れます（絵柄の参照は最大3枚）。Firefly ならスタイルの参照を使います。
3. **色は後でそろえる。** 札スタジオで、06 のパレットへの色合わせ（明るさ・彩度・色味の軽い補正）をかけて書き出します。
4. **線は自動で作る。** 白描の線は、全部の札で同じ設定で色の絵から作ります（§6.2）。これで線の太さと濃さがそろいます。
5. シード（乱数の種）を固定しても、同じ絵にはなりません。似た絵になるだけです。

### 5.4 権利と開示

- **AI だけで作った絵は、著作物と認められにくいです。** 文化庁の「AIと著作権に関する考え方について」（令和6年3月）では、簡単な指示だけで AI が作ったものは著作物にあたらないと考えられ、創作的表現に至らないアイデアを示すだけの長いプロンプトや、単なる候補の選択は、創作的寄与の判断に影響しないとしています。一方で、**「創作的表現といえるものを具体的に示す詳細な指示」は寄与と評価される可能性を高め**、生成物を見て指示を直しながら試行を繰り返す場合には著作物性が認められる場合もある、としています（概要 p.8）。**人が「創作的表現といえるような加筆・修正」を加えた部分は、通常、著作物と認められます**（同）。どれも個別の事情で判断されます。
- **既存の作品に似ていないかは、使う側の責任です。** 侵害かどうかは「類似性」と「依拠性」で判断されます。使う前に画像検索で確かめ、生成の記録を残します（チェックリスト 3-1-5・3-1-7）。
- **ストアの開示:** このゲームはまず Web で出すので、すぐに当てはまる開示ルールはありません。Steam は、遊ぶ人が触れる絵を開発中に AI で作って入れる場合（Pre-Generated）に申告を求めます。仮の絵を全部差し替えれば、申告は要らないと読めます。Apple と Google Play には、前もって作った絵を入れるだけのアプリへの開示の義務は見つかりませんでした。
- **クレジットのページで、AI の使い方を正直に書く**ことを勧めます（文化庁 3-1-6 の考え方にも合います）。

### 5.5 アーティストとの分担（推奨）

業界の例:
- Larian は「AI でアイデアを探り、本番は人のコンセプトアートに置き換える」と説明して強い反発を受け、その後コンセプトアートでも生成 AI を使わないと表明しました。
- Clair Obscur: Expedition 33 は、仮の AI テクスチャの一部が発売時に残っていて、Indie Game Awards の受賞が取り消されました（「生成 AI は使っていない」と申告していたため）。

ここから、次の分担を推奨します。

| 役 | 生成 AI | 契約するイラストレーター |
|---|---|---|
| 構図案・色の試し | 使う | ― |
| 試作の仮の絵（12月の契約まで、段階3のテスト） | 使う（「AI・仮」の印を付けて管理） | ― |
| アーティストへの参考資料 | 使う（**参考に限る。模写の元にしない**） | 受け取る |
| 本番の札と曼荼羅のピースの絵 | 使わない | 描く（線画と彩色を別の層で納品してもらう） |

- **アーティストとの契約に、AI を使うかどうかと、使う範囲を書きます。**
- 申告と実態を合わせます。仮の AI の絵は、出す前に確実に全部抜きます（§5.6 の5）。
- アーティストの絵を AI の学習に使う場合は、本人の書面の同意と契約が前提です。

### 5.6 人の確認と監修の流れ

絵にも、文と同じ監修の状態を持たせます（F-71）。絵は文と別に持つので、絵だけ差し替えても文の監修をやり直さずに済みます。

1. **記録を残す:** サービス、モデル、日付、プロンプト、シード、参照画像、手直しの有無。札スタジオの書き出しに含めます（§6.3）。
2. **既存の作品に似ていないか:** 画像検索で確かめます。
3. **民俗と宗教の確認:** §2.2 の表の全項目と、鳥居の形、装束の合わせ（左前は死装束）、意味の通らない文字が残っていないか。立山の監修者に見てもらうのが望ましいです。
4. **監修の状態:** 下書き → 監修中 → 監修済み。由緒に当たる題材と、布橋・姥尊の題材は「了承待ち」の印を付け、了承まで絵を作りません。
5. **仮の絵の管理:** 生成 AI の絵には「AI・仮」の印を付け、公開の前に一覧で全部差し替わったかを確かめます。

遊ぶ人に札の絵を見せるのは、文も絵も「監修済み」のときです。絵がまだなら、和紙に題だけの札（絵の窓が空白の札）を出します。試作のテストでは、テスターに「絵は仮」と伝えます。

### 5.7 PO に決めてほしいこと

| # | 決めること | 提案 |
|---|---|---|
| 1 | 本番の絵を誰が描くか | **A（推奨）:** AI は試作の仮の絵と構図案まで。本番は契約するイラストレーター。／B: AI の絵を土台に、アーティストが手で描き直す（手で加えた部分は権利が付く。反発の危険は残る）。／C: AI の絵をそのまま本番に（勧めない） |
| 2 | 試作で使う生成 AI | Adobe Firefly の自社モデル。足りなければ Gemini API の有料枠 |
| 3 | 札の枠の意匠 | かるた寄り（縁の帯が太く、題箋が大きい）か、花札寄り（縁が細く、絵が札いっぱい）か。札スタジオで両方を並べて見て決める。**花札寄りは絵の窓が 1:1 でなくなり（約 0.70）、#4 の「ピースと絵を共有する」と両立しない**（花札寄りにするなら、ピース用の正方形の切り抜きを別に書き出す） |
| 4 | 曼荼羅のピースと札の絵を同じにするか | 同じにする（窓を 1:1 にして使い回す） |
| 5 | 札の絵の段階をピースの状態に合わせるか | 合わせる（§3.1） |
| 6 | クレジットのページで AI の方針を公開するか | 公開する |
| 7 | 札に番号（「札①」）を出すか | F-43 は「題・本文・出典だけ」。今の `cardHtml` は番号を出している。**提案: 3D の札には描かない。札の下の HTML に出すかを決め、F-43 か本書に書く**（札スタジオは「出さない」を初期値にし、切り替えられる） |

---

## 6. 札スタジオの仕様

### 6.1 置き方

- `apps/yokai-game/card-studio.html` と `src/card-studio/` に置きました（試作）。Vite の開発サーバー（`npm run dev`）で `/card-studio.html` を開きます。iPhone などでファイル1つで開くには `npm run build:card`（`vite.card.config.ts`。出力は `dist-card/index.html`、`.gitignore` 済み）を使います。
- **本番には含めません。** `vite.config.ts` の `input` に足さないので、`build`（GitHub Pages に出るもの）にも `build:artifact` にも入りません。公開したくなった場合は、PO に確かめてからここを書き換えます。
- 札の表示は、ゲーム本体と**同じもの**を使います。今は試作なので `src/card-studio/` にあり、§7.1 の `src/yume/card3d/` を作る時にそちらへ移し、スタジオはそれを読むようにします。札の下の本文と出典は、スタジオでもゲームの `cardHtml` をそのまま使っています。
- スタジオの表のシェーダーは、白描の線をその場で出します（書き出しの mask がまだないため）。ゲームに入れる版は mask を読みます（§4.3）。
- 書き出しは手元のファイルだけです（サーバーには保存しません）。

### 6.2 画面と機能

PC では3列、スマホの縦画面では「試写」を上、操作を下の引き出しにします。スマホの実機でも開けるように、`npm run dev`（`--host`）のまま同じネットワークから開きます。傾きセンサーを試すには HTTPS が要ります（iOS の決まり）。

| 区画 | 機能 |
|---|---|
| 左: 素材 | ① 画像をドラッグ＆ドロップで読み込む（PNG・JPEG・WebP）。② 1:1 の窓で切り抜く（拡大・位置合わせ）。③ 色合わせ（明るさ・彩度・色味。06 のパレットの見本を横に出す）。④ 白描の線の自動生成（ぼかし・線の検出・しきい値・線の太さを調整）。⑤ 手描きの線画への差し替え。⑥ 箔の範囲を塗る（ブラシと消しゴム。マスクの G） |
| 中: 試写 | ⑦ 3D の札を表示（ゲームと同じ素材）。⑧ 段階の切り替え（空白・白描・彩色・金）と、段階の演出の再生。⑨ 時間帯（昼・夕・夜。`palette.ts` を使う）。⑩ 傾き（マウス、スマホの傾き）。⑪ 枠の意匠の切り替え（かるた寄り・花札寄り）。⑫ 題の文字を入れて確かめる。⑬ 曼荼羅のピースの大きさ（56×54）での見え方。⑭ 描画命令の数と fps の表示 |
| 右: 記録と確認 | ⑮ 作り方の記録（作り手の種類＝AI・仮／アーティスト、サービス、モデル、プロンプト、シード、参照画像、日付、手直しの有無）。⑯ 確認欄（§2.2 の項目、既存の作品に似ていない、文字が残っていない）。⑰ 監修の状態（下書き・監修中・監修済み、了承待ちの印）。⑱ 書き出し |

確認欄が埋まっていなくても書き出しはできます。ただし、監修の状態は「下書き」のままになります。

### 6.3 書き出す形式

札ごとに1つのフォルダにします。

```
apps/yokai-game/art-src/cards/kozobo-1/      ← 原本（リポジトリに入れるかは PO と決める）
  original.png                               ← 生成した原本（Firefly なら来歴情報つき）
apps/yokai-game/public/cards/kozobo-1/       ← ゲームが読むもの
  color.webp       1024×1024  sRGB  彩色の絵（切り抜き・色合わせ済み）
  mask.png         1024×1024  R=白描の線 G=箔の範囲 B=予備
  thumb-line.webp  256×256    曼荼羅帳の白描の小さい絵
  thumb-color.webp 256×256    曼荼羅帳の彩色の小さい絵
  (color.ktx2 / mask.ktx2    §4.8 で KTX2 に移った後)
src/data/card-art.json                       ← 全札の絵の記録（下）
```

```jsonc
// src/data/card-art.json（案）
{
  "version": 1,
  "arts": [
    {
      "id": "kozobo-1",
      "cardIds": ["kozobo-1"],          // 結びつく伝承の札
      "pieceId": "fumoto-kozobo",       // 結びつく曼荼羅のピース（あれば）
      "files": { "color": "cards/kozobo-1/color.webp", "mask": "cards/kozobo-1/mask.png",
                 "thumbLine": "cards/kozobo-1/thumb-line.webp", "thumbColor": "cards/kozobo-1/thumb-color.webp" },
      "crop": {                          // 原本の中の切り抜き。原本の UV（0〜1、左下が 0,0）
        "corners": [[0.08, 0.12], [0.92, 0.12], [0.92, 0.96], [0.08, 0.96]],  // 窓の四隅（左下・右下・右上・左上）
        "rotation": 0                    // 度（＋で絵が左回り）。回転があると軸に沿った x,y,w,h では表せない
      },
      "look": { "frame": "karuta", "lineThreshold": 0.32, "lineWidth": 1.4, "foil": 0.18 },
      "review": "下書き",                // 02 F-71 と同じ ReviewState
      "needsConsent": false,             // 了承待ちの印（F-71）
      "checks": { "notOfuda": false, "noDeity": false, "noText": false, "notSimilar": false },
      "provenance": {
        "maker": "ai-placeholder",       // "ai-placeholder" | "artist" | "artist-from-ai"
        "service": "Adobe Firefly", "model": "", "prompt": "", "seed": null,
        "refs": [], "date": "2026-10-17", "editedByHand": false, "by": ""
      }
    }
  ]
}
```

- 札スタジオの「設定を JSON でコピー」は、`crop`（上と同じ形）と `uv` を出します。`uv.matrix` は「窓の UV（0〜1）→ 原本の UV」の 3×3（three の `Matrix3.elements` と同じ列優先）で、組み込みの素材なら `texture.matrixAutoUpdate = false; texture.matrix.fromArray(matrix)` で同じ切り抜きになります（花札寄り・縦長・横長・回転 30° で、窓の端が `crop.corners` に当たることを three r186 で確かめた）。`uv.offset`・`repeat`・`rotation`・`center` は、窓の座標を縦横比で直した a = ((u−0.5)×windowAspect＋0.5, v) に掛けるスタジオのシェーダー用の値で、窓が 1:1（かるた寄り）の時だけ `matrix` と同じになります。
- `src/core/story/types.ts` に `CardArt` の型を足します。`LoreCard` には手を入れません（絵と文を分けるため）。
- 今の `ReviewState` は「下書き・監修中・監修済み」の3つです。了承待ちは F-71 のとおり「別の印」なので、`needsConsent` で持ちます。
- **圧縮のスクリプト:** `npm run make:cards`（`scripts/make-cards.mjs`）を足します。`public/cards/*/` の PNG・WebP から、`ktx create`（UASTC か ETC1S）で `.ktx2` を作ります。上下の反転もここでします。KTX2 に移るまでは要りません。

### 6.4 既存の道具を使わない理由

| 道具 | 平らな札には |
|---|---|
| Blender | 要らない。1枚の板には UV の仕事がない。曲がった物（巻物など）を作るときに使う |
| three.js editor | 要らない。本作のシェーダーの札は見られない。UV を編集する画面もない |
| Meshy・Tripo・StableProjectorz | 要らない。立体に絵を付ける道具。立体の小物を作るときの候補 |
| nanDECK・CIDEr | 要らない。紙の札を刷る道具。文字は実行時に描くので出番がない |

見た範囲では、「切り抜き・質感・段階の切り替え・3D で傾ける・書き出し」を1つにした既存の道具は見つかりませんでした。

### 6.5 作る順番と見込み

1. ゲーム本体の「札の表示」（`src/yume/card3d/`）を作る。仮の絵 2〜3 枚の `card-art.json` を手で書いて試す。**見込み 1〜2 日**
2. PO が生成画像を何枚も試し始めた時点で、札スタジオを作る。札の表示を使い回すので、追加は小さい。**見込み 2〜3 日**
3. 実機で fps とメモリを見て、必要なら `make:cards` と KTX2 に移る。

（日数は見込みで、確かめた数字ではありません。）

---

## 7. 3D の札をゲームに組み込む手順

### 7.1 作るもの

```
src/yume/card3d/
  geometry.ts   形（§4.1 の makeCardGeometry）
  material.ts   表・裏・縁の素材（§4.4）、題の CanvasTexture
  card-view.ts  CardView: 札だけの場面とカメラ、開く・閉じる・段階の演出、ばねと傾き、dispose
  art-store.ts  card-art.json を読み、絵を1枚ずつ読み込む・片付ける
```

`CardView` の形（案）:

```ts
export class CardView {
  constructor(renderer: THREE.WebGLRenderer)
  open(opts: { card: LoreCard; art?: CardArt; stage: PieceState; palette: ScenePalette; reveal?: PieceState }): Promise<void>
  setStage(stage: PieceState, animate: boolean): void
  close(): Promise<void>
  update(dt: number): void          // main.ts の毎フレームから呼ぶ
  render(): void                    // composer の後に重ねて描く（§4.7）
  readonly isOpen: boolean
}
```

### 7.2 今の HTML の札との置き換え

1. **会話の後の「伝承の札」**（`DialogueView` の `beat.kind === 'card'`）:
   - 3D の札を画面の上側に出し、その下に今の `cardHtml` の題・本文・出典を出します。「札をしまう」ボタンも今のままです。
   - 題は3D の札にも HTML にも出します。HTML 側は読み上げのためです。
   - 3D の canvas の札は `aria-hidden` にし、ダイアログの役割（`role="dialog"`）は HTML 側に残します。
2. **3D にしない場合を残します:** 「軽い」画質、WebGL の札の準備に失敗した時、絵がまだ監修済みでない時は、今の HTML の和紙のカードをそのまま出します。
3. **曼荼羅帳**（`MandalaView`）:
   - 帳の一覧は**今の SVG のまま**にします。24 のピースを 3D にはしません（描画命令とメモリのため）。
   - ピースの中の絵は、今の仮の白描（`art.ts`）から、書き出した小さい絵（`thumb-line` / `thumb-color`）の `<image>` に替えます。金の縁取りは今の SVG の線のままです。
   - ピースをタップした時の詳しい表示（`openPiece`）で、3D の札を1枚だけ出します。「札を読む」で、札の下に本文と出典を出します。
4. **段階が上がった瞬間**（現地で彩色・語り返しで金）:
   - 曼荼羅帳を開いて、そのピースの 3D の札を出し、`setStage` で演出します（§3.1）。
5. **データ:** `story-pack.ts` に `card-art.json` を足します。札とピースから絵を引けるようにします。

### 7.3 守ること

- 雷鳥の札と、立山権現・阿弥陀如来の札は、同じ頁・同じ手札・同じ絵解きカードに入れません（04 §3.5）。3D の札を並べて見せる場面を作る時も同じです。
- 札の絵柄は、将来の「絵札マーカー」（01）にもなりえます。その場合は、模様の細かさ（画像マーカーとして読み取れること）も要件に加えます。今回は要件にしません。
- 出典表示（右下）は、札を開いても隠しません（今の `.yh-credit` のまま）。

---

## 8. 出典

調査担当が実際に開いて確かめたページです。

**three.js と画像の扱い**
- https://threejs.org/docs/pages/ExtrudeGeometry.html
- https://threejs.org/manual/pages/color-management.html
- https://threejs.org/manual/pages/canvas-textures.html
- https://threejs.org/docs/pages/KTX2Loader.html
- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/docs/pages/DecalGeometry.html
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/geometries/ShapeGeometry.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/geometries/PlaneGeometry.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/textures/Texture.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/materials/MeshPhysicalMaterial.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/loaders/KTX2Loader.js
- https://github.com/mrdoob/three.js/tree/dev/editor/js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/editor/js/Menubar.File.js
- https://discourse.threejs.org/t/uv-map-difference-between-plane-and-shape-geometry/56132
- https://discourse.threejs.org/t/texture-aspect-ratio-repeat/60591
- https://iquilezles.org/articles/distfunctions2d/
- https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static
- https://bugs.webkit.org/show_bug.cgi?id=221399
- https://github.com/simeydotme/pokemon-cards-css
- https://github.com/marcofugaro/three-projected-material
- https://github.com/KhronosGroup/KTX-Software
- https://github.com/BinomialLLC/basis_universal
- https://gltf-transform.dev/cli

**既存の道具**
- https://docs.blender.org/manual/en/latest/modeling/meshes/editing/uv.html
- https://docs.blender.org/manual/en/5.3/addons/scene_gltf2.html
- https://docs.meshy.ai/en/webapp/guides/3d-model/ai-texturing
- https://docs.scenario.com/get-started/generation/3d-model-generation/3d-model-generation-tripo-ai （Tripo の第三者の資料）
- https://stableprojectorz.com/
- https://www.nandeck.com/
- https://github.com/oatear/cider
- https://github.com/Tencent-Hunyuan/Hunyuan3D-2 ・ https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2/main/LICENSE （立体に絵を付ける道具の参考。使用許諾が EU・英国・韓国を除き、月間利用者 100万人超は別許諾）

**生成 AI の条件**
- https://www.adobe.com/fireflyapproach
- https://www.adobe.com/legal/licenses-terms/adobe-gen-ai-user-guidelines.html
- https://www.adobe.com/products/firefly/enterprise.html
- https://www.adobe.com/products/firefly/features/custom-models.html
- https://www.mikechambers.com/blog/post/2025-09-24-generative-ai-commercial-safety/
- https://www.creativebloq.com/ai/adobe-supports-third-party-generators
- https://ai.google.dev/gemini-api/terms （2026-04-28 更新の版）
- https://ai.google.dev/gemini-api/docs/image-generation
- https://cloud.google.com/archive/terms/generative-ai-indemnified-services-20260422
- https://open.windriver.com/info/uni-license-list/licenses/openai-tou-20241211.html （OpenAI の規約の第三者による写し。公式は 403 で読めず）
- https://conductatlas.com/platform/openai/openai-service-terms/api-and-enterprise-ip-indemnification-carve-outs/
- https://www.proskauer.com/blog/openais-copyright-shield-broadens-user-ip-indemnities-for-ai-created-content
- https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md
- https://huggingface.co/black-forest-labs/FLUX.1-schnell
- https://bfl.ai/legal/developer-terms-of-service
- https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md
- https://stability.ai/license
- https://conductatlas.com/platform/midjourney/midjourney-terms-of-service/limitation-of-liability-and-indemnification/
- https://www.thefashionlaw.com/disney-and-universal-sue-midjourney-over-ai-copyright-free-riding-scheme/
- https://www.clearygottlieb.com/news-and-insights/publication-listing/uk-high-court-issues-landmark-ruling-in-getty-images-v-stability-ai

**日本の法律と指針・ストア**
- https://www.bunka.go.jp/seisaku/chosakuken/aiandcopyright.html
- https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/pdf/94037901_01.pdf （AIと著作権に関する考え方について）
- https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/pdf/94057901_01.pdf （同 概要）
- https://www.bunka.go.jp/seisaku/chosakuken/pdf/94097701_01.pdf （チェックリスト＆ガイダンス）
- https://partner.steamgames.com/doc/gettingstarted/contentsurvey
- https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use
- https://developer.apple.com/app-store/review/guidelines/ （後半の約14,000字は読めていない）
- https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai
- https://support.google.com/googleplay/android-developer/answer/14094294?hl=en

**業界の例**
- https://www.videogameschronicle.com/news/holy-f-guys-were-not-replacing-artists-larian-boss-responds-to-ai-backlash
- https://hitmarker.net/news/larian-confirms-that-it-will-no-longer-use-generative-ai-for-divinity-concept-art-and-writing-following-backlash-1615314
- https://www.malaymail.com/news/tech-gadgets/2025/12/21/indie-game-awards-rescinds-honours-from-clair-obscur-expedition-33-for-genai-use/202718
- https://gamebiz.jp/news/432929 （CESA の調査）
- https://www.j-cast.com/2025/12/11510082.html （サクラクレパスの件）

**検索結果の要約だけで確かめたもの**（ページそのものは開けていない）
- https://openai.com/policies/service-terms ・ https://help.openai.com/en/articles/8912793-c2pa-in-chatgpt-images （403）
- https://docs.midjourney.com/docs/terms-of-service ・ https://docs.midjourney.com/docs/seeds （403。公式文の抜粋）
- https://discourse.threejs.org/t/ktx-astc-etc-support/50815 （iPhone の ETC1 の報告）
- https://developer.mozilla.org/docs/Web/API/CSS_Font_Loading_API
- https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets

**手元で確かめたもの**（`apps/yokai-game/node_modules/three/` の r186）
- `src/geometries/ExtrudeGeometry.js`（groups の並び、77行の computeVertexNormals、WorldUVGenerator）
- `examples/jsm/geometries/RoundedBoxGeometry.js`（getUv）
- `src/textures/CompressedTexture.js`（67行 flipY=false）
- `src/math/MathUtils.js`（damp）
- `examples/jsm/libs/basis/`（basis_transcoder.js・.wasm）
- 動かしたスクリプト: `/tmp/claude-0/-home-user-ar-project/2bf84dd3-8b78-5941-8561-d739ec1d546b/scratchpad/dev/card-geo-check.mjs`（§4.1 の旧案の形）、`/tmp/claude-0/-home-user-ar-project/2bf84dd3-8b78-5941-8561-d739ec1d546b/scratchpad/dev/final-card/geo.mjs`（§4.1 の今の形）、`/tmp/claude-0/-home-user-ar-project/2bf84dd3-8b78-5941-8561-d739ec1d546b/scratchpad/dev/uvcheck.mjs`（ShapeGeometry の UV）、`/tmp/claude-0/-home-user-ar-project/2bf84dd3-8b78-5941-8561-d739ec1d546b/scratchpad/dev/final-card/uvcheck.mjs`（書き出しの `uv.matrix`）
- 文化庁「考え方」の概要（94057901_01.pdf）p.7（作風の模倣と追加的な学習）・p.8（指示の具体性と加筆・修正）を、本文を写したテキストで読み直した
