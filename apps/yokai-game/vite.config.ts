import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// GitHub Pages などのサブパスでも動くように相対パスで出力する
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gpsTest: resolve(import.meta.dirname, 'gps-test.html'),
      },
    },
  },
})
