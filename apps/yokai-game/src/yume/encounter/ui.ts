// 出会いと会話の画面（HTML のオーバーレイ）。描画だけを受け持ち、会話の進め方は core/story/dialogue.ts。
//
// - 耳を澄ますボタン（長押し。満ちていく輪）
// - 会話の枠（画面の下。名前・本文・選択肢2〜3）。台本の台詞は「台本・創作」の印つきのふつうの枠
// - 伝承の札（和紙のカード。プレイヤーには題・本文・出典だけ。確度・調べ・監修の状態は ?debug のときだけ。台本の枠とは形も書体も分ける。04 §3.2 F-43）
// - 帳（曼荼羅帳の頁と、ほかの頁のタブ。縁帳の中身は ui/cho.ts）。曼荼羅帳は縦長の掛軸（里・麓・山の三段の枠は【創作】の構図）。
//   ピースの表示から稽古（語り返し）を始められる。最初からやり直す（確認つき）
// - 会話の途中の小さな遊び（「払わずに待つ」= ミノモシ番外。04 §3.4。「絵解き鎮め」= 札を話の順に並べる。04 §3.5）。
//   絵解きの並べる遊び（EtokiGame）は、帳の稽古でも渦の演出を外して使う（ui/cho.ts）
//
// 出典表示（右下）は、どの画面を開いても隠さない（.yh-credit を上に重ねる）。
// 閉じている重ね（透明にして指を通しているだけの層）は inert にして、Tab で見えないボタンに入らないようにする（setOpen）。
// 遊びの層を開いている間は、ほかの層を inert にして、Tab が遊びの中に留まるようにする（inertSiblings）。

import type { Beat, Notice } from '../../core/story/dialogue'
import type { EtokiHandCard, EtokiSpec, GameResult, LoreCard, MatsuSpec, MandalaDef, MandalaPieceDef, PieceState } from '../../core/story/types'
import { PIECE_LABEL } from '../../core/story/types'
import { ARTS, artToSvg } from './art'
import { stampDate, stampFrameSvg, stampSvg } from './stamp'

