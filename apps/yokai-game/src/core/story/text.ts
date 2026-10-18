// 物語の文の差し込みと、書かない言葉の点検（段階4b）。描画に依存しない。
//
// - 差し込み: {呼び名}（ましろの覚え書き。無ければ「きみ」）と、データごとの差し込み（{names} など）。
//   呼び名は遊ぶ人が書いた字なので、画面には textContent か escapeHtml で出す（ここでは文字列を返すだけ）。
// - 書かない言葉（04 §7・§5.2、05、09）: 社寺の名・同じ名の地名・祭神の名（FORBIDDEN_NAMES）、雷鳥（RAICHO_WORDS。04 §3.6）、
//   罪悪感で呼び戻す言葉・離れた日数・夜の外出へ誘う言葉（GUILT_OR_NIGHT_PHRASES。04 §3.8・§5.1、02 F-62）。
//   点検（validate.ts の lintText）は、遊ぶ人に見える文だけを見る（出典・note は見ない）。

import type { MemoReader } from './memo'

export const YOBINA_TOKEN = '{呼び名}'
export const YOBINA_FALLBACK = 'きみ'

/** {呼び名} を名前か「きみ」に。extra は {names} などデータごとの差し込み。知らない差し込みはそのまま残す */
export function fillTokens(text: string, memo?: MemoReader | null, extra?: Record<string, string>): string {
  return text.replace(/\{([^{}]*)\}/g, (whole, name: string) => {
    if (`{${name}}` === YOBINA_TOKEN) return memo?.yobina ?? YOBINA_FALLBACK
    if (extra && Object.prototype.hasOwnProperty.call(extra, name)) return extra[name]
    return whole
  })
}

/** allowed（'{呼び名}' のような差し込みの字）以外の { … } と、対の無い { } を返す（空なら問題なし） */
export function tokenProblems(text: string, allowed: readonly string[]): string[] {
  const out: string[] = []
  const rest = text.replace(/\{[^{}]*\}/g, (tok) => {
    if (!allowed.includes(tok)) out.push(tok)
    return ''
  })
  for (const ch of rest) if (ch === '{' || ch === '}') out.push(ch)
  return out
}

/** 書かない名前（社寺の名・同じ名の地名・祭神の名・お札の類。04 §7・P01 §5）。どの文にも */
export const FORBIDDEN_NAMES: readonly string[] = [
  '刀尾',
  '権現',
  '雄山',
  '岩峅寺',
  '芦峅寺',
  '千垣',
  '大川寺',
  '有頼',
  '阿弥陀',
  '不動明王',
  '姥尊',
  '布橋',
  '灌頂',
  '神社',
  '御朱印',
  'お守り',
]

/** 雷鳥（04 §3.6・D04:474。便り・夜話・絵解きの文に書かない） */
export const RAICHO_WORDS: readonly string[] = ['雷鳥', 'ライチョウ']

/** 罪悪感で呼び戻す言葉・離れた日数・連続・夜の外出へ誘う言葉（便り・夜話・絵解きの文に書かない） */
export const GUILT_OR_NIGHT_PHRASES: readonly string[] = [
  'ひさしぶり',
  '久しぶり',
  'さみしかった',
  '待ってた',
  '待っていた',
  '来なかった',
  '来てくれなかった',
  '会いに来て',
  '毎日',
  '連続',
  '日ぶり',
  '日間',
  '何日',
  'おいで',
  '出かけよう',
  '見に行こう',
  '外に出よう',
  '夜の散歩',
]

/**
 * 書かない言葉の点検。where は文の場所（例: 「台本 kozobo の場面 n1」）。
 * 書かない名前はいつも見る。raicho で雷鳥、guilt で罪悪感・夜の外出の言葉も見る。見つけた分だけ文を返す
 */
export function lintText(text: string, opts: { where: string; raicho?: boolean; guilt?: boolean }): string[] {
  if (typeof text !== 'string' || !text) return []
  const out: string[] = []
  for (const w of FORBIDDEN_NAMES) if (text.includes(w)) out.push(`${opts.where}: 「${w}」は書かない（社寺・地名・祭神の名。04 §7）`)
  if (opts.raicho) for (const w of RAICHO_WORDS) if (text.includes(w)) out.push(`${opts.where}: 「${w}」は書かない（雷鳥。04 §3.6）`)
  if (opts.guilt)
    for (const w of GUILT_OR_NIGHT_PHRASES) if (text.includes(w)) out.push(`${opts.where}: 「${w}」は書かない（呼び戻し・日数・夜の外出。04 §3.8）`)
  return out
}
