// Desktop map: loads all observations over WFS, filters them client-side,
// and shows them clustered (cluster icons are pie charts of species share).

const REFRESH_MS = 60_000;

const map = L.map('map', { center: [30, 0], zoom: 2 });
const basemaps = {
  Streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }),
  Topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
  }),
  Imagery: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles &copy; Esri',
  }),
};
basemaps.Topo.addTo(map);
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
    return L.circleMarker([lat, lon], {
      species: f.properties.species,
      radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95,
    }).bindPopup(() => popupHtml(f));
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

map.on('popupopen', (e) => {
  const btn = e.popup.getElement().querySelector('[data-delete]');
  if (!btn) return;
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
});

els.period.addEventListener('change', render);
els.cluster.addEventListener('change', render);
els.refresh.addEventListener('click', load);
els.fit.addEventListener('click', fitToFinds);

requireLogin(() => {
  load();
  setInterval(load, REFRESH_MS);
});
