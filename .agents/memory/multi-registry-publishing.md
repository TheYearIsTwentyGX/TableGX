---
name: Multi-registry publishing
description: How tablegx is published as the same package under two scopes to two registries, and the invariants/credential caveats that go with it.
---

The single package `tablegx` is published under two scopes to two registries via `scripts/publish.mjs` (npm scripts `publish:npm` / `publish:tutera` / `publish:all`):
- `@twentygx/tablegx` → public npm (`https://registry.npmjs.org/`)
- `@tutera/tablegx` → private registry (`https://52.165.90.230:4873/`, an HTTPS IP that works without any `strict-ssl` override)

Routing is per-scope in `.npmrc` (`@twentygx:registry` / `@tutera:registry`); `publishConfig.registry` is intentionally absent so it can't pin everything to one registry. Auth is env-interpolated in `.npmrc` (`NPM_TOKEN` as `_authToken`, `TUTERA_AUTH` as `_auth` basic-auth base64) — never raw tokens.

**Invariant: `@twentygx` is the canonical scope that must always be the `name` committed on disk.**
**Why:** publishing reuses one `package.json` and swaps only the `name` scope per target. If a run is killed mid-publish (SIGKILL/VM teardown), the working tree can be left swapped (e.g. `@tutera/tablegx`); a naive "restore to whatever was on disk" then bakes the wrong scope in permanently. This actually happened once.
**How to apply:** the script restores to the canonical `@twentygx` name in `finally` AND normalizes the on-disk name at startup (repairing a prior interrupted run). If you rework publishing, preserve both, or publish from a staging copy instead of mutating the working tree.

**Credential caveat:** the `@tutera` `_auth` token was originally committed to `.npmrc` in plaintext, so it lives in git history — treat it as compromised and rotate it on the private registry; keep only the rotated value in the `TUTERA_AUTH` secret.

**Before a real npm publish:** bump the version — npm rejects republishing an existing version, and `publish:all` does npm first so it won't reach `@tutera` if the npm publish fails.