const CSS = /* css */ `
.yh-credit { z-index: 60; }
/* 耳を澄ます */
.ye-listen { position: absolute; left: 50%; bottom: calc(60px + var(--sab)); transform: translate(-50%, 8px); opacity: 0; pointer-events: none; transition: opacity 0.5s, transform 0.5s;
  display: flex; align-items: center; gap: 10px; padding: 8px 18px 8px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--washi); color: var(--ink);
  font: inherit; cursor: pointer; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; -webkit-tap-highlight-color: transparent; min-height: 52px; }
.ye-listen.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.ye-listen:focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 2px; }
.ye-listen svg { width: 36px; height: 36px; flex: none; transform: rotate(-90deg); }
.ye-listen .bg { fill: none; stroke: var(--line); stroke-width: 3; }
.ye-listen .fg { fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset 0.08s linear; }
.ye-listen .ear { fill: var(--ink); transform: rotate(90deg); transform-origin: 18px 18px; font: 600 13px var(--title-font); }
.ye-listen span { white-space: nowrap; }
.ye-listen b { font-family: var(--title-font); font-weight: 600; font-size: 15px; letter-spacing: 0.1em; display: block; text-align: left; }
.ye-listen small { display: block; font-size: 11px; color: var(--ink-soft); text-align: left; margin-top: 1px; }
.ye-listen.held { background: var(--washi-hover, var(--washi)); }
/* 霞が寄る（画面の縁から） */
.ye-mist { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
/* 会話の枠 */
.yd { position: absolute; left: 50%; bottom: calc(14px + var(--sab)); transform: translate(-50%, 12px); width: min(660px, calc(100vw - 24px - var(--sal) - var(--sar))); opacity: 0; pointer-events: none; transition: opacity 0.4s, transform 0.4s; z-index: 30; }
.yd.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
@media (max-width: 1120px) { .yd { bottom: calc(50px + var(--sab)); } }
.yd-box { --dbg: rgba(251, 248, 241, 0.95); --dink: #2a2622; --dsoft: rgba(42, 38, 34, 0.6); --dline: rgba(42, 38, 34, 0.2); --dchoice: rgba(255, 253, 248, 0.9);
  position: relative; background: var(--dbg); color: var(--dink); border: 1px solid var(--dline); border-radius: 14px; padding: 12px 16px 12px; box-shadow: 0 10px 34px rgba(40, 30, 30, 0.16); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.yh[data-time="night"] .yd-box { --dbg: rgba(20, 24, 48, 0.92); --dink: #e8e4f2; --dsoft: rgba(232, 228, 242, 0.64); --dline: rgba(232, 228, 242, 0.2); --dchoice: rgba(40, 46, 82, 0.9); box-shadow: 0 10px 34px rgba(0, 0, 10, 0.4); }
.yh[data-time="dusk"] .yd-box { --dbg: rgba(252, 244, 241, 0.95); --dink: #3e3240; --dsoft: rgba(62, 50, 64, 0.62); --dline: rgba(62, 50, 64, 0.2); }
.yd-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; min-height: 22px; }
.yd-name { font-family: var(--title-font); font-weight: 600; font-size: 15px; letter-spacing: 0.12em; }
.yd-name.companion { font-weight: 500; }
.yd-tag { margin-left: auto; font-size: 10.5px; color: var(--dsoft); border: 1px solid var(--dline); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.yd-text { margin: 0; font-family: var(--title-font); font-size: 16.5px; line-height: 1.85; letter-spacing: 0.04em; min-height: 3.7em; }
.yd-text.notice { font-family: var(--ui-font); font-size: 14px; line-height: 1.7; min-height: 0; padding: 4px 2px 2px; }
.yd-text.notice b { font-family: var(--title-font); font-size: 15.5px; font-weight: 600; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
.yd-text.notice span { color: var(--dsoft); }
.yd-next { position: absolute; right: 14px; bottom: 8px; font-size: 11px; color: var(--dsoft); animation: yd-blink 1.6s ease-in-out infinite; }
@keyframes yd-blink { 50% { opacity: 0.3; } }
.yd-choices { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.yd-choice { font: inherit; font-family: var(--title-font); font-size: 15px; text-align: left; color: var(--dink); background: var(--dchoice); border: 1px solid var(--dline); border-radius: 10px; padding: 9px 12px 9px 30px; min-height: 44px; cursor: pointer; position: relative; -webkit-tap-highlight-color: transparent; }
.yd-choice::before { content: "◇"; position: absolute; left: 11px; top: 50%; transform: translateY(-52%); font-size: 11px; color: var(--dsoft); }
.yd-choice:hover, .yd-choice:focus-visible { border-color: var(--dsoft); outline: none; }
.yd-choice kbd { font: 10px var(--ui-font); color: var(--dsoft); margin-left: 8px; }
/* タッチの端末では、キーボードの番号は出さない */
@media (pointer: coarse) { .yd-choice kbd { display: none; } }
.yd-close { position: absolute; top: -40px; right: 0; font: inherit; font-size: 12px; color: var(--ink); background: var(--washi); border: 1px solid var(--line); border-radius: 999px; padding: 0 12px; min-height: 32px; cursor: pointer; }
/* 払わずに待つ（ミノモシ番外）: 体につく光（光として描くのは【創作】）。払うと増え、待つと離れていく */
.yg { position: absolute; inset: 0; z-index: 38; opacity: 0; pointer-events: none; transition: opacity 0.4s; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.yg.on { opacity: 1; pointer-events: auto; }
.yg-l { position: absolute; left: 0; top: 0; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(255, 250, 214, 0.98) 0 22%, rgba(246, 226, 150, 0.7) 38%, rgba(240, 210, 120, 0) 70%); will-change: transform, opacity; }
.yg-say { position: absolute; left: 50%; top: calc(16px + var(--sat)); transform: translateX(-50%); width: min(460px, calc(100vw - 32px)); background: var(--washi-solid, #faf7f0); color: #2a2622; border: 1px solid rgba(42, 38, 34, 0.2); border-radius: 14px; padding: 10px 14px; box-shadow: 0 8px 26px rgba(30, 20, 10, 0.16); pointer-events: none; }
.yg-head { display: flex; align-items: baseline; gap: 10px; }
.yg-say b { display: block; font-size: 11px; letter-spacing: 0.14em; color: rgba(42, 38, 34, 0.68); font-weight: 500; }
.yg-tag { margin-left: auto; font-size: 10.5px; color: rgba(42, 38, 34, 0.68); border: 1px solid rgba(42, 38, 34, 0.2); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.yg-say p { margin: 2px 0 0; font-family: var(--title-font); font-size: 16px; line-height: 1.7; }
.yg-say small { display: block; margin-top: 4px; font-size: 12px; color: rgba(42, 38, 34, 0.7); }
.yg-say small:empty { display: none; }
/* 待つ輪: 明るい背景でも暗い背景でも見えるよう、和紙の円の上に墨の溝と黄土の弧 */
.yg-wait { position: absolute; left: 50%; bottom: calc(70px + var(--sab)); transform: translateX(-50%); width: 46px; height: 46px; pointer-events: none; }
.yg-wait circle { fill: none; stroke-width: 3; }
.yg-wait .disc { fill: var(--washi-solid, #faf7f0); fill-opacity: 0.92; stroke: rgba(42, 38, 34, 0.2); stroke-width: 1; }
.yg-wait .bg { stroke: rgba(42, 38, 34, 0.18); }
.yg-wait .fg { stroke: #b0742a; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 23px 23px; }
.yg-quit { position: absolute; left: calc(12px + var(--sal)); bottom: calc(16px + var(--sab)); font: inherit; font-size: 12px; color: var(--ink); background: var(--washi); border: 1px solid var(--line); border-radius: 999px; padding: 0 14px; min-height: 44px; cursor: pointer; }
.yg-quit:focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 2px; }
/* 遊びのあいだは、上の題・ボタン・現地の案内を隠す（光に集中できるように） */
.yg-playing .yh-title, .yg-playing .yh-panel, .yg-playing .yh-toast, .yg-playing .ue-cam-btn, .yg-playing .ue-note { visibility: hidden; }
/* 絵解き鎮め: 上から ましろの言葉・題・枠（一 二 三）・手札。墨の渦と藍の帳は後ろに敷く（濃さは渦の強さに合わせて JS が決める） */
.yg.yge { display: flex; flex-direction: column; align-items: center; gap: 10px; overflow: hidden; touch-action: manipulation; color: #2a2622;
  padding: calc(14px + var(--sat)) calc(16px + var(--sar)) calc(70px + var(--sab)) calc(16px + var(--sal)); }
.yge .yg-say { position: relative; left: auto; top: auto; transform: none; flex: none; max-width: 100%; }
/* 言葉が1行でも2行でも、下の枠と札が動かないように、2行分の高さを取っておく */
.yge .yg-say p { min-height: 3.4em; }
.yge .yg-say p.fresh { animation: yge-fresh 0.5s ease-out; }
@keyframes yge-fresh { from { opacity: 0.45; } }
.yge-veil { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 1.4s;
  background: radial-gradient(ellipse 90% 70% at 50% 44%, rgba(40, 50, 128, 0.55), rgba(16, 22, 74, 0.94)); }
.yge-swirl { position: absolute; left: 50%; top: 42%; width: min(128vmin, 900px); aspect-ratio: 1; pointer-events: none; opacity: 0;
  transform: translate(-50%, -50%) scale(var(--s, 1)); transition: opacity 1.4s, transform 1.4s; }
.yge-swirl svg { position: absolute; inset: 0; width: 100%; height: 100%; animation: yge-spin 70s linear infinite; }
.yge-swirl svg.in { animation-duration: 40s; animation-direction: reverse; }
@keyframes yge-spin { to { transform: rotate(360deg); } }
/* 札を置いて手札が減っても、題と枠が動かないように、上に寄せる（背の高い画面では、少し下げる） */
.yge-board { position: relative; flex: 1; min-height: 0; width: min(800px, 100%); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 12px;
  padding-top: clamp(0px, calc((100vh - 640px) / 3), 110px); }
.yge-title { margin: 0; flex: none; text-align: center; font-family: var(--title-font); background: rgba(250, 247, 240, 0.92); border: 1px solid rgba(42, 38, 34, 0.22); border-radius: 12px; padding: 5px 24px 7px; box-shadow: 0 8px 26px rgba(10, 10, 30, 0.22); }
.yge-title small { display: block; font-family: var(--ui-font); font-size: 11px; font-weight: 400; letter-spacing: 0.2em; color: rgba(42, 38, 34, 0.68); }
.yge-title span { display: block; font-size: 27px; font-weight: 600; letter-spacing: 0.24em; line-height: 1.45; margin-right: -0.24em; }
.yge-slots { display: flex; gap: 8px; justify-content: center; width: 100%; margin: 0; padding: 0; list-style: none; flex: none; }
.yge-slot { flex: 1 1 0; min-width: 0; max-width: 170px; min-height: 68px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 5px 6px 7px; text-align: center;
  border: 1.5px dashed rgba(42, 38, 34, 0.5); border-radius: 8px; background: rgba(250, 247, 240, 0.8); transition: background 0.4s, border-color 0.4s; }
.yge-slot b { font-family: var(--title-font); font-size: 13px; font-weight: 600; line-height: 1.3; color: rgba(42, 38, 34, 0.72); }
.yge-slot span { font-family: var(--title-font); font-size: 13.5px; line-height: 1.4; word-break: auto-phrase; text-wrap: balance; }
.yge-slot span:empty::before { content: "　"; }
.yge-slot.next { border-style: solid; border-width: 2px; border-color: #2a2622; background: rgba(250, 247, 240, 0.92); }
.yge-slot.next span { font-family: var(--ui-font); font-size: 11.5px; color: rgba(42, 38, 34, 0.7); }
.yge-slot.filled { border-style: solid; border-color: rgba(43, 36, 32, 0.4); background: linear-gradient(170deg, #fbf6e9, #f3ead6); }
.yge-slot.filled.blank { background: #fff; color: rgba(42, 38, 34, 0.66); }
.yge-slot.just { animation: yge-settle 0.5s ease-out; }
@keyframes yge-settle { from { transform: scale(1.08); } }
.yge-count { margin: 0; flex: none; font-size: 12.5px; letter-spacing: 0.06em; color: #2a2622; background: rgba(250, 247, 240, 0.86); border-radius: 999px; padding: 2px 12px; }
.yge-count b { font-weight: 600; margin-left: 4px; }
/* 手札は1画面に収まる大きさにしてあるが、とても低い画面では手札だけ縦に送れる（影が切れないよう、まわりを空ける） */
.yge-hand { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 420px; min-height: 0; overflow-y: auto; touch-action: pan-y; padding: 4px 10px 16px; }
.yge-card { position: relative; flex: none; display: block; width: 100%; min-height: 60px; margin: 0; padding: 10px 16px 11px; text-align: left; font: inherit; color: #2b2420; cursor: pointer;
  background: linear-gradient(170deg, #fbf6e9, #f3ead6); border: 1px solid rgba(43, 36, 32, 0.3); border-radius: 6px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 4px 10px rgba(20, 16, 30, 0.2);
  -webkit-tap-highlight-color: transparent; transition: transform 0.2s, border-color 0.2s; }
.yge-card b { display: block; font-family: var(--title-font); font-weight: 700; font-size: 17px; line-height: 1.45; letter-spacing: 0.06em; }
/* 本文の中の短いかぎかっこ（keepQuotes の span）は折らないだけにする。ここで block にしないよう、直下の span だけ */
.yge-card > span { display: block; margin-top: 2px; font-family: var(--title-font); font-size: 14px; line-height: 1.6; color: rgba(43, 36, 32, 0.86); text-wrap: pretty; word-break: auto-phrase; }
.yge-card:hover { border-color: rgba(43, 36, 32, 0.6); }
/* キーボードの位置の枠は、キーボードで操作しているときだけ（タッチでは、枠が「選んだ札」に見えてしまう） */
.yge-card:focus-visible { outline: none; }
.yd-keys .yge-card:focus-visible { outline: 2px solid #2b2420; outline-offset: -6px; }
.yge-card.blank { cursor: default; background: #fff; border: 1.5px dashed rgba(43, 36, 32, 0.42); box-shadow: 0 3px 8px rgba(20, 16, 30, 0.12); color: rgba(43, 36, 32, 0.7); }
.yge-card.blank > span { font-family: var(--ui-font); font-size: 12.5px; color: rgba(43, 36, 32, 0.64); }
.yge-card.shake { animation: yge-shake 0.42s ease-in-out; }
@keyframes yge-shake { 20% { transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(2px); } }
/* 広い画面では、手札を横に並べる */
@media (min-width: 700px) {
  .yge-hand { flex-direction: row; justify-content: center; align-items: stretch; max-width: none; overflow: visible; }
  .yge-card { flex: 0 1 240px; padding: 14px 18px 15px; }
  .yge-card:hover { transform: translateY(-2px); }
  .yge-title span { font-size: 32px; }
}
/* 低い画面では、詰める */
@media (max-height: 700px) {
  .yg.yge { gap: 6px; }
  .yge-board { gap: 8px; }
  .yge-title span { font-size: 22px; }
  .yge-slot { min-height: 56px; }
  .yge-card { min-height: 48px; padding: 7px 14px 8px; }
  .yge-card b { font-size: 15.5px; }
  .yge-card > span { font-size: 13px; line-height: 1.5; }
}
/* 横向きのスマホなど: 言葉の下の案内と題の上の小さな字を外す */
@media (max-height: 480px) {
  .yg.yge { padding-top: calc(8px + var(--sat)); padding-bottom: calc(66px + var(--sab)); }
  .yge .yg-say { padding: 6px 12px; }
  .yge .yg-say p { min-height: 0; font-size: 15px; line-height: 1.55; }
  .yge .yg-say small, .yge-title small { display: none; }
  .yge-title { padding: 2px 18px 3px; }
  .yge-title span { font-size: 20px; }
  .yge-slot { min-height: 46px; }
  .yge-board { gap: 6px; }
}
/* 稽古（plain）: 渦と藍の帳の代わりに、机の上の和紙（後ろの帳は隠す）。夜・夕の板の色に関わらず、和紙の地に墨の字 */
.yg.yge.plain { background: radial-gradient(ellipse 120% 90% at 50% 30%, #fbf7ec, #efe6d1 70%, #e6dbc2);
  --washi: rgba(250, 247, 240, 0.92); --washi-solid: #faf7f0; --ink: #2a2622; --ink-soft: rgba(42, 38, 34, 0.62); --line: rgba(42, 38, 34, 0.22); }
.yge.plain .yge-title { box-shadow: 0 4px 14px rgba(60, 40, 20, 0.12); }
/* 動きを減らす設定: 渦は回さず、揺らさない（濃さだけで伝える） */
@media (prefers-reduced-motion: reduce) {
  .yge-swirl svg, .yge-card.shake, .yge-slot.just { animation: none; }
  .yge-swirl { transform: translate(-50%, -50%); }
  .yge-card:hover { transform: none; }
}
/* 伝承の札（和紙のカード） */
.yc-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px 16px calc(56px + var(--sab)); background: rgba(30, 26, 22, 0.28); opacity: 0; pointer-events: none; transition: opacity 0.45s; z-index: 40; }
.yc-wrap.on { opacity: 1; pointer-events: auto; }
.yc-card { --cink: #2b2420; --csoft: rgba(43, 36, 32, 0.62); --cline: rgba(43, 36, 32, 0.28); position: relative; width: min(360px, 100%); max-height: 100%; overflow: auto; color: var(--cink);
  background:
    radial-gradient(circle at 18% 22%, rgba(190, 170, 130, 0.12) 0 1.2px, transparent 1.6px) 0 0 / 23px 19px,
    radial-gradient(circle at 70% 60%, rgba(150, 130, 100, 0.10) 0 0.9px, transparent 1.3px) 0 0 / 17px 29px,
    linear-gradient(170deg, #fbf6e9, #f3ead6);
  border-radius: 4px; padding: 20px 22px 16px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 14px 40px rgba(30, 20, 10, 0.3);
  transform: translateY(10px) rotate(-0.4deg); transition: transform 0.5s; }
.yc-wrap.on .yc-card { transform: none; }
.yc-card::before { content: ""; position: absolute; inset: 7px; border: 1.5px solid var(--cline); border-radius: 2px; pointer-events: none; }
.yc-card::after { content: ""; position: absolute; inset: 11px; border: 0.8px solid var(--cline); border-radius: 1px; pointer-events: none; }
.yc-kind { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.18em; color: var(--csoft); }
.yc-kind .new { margin-left: auto; letter-spacing: 0.05em; color: #7a4a2a; }
.yc-title { margin: 8px 0 10px; font-family: var(--title-font); font-weight: 700; font-size: 19px; line-height: 1.5; letter-spacing: 0.06em; word-break: auto-phrase; text-wrap: balance; }
.yc-nb { display: inline-block; }
.yc-title small { display: block; font-size: 12px; font-weight: 500; color: var(--csoft); letter-spacing: 0.12em; margin-bottom: 2px; }
.yc-body { margin: 0 0 14px; font-family: var(--title-font); font-size: 16px; line-height: 1.9; padding: 10px 12px; border-top: 1px solid var(--cline); border-bottom: 1px solid var(--cline); text-wrap: pretty; word-break: auto-phrase; }
.yc-meta { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; font-size: 12.5px; line-height: 1.5; }
.yc-meta dt { color: var(--csoft); white-space: nowrap; }
.yc-meta dd { margin: 0; }
.yc-meta a { color: inherit; }
.yc-source { margin: 2px 0 0; font-size: 12.5px; color: var(--csoft); letter-spacing: 0.02em; }
.yc-badge { display: inline-block; font-size: 11.5px; padding: 0 7px; border: 1px solid currentColor; border-radius: 3px; }
.yc-badge.ok { color: #2f5a3a; }
.yc-badge.draft { color: #8a5a2a; }
.yc-foot { margin: 12px 0 0; font-size: 11.5px; color: var(--csoft); line-height: 1.6; }
.yc-btn { display: block; width: 100%; margin-top: 12px; font: inherit; font-size: 14px; min-height: 44px; color: var(--cink); background: rgba(255, 255, 255, 0.55); border: 1px solid var(--cline); border-radius: 8px; cursor: pointer; }
.yc-btn:hover, .yc-btn:focus-visible { background: rgba(255, 255, 255, 0.85); outline: none; }
/* 曼荼羅帳 */
.ym { position: absolute; inset: 0; z-index: 35; display: flex; flex-direction: column; align-items: center; padding: calc(10px + var(--sat)) 12px calc(52px + var(--sab)); background: rgba(24, 22, 30, 0.84); opacity: 0; pointer-events: none; transition: opacity 0.4s; color: #f4efe4; }
.ym.on { opacity: 1; pointer-events: auto; }
/* 帳を開いている間は、題と右上の板を隠す（出典表示は隠さない） */
.yh.modal-open .yh-title, .yh.modal-open .yh-panel, .yh.modal-open .yh-toast { visibility: hidden; }
.ym-head { width: min(560px, 100%); display: flex; align-items: center; gap: 10px; min-height: 44px; }
.ym-head h2 { margin: 0; font-family: var(--title-font); font-size: 17px; font-weight: 600; letter-spacing: 0.2em; }
.ym-btn { font: inherit; font-size: 13px; color: #2a2622; background: rgba(250, 247, 240, 0.92); border: 1px solid rgba(42, 38, 34, 0.25); border-radius: 9px; min-height: 44px; padding: 0 12px; cursor: pointer; }
.ym-btn:focus-visible { outline: 2px solid #f4efe4; outline-offset: 2px; }
.ym-btn.close { margin-left: auto; }
/* 帳の頁（曼荼羅帳・縁帳）。タブは本物のボタン（aria-selected）。選んだ頁は、地の色だけでなく下線と字の太さでも分かる */
.ym-tabs { display: flex; gap: 4px; }
.ym-tab { position: relative; font: inherit; font-family: var(--title-font); font-size: 14.5px; letter-spacing: 0.1em; color: #f4efe4; background: transparent; border: 1px solid rgba(244, 239, 228, 0.35);
  border-radius: 9px 9px 0 0; border-bottom-width: 3px; border-bottom-color: transparent; min-height: 44px; min-width: 44px; padding: 0 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ym-tab[aria-selected="true"] { color: #2a2622; background: rgba(250, 247, 240, 0.94); border-color: rgba(250, 247, 240, 0.94); border-bottom-color: #b5523b; font-weight: 600; }
.ym-tab:focus-visible { outline: 2px solid #f4efe4; outline-offset: 2px; }
.ym-tab .ym-tab-new { display: none; position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px; border-radius: 8px; background: #b5523b; color: #fff; font-size: 10px; line-height: 16px; letter-spacing: 0; text-align: center; padding: 0 4px; font-family: var(--ui-font); font-weight: 400; }
.ym-tab.has-new .ym-tab-new { display: block; }
.ym-panel { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; align-items: center; }
.ym-panel[hidden] { display: none; }
/* 読み上げだけの言葉 */
.ym-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ym-body { flex: 1; min-height: 0; width: min(560px, 100%); display: flex; gap: 14px; align-items: stretch; justify-content: center; margin-top: 6px; }
.ym-scroll { height: 100%; max-width: 100%; aspect-ratio: 300 / 760; flex: none; filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.35)); }
.ym-scroll svg { width: 100%; height: 100%; display: block; }
.ym-side { flex: 1; min-width: 0; max-width: 220px; display: flex; flex-direction: column; gap: 10px; font-size: 12px; line-height: 1.6; }
.ym-legend { background: rgba(250, 247, 240, 0.92); color: #2a2622; border-radius: 10px; padding: 10px 12px; }
.ym-legend p { margin: 0 0 6px; }
.ym-legend ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ym-legend li { display: flex; align-items: center; gap: 8px; }
.ym-legend i { width: 18px; height: 14px; border-radius: 3px; flex: none; border: 1px dashed #8a7f70; background: rgba(249, 245, 234, 0.6); }
.ym-legend i.hakubyo { border: 1.2px solid #3a332d; background: #fffdf7; }
.ym-legend i.saishiki { border: 1.2px solid #3a332d; background: linear-gradient(135deg, #e7b98a, #9cc0a8); }
.ym-legend i.kin { border: 2px solid #c9a24a; background: linear-gradient(135deg, #e7b98a, #9cc0a8); }
.ym-note { font-size: 11px; opacity: 0.85; }
/* スマホ幅で出す短い断り書き（【創作】の構図であることは、どの幅でも隠さない） */
.ym-note-sp { display: none; margin: 2px 0 0; width: min(560px, 100%); font-size: 11px; line-height: 1.5; opacity: 0.9; }
.ym-reset { margin-top: auto; }
.ym-back { align-self: stretch; }
.ym-stamps { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin: 6px 0 10px; }
.ym-stamp { margin: 0; text-align: center; font-size: 12px; color: var(--csoft); }
.ym-stamp svg { width: 100%; max-width: 150px; height: auto; display: block; margin: 0 auto 2px; }
.ym-stamp small { font-size: 11px; }
.ym-piece { cursor: pointer; }
.ym-piece:focus-visible rect.frame { stroke: #b0603a; stroke-width: 2; }
.ym-piece.new rect.ring { animation: ym-pulse 1.8s ease-in-out infinite; }
@keyframes ym-pulse { 50% { stroke-opacity: 0.15; } }
@media (prefers-reduced-motion: reduce) { .ym-piece.new rect.ring { animation: none; } }
@media (max-width: 620px) {
  .ym-body { flex-direction: column; align-items: center; gap: 8px; }
  .ym-scroll { height: auto; flex: 1; min-height: 0; width: auto; }
  .ym-side { max-width: none; width: 100%; flex: none; display: grid; grid-template-columns: 1fr auto; gap: 6px 8px; align-items: stretch; }
  .ym-side .ym-legend { grid-row: span 2; }
  .ym-legend { flex: 1; padding: 6px 10px; font-size: 11px; }
  .ym-legend p { display: none; }
  .ym-legend ul { grid-template-columns: 1fr 1fr; gap: 2px 8px; }
  .ym-note { display: none; }
  .ym-note-sp { display: block; }
  .ym-reset, .ym-back { margin-top: 0; align-self: stretch; font-size: 12px; padding: 0 10px; }
}
/* ピースの詳しい表示・確認 */
.ym-pop { position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; padding: 16px 16px calc(56px + var(--sab)); background: rgba(24, 22, 30, 0.4); opacity: 0; pointer-events: none; transition: opacity 0.3s; }
.ym-pop.on { opacity: 1; pointer-events: auto; }
.ym-pop .yc-card { transform: none; }
.ym-pop .art { display: block; margin: 4px auto 8px; width: 120px; height: 160px; }
.ym-pop .art.kin { outline: 3px double #b8913a; outline-offset: 2px; border-radius: 3px; }
.ym-pop .row { display: flex; gap: 8px; }
.ym-pop .row .yc-btn { flex: 1; }
/* 稽古（語り返し）。ピースの表示の中で、いちばん上の大きなボタン */
.ym-pop .yc-btn.keiko { font-family: var(--title-font); font-size: 15px; letter-spacing: 0.06em; background: #fffdf7; border: 1.5px solid rgba(43, 36, 32, 0.55); }
.ym-pop .yc-btn.keiko small { display: block; font-family: var(--ui-font); font-size: 11px; letter-spacing: 0; color: var(--csoft); margin-top: -2px; }
/* 稽古のあとの一言（金の縁取りが入った） */
.ym-notice { margin: 0 0 8px; padding: 6px 10px; font-size: 13.5px; line-height: 1.6; border-left: 3px double #b8913a; background: rgba(255, 253, 247, 0.7); }
.ym-badge { display: none; position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; border-radius: 8px; background: #b5523b; color: #fff; font-size: 10px; line-height: 16px; text-align: center; padding: 0 4px; }
.yh-btn.has-new .ym-badge, .cho-btn.has-new .ym-badge { display: block; }
.yh-btn.mandala { position: relative; font-family: var(--title-font); letter-spacing: 0.08em; }
/* 帳のボタン（どのページでも「帳」の一字。指で押せる大きさ） */
.cho-btn, .yh-panel .yh-btn.cho-btn { position: relative; min-width: 52px; min-height: 44px; font-family: var(--title-font); letter-spacing: 0.08em; font-size: 16px; }
`

