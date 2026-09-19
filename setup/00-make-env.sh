#!/usr/bin/env bash
# Create .env with random passwords for the database, the GeoServer admin,
# and the "forager" login used by the web app. Never overwrites an existing .env.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$root/.env"

if [ -e "$env_file" ]; then
	echo ".env already exists, leaving it alone: $env_file"
	exit 0
fi

pw() { python3 -c 'import secrets; print(secrets.token_urlsafe(18))'; }

umask 077
cat >"$env_file" <<EOF
DB_NAME=mushrooms
DB_USER=mushroom
DB_PASSWORD=$(pw)
GEOSERVER_VERSION=2.28.5
GEOSERVER_HOME=$HOME/.local/opt/geoserver
GEOSERVER_URL=http://localhost:8080/geoserver
GEOSERVER_ADMIN_PASSWORD=$(pw)
FORAGER_USER=forager
FORAGER_PASSWORD=$(pw)
EOF
echo "Wrote $env_file (mode 600)."
