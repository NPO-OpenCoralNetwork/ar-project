// 札の素材（09 §4.4）。
// - 表: 光を受けない自作シェーダー1つで、和紙・白描・彩色・枠・金の縁・箔・題を重ねる。
//   絵は「絵の窓」の UV → Texture.matrix（offset / repeat / rotation / center）で引く。
//   白描の線は、色の絵の色の勾配（RGB の各チャンネルの Sobel の最大）と暗い所から、その場で出す（スタジオだけ）。
//   ゲームに入れる版では、書き出しの mask.png（R＝線）を読み、Sobel はしない（09 §4.3）。
//   線の太さは「書き出しの解像度（窓の高さ＝1024 画素）」の画素を単位にし、ミップの段も固定して引く
//   （textureLod）。元の画像の解像度・拡大・画面の大きさで線が変わらないように。
// - 線・帯・縁はすべて距離関数と fwidth で、画面の1画素の幅でなめらかにする。細かい模様は oct() で消す。
// - 裏: 全札共通の意匠の CanvasTexture（text.ts の drawBackDesign）に和紙の凹凸をのせる。
// - 縁: 和紙の生成り、金の段階で金（MeshPhongMaterial）。
// 定数の色は THREE.Color で linear に直して渡し、最後に colorspace_fragment で出力の色に戻す。

import * as THREE from 'three'
import { CARD, type CardLayout } from './geometry'

