// Phone data collector: watch the GPS, pick a species, save via WFS-T.

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
  save: document.getElementById('save'),
  status: document.getElementById('status'),
  recentCard: document.getElementById('recent-card'),
  recent: document.getElementById('recent'),
};

// Above this the fix is flagged as poor; the user can still save.
const GOOD_ACCURACY_M = 15;
const FAIR_ACCURACY_M = 40;

let position = null;
let picked = null;
let variant = null;
let saving = false;

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

// The genus-level species offer a second row of choices; picking one is
// optional, so the sub-list starts on 'Not sure'.
function showVariants(species) {
  variant = null;
  const list = VARIANTS[species.id];
  els.variants.hidden = !list;
  els.variantChips.replaceChildren();
  if (!list) return;

  els.variantsTitle.textContent = `Which ${species.name.toLowerCase()}?`;
  const chips = [{ id: null, name: 'Not sure', latin: species.latin }, ...list];
  for (const v of chips) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(v.id === null));
    chip.style.setProperty('--pick', species.color);
    chip.innerHTML = `<span class="name">${v.name}</span><span class="latin">${v.latin}</span>`;
    chip.addEventListener('click', () => {
      variant = v.id;
      for (const c of els.variantChips.children) c.setAttribute('aria-pressed', String(c === chip));
    });
    els.variantChips.append(chip);
  }
}

function updateSave() {
  els.save.disabled = saving || !position || !picked;
}

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
      observedAt: new Date(),
    });
    const label = variant ? VARIANT_BY_ID[variant].latin : species.name;
    setStatus(`Saved ${label} ±${Math.round(accuracy)} m`, 'ok');
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${species.color}"></span>`;
    li.append(`${label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      + (quantity > 0 ? ` · ×${quantity}` : ''));
    els.recent.prepend(li);
    els.recentCard.hidden = false;
    els.quantity.value = '';
    els.notes.value = '';
  } catch (err) {
    setStatus(err instanceof AuthError ? 'Signed out — reload and sign in again.' : `Not saved: ${err.message}`, 'err');
  } finally {
    saving = false;
    updateSave();
  }
});

requireLogin(startGps);
