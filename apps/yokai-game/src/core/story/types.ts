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

/** 台本の効果（台本の流れの中で、その場所に来たときに1回だけ適用して保存する） */
export type Effect =
  | { meet: true }
  | { bond: BondLevel }
  | { openCard: string }
  | { piece: string; state: PieceState }
  | { flag: string; value: boolean }

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
  yokaiId: string
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
