// Shared by collect.html and map.html: species list, login, and the WFS calls.
// The pages are served by GeoServer itself (data_dir/www), so every request
// here is same-origin.

const GEOSERVER = '/geoserver';
const NS_PREFIX = 'mushroom';
const NS_URI = 'http://mushroom-foraging';
const LAYER = 'observations';
const TYPENAME = `${NS_PREFIX}:${LAYER}`;

const SPECIES = [
  { id: 'chanterelle', name: 'Chanterelle', latin: 'Cantharellus spp.', color: '#e8961c' },
  { id: 'lions_mane', name: "Lion's Mane", latin: 'Hericium erinaceus', color: '#3b82c4' },
  { id: 'hen_of_the_woods', name: 'Hen of the Woods', latin: 'Grifola frondosa', color: '#8b5a2b' },
  { id: 'hedgehog', name: 'Hedgehog', latin: 'Hydnum repandum', color: '#b8457a' },
];
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

class AuthError extends Error {}

const Auth = {
  KEY: 'mushroom-foraging-login',
  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; }
  },
  set(user, pass) {
    try { localStorage.setItem(this.KEY, JSON.stringify({ user, pass })); } catch { /* private mode */ }
    this.session = { user, pass };
  },
  clear() {
    try { localStorage.removeItem(this.KEY); } catch { /* ignore */ }
    this.session = null;
  },
  header() {
    const c = this.session || this.get();
    return c ? 'Basic ' + btoa(`${c.user}:${c.pass}`) : '';
  },
};

async function wfsFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const auth = Auth.header();
  if (auth) headers.Authorization = auth;
  const resp = await fetch(url, { ...options, headers });
  if (resp.status === 401 || resp.status === 403) throw new AuthError('Wrong user name or password.');
  if (!resp.ok) throw new Error(`GeoServer answered ${resp.status}.`);
  return resp;
}

// GeoServer reports most errors as an XML exception with HTTP 200.
function exceptionText(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const node = doc.querySelector('ServiceException, ExceptionText, Message');
  return node ? node.textContent.trim() : text.slice(0, 300);
}

async function fetchObservations() {
  const params = new URLSearchParams({
    service: 'WFS', version: '1.0.0', request: 'GetFeature',
    typeName: TYPENAME, outputFormat: 'application/json',
  });
  const resp = await wfsFetch(`${GEOSERVER}/wfs?${params}`);
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    // With the layer hidden from anonymous users GeoServer says the type is unknown.
    const msg = exceptionText(text);
    if (/unknown|not find|no such/i.test(msg)) throw new AuthError('Not signed in, or this user cannot see the layer.');
    throw new Error(msg);
  }
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[c]);
}

async function transaction(body) {
  const xml = `<wfs:Transaction service="WFS" version="1.0.0"
    xmlns:wfs="http://www.opengis.net/wfs" xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml" xmlns:${NS_PREFIX}="${NS_URI}">${body}</wfs:Transaction>`;
  const resp = await wfsFetch(`${GEOSERVER}/wfs`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml,
  });
  const text = await resp.text();
  if (!/<wfs:SUCCESS\s*\/>/.test(text)) throw new Error(exceptionText(text));
  return text;
}

// obs: { species, lat, lon, accuracy, quantity, notes, observedAt: Date }
// Returns the new feature id, e.g. "observations.12".
async function insertObservation(obs) {
  const field = (name, value) => (value === null || value === undefined || value === ''
    ? '' : `<${NS_PREFIX}:${name}>${xmlEscape(value)}</${NS_PREFIX}:${name}>`);
  const text = await transaction(`<wfs:Insert><${NS_PREFIX}:${LAYER}>
    ${field('species', obs.species)}
    ${field('observed_at', obs.observedAt.toISOString())}
    ${field('accuracy_m', obs.accuracy === null ? null : Math.round(obs.accuracy * 10) / 10)}
    ${field('quantity', obs.quantity)}
    ${field('notes', obs.notes)}
    <${NS_PREFIX}:geom><gml:Point srsName="EPSG:4326"><gml:coordinates>${obs.lon},${obs.lat}</gml:coordinates></gml:Point></${NS_PREFIX}:geom>
  </${NS_PREFIX}:${LAYER}></wfs:Insert>`);
  const match = text.match(/fid="([^"]+)"/);
  return match ? match[1] : null;
}

async function deleteObservation(fid) {
  await transaction(`<wfs:Delete typeName="${TYPENAME}">
    <ogc:Filter><ogc:FeatureId fid="${xmlEscape(fid)}"/></ogc:Filter></wfs:Delete>`);
}

// Shows a sign-in overlay until a login can read the layer, then calls onReady.
// Also wires any element with [data-signout].
function requireLogin(onReady) {
  document.querySelectorAll('[data-signout]').forEach((el) => el.addEventListener('click', () => {
    Auth.clear();
    location.reload();
  }));

  const overlay = document.createElement('div');
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <form class="card login">
      <h2>Sign in</h2>
      <label>User <input name="user" autocomplete="username" autocapitalize="none" required></label>
      <label>Password <input name="pass" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="primary">Sign in</button>
      <p class="msg" role="alert"></p>
    </form>`;
  const form = overlay.querySelector('form');
  const msg = overlay.querySelector('.msg');

  const attempt = async () => {
    try {
      const data = await fetchObservations();
      overlay.remove();
      onReady(data);
      return true;
    } catch (err) {
      if (!(err instanceof AuthError)) msg.textContent = err.message;
      return false;
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Checking…';
    Auth.set(form.user.value.trim(), form.pass.value);
    if (!(await attempt())) {
      Auth.clear();
      if (msg.textContent === 'Checking…') msg.textContent = 'Wrong user name or password.';
    }
  });

  if (Auth.get()) {
    attempt().then((ok) => { if (!ok) document.body.append(overlay); });
  } else {
    document.body.append(overlay);
  }
}
