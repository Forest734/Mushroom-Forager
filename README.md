# mushroom-foraging

Log mushroom finds from a phone and see them on an interactive web map. Tracked
species: Chanterelle, Lion's Mane, Hen of the Woods, Hedgehog.

```
phone: collect.html ──WFS-T Insert──▶ GeoServer ──▶ PostGIS  mushrooms.observations
desktop: map.html   ◀──WFS GetFeature (GeoJSON)──┘
```

The pages in `web/` are plain HTML/JS (Leaflet + markercluster from cdnjs).
They are served by GeoServer itself from `data_dir/www/mushrooms/`, so they
share its origin and need no CORS or separate web server.

## Setup (once)

```sh
setup/00-make-env.sh              # random passwords → .env (gitignored, mode 600)
sudo setup/10-install-system.sh   # Java 17, PostgreSQL 16 + PostGIS, db + table
setup/20-install-geoserver.sh     # GeoServer 2.28.5 → ~/.local/opt/geoserver, user service
setup/30-configure-geoserver.py   # workspace, store, layer, WFS-T, forager user, ACL
setup/40-deploy-web.sh            # copy web/ into GeoServer (re-run after edits)
```

Then open `http://localhost:8080/geoserver/www/mushrooms/map.html` and sign in
with `FORAGER_USER` / `FORAGER_PASSWORD` from `.env`. The GeoServer admin UI is
at `http://localhost:8080/geoserver/web` (admin / `GEOSERVER_ADMIN_PASSWORD`).

GeoServer runs as a systemd user service:
`systemctl --user status geoserver`, logs with `journalctl --user -u geoserver -e`.

## Phone access

Phone browsers only give GPS to pages served over **HTTPS**, so the phone needs
an `https://` address that reaches `localhost:8080`, not `http://<lan-ip>:8080`.

## Data

`db/schema.sql` — one table, `observations`: `species` (checked against the four
ids in `web/shared.js`), `observed_at`, `accuracy_m`, `quantity`, `notes`,
`geom` (Point, EPSG:4326). Adding a species means updating both the CHECK
constraint and `SPECIES` in `web/shared.js`.

Access: the `mushroom` workspace is readable and writable only by role
`FORAGER` (and admin), so anonymous visitors see nothing.
