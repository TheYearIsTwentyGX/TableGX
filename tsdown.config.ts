import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  fixedExtension: false,
  banner: {
    js: '"use client";',
  },
  deps: {
    neverBundle: ['react', 'react-dom'],
  },
  onSuccess: async () => {
    copyFileSync('src/theme.css', 'dist/theme.css')
  },
})
