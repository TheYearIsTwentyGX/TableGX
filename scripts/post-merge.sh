#!/bin/bash
set -e

# Reconcile the environment after a task merge:
# install any newly-added dependencies and rebuild the library bundle.
npm install
npm run build
