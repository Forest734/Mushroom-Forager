// Stands in for web/store.js on GitHub Pages, where there is no GeoServer:
// finds are kept in this browser's localStorage, in the same GeoJSON shape the
// WFS layer returns, so collect.js and map.js work unchanged. Nothing leaves
// the device; export and import move finds between devices as a GeoJSON file.
// tools/build-pages.sh puts this file in place of web/store.js.

// Finds live in this browser only, so the pages offer export and import.
const ON_DEVICE = true;

const STORE_KEY = 'mushroom-forager-finds';

// Photos are too big for localStorage (about 5 MB in all), so they go to
// IndexedDB instead, as the array of JPEG data URLs under the find's id.
const PHOTO_DB = 'mushroom-forager';

function withPhotos(mode, act) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PHOTO_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('photos');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('photos', mode);
      const req = act(tx.objectStore('photos'));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

async function storePhotos(fid, photos) {
  try {
    await withPhotos('readwrite', (store) => store.put(photos, fid));
  } catch {
    throw new Error('this browser would not store the photos (storage full, or blocked in private mode).');
  }
}

function readFinds() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}

function writeFinds(features) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(features));
  } catch {
    throw new Error('this browser would not store it (storage full, or blocked in private mode).');
  }
}

async function fetchObservations() {
  return { type: 'FeatureCollection', features: readFinds() };
}

// The photos of one find, as JPEG data URLs; [] when it has none.
async function fetchPhotos(fid) {
  return (await withPhotos('readonly', (store) => store.get(fid))) || [];
}

// obs: { species, variant, lat, lon, accuracy, quantity, notes, photos, observedAt: Date },
// photos being an array of JPEG data URLs. Returns the new feature id. Ids are
// random, so finds from several devices can be merged by import without clashing.
async function insertObservation(obs) {
  const id = `observations.${crypto.randomUUID()}`;
  // Photos first, so a find is never saved without the photos taken for it.
  if (obs.photos?.length) await storePhotos(id, obs.photos);
  writeFinds([...readFinds(), {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [obs.lon, obs.lat] },
    properties: {
      species: obs.species,
      variant: obs.variant ?? null,
      observed_at: obs.observedAt.toISOString(),
      accuracy_m: obs.accuracy === null ? null : Math.round(obs.accuracy * 10) / 10,
      quantity: obs.quantity ?? null,
      notes: obs.notes || null,
    },
  }]);
  // Ask the browser not to clear the finds when it runs low on space.
  navigator.storage?.persist?.();
  return id;
}

async function deleteObservation(fid) {
  writeFinds(readFinds().filter((f) => f.id !== fid));
  await withPhotos('readwrite', (store) => store.delete(fid)).catch(() => {});
}

// Downloads every find as a GeoJSON file, for a backup or for import on
// another device. Photos go along as a `photos` property on each find.
async function exportObservations() {
  const features = await Promise.all(readFinds().map(async (f) => {
    const photos = await fetchPhotos(f.id).catch(() => []);
    return photos.length ? { ...f, properties: { ...f.properties, photos } } : f;
  }));
  const data = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([data], { type: 'application/geo+json' })),
    download: `mushroom-finds-${new Date().toISOString().slice(0, 10)}.geojson`,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Adds the finds in a GeoJSON file (an export from this app on any device, or
// the WFS layer's GeoJSON), with any photos they carry, and skips ones already
// here. Returns { added, skipped }; throws if the file isn't a FeatureCollection.
async function importObservations(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error(`${file.name} is not a GeoJSON file of finds.`);
  }
  const finds = readFinds();
  const ids = new Set(finds.map((f) => f.id));
  let added = 0;
  let skipped = 0;
  for (const f of data.features) {
    const [lon, lat] = f?.geometry?.type === 'Point' ? f.geometry.coordinates : [];
    const p = f?.properties ?? {};
    const valid = Number.isFinite(lon) && Number.isFinite(lat) && SPECIES_BY_ID[p.species]
      && !Number.isNaN(Date.parse(p.observed_at));
    if (!valid || ids.has(f.id)) { skipped++; continue; }
    const id = typeof f.id === 'string' ? f.id : `observations.${crypto.randomUUID()}`;
    const photos = Array.isArray(p.photos) ? p.photos.filter((src) => PHOTO_URL.test(src)) : [];
    if (photos.length) await storePhotos(id, photos);
    // Rebuilt field by field, since the map puts these into its popups.
    finds.push({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        species: p.species,
        variant: typeof p.variant === 'string' ? p.variant : null,
        observed_at: new Date(p.observed_at).toISOString(),
        accuracy_m: Number.isFinite(p.accuracy_m) ? p.accuracy_m : null,
        quantity: Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : null,
        notes: typeof p.notes === 'string' && p.notes ? p.notes : null,
      },
    });
    ids.add(id);
    added++;
  }
  writeFinds(finds);
  if (added) navigator.storage?.persist?.();
  return { added, skipped };
}
