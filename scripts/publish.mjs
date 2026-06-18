#!/usr/bin/env node
// Publish the SAME package ("tablegx") under different scopes to different registries:
//   - @twentygx/tablegx -> npm registry (https://registry.npmjs.org/)
//   - @tutera/tablegx    -> private @tutera registry
//
// Registry auth lives in .npmrc via env interpolation (NPM_TOKEN, TUTERA_AUTH);
// no tokens are stored here. package.json's `name` is swapped per target and always
// restored afterwards (even on failure).
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

const original = readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(original)
const baseName = pkg.name.replace(/^@[^/]+\//, '')

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
    writeFileSync(pkgPath, JSON.stringify({ ...pkg, name }, null, 2) + '\n')
    console.log(`\n▶ publishing ${name}@${pkg.version} → ${registry}`)
    run('npm', ['publish', '--ignore-scripts', '--registry', registry, ...passthrough])
  }
  console.log('\n✅ publish complete')
} finally {
  writeFileSync(pkgPath, original)
}
