# Setup

Target: Ubuntu 24.04, run from the project root. Every script can be run again
safely.

## 1. Passwords — `setup/00-make-env.sh`

Creates `.env` (mode 600, gitignored) with random passwords for the database,
the GeoServer admin, and the `forager` login the web app uses. If `.env` already
exists, the script leaves it alone.

## 2. System packages and database — `sudo setup/10-install-system.sh`

- Installs `openjdk-17-jre-headless`, `postgresql`, `postgresql-16-postgis-3`.
- Creates the role `mushroom` and the database `mushrooms`, and enables PostGIS.
- Loads [`db/schema.sql`](../db/schema.sql) as the app role.

## 3. GeoServer — `setup/20-install-geoserver.sh`

- Downloads `geoserver-2.28.5-bin.zip` from SourceForge (cached in `~/.cache`)
  and unpacks it to `~/.local/opt/geoserver`.
- Writes `~/.config/systemd/user/geoserver.service`, then enables and starts it.
- Waits until `http://localhost:8080/geoserver/web/` responds.

The user service runs while you are logged in. To keep it running after
logout or reboot without a login, run `sudo loginctl enable-linger $USER`.

## 4. Configure GeoServer — `setup/30-configure-geoserver.py`

Uses the REST API to:

- replace the default `admin` / `geoserver` password with the one in `.env`
- create the workspace `mushroom` (namespace `http://mushroom-foraging`)
- create the PostGIS store `postgis` and publish `mushroom:observations`
- set the WFS service level to `COMPLETE`, which allows transactions
- create the user `forager` with the role `FORAGER`
- restrict read and write on `mushroom.*` to `FORAGER,ADMIN`

## 5. Deploy the web app — `setup/40-deploy-web.sh`

Replaces `data_dir/www/mushrooms/` with a fresh copy of `web/`. Re-run it
after every change in `web/`.

## URLs

| What | URL |
|---|---|
| Landing page | `http://localhost:8080/geoserver/www/mushrooms/` |
| Collector | `…/www/mushrooms/collect.html` |
| Map | `…/www/mushrooms/map.html` |
| GeoServer admin | `http://localhost:8080/geoserver/web` |

## Phone access

The phone needs an **HTTPS** address, because browsers only give GPS to secure
pages. That part isn't set up yet (see [security.md](security.md#https)).
