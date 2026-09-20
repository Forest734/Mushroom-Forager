# mushroom-foraging

Log mushroom finds from a phone in the field and see them on an interactive web
map. Data is stored in PostGIS and served through GeoServer.

Tracked species: **Chanterelle**, **Lion's Mane**, **Hen of the Woods**, **Hedgehog**.
The first two are genera, so the collector offers the individual European
species underneath — optional, see [data-model.md](docs/data-model.md#sub-species-variant).

> **Status:** first iteration, written but not yet deployed. The setup scripts
> have not been run end to end yet. There is no offline mode in this iteration;
> the phone needs a connection when you save.

```
phone:   collect.html ──WFS-T Insert──▶ GeoServer ──▶ PostGIS (mushrooms.observations)
desktop: map.html     ◀──WFS GetFeature (GeoJSON)──┘
```

## Quick start

```sh
setup/00-make-env.sh              # random passwords → .env
sudo setup/10-install-system.sh   # Java 17, PostgreSQL + PostGIS, database
setup/20-install-geoserver.sh     # GeoServer as a systemd user service
setup/30-configure-geoserver.py   # layer, WFS-T, login, access rules
setup/40-deploy-web.sh            # publish web/ (re-run after edits)
```

Then open <http://localhost:8080/geoserver/www/mushrooms/map.html> and sign in
with `FORAGER_USER` / `FORAGER_PASSWORD` from `.env`. For the full steps, see
[docs/setup.md](docs/setup.md).

## Documentation

| Doc | What's in it |
|---|---|
| [architecture.md](docs/architecture.md) | how the pieces fit together, and why |
| [setup.md](docs/setup.md) | install and deploy, step by step |
| [usage.md](docs/usage.md) | using the phone collector and the map |
| [data-model.md](docs/data-model.md) | the table, species ids, adding a species |
| [security.md](docs/security.md) | logins, access rules, HTTPS |
| [troubleshooting.md](docs/troubleshooting.md) | common problems |
| [roadmap.md](docs/roadmap.md) | what's done, what's next |

## Project layout

```
mushroom-foraging/
├── README.md               this file
├── .env                    passwords, generated, not committed
├── db/
│   └── schema.sql          observations table
├── docs/                   the documentation above
├── tools/
│   └── dev-server.js       local stand-in for GeoServer (development only)
├── setup/                  numbered install/configure scripts, run in order
│   ├── 00-make-env.sh
│   ├── 10-install-system.sh      (sudo)
│   ├── 20-install-geoserver.sh
│   ├── 30-configure-geoserver.py
│   └── 40-deploy-web.sh
└── web/                    the app; served by GeoServer from data_dir/www/mushrooms/
    ├── index.html          landing page
    ├── collect.html/.js    phone collector (GPS + species + save)
    ├── map.html/.js        desktop map (filters, clustering, delete)
    ├── shared.js           species list, login, WFS calls
    └── styles.css
```
