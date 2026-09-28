// Desktop map: loads all observations over WFS, filters them client-side,
// and shows them clustered (cluster icons are pie charts of species share).

const REFRESH_MS = 60_000;

const map = L.map('map', { center: [30, 0], zoom: 2 });
const basemaps = {
  // Esri's dark canvas has no tiles past z16, so Leaflet stretches z16 beyond it.
  Dark: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 16,
    }),
  ]),
  Streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }),
  Topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
  }),
  Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles &copy; Esri',
  }),
};
basemaps.Dark.addTo(map);
L.control.layers(basemaps).addTo(map);
L.control.scale().addTo(map);

const clusterLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 45,
  iconCreateFunction: clusterIcon,
});
const plainLayer = L.layerGroup();

const els = {
  filters: document.getElementById('species-filters'),
  period: document.getElementById('period'),
  cluster: document.getElementById('cluster'),
  refresh: document.getElementById('refresh'),
  fit: document.getElementById('fit'),
  updated: document.getElementById('updated'),
};

let features = [];
let firstLoad = true;
const shown = new Set(SPECIES.map((s) => s.id));
const counts = {};

for (const s of SPECIES) {
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" checked>
    <span class="swatch" style="background:${s.color}"></span>${s.name}<span class="count">0</span>`;
  const box = label.querySelector('input');
  box.addEventListener('change', () => {
    if (box.checked) shown.add(s.id); else shown.delete(s.id);
    render();
  });
  counts[s.id] = label.querySelector('.count');
  els.filters.append(label);
}

function clusterIcon(cluster) {
  const tally = {};
  const markers = cluster.getAllChildMarkers();
  for (const m of markers) tally[m.options.species] = (tally[m.options.species] || 0) + 1;
  let angle = 0;
  const stops = SPECIES.filter((s) => tally[s.id]).map((s) => {
    const start = angle;
    angle += (tally[s.id] / markers.length) * 360;
    return `${s.color} ${start}deg ${angle}deg`;
  });
  const size = markers.length < 10 ? 32 : markers.length < 100 ? 40 : 48;
  return L.divIcon({
    html: `<div class="cluster" style="width:${size}px;height:${size}px;background:conic-gradient(${stops.join(',')})">
      <span style="text-shadow:0 0 3px #000">${markers.length}</span></div>`,
    className: '',
    iconSize: [size, size],
  });
}

function periodStart() {
  const v = els.period.value;
  if (v === 'all') return null;
  if (v === 'year') return new Date(new Date().getFullYear(), 0, 1);
  return new Date(Date.now() - Number(v) * 86_400_000);
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function popupHtml(f) {
  const p = f.properties;
  const s = SPECIES_BY_ID[p.species] || { name: p.species, color: '#888' };
  const v = p.variant ? VARIANT_BY_ID[p.variant] : null;
  const when = new Date(p.observed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const [lon, lat] = f.geometry.coordinates;
  return `<div class="popup">
    <h3><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}</h3>
    ${v ? `<p class="latin">${escapeHtml(v.group)} · ${escapeHtml(v.latin)}</p>` : ''}
    <p>${when}</p>
    ${p.quantity ? `<p>Quantity: ${p.quantity}</p>` : ''}
    <p class="muted">${lat.toFixed(5)}, ${lon.toFixed(5)}${p.accuracy_m != null ? ` · ±${Math.round(p.accuracy_m)} m` : ''}</p>
    ${p.notes ? `<p class="notes">${escapeHtml(p.notes)}</p>` : ''}
    <div class="popup-photos"></div>
    <button type="button" data-delete="${escapeHtml(f.id)}">Delete</button>
  </div>`;
}

function render() {
  const since = periodStart();
  const inPeriod = features.filter((f) => !since || new Date(f.properties.observed_at) >= since);

  for (const s of SPECIES) {
    counts[s.id].textContent = inPeriod.filter((f) => f.properties.species === s.id).length;
  }

  clusterLayer.clearLayers();
  plainLayer.clearLayers();
  const target = els.cluster.checked ? clusterLayer : plainLayer;
  const markers = inPeriod.filter((f) => shown.has(f.properties.species)).map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const color = SPECIES_BY_ID[f.properties.species]?.color || '#888';
    const marker = L.circleMarker([lat, lon], {
      species: f.properties.species,
      radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95,
    });
    // Built on the first open and kept, so the photos load once and
    // popup.update(), which calls this again, doesn't throw them away.
    let content;
    return marker.bindPopup(() => (content ||= popupContent(f, marker)));
  });
  if (els.cluster.checked) clusterLayer.addLayers(markers); else markers.forEach((m) => plainLayer.addLayer(m));

  map.removeLayer(els.cluster.checked ? plainLayer : clusterLayer);
  map.addLayer(target);
  return markers;
}

function fitToFinds() {
  const pts = features.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
  if (pts.length === 1) map.setView(pts[0], 15);
  else if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
}

async function load() {
  els.refresh.disabled = true;
  try {
    const data = await fetchObservations();
    features = data.features.filter((f) => f.geometry);
    render();
    if (firstLoad) { fitToFinds(); firstLoad = false; }
    els.updated.textContent = `${features.length} finds · updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    els.updated.textContent = err instanceof AuthError ? 'Signed out — reload to sign in.' : `Load failed: ${err.message}`;
  } finally {
    els.refresh.disabled = false;
  }
}

// A find's popup: the details, a working Delete, and its photos, which aren't
// in the list the map loads, so each popup fetches its own find's.
function popupContent(f, marker) {
  const el = document.createElement('div');
  el.innerHTML = popupHtml(f);

  const btn = el.querySelector('[data-delete]');
  btn.addEventListener('click', async () => {
    if (!confirm('Delete this find permanently?')) return;
    btn.disabled = true;
    try {
      await deleteObservation(btn.dataset.delete);
      map.closePopup();
      await load();
    } catch (err) {
      btn.disabled = false;
      alert(`Delete failed: ${err.message}`);
    }
  });

  showPhotos(f.id, el.querySelector('.popup-photos'), () => marker.getPopup().update());
  return el;
}

async function showPhotos(fid, box, resize) {
  let list;
  try {
    list = (await fetchPhotos(fid)).filter((src) => PHOTO_URL.test(src));
  } catch {
    list = [];
    box.textContent = 'Photos could not be loaded.';
  }
  for (const src of list) {
    const img = Object.assign(new Image(), { src, alt: 'Photo of this find', title: 'Open full size' });
    img.addEventListener('click', () => openPhoto(src));
    box.append(img);
  }
  if (box.hasChildNodes()) resize();
}

// Opens a photo in a new tab. A tab can't be pointed at a data: URL, so it
// gets a blob of the JPEG instead.
function openPhoto(src) {
  const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  window.open(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

els.period.addEventListener('change', render);
els.cluster.addEventListener('change', render);
els.refresh.addEventListener('click', load);
els.fit.addEventListener('click', fitToFinds);

wireDeviceStore(() => { firstLoad = true; load(); });
requireLogin(() => {
  load();
  setInterval(load, REFRESH_MS);
});
