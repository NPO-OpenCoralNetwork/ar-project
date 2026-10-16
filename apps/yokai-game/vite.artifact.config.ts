import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 夢の旅の箱庭だけを1つの HTML にまとめる（Claude のアーティファクトで iPhone からすぐ見るため）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-artifact', emptyOutDir: true },
})
