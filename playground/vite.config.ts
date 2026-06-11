import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone Vite app for exercising the library against its live source.
// Not part of the published package (see the `files` allowlist in package.json).
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Resolve the package name to the live source so edits under src/ are
      // reflected without a rebuild of dist.
      tablegx: resolve(__dirname, '../src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    // The Replit preview proxies the dev server through an iframe on a
    // different origin, so all hosts must be allowed.
    allowedHosts: true,
  },
})
