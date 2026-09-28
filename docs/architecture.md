# Architecture

## Components

| Piece | What it is | Where |
|---|---|---|
| Database | PostgreSQL 16 + PostGIS 3, database `mushrooms`, table `observations` | system service `postgresql` |
| Map server | GeoServer 2.28.5 on Java 17, bundled Jetty on port 8080 | `~/.local/opt/geoserver`, user service `geoserver` |
| Web app | Static HTML/JS, Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 from cdnjs | `web/` → copied to `data_dir/www/mushrooms/` |

## Data flow

1. **Collect.** `collect.html` gets the position from the browser's GPS
   (`navigator.geolocation.watchPosition`, high accuracy). On **Save** it sends a
   WFS 1.0.0 `Transaction` with an `Insert` to `/geoserver/wfs`, using the
   forager login.
2. **Store.** GeoServer writes the row into PostGIS through the `postgis` data
   store in the `mushroom` workspace.
3. **View.** `map.html` requests the whole layer with a WFS `GetFeature` call
   (`outputFormat=application/json`). Filtering by species and date happens
   in the browser. The map reloads the layer every 60 seconds.
4. **Delete.** The map's **Delete** button sends a WFS `Transaction` with a
   `Delete` for that feature id.

## Design decisions

- **GeoServer serves the app itself** (`data_dir/www`). The pages and WFS share
  one origin, so there is no CORS setup and only one address to expose over
  HTTPS.
- **Vector data (WFS), not rendered images (WMS).** Browsers can't attach a login
  to map image requests, and the layer is private. It is also small, so the
  browser can draw the points and filter them instantly.
- **WFS 1.0.0 with `EPSG:4326` and `lon,lat` coordinates.** In WFS 1.0.0 the
  coordinate order is always longitude, latitude. In WFS 1.1 and 2.0 it depends
  on how the coordinate system is named.
- **The phone sends the timestamp.** GeoServer's insert may write NULL for
  fields left out instead of the database default, so `observed_at` is always
  included.
- **One flat table** is enough for four species and a few fields. See
  [data-model.md](data-model.md).

## GitHub Pages

The app is also published at <https://forest734.github.io/Mushroom-Forager/>.
Pages only serves files, so that copy has no GeoServer, and it keeps finds in
the browser instead.

- **One file differs.** Everything that loads, saves or deletes finds is in
  [`web/store.js`](../web/store.js). `tools/build-pages.sh` copies `web/` to
  `dist/` and replaces `store.js` with
  [`pages/store.js`](../pages/store.js), which keeps the finds in
  `localStorage` as the same GeoJSON the WFS layer returns. `collect.js` and
  `map.js` are the same in both.
- **`ON_DEVICE`**, set by each `store.js`, shows the `[data-device]` sections:
  **Export** on the collector, and **Export** and **Import** on the map. The
  GeoServer version keeps them hidden.
- **Finds never leave the device.** Each browser has its own finds. Export
  downloads them as a `.geojson` file; Import adds a file's finds and skips any
  already there. Find ids are random UUIDs, so exports from several devices
  merge without clashing. Imported finds are rebuilt field by field, since the
  map puts them into its popups.
- **Deploy.** [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
  builds and deploys on every push to `master`. The repository's Settings →
  Pages → Source must be **GitHub Actions**.

