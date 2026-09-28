# Roadmap

## Iteration 1 — current

- [x] Phone collector: GPS, 4 species, quantity, notes, saved over WFS-T
- [x] Desktop map: species and date filters, clustering, details, delete
- [x] Private layer with a forager login
- [x] Published on GitHub Pages, with finds kept on the device and moved
      between devices by GeoJSON export and import
- [ ] Run the setup end to end and test insert, read, and delete
- [ ] HTTPS for the phone (see [security.md](security.md#https))
- [ ] First real finds in the field

## Ideas for later

- **Offline collection.** Queue finds on the phone while there is no signal,
  and send them when it comes back (service worker + IndexedDB). Deliberately
  left out of iteration 1.
- **Photos.** Attach one or more photos to a find.
- **Edit a find.** Change the species, quantity, or notes from the map (WFS
  `Update`).
- **Revisit tracking.** Mark a spot as checked but empty, to learn which spots
  are productive each season.
- **Season views.** Finds by month or year, and heatmaps per species.
- **Export.** Download as GeoJSON, CSV, or GPX for a GPS unit.
- **Backups.** Scheduled `pg_dump`.
