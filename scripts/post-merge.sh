#!/bin/bash
set -e

# Reconcile the environment after a task merge:
# install any newly-added dependencies and rebuild the library bundle.
npm install
npm run build

# Surface any agent-skill drift (version, packaging, or changed source docs).
# Skills are meant to be updated pre-merge by the task agent (see the
# "Maintaining agent skills" section in replit.md and `npm run check:skills:strict`).
# This post-merge run is only a silent backstop — it reports drift but must
# never fail the merge.
npm run check:skills || true
