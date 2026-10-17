// 物語の共通の型（描画に依存しない。夢の旅と、のちの現の旅で同じものを使う）。
// 台本・伝承の札・曼荼羅の構図はデータ（src/data/）に置き、ここでは形だけを決める。
//
// 言葉: 04 §3.3（縁）、§3.6（立山曼荼羅）、§3.2（台本と札の見分け方 F-43）、02 F-46（現地で得た印）・F-71（監修の状態）。

/** 二つの旅。夢の旅＝家の3D箱庭、現の旅＝現地（05 §3） */
export type Travel = 'yume' | 'utsutsu'

/** 縁の5段階（04 §3.3）。数字では見せず、糸の形と文字のラベルで見せる */
export const BOND_LEVELS = ['kehai', 'kaomishiri', 'najimi', 'katarinakama', 'enishi'] as const
export type BondLevel = (typeof BOND_LEVELS)[number]

export const BOND_LABEL: Record<BondLevel, string> = {
  kehai: '気配',
  kaomishiri: '顔見知り',
  najimi: 'なじみ',
  katarinakama: '語り仲間',
  enishi: 'えにし',
}

/** 旅ごとの縁の上限（05 §3: 家では「なじみ」まで。「語り仲間」「えにし」は現地） */
export const BOND_CAP: Record<Travel, BondLevel> = { yume: 'najimi', utsutsu: 'enishi' }

/** 曼荼羅のピースの状態（04 §3.6）。空白 → 白描（家・噂・夢）→ 彩色（現地だけ）→ 金の縁取り */
export const PIECE_STATES = ['empty', 'hakubyo', 'saishiki', 'kin'] as const
export type PieceState = (typeof PIECE_STATES)[number]

export const PIECE_LABEL: Record<PieceState, string> = {
  empty: '空白',
  hakubyo: '白描',
  saishiki: '彩色',
  kin: '金の縁取り',
}

/** 旅ごとのピースの上限（05 §3: 曼荼羅は夢の旅では白描（線）まで） */
export const PIECE_CAP: Record<Travel, PieceState> = { yume: 'hakubyo', utsutsu: 'kin' }

/** 監修の状態（02 F-71） */
export type ReviewState = '下書き' | '監修中' | '監修済み'

/** 伝承の札（03 の事実だけ。出典と確度を必ず付ける。04 §3.2 F-43） */
export interface LoreCard {
  id: string
  /** 札の短い題（例: 「おごり高ぶって天狗になった」） */
  title: string
  /** 札の本文。03 の内容だけ（言い換えない） */
  body: string
  /** 札の番号の表示（例: 「札①」） */
  number?: string
  yokaiId?: string
  source: {
    /** 典拠の文献（例: 『和漢三才図会』） */
    work: string
    year?: number
    /** 03 で確かめた資料（紀要・データベースなど） */
    checkedIn?: { label: string; url?: string }[]
  }
  /** 03 の確度（札にしてよいのは「確認済」だけ。04 §5.2） */
  confidence: '確認済'
  /** 03 の候補番号（例: 「03 #8」） */
  researchRef: string
  review: ReviewState
}

export interface LoreCardFile {
  version: 1
  note?: string
  cards: LoreCard[]
}

/** 曼荼羅帳の構図（【創作】。本物の立山曼荼羅を写さない。04 §3.6） */
export interface MandalaPieceDef {
  id: string
  /** ピースの中身の名前（空白の間は出さない） */
  label?: string
  yokaiId?: string
  /** 白描の絵（描画側で名前から絵を引く） */
  art?: string
  /** タップで開く札 */
  cardIds?: string[]
  /** 掛軸の座標（viewBox の中の矩形） */
  x: number
  y: number
  w: number
  h: number
}

export interface MandalaTierDef {
  id: 'yama' | 'fumoto' | 'sato'
  label: string
  /** 段の範囲（viewBox の y） */
  y0: number
  y1: number
  pieces: MandalaPieceDef[]
}

