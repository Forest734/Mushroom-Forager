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
| `photos` | text | no | JSON array of JPEG data URLs, see [Photos of finds](#photos-of-finds) |
| `geom` | geometry(Point, 4326) | yes | WGS 84 lon/lat; GiST index |

## Species

| id | Name | Scientific name | Map colour |
|---|---|---|---|
| `chanterelle` | Chanterelle | *Cantharellus* & *Craterellus* | `#e8961c` |
| `hericium` | Hericium | *Hericium* spp. | `#3b82c4` |
| `hen_of_the_woods` | Hen of the Woods | *Grifola frondosa* | `#8b5a2b` |
| `hedgehog` | Hedgehog | *Hydnum repandum* | `#b8457a` |

## Sub-species (`variant`)

`Chanterelle` and `Hericium` cover several species each. Picking either one in
the collector opens a sub-list; the pick is optional, and *Not sure* leaves
`variant` null. The other two entries are single species and have no sub-list.

The sub-lists are the **eastern North American** species, and they are grouped
by common name, because one common name usually covers several species — *Black
trumpet* alone is four. Each entry in `VARIANTS` carries:

| Field | What it is |
|---|---|
| `id` | the value stored in `variant`, genus and species with an underscore |
| `group` | the common name; the collector shows it as the heading over the group |
| `latin` | the species, shown on the chip and in the map popup |
| `hint` | one line on what separates it from the others in its group |
| `photo` | `photos/<id>.jpg`, set automatically from the id |

### `chanterelle`

| Group | `variant` | Scientific name |
|---|---|---|
| Golden chanterelle | `cantharellus_flavus` | *Cantharellus flavus* |
| Golden chanterelle | `cantharellus_tenuithrix` | *Cantharellus tenuithrix* |
| Golden chanterelle | `cantharellus_phasmatis` | *Cantharellus phasmatis* |
| Golden chanterelle | `cantharellus_roseocanus` | *Cantharellus roseocanus* |
| Golden chanterelle | `cantharellus_enelensis` | *Cantharellus enelensis* |
| Smooth chanterelle | `cantharellus_lateritius` | *Cantharellus lateritius* |
| Cinnabar chanterelle | `cantharellus_cinnabarinus` | *Cantharellus cinnabarinus* |
| Peach chanterelle | `cantharellus_persicinus` | *Cantharellus persicinus* |
| Appalachian chanterelle | `cantharellus_appalachiensis` | *Cantharellus appalachiensis* |
| Small chanterelle | `cantharellus_minor` | *Cantharellus minor* |
| Black trumpet | `craterellus_fallax` | *Craterellus fallax* |
| Black trumpet | `craterellus_cornucopioides` | *Craterellus cornucopioides* |
| Black trumpet | `craterellus_foetidus` | *Craterellus foetidus* |
| Black trumpet | `craterellus_calicornucopioides` | *Craterellus calicornucopioides* |
| Yellowfoot | `craterellus_tubaeformis` | *Craterellus tubaeformis* |
| Yellowfoot | `craterellus_ignicolor` | *Craterellus ignicolor* |
| Yellowfoot | `craterellus_lutescens` | *Craterellus lutescens* |
| Fragrant chanterelle | `craterellus_odoratus` | *Craterellus odoratus* |

### `hericium`

| Group | `variant` | Scientific name |
|---|---|---|
| Lion's mane | `hericium_erinaceus` | *Hericium erinaceus* |
| Bear's head tooth | `hericium_americanum` | *Hericium americanum* |
| Comb tooth | `hericium_coralloides` | *Hericium coralloides* |

The map colours, the legend and the filters all stay keyed to `species`, so a
`variant` only shows in a find's popup.

Unlike `species`, `variant` has no CHECK constraint: the ids live in `VARIANTS`
in [`web/shared.js`](../web/shared.js) alone, so adding one is a web change plus
`setup/40-deploy-web.sh`. Finds saved before a rename keep the old id.

## Photos

Each sub-species chip shows a photo from [`web/photos/`](../web/photos/), named
after the variant id. They come from Wikimedia Commons under CC BY or CC BY-SA,
so the author and licence have to travel with them: `web/photos/credits.html`
carries both and the collector links to it.

To add or replace one, put the Commons file name in `PHOTOS` in
[`tools/fetch-photos.py`](../tools/fetch-photos.py) and re-run it:

```sh
python3 tools/fetch-photos.py          # 400 px wide, ~70 KB each
```

It rewrites `credits.html` from whatever it downloads, so don't edit that file
by hand. A missing photo is not fatal — the chip hides the image and keeps the
name and the hint.

## Adding or renaming a species

Species ids are defined in two places, and both must match:

1. `SPECIES` in [`web/shared.js`](../web/shared.js): the id, display name,
   scientific name, and colour.
2. The `CHECK` constraint on `species` in the database. `schema.sql` only
   affects new installs, so change an existing database directly:

   ```sql
   ALTER TABLE observations DROP CONSTRAINT observations_species_check;
   ALTER TABLE observations ADD CONSTRAINT observations_species_check
     CHECK (species IN ('chanterelle', 'hericium', 'hen_of_the_woods', 'hedgehog', '<new_id>'));
   ```

   Update `schema.sql` to match, then run `setup/40-deploy-web.sh`.

## Photos of finds

The collector shrinks each photo to 1280 px on the long edge and re-encodes it
as JPEG (about 150–250 KB), which also drops the camera's EXIF, GPS position
included. A find's photos are saved together, as a JSON array of
`data:image/jpeg;base64,…` URLs in `photos`.

The map's list request leaves `photos` out (`propertyName`), so loading stays
light however many photos there are. A popup fetches its own find's photos by
`featureID` when it opens (`fetchPhotos()` in `store.js`). Only JPEG data URLs
are shown, which is `PHOTO_URL` in `web/shared.js`.

`schema.sql` adds the column to an existing table too. On a GeoServer set up
before it, reload the feature type as below.

On GitHub Pages the photos go to IndexedDB instead, keyed by the find's id,
since `localStorage` holds only about 5 MB. Export writes them into each find's
`photos` property, and Import reads them back.

## Adding a column

Add the column in PostGIS and in `schema.sql`. Then reload the layer's
attributes in GeoServer: in the admin UI, open *Layers → observations → Reload
feature type*. Finally, send the new field from `insertObservation()` in
`web/store.js`, and store it in `pages/store.js` too (`insertObservation()`,
and the fields `importObservations()` keeps).

## Backup

```sh
pg_dump -h localhost -U mushroom mushrooms > mushrooms-$(date +%F).sql
```