let styled = false
export function injectStyle(): void {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = CSS
  document.head.appendChild(s)
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 重ねを開く・閉じる。閉じている間は inert（見えないので、Tab でも読み上げでも入れない） */
function setOpen(e: HTMLElement, on: boolean): void {
  e.classList.toggle('on', on)
  e.inert = !on
}

/**
 * 遊びの層（keep）を開いている間、同じ root のほかの層を inert にする（Tab が遊びの中に留まる）。
 * 出典表示（.yh-credit）は、どの画面でも使えるように残す。自分が inert にした層だけを戻す関数を返す
 */
function inertSiblings(root: HTMLElement, keep: HTMLElement): () => void {
  const changed: HTMLElement[] = []
  for (const c of Array.from(root.children) as HTMLElement[]) {
    if (c === keep || c.inert || c.classList.contains('yh-credit')) continue
    c.inert = true
    changed.push(c)
  }
  return () => {
    for (const c of changed) c.inert = false
  }
}

// ---------------------------------------------------------------- 耳を澄ます

export class ListenButton {
  readonly el: HTMLButtonElement
  private readonly fg: SVGCircleElement
  private readonly sub: HTMLElement
  private heldFlag = false
  private keyHeld = false
  private shown = false
  private static readonly C = 2 * Math.PI * 15

  constructor(root: HTMLElement, onFirstPress: () => void) {
    injectStyle()
    const b = el('button', 'ye-listen')
    b.type = 'button'
    b.setAttribute('aria-label', '耳を澄ます（長押し。その場で止まっていても澄む）')
    b.innerHTML = `
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15"
        stroke-dasharray="${ListenButton.C.toFixed(2)}" stroke-dashoffset="${ListenButton.C.toFixed(2)}"/><text class="ear" x="18" y="22.5" text-anchor="middle">聴</text></svg>
      <span><b>耳を澄ます</b><small>長押し・その場で止まる</small></span>`
    this.fg = b.querySelector('.fg') as SVGCircleElement
    this.sub = b.querySelector('small') as HTMLElement
    const down = (e: PointerEvent) => {
      e.preventDefault()
      b.setPointerCapture?.(e.pointerId)
      this.heldFlag = true
      b.classList.add('held')
      onFirstPress()
    }
    const up = () => {
      this.heldFlag = false
      b.classList.remove('held')
    }
    b.addEventListener('pointerdown', down)
    b.addEventListener('pointerup', up)
    b.addEventListener('pointercancel', up)
    b.addEventListener('lostpointercapture', up)
    b.addEventListener('contextmenu', (e) => e.preventDefault())
    // キーボード: ボタンにフォーカスして Enter・Space を押し続ける
    b.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        this.keyHeld = true
        onFirstPress()
      }
    })
    b.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') this.keyHeld = false
    })
    b.addEventListener('blur', () => (this.keyHeld = false))
    // 出すまでは、Tab で入れない
    b.inert = true
    root.appendChild(b)
    this.el = b
  }

  /** ボタンか、キーボードの Space（画面のどこでも）を押している */
  held(globalSpace: boolean): boolean {
    return this.shown && (this.heldFlag || this.keyHeld || globalSpace)
  }

  show(on: boolean, sub?: string): void {
    if (on !== this.shown) {
      this.shown = on
      setOpen(this.el, on)
      if (!on) {
        this.heldFlag = false
        this.keyHeld = false
        this.el.classList.remove('held')
      }
    }
    if (sub !== undefined && this.sub.textContent !== sub) this.sub.textContent = sub
  }

  setProgress(p: number): void {
    const off = (ListenButton.C * (1 - Math.max(0, Math.min(1, p)))).toFixed(2)
    if (this.fg.getAttribute('stroke-dashoffset') !== off) this.fg.setAttribute('stroke-dashoffset', off)
  }
}

// ---------------------------------------------------------------- 霞

export class MistVeil {
  readonly el: HTMLDivElement
  private color = ''
  private amount = -1

  constructor(root: HTMLElement) {
    injectStyle()
    this.el = el('div', 'ye-mist')
    root.insertBefore(this.el, root.firstChild)
  }

  setColor(hex: string): void {
    if (hex === this.color) return
    this.color = hex
    this.el.style.background = `radial-gradient(ellipse 64% 60% at 50% 50%, ${hex}00 22%, ${hex}66 52%, ${hex}c8 78%, ${hex}f2 100%)`
  }

  set(amount: number): void {
    const a = Math.round(Math.max(0, Math.min(1, amount)) * 100) / 100
    if (a === this.amount) return
    this.amount = a
    this.el.style.opacity = String(a)
  }
}

// ---------------------------------------------------------------- 伝承の札

