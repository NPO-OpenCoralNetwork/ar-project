import { existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 夢の旅の箱庭（yume.html）だけを1つの HTML（dist-artifact/index.html）にまとめる（Claude のアーティファクトで iPhone からすぐ見るため）。
// index.html は入口のページなので、ここには入れない（mode を 'artifact' にして、箱庭の板に入口へのリンクを出さない）。
const outDir = resolve(import.meta.dirname, 'dist-artifact')

/** 出力の yume.html を index.html に名前を変える */
const renameToIndex = (): Plugin => ({
  name: 'yume-index',
  apply: 'build',
  closeBundle() {
    const from = resolve(outDir, 'yume.html')
    if (existsSync(from)) renameSync(from, resolve(outDir, 'index.html'))
  },
})

export default defineConfig({
  base: './',
  mode: 'artifact',
  plugins: [viteSingleFile(), renameToIndex()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'yume.html') },
  },
})
