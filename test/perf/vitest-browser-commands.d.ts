// Augments Vitest's browser command registry with the custom `reportPerf`
// command defined in `vitest.browser.config.ts`, so the benchmark can call
// `commands.reportPerf(...)` from the browser with full type safety.
declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    reportPerf: (
      label: string,
      stats: { median: number; min: number; max: number },
    ) => Promise<void>
  }
}

export {}
