#!/usr/bin/env bash
# Copy web/ into GeoServer's static "www" folder so the app is served from the
# same origin as WFS (no CORS). Re-run after every change to web/.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
. "$root/.env"

dest="$GEOSERVER_HOME/data_dir/www/mushrooms"
rm -rf "$dest"
mkdir -p "$dest"
cp -r "$root"/web/. "$dest"/
echo "Deployed to $dest"
echo "  collect: $GEOSERVER_URL/www/mushrooms/collect.html"
echo "  map:     $GEOSERVER_URL/www/mushrooms/map.html"
