// 引き継ぎ（02 F-51）の端末側。進み具合を「引き継ぎコード」（文字列）に書き出し、ほかの端末で読み込んで合わせる。
//
// - サーバーはまだ無い（置き場所・保存期間・消し方は PO の確認待ち。02 §6）。それまでは、コードを手で写す（コピー・ファイル）。
//   サーバーができたら、このコードをそのまま預ける形にする。
// - 運ぶのは物語の進み具合だけ（立山のふもと・テスト用の土地）。テスト用の土地そのもの（家の近くの位置）、
//   シミュレーターの保存、端末の設定は運ばない（F-52。test-land.ts の決まり）。座標はもともと進み具合に入っていない。
// - 読み込むときは上書きせず、いまの保存と合わせる（縁・ピースは下がらない。02 §4.4「一度配ったものは取り上げない」）。
// - コードの形: 'YU1-' ＋ JSON（Envelope）を deflate-raw で縮めて base64url にしたもの。
//   版2（10/18）: saves を土地の名前（iwakuraji・test）で持つ（端末の保存の名前を変えても、コードの形は変えないため。4a review F1）。
//   版1: saves を保存の名前（yume.story.v1・yume.story.test.v1）で持っていた。読むときは土地の名前に直す（読める）。

import { LEGACY_STORY_KEY, LEGACY_TEST_KEY, STORY_KEY, TEST_KEY } from '../storage-keys'
import { type KeyValueStore, mergeProgress, migrateLegacySave, type Progress, sanitize, UnknownVersion } from './progress'

/** 運んでよい土地 → 端末の保存の名前（これ以外は書き出さない・読み込まない） */
export const TRANSFER_SAVES = { iwakuraji: STORY_KEY, test: TEST_KEY } as const
export type TransferLand = keyof typeof TRANSFER_SAVES
export const TRANSFER_LANDS = Object.keys(TRANSFER_SAVES) as TransferLand[]
/** 版1 のコードの、保存の名前 → 土地 */
const V1_LANDS = new Map<string, TransferLand>([
  [LEGACY_STORY_KEY, 'iwakuraji'],
  [LEGACY_TEST_KEY, 'test'],
])

const PREFIX = 'YU1-'

interface Envelope {
  format: 'yumeutsutsu-save'
  v: 2
  exportedAt: string
  saves: Partial<Record<TransferLand, Progress>>
}

export interface ImportResult {
  /** 合わせた土地 */
  merged: TransferLand[]
  /** 書き出した日時（ISO） */
  exportedAt: string
}

const toBase64Url = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): Uint8Array => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

/** 端末の保存から、引き継ぎコードを作る。運ぶものが何も無ければ null */
export async function exportTransferCode(storage: KeyValueStore, now = new Date()): Promise<string | null> {
  const saves: Envelope['saves'] = {}
  for (const land of TRANSFER_LANDS) {
    const key = TRANSFER_SAVES[land]
    migrateLegacySave(storage, key)
    const raw = storage.getItem(key)
    if (!raw) continue
    try {
      saves[land] = sanitize(JSON.parse(raw))
    } catch {
      // 読めない保存は運ばない
    }
  }
  if (!Object.keys(saves).length) return null
  const env: Envelope = { format: 'yumeutsutsu-save', v: 2, exportedAt: now.toISOString(), saves }
  const packed = await pipeThrough(new TextEncoder().encode(JSON.stringify(env)), new CompressionStream('deflate-raw'))
  return PREFIX + toBase64Url(packed)
}

/** コードを読む（端末には書かない）。版1 のコードは版2 の形に直して返す。読めなければ例外 */
export async function readTransferCode(code: string): Promise<Envelope> {
  const text = code.replace(/\s+/g, '')
  if (!text.startsWith(PREFIX)) throw new Error('引き継ぎコードではないようです')
  let raw: { format?: unknown; v?: unknown; exportedAt?: unknown; saves?: unknown }
  try {
    const json = await pipeThrough(fromBase64Url(text.slice(PREFIX.length)), new DecompressionStream('deflate-raw'))
    raw = JSON.parse(new TextDecoder().decode(json))
  } catch {
    throw new Error('コードの一部が欠けているようです。もう一度、全部を写してください')
  }
  const saves = raw?.saves
  if (raw?.format !== 'yumeutsutsu-save' || (raw.v !== 1 && raw.v !== 2) || !saves || typeof saves !== 'object' || Array.isArray(saves))
    throw new Error('この引き継ぎコードの形は読めません')
  // 版1 は保存の名前、版2 は土地の名前で持つ。知らない名前は読まない
  const env: Envelope = { format: 'yumeutsutsu-save', v: 2, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', saves: {} }
  for (const [name, save] of Object.entries(saves as Record<string, unknown>)) {
    const land = raw.v === 1 ? V1_LANDS.get(name) : TRANSFER_LANDS.find((l) => l === name)
    if (land && save) env.saves[land] = save as Progress
  }
  // 中の保存が、このページで読める版か（読めなければ、読み込む前に断る。端末には何も書かない）
  for (const land of TRANSFER_LANDS) {
    if (!env.saves[land]) continue
    try {
      sanitize(env.saves[land])
    } catch (e) {
      if (e instanceof UnknownVersion) throw new Error('新しい版のゲームで作ったコードのようです。このページを読み込み直してから、もう一度試してください')
      throw new Error('このコードの中身が読めません。書き出した端末で、もう一度コードを作ってください')
    }
  }
  return env
}

/** コードを読み込み、いまの端末の保存と合わせて書く */
export async function importTransferCode(code: string, storage: KeyValueStore): Promise<ImportResult> {
  const env = await readTransferCode(code)
  const merged: TransferLand[] = []
  const writes: [string, string][] = []
  for (const land of TRANSFER_LANDS) {
    const incoming = env.saves[land]
    if (!incoming) continue
    const key = TRANSFER_SAVES[land]
    const theirs = sanitize(incoming)
    // 前の名前の保存は、先にいまの名前へ写してから合わせる（コードだけで作ると、前の名前の進み具合をもう写せなくなる）
    migrateLegacySave(storage, key)
    let raw: string | null = null
    let mine: Progress | null = null
    try {
      raw = storage.getItem(key)
      mine = raw ? sanitize(JSON.parse(raw)) : null
    } catch {
      // 読めない保存（壊れた JSON・知らない版）は、上書きする前に別の鍵へ写しておく（ProgressStore と同じ）
      if (raw) writes.push([`${key}.broken`, raw])
      mine = null
    }
    writes.push([key, JSON.stringify(mine ? mergeProgress(mine, theirs) : theirs)])
    merged.push(land)
  }
  // 先に全部を合わせてから書く。書く途中で止まったら（端末の空きが足りないなど）、書く前の値に戻してから投げる
  // （片方の土地だけ書いたままにしない。札は「保存できませんでした」と出し、進み具合はそのまま）
  const before = writes.map(([key]) => [key, storage.getItem(key)] as const)
  try {
    for (const [key, value] of writes) storage.setItem(key, value)
  } catch (e) {
    for (const [key, value] of before) {
      try {
        if (value === null) storage.removeItem(key)
        else storage.setItem(key, value)
      } catch {
        // 戻せなくても、ほかの鍵は戻す
      }
    }
    throw e
  }
  return { merged, exportedAt: env.exportedAt }
}
