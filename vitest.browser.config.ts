import { execSync } from 'node:child_process'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Real-browser performance benchmark project. Kept entirely separate from the
// default `vitest.config.ts` (jsdom) run: the default `npm test` only picks up
// `*.test.*` files, so the `*.bench.tsx` benchmark here never runs under jsdom,
// and this config only includes `*.bench.tsx`, so the jsdom guard never runs in
// the browser. Invoke with `npm run test:perf`.

// Prefer the system (Nix) Chromium, which ships its full shared-library
// closure. Playwright's downloaded chrome-headless-shell can't resolve those
// libs on NixOS. Override with CHROMIUM_EXECUTABLE_PATH if needed.
function resolveChromium(): string | undefined {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH
  try {
    return execSync('which chromium', { encoding: 'utf8' }).trim() || undefined
  } catch {
    return undefined
  }
}

const executablePath = resolveChromium()

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/perf/**/*.bench.tsx'],
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: executablePath ? { executablePath } : undefined,
      }),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
  },
})
