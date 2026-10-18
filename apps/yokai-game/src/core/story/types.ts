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

/** 曼荼羅のピースの状態（04 §3.6）。空白 → 白描（家・噂・夢）→ 彩色（現地だけ。時間のピースは、ほんとうの逢魔が時なら家でも）→ 金の縁取り */
export const PIECE_STATES = ['empty', 'hakubyo', 'saishiki', 'kin'] as const
export type PieceState = (typeof PIECE_STATES)[number]

export const PIECE_LABEL: Record<PieceState, string> = {
  empty: '空白',
  hakubyo: '白描',
  saishiki: '彩色',
  kin: '金の縁取り',
}

/**
 * 台本の効果で入るピースの上限（05 §3: 夢の旅では白描（線）まで、彩色は現地だけ）。
 * ただ一つの例外は時間のピース（TIME_PIECES）: 逢魔が時（立山の時刻）に会えば、家でも彩色まで（timePiece の効果。04 §3.6）。
 * 金の縁取りは台本では入れず、彩色済みのピースを稽古で語り返したときだけ（家でも現地でも。04 §3.6・F-41）
 */
export const PIECE_CAP: Record<Travel, PieceState> = { yume: 'hakubyo', utsutsu: 'saishiki' }

/** 監修の状態（02 F-71）。了承待ちは別の印 needsConsent（09 §5.7） */
export type ReviewState = '下書き' | '監修中' | '監修済み'

/** 時間のピース（04 §3.6 例外）。mandala.json の time: true と同じであること（story-pack の点検） */
export const TIME_PIECES: ReadonlySet<string> = new Set(['fumoto-kuragari'])

