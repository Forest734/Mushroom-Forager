# Data model

Database `mushrooms`, table `observations`, published by GeoServer as
`mushroom:observations`. Source: [`db/schema.sql`](../db/schema.sql).

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | serial | yes | primary key; GeoServer feature id is `observations.<id>` |
| `species` | text | yes | one of the species ids below (CHECK constraint) |
| `variant` | text | no | species within a genus-level `species`; see below |
| `observed_at` | timestamptz | yes | set by the phone at save time |
| `accuracy_m` | real | no | GPS accuracy radius in metres |
| `quantity` | integer | no | > 0 |
| `notes` | text | no | free text |
| `geom` | geometry(Point, 4326) | yes | WGS 84 lon/lat; GiST index |

## Species

| id | Name | Scientific name | Map colour |
|---|---|---|---|
| `chanterelle` | Chanterelle | *Cantharellus* spp. | `#e8961c` |
| `lions_mane` | Lion's Mane | *Hericium erinaceus* | `#3b82c4` |
| `hen_of_the_woods` | Hen of the Woods | *Grifola frondosa* | `#8b5a2b` |
| `hedgehog` | Hedgehog | *Hydnum repandum* | `#b8457a` |

## Sub-species (`variant`)

`Chanterelle` and `Lion's Mane` are genera, not species. Picking either one in
the collector opens a second row of choices; the pick is optional, and *Not
sure* leaves `variant` null. The other two entries are single species and have
no sub-list.

| `species` | `variant` | Scientific name |
|---|---|---|
| `chanterelle` | `cantharellus_cibarius` | *Cantharellus cibarius* |
| `chanterelle` | `cantharellus_pallens` | *Cantharellus pallens* |
| `chanterelle` | `cantharellus_friesii` | *Cantharellus friesii* |
| `chanterelle` | `cantharellus_amethysteus` | *Cantharellus amethysteus* |
| `chanterelle` | `craterellus_tubaeformis` | *Craterellus tubaeformis* |
| `chanterelle` | `craterellus_cornucopioides` | *Craterellus cornucopioides* |
| `lions_mane` | `hericium_erinaceus` | *Hericium erinaceus* |
| `lions_mane` | `hericium_coralloides` | *Hericium coralloides* |
| `lions_mane` | `hericium_flagellum` | *Hericium flagellum* |

These are the European species. The map colours, the legend and the filters all
stay keyed to `species`, so a `variant` only shows in a find's popup.

Unlike `species`, `variant` has no CHECK constraint: the ids live in `VARIANTS`
in [`web/shared.js`](../web/shared.js) alone, so adding one is a web change plus
`setup/40-deploy-web.sh`. Finds saved before a rename keep the old id.

## Adding or renaming a species

Species ids are defined in two places, and both must match:

1. `SPECIES` in [`web/shared.js`](../web/shared.js): the id, display name,
   scientific name, and colour.
2. The `CHECK` constraint on `species` in the database. `schema.sql` only
   affects new installs, so change an existing database directly:

   ```sql
   ALTER TABLE observations DROP CONSTRAINT observations_species_check;
   ALTER TABLE observations ADD CONSTRAINT observations_species_check
     CHECK (species IN ('chanterelle', 'lions_mane', 'hen_of_the_woods', 'hedgehog', '<new_id>'));
   ```

   Update `schema.sql` to match, then run `setup/40-deploy-web.sh`.

## Adding a column

Add the column in PostGIS and in `schema.sql`. Then reload the layer's
attributes in GeoServer: in the admin UI, open *Layers → observations → Reload
feature type*. Finally, send the new field from `insertObservation()` in
`shared.js`.

## Backup

```sh
pg_dump -h localhost -U mushroom mushrooms > mushrooms-$(date +%F).sql
```
