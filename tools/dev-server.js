// Local stand-in for GeoServer, so web/ can be exercised before the real stack
// exists: serves web/ statically and answers the handful of WFS calls that
// shared.js makes, backed by the real PostGIS `observations` table via psql.
//
//   node tools/dev-server.js [port]    (default 8000)
//
// It is a development aid, not part of the deployment: only the calls shared.js
// makes are implemented, and nothing here tests GeoServer's own configuration
// (WFS service level, roles, access rules). Needs setup/00-make-env.sh and
// setup/10-install-system.sh to have run.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const PORT = Number(process.argv[2] || 8000);

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);

function psql(sql) {
  return new Promise((resolve, reject) => {
    execFile('psql', ['-h', 'localhost', '-U', env.DB_USER, '-d', env.DB_NAME, '-q', '-t', '-A', '-c', sql],
      { env: { ...process.env, PGPASSWORD: env.DB_PASSWORD } },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout.trim())));
  });
}

const lit = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? m[1].trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
};

// Matches REQUIRE_LOGIN in web/shared.js; with it false the stand-in serves WFS
// to anyone, which is fine for a server bound to localhost.
const REQUIRE_LOGIN = false;

function authorized(req) {
  if (!REQUIRE_LOGIN) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  return user === env.FORAGER_USER && rest.join(':') === env.FORAGER_PASSWORD;
}

const GEOJSON_SQL = `
  SELECT json_build_object('type', 'FeatureCollection', 'features',
    coalesce(json_agg(json_build_object(
      'type', 'Feature',
      'id', 'observations.' || id,
      'geometry', ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'species', species, 'variant', variant, 'observed_at', observed_at,
        'accuracy_m', accuracy_m, 'quantity', quantity, 'notes', notes)
    ) ORDER BY id), '[]'::json))
  FROM observations`;

const TX_OK = (fid) => `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_TransactionResponse version="1.0.0" xmlns:wfs="http://www.opengis.net/wfs" xmlns:ogc="http://www.opengis.net/ogc">
  <wfs:InsertResult>${fid ? `<ogc:FeatureId fid="${fid}"/>` : ''}</wfs:InsertResult>
  <wfs:TransactionResult><wfs:Status><wfs:SUCCESS/></wfs:Status></wfs:TransactionResult>
</wfs:WFS_TransactionResponse>`;

const TX_FAIL = (msg) => `<?xml version="1.0" encoding="UTF-8"?>
<ServiceExceptionReport><ServiceException>${msg.replace(/[<>&]/g, '')}</ServiceException></ServiceExceptionReport>`;

async function handleTransaction(xml) {
  if (/<(?:\w+:)?Insert[\s>]/.test(xml)) {
    const coords = tag(xml, 'coordinates');
    const [lon, lat] = (coords || '').split(',').map(Number);
    const fid = await psql(`INSERT INTO observations (species, variant, observed_at, accuracy_m, quantity, notes, geom)
      VALUES (${lit(tag(xml, 'species'))}, ${lit(tag(xml, 'variant'))}, ${lit(tag(xml, 'observed_at'))}::timestamptz,
              ${lit(tag(xml, 'accuracy_m'))}::real, ${lit(tag(xml, 'quantity'))}::int,
              ${lit(tag(xml, 'notes'))}, ST_SetSRID(ST_MakePoint(${Number(lon)}, ${Number(lat)}), 4326))
      RETURNING id`);
    console.log(`  insert → observations.${fid}`);
    return TX_OK(`observations.${fid}`);
  }
  if (/<(?:\w+:)?Delete[\s>]/.test(xml)) {
    const fid = (xml.match(/fid="observations\.(\d+)"/) || [])[1];
    if (!fid) throw new Error('no feature id in delete');
    await psql(`DELETE FROM observations WHERE id = ${Number(fid)}`);
    console.log(`  delete → observations.${fid}`);
    return TX_OK(null);
  }
  throw new Error('only Insert and Delete are stubbed');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`${req.method} ${url.pathname}${url.search}`);

  if (url.pathname.startsWith('/geoserver/wfs')) {
    if (!authorized(req)) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="dev"' }); return res.end('unauthorized'); }
    try {
      if (req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = await handleTransaction(Buffer.concat(chunks).toString());
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        return res.end(body);
      }
      const json = await psql(GEOJSON_SQL);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(json);
    } catch (err) {
      console.error(`  ! ${err.message}`);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(TX_FAIL(err.message));
    }
  }

  let file = path.join(WEB, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('forbidden'); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`collector: http://localhost:${PORT}/collect.html   map: http://localhost:${PORT}/map.html`));
