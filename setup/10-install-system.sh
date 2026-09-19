#!/usr/bin/env bash
# System packages and database. Needs root: installs Java 17 (for GeoServer)
# and PostgreSQL + PostGIS, then creates the database, role, and table.
# Idempotent — safe to re-run.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || exec sudo -- "$0" "$@"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -r "$root/.env" ] || { echo "Missing $root/.env — run setup/00-make-env.sh first." >&2; exit 1; }
# shellcheck source=/dev/null
. "$root/.env"

echo "[1] Installing packages"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -yq \
	openjdk-17-jre-headless postgresql postgresql-16-postgis-3

systemctl enable --now postgresql

echo "[2] Creating role '$DB_USER' and database '$DB_NAME'"
psql_admin() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qAt "$@"; }

if [ -z "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")" ]; then
	psql_admin -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'"
else
	psql_admin -c "ALTER ROLE $DB_USER PASSWORD '$DB_PASSWORD'"
fi
if [ -z "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" ]; then
	psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
fi

echo "[3] Loading schema"
# The extension needs superuser; the table is then created as the app role.
psql_admin -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis"
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" \
	-v ON_ERROR_STOP=1 -q -f "$root/db/schema.sql"

echo "Done. Next (no sudo): setup/20-install-geoserver.sh"
