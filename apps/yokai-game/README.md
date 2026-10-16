# yokai-game（妖怪ARゲーム 試作）

企画書は [docs/yokai-game](../../docs/yokai-game/README.md)。作る順番は [05 全体整理とロードマップ](../../docs/yokai-game/05-overview-and-roadmap.md) §6。

| ページ | 入口 | 段階 |
|---|---|---|
| 夢の旅（家の3D箱庭・岩峅寺まわり400m四方） | `index.html` → `src/yume/` | 1a（骨組み） |
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
node scripts/fetch-dem.mjs   # 地理院の標高タイル → src/data/iwakuraji-dem.json と tateyama-skyline.json
```

範囲と原点は `scripts/lib/region.mjs`。下見の結果は [docs/yokai-game/research/2026-10-17-iwakuraji-data-survey.md](../../docs/yokai-game/research/2026-10-17-iwakuraji-data-survey.md)。

## データの出典と義務

- 道・川・建物などは © OpenStreetMap contributors（ODbL 1.0）。箱庭用に加工したデータ（`src/data/iwakuraji-osm.json`）は ODbL で提供する。加工の手順は `scripts/` に公開している。画面には出典を常に表示する。
- 標高は国土地理院の標高タイル（基盤地図情報数値標高モデル）を加工して作成。画面に出典を表示する。
- 社寺の名前や由緒は、了承を得るまでデータにも画面にも入れない（`fetch-osm.mjs` で名前を落としている）。境内は「お休みの範囲」として、中には入れない。
