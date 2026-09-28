# Security

Foraging spots are private, so the layer is closed to anonymous users.

## Sign-in

The pages open with a sign-in form, checked against `FORAGER_USER` /
`FORAGER_PASSWORD` in `.env` — by GeoServer, or by `tools/dev-server.js` in
development. `REQUIRE_LOGIN` in [`web/shared.js`](../web/shared.js) and the
matching switch in the dev server turn it off. Only the web app's own prompt
goes then: the accounts and access rules below still exist, so a real GeoServer
keeps refusing anonymous requests until those are relaxed as well — which would
leave the data open to anyone who can reach the server.

**The GitHub Pages copy has no sign-in**, whatever `REQUIRE_LOGIN` says. With
no server, the password could only be checked in the browser, so it would have
to ship in the public site's code, and there is nothing behind it to protect:
each browser's finds stay in that browser.

## Logins

| Account | Used by | Password in `.env` |
|---|---|---|
| `admin` | GeoServer admin UI, setup scripts | `GEOSERVER_ADMIN_PASSWORD` |
| `FORAGER_USER` (role `FORAGER`) | the web app, phone and desktop | `FORAGER_PASSWORD` |
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
