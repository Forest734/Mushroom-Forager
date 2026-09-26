# Security

Foraging spots are private, so the layer is closed to anonymous users.

## Sign-in

**The web app's sign-in is off right now.** `REQUIRE_LOGIN` in
[`web/shared.js`](../web/shared.js) is `false`, so the pages load straight into
the app and send no credentials, and `tools/dev-server.js` has the matching
switch and serves WFS to anyone on localhost.

Set both back to `true` to get the overlay and Basic auth back. Note that only
the web app's own prompt is off: the accounts and access rules below still
exist, so against a real GeoServer the layer will refuse anonymous requests
until those are relaxed as well — which would leave the data open to anyone who
can reach the server.

## Logins

| Account | Used by | Password in `.env` |
|---|---|---|
| `admin` | GeoServer admin UI, setup scripts | `GEOSERVER_ADMIN_PASSWORD` |
| `forager` (role `FORAGER`) | the web app, phone and desktop | `FORAGER_PASSWORD` |
| `mushroom` (PostgreSQL role) | GeoServer → database | `DB_PASSWORD` |

`setup/30-configure-geoserver.py` replaces GeoServer's default `admin` /
`geoserver` password.

## Access rules

GeoServer data security rules on the `mushroom` workspace:

```
mushroom.*.r = FORAGER,ADMIN
mushroom.*.w = FORAGER,ADMIN
```

Anonymous requests don't see the layer at all. GeoServer answers as if it
doesn't exist.

The web app sends the login as HTTP Basic auth on each request. The browser
stores it in `localStorage`; **Sign out** clears it. Basic auth is only
safe over HTTPS, which is one more reason to use HTTPS for the phone.

## Network

GeoServer listens on port 8080. With `ufw` set to deny incoming connections by
default (`~/harden.sh`), other devices on the LAN can't reach it directly.

## HTTPS

Not set up yet. Phone browsers only allow GPS on HTTPS pages (or `localhost`).
Options:

- **Tailscale** (the proposed option): `tailscale serve` gives
  `https://<machine>.<tailnet>.ts.net` with a real certificate, forwarded to
  `localhost:8080`. It is reachable from the phone anywhere, and only by your
  devices.
- A self-signed certificate on the LAN: works only at home, and the phone warns
  about the certificate.
- A cloud server with a real domain: more to run and secure.
