import { execSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { BrowserCommand } from 'vitest/node'

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

// The benchmark runs in the browser, where its measured scroll-step numbers
// only reach the browser console — which Vitest does not forward to stdout, so
// the figures never surface in CI. This command bridges that gap: the bench
// calls it (see `commands.reportPerf` in the bench), and it runs back here in
// Node where it can write to the perf job's stdout and the GitHub Actions job
// summary so the median/min/max show on every run, not just failing ones.
let summaryHeaderWritten = false

const reportPerf: BrowserCommand<
  [label: string, stats: { median: number; min: number; max: number }]
> = (_ctx, label, stats) => {
  const median = stats.median.toFixed(1)
  const min = stats.min.toFixed(1)
  const max = stats.max.toFixed(1)

  // Stdout, captured by the perf job's logs.
  process.stdout.write(
    `[perf] ${label} scroll step ms — median ${median}, min ${min}, max ${max}\n`,
  )

  // GitHub Actions job summary, rendered on the run page.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    let md = ''
    if (!summaryHeaderWritten) {
      md +=
        '\n### Scroll-speed benchmark (per-step ms)\n\n' +
        '| Benchmark | Median | Min | Max |\n' +
        '| --- | --- | --- | --- |\n'
      summaryHeaderWritten = true
    }
    md += `| ${label} | ${median} | ${min} | ${max} |\n`
    appendFileSync(summaryPath, md)
  }
}

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
      commands: { reportPerf },
      instances: [{ browser: 'chromium' }],
    },
  },
})
