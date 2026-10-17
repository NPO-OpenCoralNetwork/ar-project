import { existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 札スタジオ（card-studio.html）だけを1つの HTML（dist-card/index.html）にまとめる。
// Claude のアーティファクトや iPhone で、ファイル1つを開けば試せるように。
const outDir = resolve(import.meta.dirname, 'dist-card')

/** 出力の card-studio.html を index.html に名前を変える */
const renameToIndex = (): Plugin => ({
  name: 'card-studio-index',
  apply: 'build',
  closeBundle() {
    const from = resolve(outDir, 'card-studio.html')
    if (existsSync(from)) renameSync(from, resolve(outDir, 'index.html'))
  },
})

export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), renameToIndex()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'card-studio.html') },
  },
})
