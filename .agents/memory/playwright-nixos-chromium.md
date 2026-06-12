---
name: Playwright browser tests on NixOS
description: Why Vitest browser-mode / Playwright must use the Nix system Chromium, not the bundled one.
---

Vitest browser mode (`@vitest/browser` + `@vitest/browser-playwright`) and any
Playwright launch in this Replit/NixOS environment must point at the Nix
**system** Chromium, not Playwright's downloaded `chrome-headless-shell`.

**Why:** the downloaded binary fails at launch with
`error while loading shared libraries: libglib-2.0.so.0` — NixOS has no global
lib paths, so the prebuilt browser can't resolve its closure. Installing the
`chromium` Nix system dependency brings a browser with its full runtime closure.

**How to apply:**
- Install: system dep `chromium` (via package management), plus npm devDeps
  `@vitest/browser`, `@vitest/browser-playwright`, `playwright`.
- Pass the executable on the **provider factory**, not the instance:
  `provider: playwright({ launchOptions: { executablePath } })` where
  `executablePath` comes from `which chromium`. In Vitest 4 `provider` is a
  factory import from `@vitest/browser-playwright` (not the old string form),
  and per-instance `launchOptions` is ignored — only the factory's
  `this.options.launchOptions` is read.
- This Chromium is GPU-less (swiftshader software render), so any wall-clock
  perf budget that includes paint must allow ~90ms+/scroll-step and be marked
  hardware-sensitive.
