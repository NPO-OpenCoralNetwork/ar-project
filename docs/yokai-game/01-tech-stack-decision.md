# 技術スタック検討: three.js（Web）か Unity か

> 作成日: 2026-10-16 ／ ステータス: **提案（未決定）**
> 前提: Claude Code を使ったバイブコーディングで開発する。PC・スマホの両方で遊べるようにし、将来は AR グラスにも対応したい。

## 結論（提案）

**three.js（TypeScript）を使った Web ファーストで始める。**
AR は「対応端末でだけ有効になる追加機能」として段階的に載せる。
Unity は捨てるのではなく、**ネイティブでしか実現できない要件が「コア体験に必須」と分かった時点で移る出口**として残しておく。

理由は3つ。

1. **AI と一緒に作る開発サイクルが圧倒的に速い。** Web はすべてテキスト（コード）なので、Claude が書く→ブラウザで起動→スクリーンショットで確認→直す、を自分だけで回せる。URL を開けば、スマホ実機でもすぐ確かめられる。
2. **このゲームの核は「歩く・出会う・話す」で、AR は見せ方の一つ。** ポケモンGOでも、多くのプレイヤーは AR をオフにして遊んでいる（Niantic の CTO 自身の発言）。高精度の AR は、最初の検証には必要ない。
3. **Unity にしても、AR グラスへの対応は保証されない。** Snap Specs は Unity 非対応で、Lens Studio（JS/TS）のみ。Meta はスマホアプリ向け SDK で、ストアでの公開経路もまだない。Android XR のグラス向けライブラリは alpha 段階。どの方式でもグラスは「別クライアント」になるので、ゲームのロジックとデータを分けておく設計のほうが効く。

## 比較表

| 観点 | three.js（Web） | Unity + AR Foundation |
|---|---|---|
| Claude Code との相性 | ◎ コードもアセット定義もテキスト。Claude がブラウザ起動・スクショ・テストまで自分で回せる（クラウド環境でも可） | ○ 2026年9月に公式 Claude Code プラグインが出た（29スキル）。MCP サーバー・CLI は無料だがベータ。**AR/XR 向けのスキルはない**。Unity エディタを手元の PC で起動しておく必要があり、Play モードでの確認は実験的パッケージ（com.unity.pipeline）経由。AR の確認には実機ビルドが必要 |
| PC で遊ぶ | ◎ 同じ URL がそのまま動く | △ 別ビルド。WebGL ビルドは重く、スマホブラウザでは弱い |
| Android の AR | ◎ WebXR（ARCore）: 平面への配置・アンカー・奥行き・光源推定 | ◎ |
| iPhone の AR | △ Safari は WebXR AR 非対応（2026年9月時点）。回避策あり（下の段階表） | ◎ ARKit |
| 実在の場所への高精度な配置（鳥居の上に妖怪、など） | ✕ ARCore Geospatial API は Web 版がない。GPS＋方位センサーだと数m〜十数mずれる | ◎ Geospatial API が使える |
| バックグラウンドで歩数・位置を記録 | ✕ iOS の Web アプリは表示中しか位置を取れない | ◎ |
| 配布 | ◎ URL を送るだけ、審査なし。ストア版は後でネイティブの殻（Capacitor など）で包む | ○ App Store / Google Play |
| 端末内 LLM | ○ WebGPU で Gemma 4 E2B などがブラウザで動く（iOS も Safari 26 から WebGPU が標準で有効）。ただし約2GB のダウンロード | ○ ネイティブのプラグインが必要 |
| AR グラス | △ WebXR（Android XR のデモあり）。Snap は Lens Studio が TS なのでロジックを流用しやすい | △ Android XR ヘッドセットは対応、グラスは未確定。Snap は非対応 |
| ベンダーに縛られにくいか | ◎ 標準技術と OSS が中心 | ○ Unity 本体は安定、ただし AI 機能はベータ・クラウド連携が前提 |

## AR の段階設計（three.js 案）

| 段階 | 体験 | 技術 | 対応端末 |
|---|---|---|---|
| 0 | カメラなし。和風の背景イラストの中に妖怪が出る（ポケモンGOの AR オフ相当） | three.js | PC・全スマホ |
| 1 | カメラ映像に妖怪を重ね、スマホを向けると追従する（3軸の回転だけ。初代ポケモンGOの AR 相当） | getUserMedia（カメラ）＋ DeviceOrientation（傾き） | 全スマホ（iPhone 含む） |
| 2 | 地面に妖怪が立ち、周りを歩いて回り込める（位置と向きの6軸トラッキング） | Android: WebXR ／ iPhone: 8th Wall エンジンの SLAM（無料のバイナリ、※）または Needle Go（App Clip 経由の WebXR。Needle Engine 本体の商用利用は有料） | 対応スマホ |
| 3 | 実在の鳥居や岩の上など、決まった場所に正確に出る | ネイティブ（ARCore Geospatial）。Web では、提携先に設置する「絵札マーカー」（画像マーカー）で代用する | 将来 |

