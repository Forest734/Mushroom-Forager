// Phone data collector: watch the GPS, pick a species, take photos, save via WFS-T.

const els = {
  dot: document.getElementById('gps-dot'),
  state: document.getElementById('gps-state'),
  coords: document.getElementById('gps-coords'),
  species: document.getElementById('species'),
  variants: document.getElementById('variants'),
  variantsTitle: document.getElementById('variants-title'),
  variantChips: document.getElementById('variant-chips'),
  quantity: document.getElementById('quantity'),
  notes: document.getElementById('notes'),
  takePhoto: document.getElementById('take-photo'),
  photoInput: document.getElementById('photo-input'),
  photoList: document.getElementById('photo-list'),
  save: document.getElementById('save'),
  status: document.getElementById('status'),
  recentCard: document.getElementById('recent-card'),
  recent: document.getElementById('recent'),
};

// Above this the fix is flagged as poor; the user can still save.
const GOOD_ACCURACY_M = 15;
const FAIR_ACCURACY_M = 40;

// Photos are shrunk to this on the long edge and re-encoded as JPEG before
// they are kept, which also drops the camera's EXIF, GPS position included.
const PHOTO_MAX_PX = 1280;
const PHOTO_QUALITY = 0.8;

let position = null;
let picked = null;
let variant = null;
let saving = false;
let photos = [];
let shrinking = 0;

for (const s of SPECIES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'false');
  btn.style.setProperty('--pick', s.color);
  btn.innerHTML = `<span class="name"><span class="swatch" style="background:${s.color}"></span>${s.name}</span>
    <span class="latin">${s.latin}</span>`;
  btn.addEventListener('click', () => {
    picked = s.id;
    for (const b of els.species.children) b.setAttribute('aria-pressed', String(b === btn));
    showVariants(s);
    updateSave();
  });
  els.species.append(btn);
}

// The genus-level species open a sub-list, grouped by the common name several
// species share ("Black trumpet" covers four). Picking one is optional, so the
// sub-list starts on 'Not sure'.
function showVariants(species) {
  variant = null;
  const list = VARIANTS[species.id];
  els.variants.hidden = !list;
  els.variantChips.replaceChildren();
  if (!list) return;

  els.variantsTitle.textContent = `Which ${species.name}?`;

  const select = (chip) => {
    for (const c of els.variants.querySelectorAll('.chip')) {
      c.setAttribute('aria-pressed', String(c === chip));
    }
  };

  const unsure = document.createElement('button');
  unsure.type = 'button';
  unsure.className = 'chip unsure';
  unsure.setAttribute('aria-pressed', 'true');
  unsure.style.setProperty('--pick', species.color);
  unsure.innerHTML = `<span class="name">Not sure</span><span class="latin">${species.latin}</span>`;
  unsure.addEventListener('click', () => { variant = null; select(unsure); });
  els.variantChips.append(unsure);

  for (const [group, members] of groupBy(list, (v) => v.group)) {
    const heading = document.createElement('h3');
    heading.textContent = group;
    const row = document.createElement('div');
    row.className = 'chips photos';
    for (const v of members) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip photo';
      chip.setAttribute('aria-pressed', 'false');
      chip.style.setProperty('--pick', species.color);
      chip.innerHTML = `<img src="${v.photo}" alt="" loading="lazy" onerror="this.hidden = true">
        <span class="latin">${v.latin}</span>
        <span class="hint">${v.hint}</span>`;
      chip.addEventListener('click', () => { variant = v.id; select(chip); });
      row.append(chip);
    }
    els.variantChips.append(heading, row);
  }
}

// Keeps the order the list is written in, for both the groups and their members.
function groupBy(list, key) {
  const groups = new Map();
  for (const item of list) {
    const k = key(item);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  return groups;
}

function updateSave() {
  els.save.disabled = saving || shrinking > 0 || !position || !picked;
}

async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement('canvas'), {
    width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale),
  });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

function showPhotos() {
  els.photoList.replaceChildren(...photos.map((src, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<img src="${src}" alt="Photo ${i + 1}">
      <button type="button" class="remove" aria-label="Remove photo ${i + 1}">×</button>`;
    li.querySelector('button').addEventListener('click', () => {
      photos.splice(i, 1);
      showPhotos();
    });
    return li;
  }));
  els.takePhoto.textContent = photos.length ? 'Take another photo' : 'Take a photo';
}

els.takePhoto.addEventListener('click', () => els.photoInput.click());
els.photoInput.addEventListener('change', async () => {
  const [file] = els.photoInput.files;
  els.photoInput.value = '';
  if (!file) return;
  shrinking++;
  updateSave();
  try {
    photos.push(await shrinkPhoto(file));
    showPhotos();
  } catch {
    setStatus('That photo could not be read — try taking it again.', 'err');
  } finally {
    shrinking--;
    updateSave();
  }
});

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = kind;
}

function onPosition(pos) {
  position = pos;
  const { latitude, longitude, accuracy } = pos.coords;
  const grade = accuracy <= GOOD_ACCURACY_M ? 'good' : accuracy <= FAIR_ACCURACY_M ? 'fair' : 'bad';
  els.dot.className = `dot ${grade}`;
  els.state.textContent = `GPS ±${Math.round(accuracy)} m` + (grade === 'bad' ? ' — weak fix, wait if you can' : '');
  els.coords.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  updateSave();
}

function onPositionError(err) {
  els.dot.className = 'dot bad';
  if (!window.isSecureContext) {
    els.state.textContent = 'GPS needs HTTPS';
    els.coords.textContent = 'Open this page through the https:// address.';
  } else if (err.code === err.PERMISSION_DENIED) {
    els.state.textContent = 'Location permission denied';
    els.coords.textContent = 'Allow location for this site in the browser settings, then reload.';
  } else {
    els.state.textContent = 'No GPS fix yet';
    els.coords.textContent = err.message;
  }
}

function startGps() {
  if (!('geolocation' in navigator)) {
    onPositionError({ code: 0, message: 'This browser has no geolocation.' });
    return;
  }
  navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true, maximumAge: 5000, timeout: 30000,
  });
}

els.save.addEventListener('click', async () => {
  const species = SPECIES_BY_ID[picked];
  const { latitude, longitude, accuracy } = position.coords;
  const quantity = parseInt(els.quantity.value, 10);
  saving = true;
  updateSave();
  setStatus('Saving…');
  try {
    await insertObservation({
      species: species.id,
      variant,
      lat: latitude,
      lon: longitude,
      accuracy,
      quantity: quantity > 0 ? quantity : null,
      notes: els.notes.value.trim(),
      photos,
      observedAt: new Date(),
    });
    const label = variant ? VARIANT_BY_ID[variant].latin : species.name;
    setStatus(`Saved ${label} ±${Math.round(accuracy)} m`, 'ok');
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${species.color}"></span>`;
    li.append(`${label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      + (quantity > 0 ? ` · ×${quantity}` : '')
      + (photos.length ? ` · ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''));
    els.recent.prepend(li);
    els.recentCard.hidden = false;
    els.quantity.value = '';
    els.notes.value = '';
    photos = [];
    showPhotos();
  } catch (err) {
    setStatus(err instanceof AuthError ? 'Signed out — reload and sign in again.' : `Not saved: ${err.message}`, 'err');
  } finally {
    saving = false;
    updateSave();
  }
});

wireDeviceStore();
requireLogin(startGps);