/** 確度・調べ・監修の状態は作る側の情報なので、URL に ?debug を付けたとき（開発・監修の確認）だけ出す */
const SHOW_PRODUCTION_META = (() => {
  try {
    return new URLSearchParams(window.location.search).has('debug')
  } catch {
    return false
  }
})()

/** 短いかぎかっこ（「ガメ」『民族』など）は、行の途中で折らない */
const keepQuotes = (html: string): string => html.replace(/[「『][^「」『』]{1,10}[」』]/g, (q) => `<span class="yc-nb">${q}</span>`)

/**
 * 札の中身（種類・題・本文・出典）。ゲームでは札の番号（card.number）は出さない（順番が分かってしまう。F-43 は題・本文・出典だけ）。
 * heading: 題の見出しの段（既定 h3。縁帳の頁の中では h5）。number: 番号も出す（札スタジオの見本だけ。PO の判断待ち。09 §5.7-7）
 */
export function cardHtml(card: LoreCard, opts: { first?: boolean; button?: string; heading?: 'h3' | 'h4' | 'h5'; number?: boolean } = {}): string {
  const h = opts.heading ?? 'h3'
  const src = card.source
  const work = `${escapeHtml(src.work)}${src.year ? `（${src.year}）` : ''}`
  const checked = (src.checkedIn ?? [])
    .map((c) => (c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.label)}</a>` : escapeHtml(c.label)))
    .join('、')
  const meta = SHOW_PRODUCTION_META
    ? `
    <dl class="yc-meta">
      <dt>出典</dt><dd>${work}</dd>
      <dt>確度</dt><dd><span class="yc-badge ok">${escapeHtml(card.confidence)}</span></dd>
      <dt>調べ</dt><dd>${escapeHtml(card.researchRef)}${checked ? `（${checked}）` : ''}</dd>
      <dt>監修</dt><dd><span class="yc-badge draft">${escapeHtml(card.review)}</span></dd>
    </dl>`
    : `
    <p class="yc-source">出典 ${work}</p>`
  return `
    <div class="yc-kind"><span>伝承の札</span>${opts.first ? '<span class="new">札が開いた</span>' : ''}</div>
    <${h} class="yc-title">${opts.number && card.number ? `<small>${escapeHtml(card.number)}</small>` : ''}${escapeHtml(card.title)}</${h}>
    <p class="yc-body">${keepQuotes(escapeHtml(card.body))}</p>${meta}
    ${opts.first ? '<p class="yc-foot">札は伝承の記録です。会話の台詞は、本作の創作です。</p>' : ''}
    ${opts.button ? `<button class="yc-btn" type="button">${escapeHtml(opts.button)}</button>` : ''}`
}

// ---------------------------------------------------------------- 会話の枠

export interface DialogueHooks {
  /** 次の拍へ（小さな遊びのあとは、その結果を渡す） */
  next(result?: GameResult): void
  choose(index: number): void
  close(): void
}

export class DialogueView {
  private readonly wrap: HTMLDivElement
  private readonly box: HTMLDivElement
  private readonly nameEl: HTMLElement
  private readonly tagEl: HTMLElement
  private readonly textEl: HTMLElement
  private readonly choicesEl: HTMLElement
  private readonly nextEl: HTMLElement
  private readonly cardWrap: HTMLDivElement
  private readonly cardEl: HTMLDivElement
  private beat: Beat | null = null
  private game: MatsuGame | EtokiGame | null = null
  private readonly root: HTMLElement
  private openFlag = false
  /** 連打で2拍進まないように、表示してから少し待つ */
  private shownAt = 0

  constructor(
    root: HTMLElement,
    private readonly hooks: DialogueHooks,
    /** お知らせに出す妖怪の名前と、遊びの中で鳴らす鈴（なければ鳴らさない） */
    private readonly deps: { yokaiName(id: string): string; sound?: { bell(v?: number): void } },
  ) {
    injectStyle()
    this.root = root
    this.wrap = el('div', 'yd')
    this.wrap.setAttribute('role', 'dialog')
    this.wrap.setAttribute('aria-live', 'polite')
    this.box = el('div', 'yd-box')
    this.nameEl = el('span', 'yd-name')
    this.tagEl = el('span', 'yd-tag')
    const head = el('div', 'yd-head')
    head.append(this.nameEl, this.tagEl)
    this.textEl = el('p', 'yd-text')
    this.choicesEl = el('div', 'yd-choices')
    this.nextEl = el('span', 'yd-next', 'タップで次へ ▼')
    this.box.append(head, this.textEl, this.choicesEl, this.nextEl)
    const close = el('button', 'yd-close', '会話をやめる')
    ;(close as HTMLButtonElement).type = 'button'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      this.hooks.close()
    })
    this.wrap.append(close, this.box)
    this.box.addEventListener('click', () => this.advance())
    this.wrap.inert = true
    root.appendChild(this.wrap)
    // 会話の枠の高さ（選択肢が増えると高くなる）。現地の姿は、この上に出す
    new ResizeObserver(() => root.style.setProperty('--yd-h', `${Math.round(this.wrap.offsetHeight)}px`)).observe(this.wrap)

    this.cardWrap = el('div', 'yc-wrap')
    this.cardEl = el('div', 'yc-card')
    this.cardEl.setAttribute('role', 'dialog')
    this.cardEl.setAttribute('aria-label', '伝承の札')
    this.cardWrap.appendChild(this.cardEl)
    this.cardWrap.inert = true
    root.appendChild(this.cardWrap)

    // キーボードで操作しているか（遊びの札にキーボードの位置の枠を出すのは、そのときだけ）
    window.addEventListener('keydown', () => root.classList.add('yd-keys'), true)
    window.addEventListener('pointerdown', () => root.classList.remove('yd-keys'), true)
    window.addEventListener('keydown', (e) => {
      if (!this.openFlag || e.repeat) return
      // 遊びの間は、Enter・Space を遊びの中のボタン（札・会話をやめる）に任せる。ここで止めると押せなくなる。数字キーも使わない
      if (this.beat?.kind === 'game') return
      if (e.code === 'Enter' || e.code === 'Space') {
        if (this.beat?.kind === 'choices') return
        e.preventDefault()
        this.advance()
      } else if (/^Digit[1-3]$/.test(e.code) && this.beat?.kind === 'choices') {
        const i = Number(e.code.slice(5)) - 1
        const o = this.beat.options[i]
        if (o) this.hooks.choose(o.index)
      } else if (e.code === 'Escape') {
        if (this.beat?.kind === 'card') this.advance()
      }
    })
  }

  get isOpen(): boolean {
    return this.openFlag
  }

  open(label: string): void {
    this.openFlag = true
    this.wrap.setAttribute('aria-label', label)
    setOpen(this.wrap, true)
  }

  close(): void {
    this.openFlag = false
    this.beat = null
    // 遊びを先に閉じる（遊びが inert にしていた層を戻してから、会話の枠と札を閉じる）
    this.game?.dispose()
    this.game = null
    setOpen(this.wrap, false)
    setOpen(this.cardWrap, false)
  }

  private advance(): void {
    if (!this.beat || this.beat.kind === 'choices' || this.beat.kind === 'end' || this.beat.kind === 'game') return
    if (performance.now() - this.shownAt < 220) return
    this.hooks.next()
  }

  show(beat: Beat): void {
    this.beat = beat
    this.shownAt = performance.now()
    if (beat.kind === 'game') {
      setOpen(this.cardWrap, false)
      this.wrap.style.visibility = 'hidden'
      this.game?.dispose()
      const done = (result: GameResult) => {
        this.game = null
        this.wrap.style.visibility = ''
        this.hooks.next(result)
      }
      const quit = () => this.hooks.close()
      this.game =
        beat.game.type === 'etoki'
          ? new EtokiGame(this.root, beat.game, beat.hand ?? [], done, quit, this.deps.sound)
          : new MatsuGame(this.root, beat.game, done, quit)
      return
    }
    if (beat.kind === 'card') {
      this.cardEl.innerHTML = cardHtml(beat.card, { first: beat.first, button: '札をしまう' })
      const btn = this.cardEl.querySelector('.yc-btn') as HTMLButtonElement
      btn.addEventListener('click', () => this.advance())
      setOpen(this.cardWrap, true)
      this.wrap.style.visibility = 'hidden'
      window.setTimeout(() => btn.focus({ preventScroll: true }), 50)
      return
    }
    setOpen(this.cardWrap, false)
    this.wrap.style.visibility = ''
    this.choicesEl.innerHTML = ''
    if (beat.kind === 'line' || beat.kind === 'choices') {
      const line = beat.kind === 'line' ? beat : beat.context
      if (line) {
        this.nameEl.textContent = line.speaker.name
        this.nameEl.className = `yd-name ${line.speaker.role}`
        this.tagEl.textContent = '台本・創作'
        this.tagEl.title = '本作の創作の台詞（伝承の事実は「伝承の札」で示します）'
        this.textEl.className = 'yd-text'
        this.textEl.textContent = line.text
      }
      if (beat.kind === 'choices') {
        beat.options.forEach((o, i) => {
          const b = el('button', 'yd-choice') as HTMLButtonElement
          b.type = 'button'
          b.innerHTML = `${escapeHtml(o.text)}<kbd>${i + 1}</kbd>`
          b.addEventListener('click', (e) => {
            e.stopPropagation()
            this.hooks.choose(o.index)
          })
          this.choicesEl.appendChild(b)
        })
        this.nextEl.style.display = 'none'
        window.setTimeout(() => (this.choicesEl.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true }), 50)
      } else this.nextEl.style.display = ''
      return
    }
    if (beat.kind === 'notice') {
      this.nameEl.textContent = ''
      this.tagEl.textContent = 'おしらせ'
      this.tagEl.title = ''
      this.textEl.className = 'yd-text notice'
      this.textEl.innerHTML = noticeHtml(beat.notice, this.deps.yokaiName)
      this.nextEl.style.display = ''
    }
  }
}

/** 縁の段階ごとの糸の形（04 §3.3。数字では見せない） */
const BOND_THREAD: Record<string, string> = {
  kaomishiri: '縁の糸が一本、結ばれた。',
  najimi: '糸がより合わさって、より糸になった。',
  katarinakama: '糸が組まれて、組紐になった。',
  enishi: '糸に、ほどけない結び目ができた。',
}

function noticeHtml(n: Notice, yokaiName: (id: string) => string): string {
  if (n.type === 'bond') {
    return `<b>${escapeHtml(yokaiName(n.yokai))}と「${escapeHtml(n.label)}」になった</b><span>${escapeHtml(BOND_THREAD[n.level] ?? '')}</span>`
  }
  if (n.type === 'item') {
    return n.action === 'receive'
      ? `<b>${escapeHtml(n.name)}を受け取った</b><span>持ち物は、帳の「縁帳」で見られる。</span>`
      : `<b>${escapeHtml(n.name)}を渡した</b><span>喜んでもらえたみたい。</span>`
  }
  const where = n.travel === 'yume' ? '夢の旅では線（白描）まで。色は、現地でこの地点に立つと入る。' : ''
  return `<b>曼荼羅帳に、${escapeHtml(n.label)}のピースが一つ入った</b><span>${where}右上の「帳」で見られる。</span>`
}

// ---------------------------------------------------------------- 払わずに待つ（ミノモシ番外）

/**
 * 体につくミノモシ（04 §3.4。#17 の伝承は「体につく」「手で払うといっそう増えた」まで）。
 * 光として描くのと、「払わずに待つ」と離れていく遊び方は【創作】。原典に「光」の語はない。
 * 光をタップする（払う）と、その光が分かれて増える。WAIT_SEC のあいだ何もしなければ、光はふわりと離れていく。失敗はない。
 * ましろの台詞は台本（GameSpec.lines）から受け取る。
 */
class MatsuGame {
  private static readonly WAIT_SEC = 5
  private static readonly MAX = 36
  private readonly el: HTMLDivElement
  private readonly say: HTMLElement
  private readonly ring: SVGCircleElement
  private readonly lights: { e: HTMLDivElement; a: number; r: number; w: number; dy: number; born: number }[] = []
  private readonly lines: Required<NonNullable<MatsuSpec['lines']>>
  private tapped = 0
  private calm = 0
  private leaving = -1
  private last = performance.now()
  private raf = 0
  private disposed = false
  /** 動きを減らす設定なら、光は回らず・揺れず、離れるときも動かずに薄れる */
  private readonly motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1
  /** 遊びの間 inert にした、ほかの層を戻す */
  private readonly uninert: () => void

  constructor(
    private readonly root: HTMLElement,
    spec: MatsuSpec,
    private readonly done: (r: GameResult) => void,
    quit: () => void,
  ) {
    // ましろの台詞は台本（game.lines）から。なければ既定
    this.lines = {
      start: spec.lines?.start ?? '光が、くっついてきた……。払わずに、そのまま待ってみよう。',
      brushed: spec.lines?.brushed ?? '……払うと、かえって増えるみたい。',
      brushedAgain: spec.lines?.brushedAgain ?? 'また増えた……。じっと待ってみよう。',
      done: spec.lines?.done ?? '……離れていった。',
    }
    this.el = el('div', 'yg')
    this.el.setAttribute('role', 'application')
    this.el.setAttribute('aria-label', '体についた光。払わずに、そのまま待つ')
    this.say = el(
      'div',
      'yg-say',
      `<div class="yg-head"><b>ましろ</b><span class="yg-tag" title="本作の創作の台詞（伝承の事実は「伝承の札」で示します）">台本・創作</span></div><p aria-live="polite">${escapeHtml(this.lines.start)}</p><small>画面にさわらずに、数秒待つ</small>`,
    )
    const C = 2 * Math.PI * 19
    const wait = el('div', 'yg-wait', `<svg viewBox="0 0 46 46" aria-hidden="true"><circle class="disc" cx="23" cy="23" r="22.5"/><circle class="bg" cx="23" cy="23" r="19"/><circle class="fg" cx="23" cy="23" r="19" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/></svg>`)
    this.ring = wait.querySelector('.fg') as SVGCircleElement
    const quitBtn = el('button', 'yg-quit', '会話をやめる') as HTMLButtonElement
    quitBtn.type = 'button'
    // 払う操作（pointerdown）として数えない
    quitBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
    quitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      quit()
    })
    this.el.append(this.say, wait, quitBtn)
    root.appendChild(this.el)
    root.classList.add('yg-playing')
    this.uninert = inertSiblings(root, this.el)
    for (let i = 0; i < 6; i++) this.spawn(Math.random() * Math.PI * 2, 70 + Math.random() * 70)
    this.el.addEventListener('pointerdown', (e) => this.brush(e))
    // すぐに触れるようにする（次のフレームを待つと、重い端末で最初の一回の「払う」を取りこぼす）。読み直してからにすると、出るときのフェードは残る
    void this.el.offsetWidth
    this.el.classList.add('on')
    const step = (t: number) => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(step)
      const dt = (t - this.last) / 1000
      this.last = t
      // 待つ時間は実時間で数える（重い端末でも5秒で離れる）。タブを離れていた分は数えすぎない
      this.calm += Math.max(0, Math.min(0.25, dt))
      this.tick(Math.max(0, Math.min(0.05, dt)), t)
    }
    this.raf = requestAnimationFrame(step)
  }

  private spawn(a: number, r: number): void {
    if (this.lights.length >= MatsuGame.MAX) return
    const e = el('div', 'yg-l')
    this.el.insertBefore(e, this.say)
    this.lights.push({ e, a, r, w: (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1), dy: Math.random() * Math.PI * 2, born: performance.now() })
  }

  /** 払う: 触れたあたりの光が分かれて増える（#17: 手で払うとより一層増えた） */
  private brush(e: PointerEvent): void {
    if (this.leaving >= 0) return
    this.tapped++
    this.calm = 0
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.46
    const a = Math.atan2(e.clientY - cy, e.clientX - cx)
    const r = Math.min(170, Math.hypot(e.clientX - cx, e.clientY - cy))
    for (let i = 0; i < 2; i++) this.spawn(a + (Math.random() - 0.5) * 0.8, Math.max(40, r + (Math.random() - 0.5) * 40))
    const p = this.say.querySelector('p') as HTMLElement
    p.textContent = this.tapped === 1 ? this.lines.brushed : this.lines.brushedAgain
  }

  private tick(dt: number, t: number): void {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.46
    if (this.leaving < 0) {
      const k = Math.min(1, this.calm / MatsuGame.WAIT_SEC)
      this.ring.style.strokeDashoffset = (2 * Math.PI * 19 * (1 - k)).toFixed(2)
      if (k >= 1) {
        this.leaving = t
        ;(this.say.querySelector('p') as HTMLElement).textContent = this.lines.done
        ;(this.say.querySelector('small') as HTMLElement).textContent = ''
      }
    }
    const away = this.leaving >= 0 ? (t - this.leaving) / 1600 : 0
    const m = this.motion
    for (const l of this.lights) {
      l.a += l.w * dt * m
      const r = l.r + away * 260 * m
      const x = cx + Math.cos(l.a) * r
      const y = cy + Math.sin(l.a) * r * 0.8 + Math.sin(t / 700 + l.dy) * 6 * m - away * 120 * m
      const grow = Math.min(1, (t - l.born) / 300)
      l.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(0.6 + 0.4 * grow).toFixed(2)})`
      l.e.style.opacity = String(Math.max(0, 1 - away) * grow)
    }
    if (away >= 1) {
      const n = this.tapped
      this.dispose()
      this.done({ tapped: n })
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.uninert()
    setOpen(this.el, false)
    this.el.style.pointerEvents = 'none'
    this.root.classList.remove('yg-playing')
    window.setTimeout(() => this.el.remove(), 450)
  }
}