> ※ 8th Wall の注意点: 枠組み部分（three.js 連携や画像マーカーなど）は MIT ライセンスの OSS だが、空間を認識する SLAM の部分は**クローズドソースのバイナリ**。「より大きな製品の一部として」なら商用でも無料で使えるが、改変はできない。公式の保守は2026年3月までとされているので、**iOS の更新で動かなくなっても誰も直せない**おそれがある。段階2はあくまで「おまけ」と位置づけ、ゲームの成立がこれに依存しないようにする。

> 段階3の代替案「絵札マーカー」（2026-10-16 に「御札マーカー」から改名）: 提携した自治体や神社の案内板に、オリジナルの絵札デザイン（お札・護符には似せない）を画像マーカーとして置く。それを読み取ると、その場所にぴったり妖怪が現れる。技術的な制約を、地域連携の仕掛け（AR City Vision の枠組み）に変えられる。

## アーキテクチャ方針（どの方式を選んでも効く部分）

```
┌──────────── 共通コア（TypeScript・描画に依存しない） ────────────┐
│ 妖怪データ / 伝承テキスト / クエスト・関係値 / 出現ルール / 会話API │
└───────────────────────────────────────────────────────────────┘
      │                │                   │                │
  Web クライアント   ストア版の殻         グラス版           サーバー
  three.js +        Capacitor など       WebXR / Snap Lens  会話（LLM）
  MapLibre（地図）   （背景位置・通知）    / 音声中心          ・配置管理
```

- 妖怪や伝承は**データ（JSON など）として持ち**、描画コードとは分ける。これがグラス・ネイティブ・他地域への展開でそのまま使い回せる資産になる。
- 地図は MapLibre GL JS ＋ OpenStreetMap 系のタイルに、自前の和風スタイルを当てる。妖怪は three.js のカスタムレイヤーで描く。
- 画風は、**2.5D の「切り絵／紙芝居」調**（イラストを板として立体空間に並べる）が有力。3D モデルを作るコストが小さく、AR でも映え、和の雰囲気とも合う。イメージボードで要検討。

## Unity に切り替える判断基準（出口条件）

次のどれかが「最初のリリースに必須」と決まったら、Unity（またはネイティブ）を再検討する。

- 実在の場所への高精度な配置（Geospatial）がコア体験になった
- 重い3D表現（広い3D空間、大量のアニメーションするキャラクター）が必要になった
- Unity に慣れたメンバーが加わり、エディタ上での制作の方が速くなった
- iPhone での6軸 AR（段階2）が Web の回避策では品質不足と分かった

※ バックグラウンドの位置記録やプッシュ通知だけなら、Unity にしなくても、Capacitor などの殻とネイティブプラグインで足せる見込み。

## 検証スパイク（1〜2週間）で確かめること

| # | 検証項目 | 合格ライン（仮） |
|---|---|---|
| 1 | 地図＋GPS: 歩くと妖怪の気配が出る | iPhone と Android の両方で位置が取れる。ホーム画面に追加した Web アプリでも動く |
| 2 | 段階1 AR（カメラ＋傾き） | 中位機種で 30fps 以上 |
| 3 | 段階2 AR: Android の WebXR と iPhone の 8th Wall SLAM | 妖怪が地面に安定して立つ。30分あたりの電池消費を計測する |
| 4 | 会話: クラウド LLM を基本にし、端末内 Gemma 4 も試す | 応答 2秒以内。端末内版のダウンロード量と速度を把握する |

## 出典

- Safari の WebXR 対応状況: https://xrdoctors.pro/blog/webxr-on-ios-what-actually-works ／ https://threejsresources.com/webxr/browsers
- Unity 公式 MCP: https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.9/manual/integration/unity-mcp-landing.html ／ https://unity.com/blog/unity-ai-mcp-how-to-get-started
- Unity 公式 Claude Code プラグイン: https://unity.com/blog/unity-plugin-for-claude-code ／ 料金（MCP・CLI 無料）: https://unity.com/features/ai ／ Unity CLI: https://unity.com/blog/meet-the-unity-cli
- 8th Wall のオープンソース化: https://8thwall.org/docs/open-source ／ https://github.com/8thwall/8thwall ／ バイナリの利用条件: https://8thwall.org/docs/migration/faq
- Needle Engine の iOS WebXR（App Clip）: https://engine.needle.tools/docs/how-to-guides/xr/ios-webxr-app-clip ／ ライセンス: https://needle.tools/eula
- WebXR と ARCore の機能比較（Geospatial に Web 版がないこと）: https://developers.google.com/ar/develop/webxr/arcore-comparison
- LocAR.js（Web の位置情報 AR）: https://github.com/ar-js-org/locar.js
- WebGPU（iOS 26）: https://appdevelopermagazine.com/webgpu-in-ios-26/
- ブラウザで動く Gemma 4: https://pyimagesearch.com/2026/07/27/running-gemma-4-in-the-browser-with-transformers-js-and-webgpu/
- Android XR の Web 開発: https://developer.android.com/develop/xr/web ／ Project Aura: https://www.xreal.com/blog/project-aura-google-io-2026
- ポケモンGOの AR 利用状況: https://arinsider.co/2019/04/10/the-age-old-question-is-pokemon-go-ar/
- iOS の Web アプリと位置情報: https://developer.apple.com/forums/thread/804381
