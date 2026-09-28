# Usage

## In the field — collector (phone)

1. Open `collect.html` over HTTPS and sign in with the login from `.env`
   (see [security.md](security.md#sign-in)). The phone remembers it until you
   tap **Sign out**. The GitHub Pages copy has no sign-in.
2. Allow location access when the browser asks.
3. Wait for a good fix. The dot shows GPS accuracy:
   - green: within ±15 m
   - amber: within ±40 m
   - red: worse; wait if you can
4. Tap the species. Chanterelle and Hericium then offer the individual species
   underneath, with a photo and a one-line hint each, grouped by the common name
   they share — tap one, or leave it on *Not sure* to record the genus
   only. Optionally enter a quantity and notes (habitat, host tree, condition).
5. Optionally tap **Take a photo**. The camera opens; take the shot and it
   appears under the notes. Tap it again for more (cap, gills, stem), or **×**
   on a photo to drop it. Photos are shrunk to 1280 px and saved without the
   camera's location data.
6. Tap **Save find**. A green message confirms the save, and the find is added to
   *Saved this session*.

Saving needs a connection. If it fails, the form keeps what you entered, so
you can try again.

Tip: add the page to your home screen (browser menu → *Add to Home screen*) for
one-tap access.

## At home — map (desktop)

- **Species.** Tick or untick species to show or hide them. The number next to
  each species counts its finds in the selected period.
- **When.** Choose all time, this year, the last 30 days, or the last 7 days.
- **Cluster nearby finds.** Finds that are close together are grouped. Each
  group is a small pie chart of the species mix, with the total in the middle.
  Zoom in or click a group to split it.
- **Basemap.** Use the layer control at the top right to switch between Dark
  (the default), Streets, Topo, and Satellite.
- **Details.** Click a point to see its time, quantity, coordinates, GPS
  accuracy, notes, and photos. Click a photo to open it full size in a new tab.
- **Delete.** Removes a find permanently from the database, after you confirm.
- The map reloads every 60 s. **Refresh** reloads it now, and **Zoom to finds**
  fits the view to all finds.

## On GitHub Pages — finds on the device

At <https://forest734.github.io/Mushroom-Forager/> there is no server. Each
browser keeps its own finds, and nothing is sent anywhere. Saving works
without a connection once the page has loaded.

- **Phone to computer.** On the phone, tap **Export finds** at the bottom of
  the collector. It downloads a `.geojson` file. Send it to the computer (by
  AirDrop, email, or a shared drive), then click **Import** on the map and
  pick the file. Finds already on the map are skipped, so importing the same
  file twice is safe. Photos travel in the file too, so it grows by about
  200 KB per photo.
- **Back up.** The finds live in the browser's storage. Clearing the site's
  data or the browser's history deletes them, and Safari on iPhone may clear a
  site's data after about a week without a visit. Export now and then to keep
  a copy. On iPhone, the page added to the home screen is less likely to be
  cleared, but it keeps its own finds, separate from Safari's, so pick one and
  stick with it.
- **Delete** on the map removes the find from that browser only.

