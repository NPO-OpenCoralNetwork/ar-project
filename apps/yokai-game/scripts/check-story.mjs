// 物語のデータの点検（npm run check:story）。story-pack.ts の loadStoryPack() を rolldown で束ねて走らせ、problems を出す。
// 1つでもあれば 1 で終える（build には入れていない）。

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rolldown = join(root, 'node_modules', '.bin', 'rolldown')
// node_modules は、ほかの作業コピーとリンクで共有していることがあるので、作業コピーごとに置き場所を分ける
const outDir = join(root, 'node_modules', '.cache', 'yokai-tests', createHash('sha1').update(root).digest('hex').slice(0, 8))
mkdirSync(outDir, { recursive: true })

const entry = join(outDir, 'check-story-entry.ts')
const bundle = join(outDir, 'check-story.mjs')
writeFileSync(
  entry,
  `import { loadStoryPack } from ${JSON.stringify(join(root, 'src', 'data', 'story-pack.ts'))}
const { problems } = loadStoryPack()
for (const p of problems) console.log('- ' + p)
console.log(problems.length ? '物語のデータに ' + problems.length + ' 件の問題' : '物語のデータに問題なし')
process.exitCode = problems.length ? 1 : 0
`,
)
const b = spawnSync(rolldown, [entry, '-o', bundle, '--platform', 'node', '--format', 'esm'], { cwd: root, encoding: 'utf8' })
if (b.status !== 0) {
  console.error(`束ねられない\n${b.stdout}${b.stderr}`)
  process.exit(1)
}
const r = spawnSync(process.execPath, [bundle], { cwd: root, stdio: 'inherit' })
process.exit(r.status ?? 1)
