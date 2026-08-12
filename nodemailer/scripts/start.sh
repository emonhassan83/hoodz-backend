#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "dist" ]; then
  npm run build
fi

node dist/index.js
