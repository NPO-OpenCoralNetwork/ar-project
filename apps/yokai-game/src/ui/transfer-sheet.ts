// 引き継ぎの札（02 F-51。いまはサーバーを使わない試作）。コードの作り方・合わせ方は core/story/transfer.ts。
// 入口（index.html#hikitsugi）から開く。ほかのページ（夢の旅の支度など）からも同じ札を開けるよう、ui に置く（札の地は開くページが用意する）。
//
// - コードを作る: この端末の進み具合（立山のふもと・テスト用の土地）を、YU1- で始まる文字にする。写す（コピー）か、ファイルに書き出す。
// - コードを読み込む: 貼りつけるか、ファイルから。いまの端末の保存と合わせる（上書きしない。縁やピースは下がらない）。
//   開いたままのほかのタブは、保存が書き換わったのを見て進み具合を入れ替える（ProgressStore.follow。古い進み具合で書き戻さない）。
//   ただ、そのタブで開いている画面（話の途中など）は、開き直すまで前のままのことがあるので、そう短く一言書く。
// - テスト用の土地そのもの（家の近くの地図と地点）は、コードに入らない（transfer.ts の TRANSFER_SAVES）。そのことを札に書いておく。
// - コードは人に渡さない（旅印や進み具合が、その人の端末にも写る。旅印は人に譲るものではない。02 §4.5）。
// - 縁は数で見せない。読み込んだあとに出すのは、会った妖怪と開いた札の数だけ（入口の「つづき」と同じ）。
// - 端末の保存を長く残すよう、ここで読み込めたときに一度だけ静かに頼む（ui/persist.ts の persistOnce。押したあとで、ページはそのまま）。
//   iPhone の Safari は、7日ほど開かないでいると、そのサイトの保存を消すことがある。確かなのは引き継ぎコードなので、札に一行だけ書く。
// three.js は読み込まない。

import './transfer-sheet.css'
import { browserStorage, type KeyValueStore, ProgressStore } from '../core/story/progress'
import { exportTransferCode, importTransferCode, readTransferCode, TRANSFER_LANDS, TRANSFER_SAVES, type TransferLand } from '../core/story/transfer'
import { loadTestLand } from '../utsutsu/test-land'
import { focusSheet } from './focus'
import { persistOnce } from './persist'

/** 読み込むファイルの大きさの上限（コードは数 KB。取り違えた大きなファイルは読まない） */
const FILE_MAX = 256 * 1024

/** 札に出す土地の名前 */
const LAND_NAME: Record<TransferLand, string> = { iwakuraji: '立山のふもと', test: 'テスト用の土地' }

export interface TransferFlow {
  /** 札を置く所（中身を入れ替える）。札の地はページが用意する */
  host: HTMLElement
  /** もどる（入口へ など） */
  back: { label: string; go: () => void }
}

/**
 * コードを作る・読む仕組みが、このブラウザにあるか（deflate-raw の圧縮。iPhone は iOS 16.4 から）。
 * Chromium 80〜102 は CompressionStream があっても deflate-raw を断るので、作ってみて確かめる
 */