const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
// 画面の1画素より細かい模様は消す（にじみ・ちらつきを防ぐ）。f は単位あたりの周波数、px は1画素の大きさ
float oct(float f, float px){ return 1.0 - smoothstep(0.2, 0.5, f * px); }
// 和紙の高さ: 粒 + 一方向に伸びた繊維（角度の違う2層）
float washiH(vec2 p, float px){
  float h = 0.0;
  h += 0.50 * vnoise(p * 55.0) * oct(55.0, px);
  h += 0.30 * vnoise(p * 150.0) * oct(150.0, px);
  h += 0.18 * vnoise(p * 340.0) * oct(340.0, px);
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
  h += 0.14 * smoothstep(0.6, 0.95, vnoise(vec2(q.x * 26.0, q.y * 240.0))) * oct(240.0, px);
  vec2 r = mat2(0.94, 0.34, -0.34, 0.94) * p;
  h += 0.10 * smoothstep(0.64, 0.97, vnoise(vec2(r.x * 300.0, r.y * 22.0))) * oct(300.0, px);
  return h;
}
// 和紙の凹凸の陰（手続き的な法線）。p は札の物理単位。
// 高さは1回だけ計算し、傾きは画面の微分（dFdx / dFdy）から札の座標の勾配に直して取る。
float washiShade(vec2 p, vec3 L, float amount, out float fiber){
  vec2 dpx = dFdx(p), dpy = dFdy(p);
  float px = max(length(fwidth(p)), 1e-5);
  float h = washiH(p, px);
  fiber = h;
  float hx = dFdx(h), hy = dFdy(h);
  float det = dpx.x * dpy.y - dpx.y * dpy.x;
  vec2 grad = abs(det) > 1e-14 ? vec2(dpy.y * hx - dpx.y * hy, dpx.x * hy - dpy.x * hx) / det : vec2(0.0);
  vec3 n = normalize(vec3(-grad * amount * 0.0022, 1.0));
  return 1.0 + (dot(n, L) - L.z) * 0.9;
}
// 距離 d の線（半幅 w）。画面の1画素より細い時は、1画素の幅に広げて濃さを下げる
float aaLine(float d, float w){
  float fw = max(fwidth(d), 1e-6);
  float cov = clamp(2.0 * w / fw, 0.0, 1.0);
  return cov * clamp((max(w, 0.5 * fw) - abs(d)) / fw + 0.5, 0.0, 1.0);
}
// 距離 d < 0 の内側（縁を1画素でなめらかに）
float aaIn(float d){ float fw = max(fwidth(d), 1e-6); return clamp(0.5 - d / fw, 0.0, 1.0); }
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdBox(vec2 p, vec4 r){ vec2 c = (r.xy + r.zw) * 0.5; vec2 b = (r.zw - r.xy) * 0.5; vec2 q = abs(p - c) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
`

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRONT_FRAG = /* glsl */ `
uniform sampler2D uArt;
uniform sampler2D uTitle;
uniform mat3 uArtMat;
uniform float uArtLod;     // 白描の線を引くミップの段（書き出しの解像度に合わせる。main.ts）
uniform vec2 uCard;
uniform vec4 uWin;
uniform vec4 uStrip;
uniform float uBand;
uniform float uRadius;
uniform float uFrame;      // 0 かるた寄り / 1 花札寄り
uniform float uStage;      // 0 空白 / 1 白描 / 2 彩色 / 3 金（途中の値で段階の間をつなぐ）
uniform float uHasArt;
uniform float uLineTh;
uniform float uLineW;
uniform float uLineOverlay;
uniform float uWashi;
uniform float uFoil;
uniform float uHolo;
uniform float uNight;
uniform float uShowTitle;
uniform float uTime;
uniform float uMotion;     // 動きを減らす設定で 0（段階はフェードだけ。時間の動きを止める）
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uBandCol;
uniform vec3 uBandInk;
uniform vec3 uGold;
uniform vec3 uGoldHi;
uniform vec3 uAmber;
uniform vec3 uLight;       // 札の座標での光の向き
uniform vec2 uTilt;        // 傾き（-1〜1）。動きを減らす設定では 0
varying vec2 vUv;
${NOISE}

// 窓の UV（0〜1）→ 縦横比を直した座標 a → Texture.matrix → 絵の UV
vec2 winA(vec2 w){ float aw = (uWin.z - uWin.x) / (uWin.w - uWin.y); return vec2((w.x - 0.5) * aw + 0.5, w.y); }
vec2 artUv(vec2 a){ return (uArtMat * vec3(a, 1.0)).xy; }
// 画像の外は端の色を延ばして読む（境目に勾配を作らない）
vec3 colAt(vec2 t){ return sqrt(max(textureLod(uArt, clamp(t, 0.0, 1.0), uArtLod).rgb, 0.0)); }
// 画像から白描の線を出す（色の勾配 + 暗い所）。a は窓の座標、h は書き出しの1画素 × 線の太さ
float inkLine(vec2 a){
  float h = uLineW * 1.6 / 1024.0;
  vec2 dx = (uArtMat * vec3(h, 0.0, 0.0)).xy;
  vec2 dy = (uArtMat * vec3(0.0, h, 0.0)).xy;
  vec2 t = artUv(a);
  vec3 tl = colAt(t - dx + dy), tc = colAt(t + dy), tr = colAt(t + dx + dy);
  vec3 l  = colAt(t - dx),      m  = colAt(t),      r  = colAt(t + dx);
  vec3 bl = colAt(t - dx - dy), bc = colAt(t - dy), br = colAt(t + dx - dy);
  vec3 gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  vec3 gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  vec3 g2 = gx * gx + gy * gy;
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  float gLum = length(vec2(dot(gx, LW), dot(gy, LW)));
  float gCol = sqrt(max(max(g2.r, g2.g), g2.b)) * 0.8;   // 明るさの近い色どうしの境目も拾う
  float g = max(gLum, gCol) * 0.25;
  float edge = smoothstep(uLineTh, uLineTh + 0.08, g);
  float dark = smoothstep(0.30, 0.12, dot(m, LW)) * 0.95;
  return clamp(max(edge, dark), 0.0, 1.0);
}

void main(){
  vec2 p = vUv * uCard;                       // 札の物理単位（左下が 0,0）
  vec2 pc = p - uCard * 0.5;
  float px = max(length(fwidth(p)), 1e-5);
  float fiber;
  float shade = washiShade(p, uLight, uWashi, fiber);
  vec3 paper = uPaper * (0.975 + 0.05 * fiber);

  // 段階が上がるときは、中心からノイズの境目で広がる。動きを減らす設定では、全体のフェードだけ
  float sLine, sCol, sGold;
  if (uMotion > 0.5) {
    float rr = length(pc / uCard.y) * 1.3 + 0.25 * vnoise(p * 18.0);
    float D = 0.75;
    sLine = clamp(((uStage - 0.0) * (1.0 + D) - rr) / 0.18, 0.0, 1.0);
    sCol  = clamp(((uStage - 1.0) * (1.0 + D) - rr) / 0.18, 0.0, 1.0);
    sGold = clamp(((uStage - 2.0) * (1.0 + D) - rr) / 0.18, 0.0, 1.0);
  } else {
    sLine = clamp(uStage, 0.0, 1.0);
    sCol  = clamp(uStage - 1.0, 0.0, 1.0);
    sGold = clamp(uStage - 2.0, 0.0, 1.0);
  }

  // 絵の窓
  float dWin = sdBox(p, uWin);
  float inWin = aaIn(dWin);
  vec2 w = (p - uWin.xy) / (uWin.zw - uWin.xy);
  vec2 a = winA(w);
  vec2 t = artUv(a);
  float inImg = aaIn(sdBox(t, vec4(0.0, 0.0, 1.0, 1.0))) * uHasArt;   // 絵の縁も1画素でなめらかに
  float inArt = inImg * inWin;
  vec3 art = texture2D(uArt, t).rgb;
  // 白描の線（要る段階だけ計算する。uniform による分岐）
  float line = 0.0;
  if (uStage > 0.001 && (uStage < 2.0 || uLineOverlay > 0.001)) {
    line = inkLine(a) * inArt * (0.88 + 0.12 * mix(0.5, vnoise(p * 300.0), oct(300.0, px)));
  }

  vec3 c = paper;
  c = mix(c, uInk, line * sLine * (1.0 - sCol));                      // 白描: 和紙に墨の線
  c = mix(c, art, inArt * sCol);                                       // 彩色
  c = mix(c, uInk, line * sCol * uLineOverlay);                        // 彩色の上に線を少し残す

  // 枠: 縁の帯（かるた寄りは太く、花札寄りは細く）
  vec2 hc = uCard * 0.5;
  float dOuter = sdRR(pc, hc, uRadius);
  float inBand = 1.0 - aaIn(dOuter + uBand);
  vec3 band = mix(uBandInk, uBandCol, max(sCol, sGold));
  c = mix(c, band * (0.96 + 0.06 * fiber), inBand);

  // 窓の線（空白の段階は点線。点が画面の画素より細かければ、平均の濃さにする）
  float winLine = aaLine(dWin, 0.0011);
  float dash = mix(0.5, step(0.5, fract((p.x + p.y) * 90.0)), oct(127.0, px));
  float blank = 1.0 - clamp(uStage, 0.0, 1.0);
  c = mix(c, uInk, winLine * mix(0.55, 0.35 * dash, blank) * (1.0 - uFrame * 0.5));

  // 題箋（題の文字の下の細い紙）
  float dStrip = sdBox(p, uStrip);
  float inStrip = aaIn(dStrip) * uShowTitle;
  vec3 stripCol = mix(vec3(1.0), uPaper, 0.35);
  c = mix(c, stripCol * (0.985 + 0.03 * fiber), inStrip * mix(1.0, 0.82, uFrame));
  float stripLine = aaLine(dStrip, 0.0009) * uShowTitle * (1.0 - uFrame);

  // 金の縁取り: 縁の帯の内側の線・窓の線・題箋の線・題の字（箔）
  float gBand = aaLine(dOuter + uBand, 0.0025);
  float gEdge = aaLine(dOuter + uBand * 0.45, 0.002);
  float gWin  = aaLine(dWin + 0.0035, 0.0023);
  // 題の canvas は題箋の範囲だけ（text.ts）
  vec2 ts = (p - uStrip.xy) / (uStrip.zw - uStrip.xy);
  float titleA = texture2D(uTitle, ts).a * inStrip;
  float foil = max(max(gBand, gEdge), max(gWin * (1.0 - uFrame * 0.6), stripLine)) * sGold;
  float foilTitle = titleA * sGold;

  // 光の筋（傾きで動く）と、箔のきらめき（傾きで入れ替わる細かい粒）
  vec2 pn = pc / uCard.y;
  float sweep = dot(pn, normalize(vec2(1.0, 0.7))) - dot(uTilt, vec2(0.55, 0.38)) * 1.4;
  float glint = exp(-sweep * sweep * 38.0);
  vec2 cell = floor(p * 300.0);
  float rnd = hash12(cell);
  float sparkle = smoothstep(0.93, 1.0, fract(rnd * 7.0 + dot(uTilt, vec2(1.3, 0.9)) * 1.7 + uTime * 0.05 * uMotion)) * step(0.55, rnd) * oct(300.0, px);
  vec3 gold = mix(uGold, uGoldHi, clamp(glint * uFoil * 1.1, 0.0, 1.0)) * (1.0 + uFoil * 1.4 * sparkle);
  vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (dot(pn, vec2(0.7, 0.3)) * 1.5 + dot(uTilt, vec2(0.6, 0.3)) + vec3(0.0, 0.33, 0.67)));
  gold += rainbow * uHolo * (0.15 + length(uTilt)) * 0.35;
  gold *= 1.0 + 0.35 * uNight;                                        // 夜は金がうっすら自分で光る

  // 題の字（墨。金の段階で箔）
  c = mix(c, uInk, stripLine * 0.35);
  c = mix(c, mix(uInk, gold * 0.85, sGold), titleA);
  c = mix(c, gold, foil);

  // 和紙の凹凸の陰（金の所は弱く）
  c *= mix(shade, 1.0 + (shade - 1.0) * 0.3, max(foil, foilTitle));

  // 夜: 札の縁に琥珀の細い光
  float rim = exp(min(dOuter, 0.0) / 0.006) * uNight;
  c += uAmber * rim * 0.22;

  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`

const BACK_FRAG = /* glsl */ `
uniform sampler2D uBack;
uniform vec2 uCard;
uniform float uRadius;
uniform float uWashi;
uniform float uNight;
uniform vec3 uAmber;
uniform vec3 uLight;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = vUv * uCard;
  float fiber;
  float shade = washiShade(p + 3.7, uLight, uWashi, fiber);
  vec3 c = texture2D(uBack, vUv).rgb * (0.975 + 0.05 * fiber) * shade;
  float d = sdRR(p - uCard * 0.5, uCard * 0.5, uRadius);
  c += uAmber * exp(min(d, 0.0) / 0.006) * uNight * 0.22;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`

export interface CardMaterials {
  front: THREE.ShaderMaterial
  back: THREE.ShaderMaterial
  edge: THREE.MeshPhongMaterial
  list: THREE.Material[]
  setLayout(layout: CardLayout): void
}

export const COLORS = {
  paper: '#f6efdf',
  ink: '#26221e',
  bandInk: '#d3cab8',
  bands: { ai: '#3f5f8f', wakakusa: '#8fae6e', fuji: '#8e84aa' } as Record<string, string>,
  gold: '#a8761f',
  goldHi: '#ffe7a8',
  amber: '#ffb866',
  edgePaper: '#e9dfc9',
  edgeGold: '#c99a3e',
}

export function makeMaterials(art: THREE.Texture, title: THREE.Texture, back: THREE.Texture, layout: CardLayout): CardMaterials {
  const col = (hex: string) => new THREE.Color(hex)
  const card = new THREE.Vector2(CARD.w, CARD.h)
  const front = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRONT_FRAG,
    uniforms: {
      uArt: { value: art },
      uTitle: { value: title },
      uArtMat: { value: new THREE.Matrix3() },
      uArtLod: { value: 0 },
      uCard: { value: card },
      uRadius: { value: CARD.r },
      uWin: { value: new THREE.Vector4() },
      uStrip: { value: new THREE.Vector4() },
      uBand: { value: 0 },
      uFrame: { value: 0 },
      uStage: { value: 1 },
      uHasArt: { value: 1 },
      uLineTh: { value: 0.12 },
      uLineW: { value: 1 },
      uLineOverlay: { value: 0.25 },
      uWashi: { value: 0.5 },
      uFoil: { value: 0.6 },
      uHolo: { value: 0.15 },
      uNight: { value: 0 },
      uShowTitle: { value: 1 },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uPaper: { value: col(COLORS.paper) },
      uInk: { value: col(COLORS.ink) },
      uBandCol: { value: col(COLORS.bands.ai) },
      uBandInk: { value: col(COLORS.bandInk) },
      uGold: { value: col(COLORS.gold) },
      uGoldHi: { value: col(COLORS.goldHi) },
      uAmber: { value: col(COLORS.amber) },
      uLight: { value: new THREE.Vector3(0, 0, 1) },
      uTilt: { value: new THREE.Vector2() },
    },
  })
  const backMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: BACK_FRAG,
    uniforms: {
      uBack: { value: back },
      uCard: { value: card },
      uRadius: { value: CARD.r },
      uWashi: { value: 0.5 },
      uNight: { value: 0 },
      uAmber: { value: col(COLORS.amber) },
      uLight: { value: new THREE.Vector3(0, 0, 1) },
    },
  })
  const edge = new THREE.MeshPhongMaterial({ color: COLORS.edgePaper, shininess: 8, specular: 0x222222 })
  const setLayout = (l: CardLayout) => {
    const u = front.uniforms
    ;(u.uWin.value as THREE.Vector4).set(l.win.x0, l.win.y0, l.win.x1, l.win.y1)
    ;(u.uStrip.value as THREE.Vector4).set(l.strip.x0, l.strip.y0, l.strip.x1, l.strip.y1)
    u.uBand.value = l.band
    u.uFrame.value = l.frame === 'karuta' ? 0 : 1
  }
  setLayout(layout)
  return { front, back: backMat, edge, list: [front, backMat, edge], setLayout }
}
