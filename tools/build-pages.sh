#!/usr/bin/env bash
# Builds the GitHub Pages site into dist/: web/ as it is, except that store.js
# is swapped for pages/store.js, which keeps finds in the browser because Pages
# has no GeoServer. .github/workflows/pages.yml runs this on every push.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rm -rf "$root/dist"
cp -r "$root/web" "$root/dist"
cp "$root/pages/store.js" "$root/dist/store.js"
echo "Built $root/dist"