export interface MandalaDef {
  version: 1
  title: string
  note: string
  /** 掛軸の絵の大きさ（SVG の viewBox） */
  viewBox: [number, number]
  /** 下から里・麓・山（データは上から並べる） */
  tiers: MandalaTierDef[]
}

// ---- 台本 ----

/** 台本の条件（すべて満たすと真）。yokai を省くと、その台本の妖怪 */
export type Condition =
  | { met: boolean; yokai?: string }
  | { card: string; opened: boolean }
  | { bondAtLeast: BondLevel; yokai?: string }
  | { piece: string; atLeast: PieceState }
  | { flag: string; is: boolean }
  | { travel: Travel }

/**
 * 会話の途中に入る小さな遊び（失敗はない。04 §3.4・§3.5）。遊びの間のましろの台詞（【創作】）も台本に持つ
 * （lines。ないときは画面側の決まり文句）。
 * - matsu: 「払わずに待つ」（ミノモシ番外）。体につくものを払うと増え、しばらく何もしないと離れていく。
 *   払った（タップした）かどうかを tappedFlag に保存し、そのあとの台詞の出し分けに使える。
 * - etoki: 「絵解き鎮め」（04 §3.5）。手札（調べるで拾った札）を、話の順に1枚ずつ選ぶ。点数・打ち切りはない。
 *   違えば渦が少し濃くなり、ましろが声をかけるだけ。拾っていない札・まだ作っていない札は白紙で出る（拾い漏れの救い）。
 */
export type GameSpec = MatsuSpec | EtokiSpec

export interface MatsuSpec {
  type: 'matsu'
  tappedFlag?: string
  lines?: {
    /** はじめ */
    start?: string
    /** 1回目に払ったとき */
    brushed?: string
    /** 2回目からに払ったとき */
    brushedAgain?: string
    /** 離れていったとき */
    done?: string
  }
}

/** 絵解き鎮めの札の並び（正しい順）。pending は、PO・監修の確認待ちでまだ作っていない札（いつも白紙で出す） */
export type EtokiSlot = { card: string } | { pending: string }

export interface EtokiSpec {
  type: 'etoki'
  /** 渦の中に出す題（例: 「光蔵坊の話」） */
  title: string
  /** 正しい順の札（4枚まで） */
  slots: EtokiSlot[]
  /** 渦と風の演出を外して、並べるだけ（稽古）にする（04 §3.5「演出を外しても成り立つ形」） */
  plain?: boolean
  lines?: {
    /** はじめ */
    start?: string
    /** 合っていたとき */
    right?: string
    /** 1回目に違ったとき */
    wrong?: string
    /** 2回目からに違ったとき */
    wrongAgain?: string
    /** 拾っていない札（白紙）を置いたとき。伝承の中身は言わない */
    blank?: string
    /** まだ作っていない札（白紙）を置いたとき */
    pending?: string
    /** 並べ終えたとき */
    done?: string
  }
}

/** 遊びの結果 */
export interface GameResult {
  /** matsu: 払った（タップした）回数 */
  tapped?: number
  /** etoki: 違う札を選んだ回数 */
  mistakes?: number
}

/** 絵解き鎮めの手札の1枚（台本の側で、いま持っているかを見て作る。並びは正しい順） */
export interface EtokiHandCard {
  /** 札の id か、pending の id */
  key: string
  /** 持っている札の中身（白紙なら無し） */
  card?: LoreCard
  /** 白紙の理由: missing＝まだ拾っていない、pending＝まだ作っていない */
  blank?: 'missing' | 'pending'
}

/** 台本の効果（台本の流れの中で、その場所に来たときに1回だけ適用して保存する） */
export type Effect =
  | { meet: true }
  | { bond: BondLevel }
  | { openCard: string }
  | { piece: string; state: PieceState }
  | { flag: string; value: boolean }
  | { game: GameSpec }

export interface ScriptLine {
  /** speakers のキー */
  speaker: string
  text: string
}

export interface ScriptChoice {
  text: string
  next: string
  when?: Condition[]
}

/**
 * 台本の1場面。順番: lines（台詞）→ effects（札・ピース・縁）→ choices（選択肢）か next（次の場面）か end。
 * 選択肢は、直前の台詞を画面に残したまま出す。
 */
