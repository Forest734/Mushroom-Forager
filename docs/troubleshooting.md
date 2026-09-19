# Troubleshooting

## GeoServer

```sh
systemctl --user status geoserver
journalctl --user -u geoserver -e
systemctl --user restart geoserver
```

GeoServer usually takes 20–60 s to start.

## Collector says "GPS needs HTTPS"

The page was opened over `http://` from another device. Use the HTTPS address
(see [security.md](security.md#https)).

## "Location permission denied"

In the phone browser's site settings, allow Location for the site, then reload
the page.

## Sign-in keeps failing

- Check `FORAGER_USER` / `FORAGER_PASSWORD` in `.env`.
- Re-run `setup/30-configure-geoserver.py`. It resets the forager password and
  the access rules from `.env`.
- If the browser shows its own login popup, that is GeoServer asking for Basic
  auth after a wrong password. Cancel it and use the page's sign-in form.

## "Not saved: …"

The message is GeoServer's own error text. Common causes:

- **constraint / check violation**: the species id isn't allowed by the
  database. See [data-model.md](data-model.md#adding-or-renaming-a-species).
- **Transaction not supported / not allowed**: the WFS service level isn't
  `COMPLETE`, or the user lacks write access. Re-run the configure script.

## Map is empty

- Check the **When** filter and the species checkboxes.
- Check the status line under **Refresh** for an error.
- Test the layer directly as admin (the password is in `.env`):

  ```sh
  wget -qO- --user admin --ask-password \
    'http://localhost:8080/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=mushroom:observations&outputFormat=application/json&maxFeatures=1'
  ```

## Web changes don't show up

Run `setup/40-deploy-web.sh`, then hard-reload the page (Ctrl+Shift+R).
