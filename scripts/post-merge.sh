#!/bin/bash
set -euo pipefail

# Reconcile JavaScript dependencies after task-agent changes.
# npm install is idempotent and updates node_modules from the committed lockfile
# without prompting for input.
npm install --no-audit --no-fund