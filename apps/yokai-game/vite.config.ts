import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// GitHub Pages などのサブパスでも動くように相対パスで出力する
// index.html は入口（二つの旅を選ぶ）。夢の旅の箱庭は yume.html、現の旅は utsutsu.html
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        yume: resolve(import.meta.dirname, 'yume.html'),
        gpsTest: resolve(import.meta.dirname, 'gps-test.html'),
        utsutsu: resolve(import.meta.dirname, 'utsutsu.html'),
      },
    },
  },
})
