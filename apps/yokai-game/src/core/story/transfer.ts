// 引き継ぎ（02 F-51）の端末側。進み具合を「引き継ぎコード」（文字列）に書き出し、ほかの端末で読み込んで合わせる。
//
// - サーバーはまだ無い（置き場所・保存期間・消し方は PO の確認待ち。02 §6）。それまでは、コードを手で写す（コピー・ファイル）。
//   サーバーができたら、このコードをそのまま預ける形にする。
// - 運ぶのは物語の進み具合だけ（立山のふもと・テスト用の土地）。テスト用の土地そのもの（家の近くの位置）、
//   シミュレーターの保存、端末の設定は運ばない（F-52。test-land.ts の決まり）。座標はもともと進み具合に入っていない。
// - 読み込むときは上書きせず、いまの保存と合わせる（縁・ピースは下がらない。02 §4.4「一度配ったものは取り上げない」）。

import { STORY_KEY, TEST_KEY } from '../storage-keys'
import { type KeyValueStore, mergeProgress, type Progress, sanitize } from './progress'

/** 運んでよい保存の名前（これ以外は書き出さない・読み込まない） */
export const TRANSFER_KEYS = [STORY_KEY, TEST_KEY] as const

const PREFIX = 'YU1-'

interface Envelope {
  format: 'yumeutsutsu-save'
  v: 1
  exportedAt: string
  saves: Partial<Record<(typeof TRANSFER_KEYS)[number], Progress>>
}

export interface ImportResult {
  /** 合わせた保存の名前 */
  merged: string[]
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
  for (const key of TRANSFER_KEYS) {
    const raw = storage.getItem(key)
    if (!raw) continue
    try {
      saves[key] = sanitize(JSON.parse(raw))
    } catch {
      // 読めない保存は運ばない
    }
  }
  if (!Object.keys(saves).length) return null
  const env: Envelope = { format: 'yumeutsutsu-save', v: 1, exportedAt: now.toISOString(), saves }
  const packed = await pipeThrough(new TextEncoder().encode(JSON.stringify(env)), new CompressionStream('deflate-raw'))
  return PREFIX + toBase64Url(packed)
}

/** コードを読む（端末には書かない）。読めなければ例外 */
export async function readTransferCode(code: string): Promise<Envelope> {
  const text = code.replace(/\s+/g, '')
  if (!text.startsWith(PREFIX)) throw new Error('引き継ぎコードではないようです')
  let env: Envelope
  try {
    const json = await pipeThrough(fromBase64Url(text.slice(PREFIX.length)), new DecompressionStream('deflate-raw'))
    env = JSON.parse(new TextDecoder().decode(json)) as Envelope
  } catch {
    throw new Error('コードの一部が欠けているようです。もう一度、全部を写してください')
  }
  if (env?.format !== 'yumeutsutsu-save' || env.v !== 1 || !env.saves || typeof env.saves !== 'object') throw new Error('この引き継ぎコードの形は読めません')
  return env
}

/** コードを読み込み、いまの端末の保存と合わせて書く */
export async function importTransferCode(code: string, storage: KeyValueStore): Promise<ImportResult> {
  const env = await readTransferCode(code)
  const merged: string[] = []
  for (const key of TRANSFER_KEYS) {
    const incoming = env.saves[key]
    if (!incoming) continue
    const theirs = sanitize(incoming)
    let mine: Progress | null = null
    try {
      const raw = storage.getItem(key)
      mine = raw ? sanitize(JSON.parse(raw)) : null
    } catch {
      mine = null
    }
    storage.setItem(key, JSON.stringify(mine ? mergeProgress(mine, theirs) : theirs))
    merged.push(key)
  }
  return { merged, exportedAt: typeof env.exportedAt === 'string' ? env.exportedAt : '' }
}