/** 伝承の札（03 の事実だけ。出典と確度を必ず付ける。04 §3.2 F-43） */
export interface LoreCard {
  id: string
  /** 札の短い題（例: 「おごり高ぶって天狗になった」） */
  title: string
  /** 札の本文。03 の内容だけ（言い換えない） */
  body: string
  /** 札の種類。既定は伝承の札。名産の札（供物の 03 #21〜#23）は妖怪の伝承ではないので、見出しを分ける */
  kind?: '伝承' | '名産'
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
  /** 了承待ち（02 F-71「別に」）。了承まで開かない・見せない。題と本文は空にする（04 §5.2） */
  needsConsent?: true
  /** 並べてはいけない組み合わせの印（04 §3.6: 雷鳥と立山権現・阿弥陀如来） */
  topics?: ('raicho' | 'kami')[]
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
  /**
   * 稽古（語り返し）で並べる札（話の順）。彩色済みのピースで、ここの札を並べ終えると金の縁取り（04 §3.6）。
   * pending: で始まる項目は、まだ作っていない札（いつも白紙）。札が1枚しかない妖怪は稽古を持たない
   */
  keiko?: string[]
  /** 時間のピース（逢魔が時に会えば、家でも彩色。金は稽古で） */
  time?: true
  /** ピースの表示の一言（状態ごと。無ければ画面の決まり文句） */
  hint?: Partial<Record<'hakubyo' | 'saishiki' | 'kin', string>>
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
  /** 持ち物（供物・届け物）の状態。none＝まだ、held＝持っている、given＝渡した */
  | { item: string; state: ItemState }
  /** 悩みをもう1つ抱えられるか（同時に3つまで。04 §2.4）。questRoom: false で「いっぱい」 */
  | { questRoom: boolean }
  /** その物語の日（立山の時刻、04:00 区切り）に、この妖怪と会ったか（lastMet）。'any' は夢でも現地でも。会話の時計が要る */
  | { metToday: Travel | 'any'; yokai?: string }

/** 条件の種類（このほかの鍵の条件は、点検で知らない条件として断る） */
export const CONDITION_KEYS = ['met', 'card', 'bondAtLeast', 'piece', 'flag', 'travel', 'item', 'questRoom', 'metToday'] as const

/** 持ち物の状態 */
export type ItemState = 'none' | 'held' | 'given'

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
  /** 持ち物を受け取る（供物・届け物。お金では買えない。04 §3.7） */
  | { receive: string }
  /** 持ち物を渡す（受け取った妖怪の好物なら、縁が「なじみ」まで上がるのは台本の bond で書く） */
  | { deliver: string }
  /** 開いている札を、もう一度見せる（開かない。了承待ち・まだ開いていない札は飛ばす） */
  | { showCard: string }
  /** 時間のピース。会話を始めた時が逢魔が時（立山）なら彩色（家でも）、そうでなければ白描 */
  | { timePiece: string }

/** 効果の種類（このほかの鍵の効果は、点検で知らない効果として断る） */
export const EFFECT_KEYS = ['meet', 'bond', 'openCard', 'piece', 'flag', 'game', 'receive', 'deliver', 'showCard', 'timePiece'] as const

export interface ScriptLine {
  /** speakers のキー */
  speaker: string
  text: string
  /** この条件を満たすときだけ言う（台詞を出す時に見る。満たさなければ飛ばす） */
  when?: Condition[]
}

export interface ScriptChoice {
  text: string
  next: string
  when?: Condition[]
  /** 了承待ちの選択肢（了承まで出さない。02 F-71・04 §5.2） */
  needsConsent?: true
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
  /** talk（既定）: 出会いの会話。yobanashi: 夜話（会ったことにしない。効果は showCard だけ） */
  kind?: 'talk' | 'yobanashi'
  /** 了承待ちの台本（了承まで始めない。02 F-71） */
  needsConsent?: true
  speakers: Record<string, ScriptSpeaker>
  /** 上から順に見て、条件を満たした最初の入口から始める（id は夜話の場面の名前と、start(entryId) に使う） */
  entries: { id?: string; when?: Condition[]; node: string; label?: string }[]
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
  /** 縁帳に出す人となり（【創作】。伝承は札で別に出す） */
  profile?: string
  /** 好物（持ち物の id。渡すと「なじみ」。04 §3.3） */
  likes?: string
  /** 本作オリジナルの妖怪（伝承にない。縁帳で明記する。04 §3.3） */
  original?: boolean
  /** 夜話の台本（kind: 'yobanashi'。なじみ以上で、その日に会った夜に来る。04 §3.8） */
  yobanashi?: string
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
  /** 地図の札に書く字（既定「古い話」） */
  label?: string
  /** 気配の言い方（既定「古い話の気配」） */
  kehai?: string
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

// ---- 持ち物・悩み・妖怪の帳（段階4） ----

/** 持ち物（供物・届け物。04 §3.7）。名産品は主役にせず、妖怪の好物として出す。札で言うことは 03 の確認済だけ */
export interface ItemDef {
  id: string
  name: string
  /** 渡したときに開く札（03 の名産の札） */
  card?: string
  note?: string
}

/**
 * 悩みごと（04 §3.4・付録A）。進み具合はフラグ・札・持ち物で持ち、ここでは「始まった」「解けた」の見分け方と、帳に出す題だけを持つ。
 * 抱えている＝start を満たし、done を満たさない。同時に3つまで（questRoom）。
 */
export interface QuestDef {
  id: string
  /** 付録A の番号 */
  number: number
  /** 帳に出す題（【創作】） */
  title: string
  type: '調べる' | '届ける' | 'とりもつ' | '番外'
  /** かかわる妖怪 */
  yokai: string[]
  start: Condition[]
  done: Condition[]
  /** 今日の絵解きでましろが振り返る一言（【創作】） */
  recap?: string
}

export interface QuestFile {
  version: 1
  note?: string
  quests: QuestDef[]
}

export interface ItemFile {
  version: 1
  note?: string
  items: ItemDef[]
}

// ---- 便り（段階4b） ----

/**
 * 便りの部品。届いた時に、どの部品を使うかを id で残す（あとで文を直しても、届いた便りの組み立ては変えない）。
 * p: ましろの地の文 / quote: 白描の頁の中の、妖怪の言葉 / card: 札の枠（題・本文・出典） /
 * sheen: [艶0〜1段, 2段から]。届いた時に選ぶ（id.a / id.b）
 */
export type LetterPart =
  | { id: string; p: string; when?: Condition[] }
  | { id: string; quote: string; yokai: string; when?: Condition[] }
  | { id: string; card: string; lead?: string }
  | { id: string; sheen: [string, string]; yokai: string }

/** 決まった便り（また聞き・悩みの便り）。文はすべて【創作】。伝承の事実は札の部品だけ */
export interface LetterDef {
  id: string
  title: string
  kind: 'matagiki' | 'quest'
  /** だれの話か（妖怪の id） */
  about?: string
  /** このフラグが立った物語の日から days 日あと（0＝すぐ）の、はじめて開いたときに届く */
  after: { flag: string; days: 0 | 1 }
  /** はじめて読んだときに立てるフラグ */
  onRead?: { flag: string }
  /** 了承待ち（了承まで届けない。02 F-71） */
  needsConsent?: true
  parts: LetterPart[]
}

/** 「ましろの便り」の、妖怪の話の一行 */
export interface SnippetLine {
  id: string
  text: string
  when?: Condition[]
}

/** 「ましろの便り」（遊んだ日のあと、はじめて開いた日に1通。部品の組み合わせ） */
export interface DailyLetterDef {
  title: string
  /** 呼び名を聞く一文（呼び名を書いても消してもいない間だけ出す） */
  askName: string
  open: string[]
  close: string[]
  /** そえる一言（1通に1つまで。max は、これまでの便りで使った回数の上限） */
  hints: { id: 'etoki-before' | 'kuragari' | 'yobanashi' | 'etoki'; text: string; max: number }[]
  /** 妖怪ごと。a＝艶0〜1段、b＝2段から */
  snippets: Record<string, { a: SnippetLine[]; b: SnippetLine[] }>
}

export interface TayoriFile {
  version: 1
  note?: string
  creative: true
  review: ReviewState
  letters: LetterDef[]
  daily: DailyLetterDef
  /** 夜話に来なかった、その日に会ったなじみの妖怪の気配（妖怪ごとに2つ。日で回す） */
  nightKehai: Record<string, string[]>
}

/** 今日の絵解き（04 §2.4・§3.6）。ましろの振り返りと添え書きは【創作】。一言は選ぶだけ */
export interface EtokiFile {
  version: 1
  note?: string
  creative: true
  review: ReviewState
  /** ましろの振り返り。{呼び名}・{names} が使える */
  recap: { open: string; met: string; metNone: string; newCard: string; pick: string; noCards: string }
  /** 札の添え書き（クエストの日は QuestDef.recap）。{names} が使える */
  caption: { met: string; none: string }
  /** 一言の欄の見出し。{呼び名} が使える */
  phraseLabel: string
  phrases: { id: string; text: string }[]
  lines: { saved: string; bye: string; pairBlocked: string }
}

/** core の仕組みが読む物語のデータ（StoryPack はこれを満たす） */
export interface StoryData {
  yokai: Record<string, YokaiDef>
  scripts: Record<string, DialogueScript>
  cards: Record<string, LoreCard>
  quests: QuestDef[]
  items: Record<string, ItemDef>
  mandala: MandalaDef
  tayori: TayoriFile
  etoki: EtokiFile
}
