// 物語の仕組みのテスト（tests/*.test.ts）を走らせる（npm run test:story）。build とは別（build はテストの道具に頼らない）。
//
// - 1つずつ rolldown で束ね（node_modules/.cache/yokai-tests/）、node で二つの時間帯（Asia/Tokyo・America/New_York）で走らせる。
//   立山の時刻は端末の時間帯に関係なく同じ結果になるはずなので、テストが出す「= 名前 値」の行も、二つの時間帯で見比べる。
// - 「FAIL」の行か、終わりの行（「-- n ok, m fail」）が無いか、終了コードが 0 でなければ落ちたとする。まとめを出し、落ちたら 1 で終える。
// - 引数で名前の一部を渡すと、そのテストだけ（例: npm run test:story -- clock letters）。

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rolldown = join(root, 'node_modules', '.bin', 'rolldown')
// node_modules は、ほかの作業コピーとリンクで共有していることがあるので、作業コピーごとに置き場所を分ける
const outDir = join(root, 'node_modules', '.cache', 'yokai-tests', createHash('sha1').update(root).digest('hex').slice(0, 8))
const TIME_ZONES = ['Asia/Tokyo', 'America/New_York']

const only = process.argv.slice(2)
const files = readdirSync(join(root, 'tests'))
  .filter((f) => f.endsWith('.test.ts'))
  .filter((f) => !only.length || only.some((x) => f.includes(x)))
  .sort()
if (!files.length) {
  console.error('テストが見つからない')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const rows = []
let bad = 0
for (const f of files) {
  const name = f.replace(/\.test\.ts$/, '')
  const bundle = join(outDir, `${name}.mjs`)
  const b = spawnSync(rolldown, [join('tests', f), '-o', bundle, '--platform', 'node', '--format', 'esm'], { cwd: root, encoding: 'utf8' })
  if (b.status !== 0) {
    bad++
    rows.push(`FAIL ${name}: 束ねられない`)
    console.log(`\n## ${name}: 束ねられない\n${b.stdout}${b.stderr}`)
    continue
  }
  const snaps = new Map()
  const parts = []
  let fileBad = false
  for (const tz of TIME_ZONES) {
    const r = spawnSync(process.execPath, [bundle], { cwd: root, encoding: 'utf8', env: { ...process.env, TZ: tz }, timeout: 120_000 })
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const lines = text.split('\n')
    const fails = lines.filter((l) => l.startsWith('FAIL'))
    const summary = lines.filter((l) => l.startsWith('-- ')).pop()
    snaps.set(tz, lines.filter((l) => l.startsWith('= ')).join('\n'))
    if (r.status !== 0 || fails.length || !summary) {
      fileBad = true
      console.log(`\n## ${name} (TZ=${tz})\n${fails.length ? fails.join('\n') : lines.slice(-30).join('\n')}`)
    }
    parts.push(`${tz}: ${summary ? summary.slice(3) : '終わらなかった'}`)
  }
  const [a, z] = TIME_ZONES.map((tz) => snaps.get(tz))
  if (a !== z) {
    fileBad = true
    console.log(`\n## ${name}: 時間帯で結果が違う\n--- ${TIME_ZONES[0]}\n${a}\n--- ${TIME_ZONES[1]}\n${z}`)
  }
  if (fileBad) bad++
  rows.push(`${fileBad ? 'FAIL' : 'ok  '} ${name.padEnd(14)} ${parts.join(' / ')}${a === z ? '' : '（時間帯で違う）'}`)
}
console.log(`\n物語のテスト（${TIME_ZONES.join('・')}）`)
for (const r of rows) console.log(r)
console.log(bad ? `\n${bad} 件落ちた` : '\nすべて通った')
process.exit(bad ? 1 : 0)
