#!/bin/bash
set -e

# Reconcile the environment after a task merge:
# install any newly-added dependencies and rebuild the library bundle.
npm install
npm run build

# Surface any agent-skill drift (version, packaging, or changed source docs).
# This is a guardrail only — it reports drift but must never fail the merge.
npm run check:skills || true