// ---------------------------------------------------------------- 絵解き鎮め

/** 枠の番号（札の番号ではない。札の番号は順番が分かってしまうので出さない） */
const SLOT_LABEL = ['一', '二', '三', '四']

/**
 * 絵解き鎮め（04 §3.5）。手札（調べるで拾った札）を、話の順に1枚ずつ選んで枠に置く。点数・打ち切りはない。
 * 合っていれば鈴が鳴り、墨の渦が1段引く。違えば渦が少し濃くなり、ましろが声をかけるだけ。
 * 拾っていない札・まだ作っていない札は白紙で出て、選べない。その番が来たら少し待って置き、
 * ましろが中身を言わずに先へ進める（拾い漏れの救い）。
 * 墨の渦・藍の帳（場所の畏れ。画面が藍に沈む）は【創作】の演出。spec.plain なら外して、並べるだけ（稽古）にする。
 * ましろの台詞は台本（GameSpec.lines）から受け取る。
 * 会話の中（DialogueView）と、帳の稽古（ui/cho.ts。plain・opts で題の上の字とやめるボタンの字を変える）で使う。
 */
export class EtokiGame {
  /** 白紙の札の番が来てから置くまで（ms） */
  private static readonly BLANK_MS = 900
  /** はじめの言葉・白紙の言葉を読む間（ms） */
  private static readonly READ_MS = 1500
  /** 並べ終えて、ましろの言葉を読んでから閉じるまで（ms） */
  private static readonly DONE_MS = 1800
  /** 違う札を選んだときに、渦が濃くなる分と、その上限 */
  private static readonly WRONG_UP = 0.15
  private static readonly LEVEL_MAX = 1.4
  private readonly el: HTMLDivElement
  private readonly sayText: HTMLElement
  private readonly hint: HTMLElement
  private readonly veil: HTMLElement | null = null
  private readonly swirl: HTMLElement | null = null
  private readonly slots: HTMLElement[] = []
  private readonly count: HTMLElement
  private readonly handEl: HTMLElement
  /** 手札の札（hand の番号 → 札の要素） */
  private readonly cards = new Map<number, HTMLElement>()
  private readonly lines: Required<NonNullable<EtokiSpec['lines']>>
  /** 置いた枚数（次に置くのは hand[placed]） */
  private placed = 0
  private mistakes = 0
  /** 渦の強さ（1 で始まり、置くごとに 1/N 引く。違うと少し濃くなる。並べ終えると 0） */
  private level = 1
  /** 白紙を置くまでの間と、並べ終えたあとは、札を選べない */
  private waiting = false
  private finished = false
  private disposed = false
  private readonly timers = new Set<number>()
  /** 遊びの間 inert にした、ほかの層を戻す（role=dialog。Tab は札と「会話をやめる」の間だけを回る） */
  private readonly uninert: () => void