const canCode = (): boolean => {
  try {
    new CompressionStream('deflate-raw')
    new DecompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * 句ごとに折り返す（promise-sheet の phrases と同じ .ph）。この札は注意書きに括弧が多いので、
 * 「、。」のあとに加えて「（」「「」の前と「）」「」」のあとでも分ける（括弧の中の途中で行が分かれにくいように。
 * 「…の土地）だけで／す。」と、括弧のあとの字だけが次の行へ落ちないように）。
 * ただし括弧のすぐあとの2字までのかな（「）は、」「」で」「）です。」）は、括弧の句に付ける（「は、」だけの句や、「で」で始まる行を作らない）
 */
function phrases(s: string): string {
  const parts = s.match(/[（「]?[^、。（「）」]+(?:[）」]+(?:[ぁ-ゖ]{1,2}(?![ぁ-ゖ]))?)?[、。]*/g) ?? []
  // 分けきれない形（括弧が続くなど）は、分けずに出す（字を落とさない）
  return (parts.join('') === s ? parts : [s]).map((p) => `<span class="ph">${escapeHtml(p)}</span>`).join('')
}

/** 日時を「2026.10.18 15:20」の形に（読めなければ空） */
function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * その土地の進み具合を、ことばで（会った妖怪と開いた札の数。縁は数で見せない）。HTML を返す。
 * 二つの数でひとつの句にし、数ごとにひと続きにする（「開いた／札 9」と語の途中で分けない。
 * 土地の名前のあとに収まらなければ句ごと次の行へ。それでも収まらないときだけ「・」のあとで分ける）
 */
function countsOf(storage: KeyValueStore, land: TransferLand): string {
  const p = new ProgressStore(storage, TRANSFER_SAVES[land]).get()
  const met = Object.values(p.yokai).filter((y) => y.met).length
  return `<span class="ph"><span>会った妖怪 ${met}・</span><span>開いた札 ${Object.keys(p.cards).length}</span></span>`
}

/** 写す。navigator.clipboard が使えなければ、選んで copy を試す。写せたら true */
async function copyText(box: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(box.value)
    return true
  } catch {
    // http のページや古いブラウザでは使えない。下の方法で試す
  }
  box.focus({ preventScroll: true })
  box.select()
  box.setSelectionRange(0, box.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  }
}

/** コードを .txt に書き出す（中身はコードだけ。そのまま「ファイルから」で読める）。ファイル名を返す */
function saveFile(code: string, at: Date): string {
  const name = `yumeutsutsu-hikitsugi-${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}.txt`
  const url = URL.createObjectURL(new Blob([`${code}\n`], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.hidden = true
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

/** 引き継ぎの札を出す */
export function showTransfer(flow: TransferFlow): void {
  const storage = browserStorage()
  flow.host.innerHTML = `
    <div class="tf-card">
      <button class="tf-back tf-top" type="button" data-act="back"></button>
      <h1>引き継ぎ<span class="kari">（試作）</span></h1>
      <p class="tf-lead">${phrases('PC とスマホ、別の端末で続きを遊ぶための、引き継ぎコードです。いまはサーバーを使わず、コードを自分で写します。')}</p>
      <ul class="tf-notes">
        <li>${phrases('運ぶのは、旅の進み具合（立山のふもと・テスト用の土地）だけです。')}</li>
        <li>${phrases('テスト用の土地の、場所（家の近くの地図と地点）は、コードに入りません。')}</li>
      </ul>
      <section class="tf-part" aria-labelledby="tf-out-h">
        <h2 id="tf-out-h">コードを作る<small>この端末から</small></h2>
        <p class="tf-soft">${phrases('いまの進み具合を、コードにします。')}</p>
        <div class="tf-row"><button class="tf-btn main" type="button" data-act="make">コードを作る</button></div>
        <div class="tf-made" hidden>
          <label class="tf-label" for="tf-code">引き継ぎコード</label>
          <textarea id="tf-code" class="tf-code" readonly rows="5" spellcheck="false" autocomplete="off"></textarea>
          <p class="tf-soft tf-what"></p>
          <div class="tf-row">
            <button class="tf-btn" type="button" data-act="copy">コピー</button>
            <button class="tf-btn" type="button" data-act="save">ファイルに保存</button>
          </div>
        </div>
        <div class="tf-msg" data-msg="out" role="status" aria-live="polite"></div>
        <p class="tf-warn">${phrases('コードは人に渡さないでください（旅印や進み具合が、その人の端末にも写ります）。')}</p>
      </section>
      <section class="tf-part" aria-labelledby="tf-in-h">
        <h2 id="tf-in-h">コードを読み込む<small>この端末へ</small></h2>
        <label class="tf-label" for="tf-paste">${phrases('別の端末で作ったコードを、ここに貼りつけます。')}</label>
        <textarea id="tf-paste" class="tf-code" rows="4" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="YU1-…"></textarea>
        <div class="tf-row">
          <button class="tf-btn main" type="button" data-act="load">読み込む</button>
          <button class="tf-btn" type="button" data-act="file">ファイルから</button>
          <input type="file" accept=".txt,text/plain" hidden data-act="pick" />
        </div>
        <p class="tf-soft">${phrases('この端末の進み具合と合わせます（上書きしません）。縁やピースは下がりません。')}</p>
        <div class="tf-msg" data-msg="in" role="status" aria-live="polite"></div>
      </section>
      <p class="tf-soft tf-keep">${phrases('iPhone の Safari では、7日ほど開かないでいると、この端末の記録が消えることがあります。引き継ぎコードを取っておくと安心です。')}</p>
      <button class="tf-back" type="button" data-act="back"></button>
    </div>`
  const card = flow.host.querySelector('.tf-card') as HTMLElement
  const q = <T extends Element>(sel: string) => card.querySelector(sel) as T
  const makeBtn = q<HTMLButtonElement>('[data-act="make"]')
  const made = q<HTMLElement>('.tf-made')
  const codeBox = q<HTMLTextAreaElement>('#tf-code')
  const what = q<HTMLElement>('.tf-what')
  const outMsg = q<HTMLElement>('[data-msg="out"]')
  const paste = q<HTMLTextAreaElement>('#tf-paste')
  const loadBtn = q<HTMLButtonElement>('[data-act="load"]')
  const fileBtn = q<HTMLButtonElement>('[data-act="file"]')
  const picker = q<HTMLInputElement>('[data-act="pick"]')
  const inMsg = q<HTMLElement>('[data-msg="in"]')
  // もどる（札の頭と終わりに。長い札なので、頭からも戻れるように）
  card.querySelectorAll<HTMLButtonElement>('[data-act="back"]').forEach((b) => {
    b.textContent = flow.back.label
    b.addEventListener('click', () => flow.back.go())
  })

  /** 知らせの欄に書く（kind は見た目の枠。言葉でも分かるように、成否は文の頭に書く） */
  const say = (box: HTMLElement, html: string, kind: 'ok' | 'err' | 'plain') => {
    box.className = `tf-msg ${kind}`
    box.innerHTML = html
    // スマホでは知らせが画面の下に出ることがあるので、見える所まで送る（動きを減らす設定なら、すぐに）
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (html) box.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }
  /**
   * 作る・読む間は、ボタンを受けない（続けて押しても二度書かない）。disabled にすると、押したボタンから
   * キーボードの位置が <body> へ落ちるので、aria-disabled と印で止める
   */
  let working = false
  const busy = (on: boolean) => {
    working = on
    for (const b of [makeBtn, loadBtn, fileBtn]) b.setAttribute('aria-disabled', String(on))
    card.setAttribute('aria-busy', String(on))
  }
  const unusable = (): string | null =>
    !storage
      ? 'この端末では保存が使えないため、引き継ぎができません（プライベートブラウズのときなど）。'
      : !canCode()
        ? 'このブラウザでは、引き継ぎコードを使えません。新しいブラウザで開いてください。'
        : null

  // ------------------------------------------------ コードを作る
  let madeAt = new Date()
  makeBtn.addEventListener('click', async () => {
    if (working) return
    const no = unusable()
    if (no || !storage) {
      say(outMsg, `<p>${phrases(no ?? '')}</p>`, 'err')
      return
    }
    busy(true)
    try {
      const code = await exportTransferCode(storage)
      if (!code) {
        made.hidden = true
        say(outMsg, `<p>${phrases('まだ、運ぶ進み具合がありません。旅で妖怪に会うと、コードを作れます。')}</p>`, 'plain')
        return
      }
      const env = await readTransferCode(code)
      const lands = TRANSFER_LANDS.filter((l) => env.saves[l]).map((l) => LAND_NAME[l])
      madeAt = new Date(env.exportedAt)
      codeBox.value = code
      what.innerHTML = phrases(`${when(env.exportedAt)} の進み具合（${lands.join('・')}）です。`)
      made.hidden = false
      // 欄の高さを、コードの長さに合わせる（長いときは欄の中で送る）
      codeBox.style.height = ''
      codeBox.style.height = `${Math.min(codeBox.scrollHeight + 2, 260)}px`
      makeBtn.textContent = 'コードを作り直す'
      say(outMsg, `<p><b>コードを作りました。</b>${phrases('別の端末で、この画面の「コードを読み込む」へ、貼りつけてください。')}</p>`, 'ok')
    } catch {
      say(outMsg, `<p><b>コードを作れませんでした。</b>${phrases('もう一度、試してください。')}</p>`, 'err')
    } finally {
      busy(false)
    }
  })
  // 読むだけの欄は、触れたら全部を選ぶ（長押しで写しやすく）
  codeBox.addEventListener('focus', () => codeBox.setSelectionRange(0, codeBox.value.length))
  q<HTMLButtonElement>('[data-act="copy"]').addEventListener('click', async () => {
    if (await copyText(codeBox)) say(outMsg, `<p><b>コピーしました。</b>${phrases('別の端末で貼りつけてください。')}</p>`, 'ok')
    else say(outMsg, `<p><b>コピーできませんでした。</b>${phrases('コードを選んだので、長押し（PC は Ctrl+C か ⌘+C）で写してください。')}</p>`, 'err')
  })
  q<HTMLButtonElement>('[data-act="save"]').addEventListener('click', () => {
    const name = saveFile(codeBox.value, madeAt)
    // ファイル名は長いので、ひとつの句にして「です。」を次の行へ送る（名前の途中で「で／す」と分かれないように）
    say(outMsg, `<p><b>ファイルに書き出しました。</b>${phrases(`「${name}」`)}${phrases('です。別の端末の「ファイルから」で読み込めます。')}</p>`, 'ok')
  })

  // ------------------------------------------------ コードを読み込む
  const load = async (text: string): Promise<void> => {
    if (working) return
    const no = unusable()
    if (no || !storage) {
      say(inMsg, `<p>${phrases(no ?? '')}</p>`, 'err')
      return
    }
    if (!text.trim()) {
      say(inMsg, `<p><b>コードがありません。</b>${phrases('別の端末で作ったコード（YU1- で始まる文字）を、貼りつけてください。')}</p>`, 'err')
      return
    }
    busy(true)
    try {
      // 先に読むだけ試す（読めないコードなら、端末には何も書かない）
      try {
        await readTransferCode(text)
      } catch (e) {
        const m = e instanceof Error && e.message ? e.message.replace(/。?$/, '。') : '読めないコードです。'
        say(inMsg, `<p><b>読み込めませんでした。</b>${phrases(m)}</p><p>${phrases('この端末の進み具合は、そのままです。')}</p>`, 'err')
        return
      }
      const r = await importTransferCode(text, storage)
      if (!r.merged.length) {
        say(inMsg, `<p><b>読み込みました。</b>${phrases('ただ、このコードには進み具合が入っていませんでした。')}</p>`, 'plain')
        return
      }
      const at = when(r.exportedAt)
      const rows = r.merged.map((l) => `<li><b>${LAND_NAME[l]}</b>${countsOf(storage, l)}</li>`).join('')
      const noLand = r.merged.includes('test') && !loadTestLand()
      say(
        inMsg,
        // 日時と「作ったコードです。」は別の句に（狭い画面で「コードで／す。」と分かれないように）
        `<p><b>読み込みました。</b>${at ? `${phrases(`${at} に`)}${phrases('作ったコードです。')}` : ''}</p>
        <p>${phrases('この端末の進み具合と、合わせました。縁やピースは下がりません。いまの進み具合は、')}</p>
        <ul class="tf-lands">${rows}</ul>
        ${noLand ? `<p>${phrases('テスト用の土地は、進み具合だけが入りました。土地は、この端末の現の旅で、現地で作ると続きを遊べます。')}</p>` : ''}
        <p class="tf-tabs">${phrases('ほかのタブの画面は、開き直すまで、前の進み具合のままかもしれません。')}</p>`,
        'ok',
      )
      paste.value = ''
      // 作ってあったコードは、読み込む前の進み具合なので下げる（作り直してもらう）
      made.hidden = true
      codeBox.value = ''
      makeBtn.textContent = 'コードを作る'
      say(outMsg, '', 'plain')
      // まっさらな端末に読み込んだときも、ここで一度だけ頼む
      persistOnce()
    } catch {
      say(inMsg, `<p><b>保存できませんでした。</b>${phrases('端末の空きが足りないのかもしれません。')}</p>`, 'err')
    } finally {
      busy(false)
    }
  }
  loadBtn.addEventListener('click', () => void load(paste.value))
  fileBtn.addEventListener('click', () => {
    if (!working) picker.click()
  })
  picker.addEventListener('change', async () => {
    const f = picker.files?.[0]
    picker.value = ''
    if (!f) return
    if (f.size > FILE_MAX) {
      say(inMsg, `<p><b>読み込めませんでした。</b>${phrases('引き継ぎコードのファイル（.txt）ではないようです。')}</p><p>${phrases('この端末の進み具合は、そのままです。')}</p>`, 'err')
      return
    }
    let text = ''
    try {
      text = await f.text()
    } catch {
      say(inMsg, `<p><b>ファイルを読めませんでした。</b>${phrases('この端末の進み具合は、そのままです。')}</p>`, 'err')
      return
    }
    paste.value = text.trim()
    await load(paste.value)
  })

  focusSheet(card)
}
