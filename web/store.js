// Loads, saves and deletes finds over WFS, for collect.html and map.html. The
// pages are served by GeoServer itself (data_dir/www), so every request here
// is same-origin. The GitHub Pages build swaps this file for pages/store.js,
// which keeps finds in the browser instead (see tools/build-pages.sh).

// Finds live on the server, so the pages offer no export or import.
const ON_DEVICE = false;

const GEOSERVER = '/geoserver';
const NS_PREFIX = 'mushroom';
const NS_URI = 'http://mushroom-foraging';
const LAYER = 'observations';
const TYPENAME = `${NS_PREFIX}:${LAYER}`;

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

// obs: { species, variant, lat, lon, accuracy, quantity, notes, observedAt: Date }
// Returns the new feature id, e.g. "observations.12".
async function insertObservation(obs) {
  const field = (name, value) => (value === null || value === undefined || value === ''
    ? '' : `<${NS_PREFIX}:${name}>${xmlEscape(value)}</${NS_PREFIX}:${name}>`);
  const text = await transaction(`<wfs:Insert><${NS_PREFIX}:${LAYER}>
    ${field('species', obs.species)}
    ${field('variant', obs.variant)}
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