  constructor(
    private readonly root: HTMLElement,
    spec: EtokiSpec,
    private readonly hand: EtokiHandCard[],
    private readonly done: (r: GameResult) => void,
    quit: () => void,
    private readonly sound?: { bell(v?: number): void },
    /** kicker: 題の上の小さな字（既定は「絵解き鎮め」「絵解きの稽古」）。quitLabel: やめるボタンの字（既定「会話をやめる」） */
    opts: { kicker?: string; quitLabel?: string } = {},
  ) {
    // ましろの台詞は台本（game.lines）から。なければ既定
    this.lines = {
      start: spec.lines?.start ?? '話の順に、札を一枚ずつ選んでいこう。',
      right: spec.lines?.right ?? '……風が、少し弱まった。',
      wrong: spec.lines?.wrong ?? 'ちがうみたい。札の言葉を、よく読んでみよう。',
      wrongAgain: spec.lines?.wrongAgain ?? '話のはじまりは、どの札だろう。',
      blank: spec.lines?.blank ?? 'ここは、まだ拾っていない話。……あとで、拾いに行こう。',
      pending: spec.lines?.pending ?? 'この札は、まだ白紙のまま。',
      done: spec.lines?.done ?? '……風が、やんだ。',
    }
    this.el = el('div', `yg yge${spec.plain ? ' plain' : ''}`)
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-label', `絵解き${spec.plain ? 'の稽古' : '鎮め'}「${spec.title}」。札を話の順に選ぶ`)
    // 確認用（Playwright から読む）: 違えた回数。渦の強さは data-level
    this.el.dataset.mistakes = '0'
    if (!spec.plain) {
      this.veil = el('div', 'yge-veil')
      this.swirl = el('div', 'yge-swirl', `${swirlSvg('out')}${swirlSvg('in')}`)
      this.el.append(this.veil, this.swirl)
    }
    const say = el(
      'div',
      'yg-say',
      `<div class="yg-head"><b>ましろ</b><span class="yg-tag" title="本作の創作の台詞（伝承の事実は「伝承の札」で示します）">台本・創作</span></div><p aria-live="polite">${escapeHtml(this.lines.start)}</p><small>札を選ぶと、つぎの枠に置かれる</small>`,
    )
    this.sayText = say.querySelector('p') as HTMLElement
    this.hint = say.querySelector('small') as HTMLElement
    const board = el('div', 'yge-board')
    const kicker = opts.kicker ?? (spec.plain ? '絵解きの稽古' : '絵解き鎮め')
    const title = el('h2', 'yge-title', `<small>${escapeHtml(kicker)}</small><span>${escapeHtml(spec.title)}</span>`)
    const slotList = el('ol', 'yge-slots')
    slotList.setAttribute('aria-label', '話の順の枠')
    hand.forEach((_, i) => {
      const li = el('li', 'yge-slot', `<b>${SLOT_LABEL[i] ?? String(i + 1)}</b><span></span>`)
      slotList.appendChild(li)
      this.slots.push(li)
    })
    this.count = el('p', 'yge-count')
    this.handEl = el('div', 'yge-hand')
    this.handEl.setAttribute('role', 'group')
    this.handEl.setAttribute('aria-label', '手札')
    // 手札: 持っている札（決まった入れ替え）のあとに白紙。札の番号（card.number）は出さない
    for (const i of handOrder(hand)) {
      const c = hand[i]
      let e: HTMLElement
      if (c.card) {
        const b = el('button', 'yge-card', `<b>${escapeHtml(c.card.title)}</b><span>${keepQuotes(escapeHtml(c.card.body))}</span>`) as HTMLButtonElement
        b.type = 'button'
        b.addEventListener('click', () => this.pick(i))
        e = b
      } else {
        e = el('div', 'yge-card blank', `<b>白紙</b><span>${c.blank === 'pending' ? 'まだ白紙の頁' : 'まだ拾っていない話'}</span>`)
        e.setAttribute('aria-disabled', 'true')
      }
      this.handEl.appendChild(e)
      this.cards.set(i, e)
    }
    board.append(title, slotList, this.count, this.handEl)
    const quitBtn = el('button', 'yg-quit') as HTMLButtonElement
    quitBtn.textContent = opts.quitLabel ?? '会話をやめる'
    quitBtn.type = 'button'
    quitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      quit()
    })
    this.el.append(say, board, quitBtn)
    // Enter を押し続けたとき（キーの連続入力）に、同じ札や、次に位置が移った札を続けて選ばないようにする
    this.el.addEventListener('keydown', (e) => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault()
    })
    root.appendChild(this.el)
    root.classList.add('yg-playing')
    this.uninert = inertSiblings(root, this.el)
    this.refresh()
    // 読み直してから付けると、出るときのフェードと、渦・藍が濃くなっていく様子が残る
    void this.el.offsetWidth
    this.el.classList.add('on')
    this.setLevel(1)
    this.focusFirst()
    // 1枚目が白紙なら、はじめの言葉を読んでから置く
    this.proceed(EtokiGame.READ_MS)
  }

  /** 札を選んだ。次の番の札なら置き、違えば渦が少し濃くなる */
  private pick(i: number): void {
    if (this.disposed || this.waiting || this.finished) return
    if (i === this.placed) {
      this.sound?.bell(0.6)
      this.place(i)
      // 最後の1枚なら、そのまま「風がやんだ」へ
      if (this.placed >= this.hand.length) this.finish(0)
      else {
        this.say(this.lines.right)
        this.proceed(EtokiGame.BLANK_MS)
      }
      return
    }
    this.mistakes++
    this.el.dataset.mistakes = String(this.mistakes)
    this.setLevel(Math.min(EtokiGame.LEVEL_MAX, this.level + EtokiGame.WRONG_UP))
    this.say(this.mistakes === 1 ? this.lines.wrong : this.lines.wrongAgain)
    const e = this.cards.get(i)
    if (e) {
      // 揺れ（動きを減らす設定では CSS が止める）。続けて選んでも揺れるよう、付け直す
      e.classList.remove('shake')
      void e.offsetWidth
      e.classList.add('shake')
      this.later(450, () => e.classList.remove('shake'))
    }
  }

  /** 次の番へ: 並べ終えたら終わり。白紙の番なら少し待って置く。そうでなければ札を選んでもらう */
  private proceed(pause: number): void {
    if (this.placed >= this.hand.length) {
      this.finish(pause)
      return
    }
    if (this.hand[this.placed].blank) {
      this.waiting = true
      this.later(pause, () => {
        const i = this.placed
        const blank = this.hand[i].blank
        this.place(i)
        this.say(blank === 'pending' ? this.lines.pending : this.lines.blank)
        this.waiting = false
        this.proceed(EtokiGame.READ_MS)
      })
      return
    }
    this.waiting = false
  }

  /** hand[i] を枠に置く（手札から消し、渦を1段引く） */
  private place(i: number): void {
    const c = this.hand[i]
    const slot = this.slots[i]
    const text = slot.querySelector('span') as HTMLElement
    text.textContent = c.card ? c.card.title : '白紙'
    slot.classList.add('filled', 'just')
    slot.classList.toggle('blank', !c.card)
    slot.setAttribute('aria-label', `${SLOT_LABEL[i] ?? i + 1}: ${c.card ? c.card.title : `白紙（${c.blank === 'pending' ? 'まだ白紙の頁' : 'まだ拾っていない話'}）`}`)
    this.later(520, () => slot.classList.remove('just'))
    const had = this.cards.get(i)
    const hadFocus = !!had && had === document.activeElement
    had?.remove()
    this.cards.delete(i)
    this.placed++
    this.setLevel(this.level - 1 / Math.max(1, this.hand.length))
    this.refresh()
    // 選んだ札が消えると、キーボードの位置がなくなる。次の札へ移す（白紙を置いたときは、いまの位置のまま）
    if (hadFocus || !this.el.contains(document.activeElement)) this.focusFirst()
  }

  /** 並べ終えた: 渦が消え、ましろの言葉を読んでから会話へ戻す（2回は終わらない） */
  private finish(pause: number): void {
    if (this.finished) return
    this.finished = true
    this.waiting = true
    // 案内は消すが、場所は残す（言葉の枠が縮むと、題と枠が動いてしまう）
    this.hint.style.visibility = 'hidden'
    const calm = () => {
      this.setLevel(0)
      this.say(this.lines.done)
      this.later(EtokiGame.DONE_MS, () => {
        const m = this.mistakes
        this.dispose()
        this.done({ mistakes: m })
      })
    }
    if (pause > 0) this.later(pause, calm)
    else calm()
  }

  /** 枠の「つぎ」と、並べた枚数（色だけにしない: 文字で数も出す） */
  private refresh(): void {
    this.slots.forEach((s, i) => {
      const next = i === this.placed && !this.finished
      s.classList.toggle('next', next)
      if (!s.classList.contains('filled')) (s.querySelector('span') as HTMLElement).textContent = next ? 'つぎ' : ''
    })
    this.count.innerHTML = `並べた札<b>${this.placed} / ${this.hand.length}</b>`
  }

  private say(text: string): void {
    this.sayText.textContent = text
    // 同じ言葉が続いても、言い直したと分かるように、ふっと濃くする（動きではなく濃さ）
    this.sayText.classList.remove('fresh')
    void this.sayText.offsetWidth
    this.sayText.classList.add('fresh')
  }

  /** 渦の強さ（藍の帳の濃さ・墨の渦の濃さと大きさ） */
  private setLevel(v: number): void {
    this.level = Math.max(0, Math.min(EtokiGame.LEVEL_MAX, v))
    this.el.dataset.level = this.level.toFixed(2)
    if (this.veil) this.veil.style.opacity = Math.min(0.84, this.level * 0.6).toFixed(3)
    if (this.swirl) {
      this.swirl.style.opacity = Math.min(1, this.level * 0.85).toFixed(3)
      this.swirl.style.setProperty('--s', (0.8 + 0.2 * this.level).toFixed(3))
    }
  }

  /** いちばん前の、選べる札にキーボードの位置を置く */
  private focusFirst(): void {
    this.later(50, () => (this.handEl.querySelector('button.yge-card') as HTMLButtonElement | null)?.focus({ preventScroll: true }))
  }

  /** 閉じたあとには動かないタイマー */
  private later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id)
      if (!this.disposed) fn()
    }, ms)
    this.timers.add(id)
  }

  /**
   * 並べ終えたあと（ましろの終わりの言葉の間）なら、待たずに終える（done を呼ぶ）。終えたら true。
   * 帳の稽古で、終わりの言葉の間に「やめる」・Escape を押しても、語り返した分は残す（ui/cho.ts）
   */
  finishNow(): boolean {
    if (!this.finished || this.disposed) return false
    const m = this.mistakes
    this.dispose()
    this.done({ mistakes: m })
    return true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const id of this.timers) window.clearTimeout(id)
    this.timers.clear()
    this.uninert()
    setOpen(this.el, false)
    this.el.style.pointerEvents = 'none'
    this.root.classList.remove('yg-playing')
    window.setTimeout(() => this.el.remove(), 450)
  }
}

/**
 * 手札を出す順（hand の番号）。持っている札は、札の id から決まる入れ替えにする（開くたびに同じ並び）。
 * 2枚以上なら、正しい順のままにはしない。白紙は選べないので、うしろにまとめる。
 */
function handOrder(hand: EtokiHandCard[]): number[] {
  const held = hand.flatMap((c, i) => (c.card ? [i] : []))
  const blanks = hand.flatMap((c, i) => (c.card ? [] : [i]))
  let h = 2166136261
  for (const c of hand) for (let k = 0; k < c.key.length; k++) h = Math.imul(h ^ c.key.charCodeAt(k), 16777619) >>> 0
  const order = held.slice()
  for (let i = order.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    const j = h % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // 正しい順のままなら、1枚ずらす
  if (order.length >= 2 && order.every((v, k) => v === held[k])) order.push(order.shift()!)
  return [...order, ...blanks]
}

/**
 * 墨の渦（【創作】の演出）。筆で掃いたような、途切れた渦の線を、決まった形で描く。外の輪と内の輪を逆向きに回す（回すのは CSS）。
 * 内の輪には、風の筋（淡い細い線）を少し混ぜる。社殿・鳥居・お札などの形は描かない。
 */
function swirlSvg(ring: 'out' | 'in'): string {
  // [はじめの半径, おわりの半径, はじめの角度(度), 掃く角度(度), 太さ, 濃さ]
  const strokes: [number, number, number, number, number, number][] =
    ring === 'out'
      ? [
          [94, 82, 8, 140, 5.5, 0.8],
          [88, 72, 196, 118, 3.4, 0.66],
          [76, 62, 112, 168, 6.5, 0.82],
          [70, 56, 318, 104, 2.4, 0.6],
          [97, 92, 262, 64, 1.8, 0.5],
        ]
      : [
          [54, 38, 36, 196, 5, 0.8],
          [46, 30, 252, 138, 3, 0.7],
          [32, 20, 150, 156, 2.4, 0.6],
          [60, 55, 176, 62, 1.6, 0.5],
        ]
  const wind: [number, number, number, number, number][] =
    ring === 'in'
      ? [
          [64, 58, 86, 84, 1.3],
          [40, 34, 300, 70, 1.1],
          [84, 80, 220, 52, 1.2],
        ]
      : []
  const ink = strokes.map(([r0, r1, a0, sw, w, o]) => `<path d="${brushPath(r0, r1, a0, sw, w)}" fill="#2a2622" fill-opacity="${o}"/>`).join('')
  const pale = wind.map(([r0, r1, a0, sw, w]) => `<path d="${brushPath(r0, r1, a0, sw, w)}" fill="#f4f0e6" fill-opacity="0.55"/>`).join('')
  return `<svg class="${ring}" viewBox="-100 -100 200 200" aria-hidden="true">${ink}${pale}</svg>`
}

/** 渦の一筆（半径を変えながら弧を掃く）。入りは細く、途中で太り、払いで細くなる */
function brushPath(r0: number, r1: number, a0: number, sweep: number, w: number): string {
  const n = 28
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = ((a0 + sweep * t) * Math.PI) / 180
    const r = r0 + (r1 - r0) * t
    const k = (w / 2) * Math.sin(Math.PI * t ** 0.75)
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    outer.push(`${(cx * (r + k)).toFixed(1)},${(cy * (r + k)).toFixed(1)}`)
    inner.push(`${(cx * (r - k)).toFixed(1)},${(cy * (r - k)).toFixed(1)}`)
  }
  return `M${outer.join('L')}L${inner.reverse().join('L')}Z`
}

// ---------------------------------------------------------------- 帳（曼荼羅帳と、ほかの頁のタブ）

