#!/usr/bin/env bash
# Rebuild sample/ and tests/fixtures/ from a DataIntake checkout, so the parity test compares
# against the Python tool's current output. DataIntake itself is only read, never changed.
set -euo pipefail

data_intake="${1:?usage: scripts/refresh-fixtures.sh <path to a data-intake checkout>}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

intake() { uv run --project "$data_intake" --frozen intake "$@"; }

intake demo --out "$work/demo"
for business in shop studio; do
  rm -rf "${repo:?}/sample/$business"
  mkdir -p "$repo/sample/$business"
  cp "$work/demo/$business"/* "$repo/sample/$business/"
done

intake audit "$repo/sample/shop" --client "Pinecrest Goods" --as-of 2024-12-31 \
  --out "$work/shop.html" --json "$repo/tests/fixtures/shop.json"
intake audit "$repo/sample/studio" --client "Northline Studio" --as-of 2024-12-31 \
  --out "$work/studio.html" --json "$repo/tests/fixtures/studio.json"
