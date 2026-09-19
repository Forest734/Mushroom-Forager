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