export interface MandalaHooks {
  close(): void
  reset(): void
  /** ピースを見た（「新」の印を消す） */
  seen(pieceId: string): void
  /** 稽古（語り返し）を始める。ピースの表示を閉じてから呼ぶ */
  keiko?(pieceId: string): void
}

/** 稽古ができるか。ready＝できる（彩色済みで、稽古の札が2枚以上開いている）、few＝札がまだ足りない、none＝稽古のないピース */
export type KeikoState = 'ready' | 'few' | 'none'

export interface MandalaState {
  piece(id: string): PieceState
  isNew(id: string): boolean
  card(id: string): LoreCard | undefined
  /** 巻末の旅印（02 F-45）。at は押した日時（まだなら null） */
  stamps?(): { id: string; title: string; stampTitle: string; motif: string; at: string | null }[]
  /** 稽古（04 §3.6）。無ければ、稽古のボタンも案内も出さない */
  keiko?(id: string): KeikoState
}

/** 帳のほかの頁（タブ。いまは縁帳）。panel は中身の要素で、帳が見せたり隠したりする */
export interface ChoTab {
  id: string
  label: string
  panel: HTMLElement
  /** 頁を開いたとき（描き直す） */
  show?(): void
  /** タブに「新」の印を出すか（数は出さない） */
  isNew?(): boolean
  /** 「新」の印の読み上げ（例: 「新しい縁がある」） */
  newLabel?: string
}

const INK = '#3a332d'

/**
 * 帳。タブ（本物のボタン。aria-selected、左右の矢印キーで移る）で頁を切り替える。はじめの頁は曼荼羅帳（掛軸・巻末の旅印・やり直す）。
 * ほかの頁（縁帳）は、作る側（ui/cho.ts）が中身を渡す。タブの「新」は、字の印だけ（数は出さない）。
 */
export class MandalaView {
  private readonly root: HTMLElement
  private readonly wrap: HTMLDivElement
  private readonly scroll: HTMLDivElement
  private readonly pop: HTMLDivElement
  private readonly popCard: HTMLDivElement
  private readonly tabs: (ChoTab & { btn: HTMLButtonElement })[] = []
  private current = 'mandala'
  private openFlag = false
  private lastFocus: HTMLElement | null = null
  /** ピースの表示・確認を開く前にキーボードの位置があった所（閉じたら戻す） */
  private popReturn: HTMLElement | SVGElement | null = null

  constructor(
    root: HTMLElement,
    private readonly def: MandalaDef,
    private readonly state: MandalaState,
    private readonly hooks: MandalaHooks,
    /** ほかの頁（タブ）。無ければタブを出さず、曼荼羅帳だけ */
    extraTabs: ChoTab[] = [],
  ) {
    injectStyle()
    this.root = root
    this.wrap = el('div', 'ym')
    this.wrap.setAttribute('role', 'dialog')
    this.wrap.setAttribute('aria-label', extraTabs.length ? '帳' : def.title)
    const head = el('div', 'ym-head')
    const mandalaPanel = el('div', 'ym-panel')
    if (extraTabs.length) {
      head.innerHTML = '<h2>帳</h2>'
      const list = el('div', 'ym-tabs')
      list.setAttribute('role', 'tablist')
      list.setAttribute('aria-label', '帳の頁')
      const all: ChoTab[] = [
        { id: 'mandala', label: def.title, panel: mandalaPanel, show: () => this.render(), isNew: () => this.anyNewPiece(), newLabel: '新しいピースがある' },
        ...extraTabs,
      ]
      for (const t of all) {
        const b = el('button', 'ym-tab', `${escapeHtml(t.label)}<span class="ym-tab-new" aria-hidden="true">新</span><span class="ym-vh"></span>`) as HTMLButtonElement
        b.type = 'button'
        b.id = `ym-tab-${t.id}`
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-controls', `ym-panel-${t.id}`)
        t.panel.classList.add('ym-panel')
        t.panel.id = `ym-panel-${t.id}`
        t.panel.setAttribute('role', 'tabpanel')
        t.panel.setAttribute('aria-labelledby', b.id)
        b.addEventListener('click', () => this.selectTab(t.id))
        // 左右の矢印・Home・End で隣のタブへ（タブの並びの中だけ。Tab キーは頁の中へ進む）
        b.addEventListener('keydown', (e) => {
          const i = this.tabs.findIndex((x) => x.id === t.id)
          const n = this.tabs.length
          const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
          if (to < 0) return
          e.preventDefault()
          this.selectTab(this.tabs[to].id, true)
        })
        list.appendChild(b)
        this.tabs.push({ ...t, btn: b })
      }
      head.appendChild(list)
    } else {
      head.innerHTML = `<h2>${escapeHtml(def.title)}</h2>`
    }
    const close = el('button', 'ym-btn close', 'とじる') as HTMLButtonElement
    close.type = 'button'
    close.addEventListener('click', () => this.hooks.close())
    head.appendChild(close)
    const noteSp = el('p', 'ym-note-sp', '【創作】の構図です。本物の立山曼荼羅を写したものではありません。')
    const body = el('div', 'ym-body')
    this.scroll = el('div', 'ym-scroll')
    const side = el('div', 'ym-side')
    side.innerHTML = `
      <div class="ym-legend">
        <p>ピースの状態</p>
        <ul>
          <li><i></i>空白（まだ）</li>
          <li><i class="hakubyo"></i>白描（話を聞いた）</li>
          <li><i class="saishiki"></i>彩色（現地で）</li>
          <li><i class="kin"></i>金の縁取り</li>
        </ul>
      </div>
      <p class="ym-note">${escapeHtml(def.note)}</p>`
    if (state.stamps) {
      const back = el('button', 'ym-btn ym-back', '巻末の旅印') as HTMLButtonElement
      back.type = 'button'
      back.addEventListener('click', () => this.openStamps())
      side.appendChild(back)
    }
    const reset = el('button', 'ym-btn ym-reset', '最初からやり直す') as HTMLButtonElement
    reset.type = 'button'
    reset.addEventListener('click', () => this.confirmReset())
    side.appendChild(reset)
    body.append(this.scroll, side)
    mandalaPanel.append(noteSp, body)
    this.wrap.append(head, ...(this.tabs.length ? this.tabs.map((t) => t.panel) : [mandalaPanel]))
    this.wrap.inert = true
    root.appendChild(this.wrap)

    this.pop = el('div', 'ym-pop')
    this.popCard = el('div', 'yc-card')
    this.popCard.setAttribute('role', 'dialog')
    this.pop.appendChild(this.popCard)
    this.pop.addEventListener('click', (e) => {
      if (e.target === this.pop) this.closePop()
    })
    this.pop.inert = true
    root.appendChild(this.pop)

    window.addEventListener('keydown', (e) => {
      // 稽古（並べる遊び）の間は、遊びの側（ui/cho.ts）が Escape を受ける（受けたら defaultPrevented）
      if (!this.openFlag || e.code !== 'Escape' || e.defaultPrevented || this.root.classList.contains('yg-playing')) return
      if (this.pop.classList.contains('on')) this.closePop()
      else this.hooks.close()
    })
  }

  get isOpen(): boolean {
    return this.openFlag
  }

  /** いま開いている頁（タブの id） */
  get tab(): string {
    return this.current
  }

  /** tab: 開く頁（省くと、前に開いていた頁） */
  open(tab?: string): void {
    this.lastFocus = document.activeElement as HTMLElement | null
    this.openFlag = true
    if (this.tabs.length) this.selectTab(tab ?? this.current)
    else this.render()
    setOpen(this.wrap, true)
    this.root.classList.add('modal-open')
    // キーボードの位置は、いまの頁のタブへ（タブが無ければ「とじる」）
    const first = this.tabs.find((t) => t.id === this.current)?.btn ?? (this.wrap.querySelector('.ym-btn.close') as HTMLButtonElement | null)
    window.setTimeout(() => first?.focus({ preventScroll: true }), 50)
  }

  close(): void {
    if (!this.openFlag) return
    this.openFlag = false
    setOpen(this.wrap, false)
    this.root.classList.remove('modal-open')
    this.closePop()
    this.lastFocus?.focus?.({ preventScroll: true })
  }

  /** 頁（タブ）を切り替える。focus なら、そのタブへキーボードの位置を移す */
  selectTab(id: string, focus = false): void {
    const want = this.tabs.find((t) => t.id === id) ?? this.tabs[0]
    if (!want) return
    this.current = want.id
    for (const t of this.tabs) {
      const on = t === want
      t.btn.setAttribute('aria-selected', String(on))
      t.btn.tabIndex = on ? 0 : -1
      t.panel.hidden = !on
    }
    want.show?.()
    this.refreshMarks()
    if (focus) want.btn.focus({ preventScroll: true })
  }

  /** タブの「新」の印を合わせる（字の印と、読み上げの言葉。数は出さない） */
  refreshMarks(): void {
    for (const t of this.tabs) {
      const on = !!t.isNew?.()
      t.btn.classList.toggle('has-new', on)
      ;(t.btn.querySelector('.ym-vh') as HTMLElement).textContent = on ? `（${t.newLabel ?? '新しいものがある'}）` : ''
    }
  }

  private anyNewPiece(): boolean {
    return this.def.tiers.some((t) => t.pieces.some((p) => this.state.piece(p.id) !== 'empty' && this.state.isNew(p.id)))
  }

