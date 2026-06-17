#!/usr/bin/env node
// Skill drift guardrail for the bundled @tanstack/intent skills.
//
//   node scripts/check-skills.mjs            verify (validate + stale + source drift)
//   node scripts/check-skills.mjs --strict   verify and exit non-zero on drift
//   node scripts/check-skills.mjs --write     (re)write the source-tracking baseline
//
// The baseline (skills/sync-state.json) records a content hash of every file a
// skill declares in its `sources` frontmatter. On verify, the current hashes are
// recomputed and compared so a changed source doc points at the exact skill that
// needs review — beyond the coarse version check `intent stale` performs.
//
// By default this is a guardrail, not a gate: drift is reported but never
// hard-fails (used by the post-merge backstop). With --strict, drift makes the
// process exit non-zero so a task agent can gate on it before merging.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = join(repoRoot, 'skills')
const baselinePath = join(skillsDir, 'sync-state.json')
const write = process.argv.includes('--write')
const strict = process.argv.includes('--strict')

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  return typeof pkg.version === 'string' ? pkg.version : null
}

/** Minimal frontmatter reader for the fields we track. */
function readSkillMeta(skillMdPath) {
  const content = readFileSync(skillMdPath, 'utf8')
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return null
  const lines = fm[1].split(/\r?\n/)
  let name = null
  const sources = []
  let inSources = false
  for (const line of lines) {
    const nameMatch = line.match(/^name:\s*(.+?)\s*$/)
    if (nameMatch) {
      name = nameMatch[1].replace(/^["']|["']$/g, '')
      inSources = false
      continue
    }
    if (/^sources:\s*$/.test(line)) {
      inSources = true
      continue
    }
    if (inSources) {
      const item = line.match(/^\s*-\s*(.+?)\s*$/)
      if (item) {
        sources.push(item[1].replace(/^["']|["']$/g, ''))
        continue
      }
      if (/^\S/.test(line)) inSources = false
    }
  }
  return name ? { name, sources } : null
}

function findSkills() {
  if (!existsSync(skillsDir)) return []
  const skills = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillMd = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillMd)) continue
    const meta = readSkillMeta(skillMd)
    if (meta) skills.push(meta)
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

function hashSource(relPath) {
  const abs = join(repoRoot, relPath)
  if (!existsSync(abs)) return null
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

function buildBaseline(skills) {
  const baseline = { library_version: readPackageVersion(), skills: {} }
  for (const skill of skills) {
    const sourcesSha = {}
    for (const source of skill.sources) {
      const sha = hashSource(source)
      if (sha) sourcesSha[source] = sha
    }
    baseline.skills[skill.name] = { sources_sha: sourcesSha }
  }
  return baseline
}

function runIntent(args) {
  try {
    const out = execFileSync('npx', ['@tanstack/intent', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    process.stdout.write(out)
    return true
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout)
    if (err.stderr) process.stderr.write(err.stderr)
    return false
  }
}

const skills = findSkills()

if (write) {
  writeFileSync(baselinePath, JSON.stringify(buildBaseline(skills), null, 2) + '\n')
  console.log(`Wrote source-tracking baseline for ${skills.length} skills → ${baselinePath}`)
  process.exit(0)
}

console.log('▶ intent validate')
runIntent(['validate'])
console.log('\n▶ intent stale')
runIntent(['stale'])

console.log('\n▶ source drift (content hashes vs baseline)')
if (!existsSync(baselinePath)) {
  console.log('  ⚠ no baseline found — run: npm run check:skills -- --write')
  process.exit(strict ? 1 : 0)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const findings = []
for (const skill of skills) {
  const stored = baseline.skills?.[skill.name]?.sources_sha ?? {}
  for (const source of skill.sources) {
    const current = hashSource(source)
    if (current === null) {
      findings.push(`${skill.name}: source not found (${source})`)
    } else if (!stored[source]) {
      findings.push(`${skill.name}: untracked source (${source}) — re-baseline after review`)
    } else if (stored[source] !== current) {
      findings.push(`${skill.name}: source changed (${source}) — review this skill`)
    }
  }
}

if (findings.length === 0) {
  console.log('  ✅ all tracked sources match the baseline')
  process.exit(0)
}

console.log(`  ⚠ ${findings.length} skill(s) need review:`)
for (const f of findings) console.log(`    - ${f}`)
console.log('\n  To fix: review the flagged skill(s) in skills/<name>/SKILL.md so')
console.log('  they match the new behavior of the changed source(s), then re-baseline:')
console.log('    npm run check:skills -- --write')

if (strict) {
  console.error('\n✖ skill drift detected (strict mode) — update the skill(s) before merging.')
  process.exit(1)
}

// Default mode is a guardrail: never hard-fail.
process.exit(0)
