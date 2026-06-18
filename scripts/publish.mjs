#!/usr/bin/env node
// Publish the SAME package ("tablegx") under different scopes to different registries:
//   - @twentygx/tablegx -> npm registry (https://registry.npmjs.org/)
//   - @tutera/tablegx    -> private @tutera registry
//
// Registry auth lives in .npmrc via env interpolation (NPM_TOKEN, TUTERA_AUTH);
// no tokens are stored here. package.json's `name` scope is swapped per target and
// always normalized back to the canonical @twentygx scope afterwards — even if a
// previous run was killed mid-publish and left the file swapped.
//
//   node scripts/publish.mjs                 publish to all targets
//   node scripts/publish.mjs npm             publish only the @twentygx (npm) build
//   node scripts/publish.mjs tutera          publish only the @tutera build
//   node scripts/publish.mjs all --dry-run   extra flags (e.g. --dry-run, --otp=123456) pass through

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(repoRoot, 'package.json')

// The canonical scope that must always be the one committed on disk.
const HOME_SCOPE = '@twentygx'

const TARGETS = {
  npm: { scope: '@twentygx', registry: 'https://registry.npmjs.org/' },
  tutera: { scope: '@tutera', registry: 'https://52.165.90.230:4873/' },
}

const [target = 'all', ...passthrough] = process.argv.slice(2)
const selected = target === 'all' ? Object.keys(TARGETS) : [target]
for (const t of selected) {
  if (!TARGETS[t]) {
    console.error(`Unknown target "${t}". Use one of: ${Object.keys(TARGETS).join(', ')}, all`)
    process.exit(1)
  }
}

// Replace ONLY the top-level package name value, preserving the file's exact
// formatting (so a non-canonical scope left by an interrupted run is repaired
// without reformatting the whole file).
function withName(src, name) {
  return src.replace(/("name"\s*:\s*)"[^"]*"/, `$1"${name}"`)
}

const onDisk = readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(onDisk)
const baseName = pkg.name.replace(/^@[^/]+\//, '')
// Canonical, byte-identical-when-already-correct content with the home scope.
const canonical = withName(onDisk, `${HOME_SCOPE}/${baseName}`)
// Repair the working tree immediately if a prior run left a swapped scope.
if (onDisk !== canonical) writeFileSync(pkgPath, canonical)

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: repoRoot, stdio: 'inherit' })
}

// Build once; each publish uses --ignore-scripts so we don't rebuild per target.
console.log('▶ building…')
run('npm', ['run', 'build'])

try {
  for (const t of selected) {
    const { scope, registry } = TARGETS[t]
    const name = `${scope}/${baseName}`
    writeFileSync(pkgPath, withName(canonical, name))
    console.log(`\n▶ publishing ${name}@${pkg.version} → ${registry}`)
    // Enforced --registry goes last so passthrough flags can't override the target.
    run('npm', ['publish', '--ignore-scripts', ...passthrough, '--registry', registry])
  }
  console.log('\n✅ publish complete')
} finally {
  // Always leave the canonical (@twentygx) name on disk.
  writeFileSync(pkgPath, canonical)
}