  render(): void {
    const [W, H] = this.def.viewBox
    const parts: string[] = []
    // 表装と軸
    parts.push(`<defs>
      <linearGradient id="ymPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8f3e6"/><stop offset="1" stop-color="#efe6d2"/></linearGradient>
      <linearGradient id="ymFog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    </defs>`)
    parts.push(`<rect x="3" y="12" width="${W - 6}" height="${H - 24}" rx="2" fill="#c9b994"/>`)
    parts.push(`<rect x="10" y="20" width="${W - 20}" height="${H - 40}" fill="#ddd0b0"/>`)
    parts.push(`<rect x="18" y="28" width="${W - 36}" height="${H - 56}" fill="url(#ymPaper)" stroke="#a89878" stroke-width="0.8"/>`)
    parts.push(`<rect x="0" y="2" width="${W}" height="12" rx="6" fill="#6b4f3a"/><rect x="0" y="${H - 14}" width="${W}" height="12" rx="6" fill="#6b4f3a"/>`)
    parts.push(`<circle cx="4" cy="${H - 8}" r="7" fill="#4e392a"/><circle cx="${W - 4}" cy="${H - 8}" r="7" fill="#4e392a"/>`)
    // 背景の線（【創作】の構図: 下から里の川、麓の道、山の稜線）
    const faint = `fill="none" stroke="${INK}" stroke-opacity="0.22" stroke-linecap="round"`
    parts.push(`<path d="M18,712 C80,698 120,724 180,708 C230,694 260,712 282,702" ${faint} stroke-width="1.2"/>`)
    parts.push(`<path d="M18,722 C80,708 120,734 180,718 C230,704 260,722 282,712" ${faint} stroke-width="0.8"/>`)
    parts.push(`<path d="M150,728 C92,692 208,640 150,600 C92,560 208,520 150,470 C92,420 208,380 150,330 C100,290 200,252 150,212 C120,176 170,146 150,104" ${faint} stroke-width="1.1" stroke-dasharray="2 5"/>`)
    parts.push(`<path d="M18,186 L58,140 L84,156 L126,92 L152,124 L192,70 L226,118 L254,104 L282,126" ${faint} stroke-width="1.3"/>`)
    parts.push(`<path d="M104,124 L126,92 L140,108" ${faint} stroke-width="0.8"/>`)
    // すやり霞（段の境目）
    for (const y of [212, 558]) {
      parts.push(
        `<path d="M18,${y} C40,${y - 9} 70,${y - 9} 92,${y} C112,${y - 8} 140,${y - 8} 160,${y} C186,${y - 9} 214,${y - 9} 236,${y} C252,${y - 6} 270,${y - 6} 282,${y} L282,${y + 6} L18,${y + 6} Z" fill="#ffffff" fill-opacity="0.75" stroke="${INK}" stroke-opacity="0.18" stroke-width="0.8"/>`,
      )
    }
    // 段の名前
    for (const t of this.def.tiers) {
      // 枠と重ならないよう、各段の右上の余白に置く
      parts.push(`<text x="${W - 26}" y="${t.y0 + 16}" text-anchor="end" font-size="12" fill="${INK}" fill-opacity="0.85" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">${escapeHtml(t.label)}</text>`)
    }
    // ピース
    for (const t of this.def.tiers) for (const p of t.pieces) parts.push(this.pieceSvg(p))
    // 山の段は霧の中
    const yama = this.def.tiers.find((t) => t.id === 'yama')
    if (yama) parts.push(`<rect x="18" y="${yama.y0 - 6}" width="${W - 36}" height="${yama.y1 - yama.y0}" fill="url(#ymFog)" pointer-events="none"/>`)
    this.scroll.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(this.def.title)}">${parts.join('')}</svg>`
    for (const g of Array.from(this.scroll.querySelectorAll<SVGGElement>('.ym-piece'))) {
      const id = g.dataset.id!
      const open = () => this.openPiece(id)
      g.addEventListener('click', open)
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      })
    }
    this.refreshMarks()
  }

  private pieceSvg(p: MandalaPieceDef): string {
    const st = this.state.piece(p.id)
    const filled = st !== 'empty'
    const fresh = filled && this.state.isNew(p.id)
    const label = filled && p.label ? `${p.label}（${PIECE_LABEL[st]}${fresh ? '・新しい' : ''}）` : `空白のピース`
    let inner = ''
    if (!filled) {
      inner = `<rect class="frame" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="#fbf7ec" fill-opacity="0.55" stroke="#8a7f70" stroke-opacity="0.75" stroke-width="0.8" stroke-dasharray="3 2.4"/>`
    } else {
      const art = p.art ? ARTS[p.art] : undefined
      let artSvg = ''
      if (art) {
        // 小さなピースでは姿の範囲（pieceBox）に寄せる。はみ出た分は画像の枠で切る
        // （<image> にするのは、ピースの当たり判定とフォーカスの枠を、はみ出た線で広げないため）
        const pad = 3
        const [bx, by, bw, bh] = art.pieceBox ?? [0, 0, art.w, art.h]
        const lineScale = 1.6 * Math.min(bw / art.w, bh / art.h) ** 0.5
        const inner = artToSvg(art, '#fffdf7', INK, lineScale, 1, st === 'saishiki' || st === 'kin')
        const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx} ${by} ${bw} ${bh}">${inner}</svg>`)}`
        artSvg = `<image x="${p.x + pad}" y="${p.y + pad}" width="${p.w - pad * 2}" height="${p.h - pad * 2}" preserveAspectRatio="xMidYMid meet" href="${src}"/>`
      }
      const stroke = st === 'kin' ? '#c9a24a' : INK
      const sw = st === 'kin' ? 2.2 : 1.1
      inner =
        `<rect class="frame" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="#fffdf7" stroke="${stroke}" stroke-width="${sw}"/>` +
        artSvg +
        // 状態の印（色だけにしない: 形と文字）
        `<rect x="${p.x + p.w - 19}" y="${p.y + 2}" width="17" height="15" rx="2" fill="#fffdf7" stroke="${INK}" stroke-width="0.6"/>` +
        `<text x="${p.x + p.w - 10.5}" y="${p.y + 13.6}" font-size="11" text-anchor="middle" fill="${INK}" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">${st === 'hakubyo' ? '線' : st === 'saishiki' ? '彩' : '金'}</text>`
      // まだ見ていない（状態が上がったときも）: 輪と、左上の「新」の字（色だけにしない）
      if (fresh)
        inner +=
          `<rect class="ring" x="${p.x - 3}" y="${p.y - 3}" width="${p.w + 6}" height="${p.h + 6}" rx="7" fill="none" stroke="#b5523b" stroke-width="1.6"/>` +
          `<rect x="${p.x - 4}" y="${p.y - 6}" width="15" height="13" rx="6.5" fill="#b5523b"/>` +
          `<text x="${p.x + 3.5}" y="${p.y + 3.8}" font-size="9" text-anchor="middle" fill="#fff">新</text>`
    }
    const cls = `ym-piece${fresh ? ' new' : ''}`
    return `<g class="${cls}" data-id="${p.id}" role="button" tabindex="0" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title>${inner}</g>`
  }

  /** 巻末の旅印の頁。家では枠だけ見える */
  openStamps(): void {
    const list = this.state.stamps?.() ?? []
    const items = list
      .map(
        (s) => `<figure class="ym-stamp">${s.at ? stampSvg({ title: s.stampTitle, date: stampDate(s.at), motif: s.motif }) : stampFrameSvg(s.stampTitle)}
          <figcaption>${escapeHtml(s.title)}${s.at ? `<br><small>${escapeHtml(stampDate(s.at))}</small>` : ''}</figcaption></figure>`,
      )
      .join('')
    this.showPop(`
      <div class="yc-kind"><span>巻末</span></div>
      <h3 class="yc-title">旅印</h3>
      <div class="ym-stamps">${items}</div>
      <p class="yc-foot" style="margin-top:4px">現地で節を終えた記念の印です。この印は売ったり譲ったりできません。</p>
      <button class="yc-btn" type="button" data-act="close">もどる</button>`)
  }

  private findPiece(id: string): MandalaPieceDef | undefined {
    for (const t of this.def.tiers) for (const p of t.pieces) if (p.id === id) return p
    return undefined
  }

  /** 掛軸の上のピースの要素（描き直すと替わるので、そのつど探す） */
  private pieceEl(id: string): SVGElement | null {
    return Array.from(this.scroll.querySelectorAll<SVGElement>('.ym-piece')).find((g) => g.dataset.id === id) ?? null
  }

  /**
   * ピースの表示。notice は上に出す一言（稽古のあとの「金の縁取りが入った」など）。
   * 稽古のあるピースでは: 白描なら、彩色のあとに語り返すと金になることを言う。彩色・金で札がそろっていれば、稽古のボタンを出す
   */
  openPiece(id: string, notice?: string): void {
    const p = this.findPiece(id)
    if (!p) return
    const st = this.state.piece(id)
    if (st === 'empty') {
      this.showPop(
        `
        <div class="yc-kind"><span>空白のピース</span></div>
        <h3 class="yc-title">まだ白紙</h3>
        <p class="yc-body" style="font-size:14px">誰かの話を聞くと、ここに線が入る。</p>
        <button class="yc-btn" type="button" data-act="close">もどる</button>`,
        this.pieceEl(id),
      )
      return
    }
    this.hooks.seen(id)
    const art = p.art ? ARTS[p.art] : undefined
    const svg = art
      ? `<svg class="art${st === 'kin' ? ' kin' : ''}" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${artToSvg(art, '#fffdf7', INK, 1.1, 1, st === 'saishiki' || st === 'kin')}</svg>`
      : ''
    const cards = (p.cardIds ?? []).map((c) => this.state.card(c)).filter((c): c is LoreCard => !!c)
    const keiko = this.state.keiko?.(id) ?? 'none'
    const hints = [
      st === 'hakubyo'
        ? '夢で話を聞いて、線（白描）が入った。現地でこの地点に立つと、色が入る（現の旅）。'
        : st === 'saishiki'
          ? '現地で色が入った。'
          : // 稽古のすぐあと（上の一言で言った）は、くり返さない
            notice
            ? ''
            : '語り返して、金の縁取りが入った。',
    ].filter(Boolean)
    if (keiko !== 'none' && st === 'hakubyo') hints.push('現地で色が入ったピースを、ここで語り返すと金の縁取りになる。')
    if (keiko === 'few' && st !== 'hakubyo') hints.push('話の札がもう少しそろうと、ここで語り返せる（稽古）。')
    const keikoBtn =
      keiko === 'ready' && st !== 'hakubyo'
        ? `<button class="yc-btn keiko" type="button" data-act="keiko">${st === 'kin' ? 'もう一度、語り返す' : '稽古する（語り返す）'}<small>札を話の順に並べて、${escapeHtml(p.label ?? '')}に語り返す</small></button>`
        : ''
    this.showPop(
      `
      <div class="yc-kind"><span>曼荼羅のピース</span><span class="new">${escapeHtml(PIECE_LABEL[st])}</span></div>
      ${notice ? `<p class="ym-notice" role="status">${escapeHtml(notice)}</p>` : ''}
      <h3 class="yc-title">${escapeHtml(p.label ?? '')}</h3>
      ${svg}
      ${hints.map((h) => `<p class="yc-foot" style="margin-top:0">${escapeHtml(h)}</p>`).join('')}
      ${keikoBtn}
      <div class="row">
        ${cards.length ? `<button class="yc-btn" type="button" data-act="card">札を読む${cards.length > 1 ? `（${cards.length}枚）` : ''}</button>` : ''}
        <button class="yc-btn" type="button" data-act="close">もどる</button>
      </div>`,
      this.pieceEl(id),
    )
    const showCard = (i: number) => {
      const last = i >= cards.length - 1
      this.showPop(cardHtml(cards[i], { button: last ? 'もどる' : `次の札（${i + 1}/${cards.length}）` }))
      this.popCard.querySelector('.yc-btn')?.addEventListener('click', () => (last ? this.openPiece(id) : showCard(i + 1)))
    }
    this.popCard.querySelector('[data-act="card"]')?.addEventListener('click', () => showCard(0))
    this.popCard.querySelector('[data-act="keiko"]')?.addEventListener('click', () => {
      this.closePop()
      this.hooks.keiko?.(id)
    })
    this.render()
  }

  /** returnTo: 閉じたときにキーボードの位置を戻す所（省くと、開いたときの位置） */
  private showPop(html: string, returnTo?: HTMLElement | SVGElement | null): void {
    if (!this.pop.classList.contains('on')) this.popReturn = returnTo ?? (document.activeElement as HTMLElement | SVGElement | null)
    this.popCard.innerHTML = html
    this.popCard.querySelector('[data-act="close"]')?.addEventListener('click', () => this.closePop())
    setOpen(this.pop, true)
    // 表示の間、後ろの帳（タブ・ピース）には Tab で入らない（閉じたら戻す）
    this.wrap.inert = true
    window.setTimeout(() => (this.popCard.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true }), 30)
  }

  private closePop(): void {
    const had = this.pop.contains(document.activeElement)
    setOpen(this.pop, false)
    this.wrap.inert = !this.openFlag
    // キーボードの位置を、開く前の所（描き直したピースなら、同じピース。無ければ「とじる」）へ戻す（<body> に落とさない）
    const from = this.popReturn
    this.popReturn = null
    if (!had || !this.openFlag) return
    const id = from?.dataset?.id
    const back = from?.isConnected && this.wrap.contains(from) ? from : id ? this.pieceEl(id) : null
    ;(back ?? (this.wrap.querySelector('.ym-btn.close') as HTMLButtonElement | null))?.focus({ preventScroll: true })
  }

  private confirmReset(): void {
    this.showPop(`
      <div class="yc-kind"><span>確認</span></div>
      <h3 class="yc-title">最初からやり直しますか</h3>
      <p class="yc-body" style="font-size:14px">会った妖怪・開いた札・曼荼羅のピース・縁・持ち物が、すべて消えます。元には戻せません。</p>
      <div class="row">
        <button class="yc-btn" type="button" data-act="close">やめる</button>
        <button class="yc-btn" type="button" data-act="reset">やり直す</button>
      </div>`)
    this.popCard.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
      this.closePop()
      this.hooks.reset()
      this.render()
    })
  }
}