export interface ScriptNode {
  lines?: ScriptLine[]
  effects?: Effect[]
  choices?: ScriptChoice[]
  next?: string
  end?: boolean
}

export interface ScriptSpeaker {
  name: string
  role: 'yokai' | 'companion'
}

export interface DialogueScript {
  version: 1
  id: string
  /** 話す妖怪。調べる地点の台本（ましろだけが話す）では無し。そのときは会う・縁の効果を使えない */
  yokaiId?: string
  /** 台本の台詞はすべて【創作】。伝承の事実は札（openCard）でだけ出す */
  creative: true
  review: ReviewState
  note?: string
  speakers: Record<string, ScriptSpeaker>
  /** 上から順に見て、条件を満たした最初の入口から始める */
  entries: { when?: Condition[]; node: string; label?: string }[]
  nodes: Record<string, ScriptNode>
}

/** 妖怪の基本の情報（画面に出す名前・夢の姿の絵） */
export interface YokaiDef {
  id: string
  name: string
  /** 台本のある妖怪だけ、耳を澄ますと夢の姿が浮かぶ */
  script?: string
  /** 夢の姿の絵（描画側で名前から絵を引く） */
  art?: string
  /** 夢の姿の高さ（m） */
  heightM?: number
}

/**
 * 節（1回の外出の単位。20〜40分・3〜5か所。04 §2.4）。現地で requires をすべて満たすと、曼荼羅帳の巻末に旅印を押せる（02 F-45）。
 * 旅印は駅スタンプのようなインク1色の絵柄で、日付が入る。御朱印・お守りに似せない（02 §4.5）。
 */
export interface SectionDef {
  id: string
  /** 地域パックの id（その土地を歩いているときだけ終えられる） */
  region: string
  title: string
  /** 旅印の上に入る字 */
  stampTitle: string
  /** 旅印の絵柄（描画側で名前から引く） */
  stampMotif: string
  requires: Condition[]
}

export interface SectionFile {
  version: 1
  note?: string
  sections: SectionDef[]
}

// ---- 調べる地点・出現の表 ----

/**
 * 調べる地点（悩みの「調べる」。04 §3.4）。妖怪はおらず、立ち止まる（家では耳を澄ます）と、ましろが話して札が出る。
 * 地点そのものは地域パック・テスト用の土地に置き、ここでは「どの台本を使い、いつ気配を出すか」だけを持つ。
 */
export interface ClueDef {
  id: string
  /** 使う台本（ましろだけが話す） */
  script: string
  /** この条件を満たす間だけ、気配を出す（例: 悩みを頼まれた・札をまだ拾っていない）。拾い漏れの地点は「次の楽しみ」として残る */
  showWhen: Condition[]
  note?: string
}

export interface ClueFile {
  version: 1
  note?: string
  clues: ClueDef[]
}

/** 時間帯（現の旅は日の入りからの時刻、夢の旅は箱庭の昼・夕・夜を当てる。04 §2.5・§3.9） */
export type TimeSlot = 'day' | 'oumagatoki' | 'night'

/** 場所の種類（出現の表の行。試作では水辺だけ。04 §3.1） */
export type PlaceKind = 'mizube'

/**
 * 出現の表の1マス。
 * - yokaiId と script: 出る妖怪と、寄り道の台本（悩みは始めない。縁も上げない。04 §3.1）。when を満たさなければ気配だけ
 * - pending: まだ作っていない妖怪（例: くらがり＝段階4）。作るまでは気配だけ
 * - kehaiOnly: 気配だけ（夜。02 F-62）
 */
export interface AppearanceSlot {
  yokaiId?: string
  script?: string
  when?: Condition[]
  pending?: string
  kehaiOnly?: true
}

export interface AppearanceRow {
  placeKind: PlaceKind
  /** 表の見出し（例: 「川・用水沿いの歩道（河原には置かない）」） */
  label: string
  slots: Record<TimeSlot, AppearanceSlot>
}

export interface AppearanceTable {
  version: 1
  note?: string
  rows: AppearanceRow[]
}
