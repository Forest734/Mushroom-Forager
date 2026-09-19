#!/usr/bin/env python3
"""Configure GeoServer over its REST API. Idempotent — safe to re-run.

- replaces the default admin password with the one in .env
- workspace/namespace "mushroom", PostGIS store, layer mushroom:observations
- WFS set to allow transactions (inserts from the phone, deletes from the map)
- user "forager" with role FORAGER, which is the only non-admin role allowed to
  read or write the mushroom workspace (the spots are private)
"""

import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = "mushroom"
NAMESPACE_URI = "http://mushroom-foraging"
STORE = "postgis"
LAYER = "observations"
ROLE = "FORAGER"


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


ENV = load_env()
REST = ENV["GEOSERVER_URL"].rstrip("/") + "/rest"


class GeoServer:
    def __init__(self, password):
        self.password = password

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(REST + path, data=data, method=method)
        token = base64.b64encode(f"admin:{self.password}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req) as resp:
                text = resp.read().decode()
                return resp.status, (json.loads(text) if text.strip().startswith("{") else text)
        except urllib.error.HTTPError as err:
            return err.code, err.read().decode(errors="replace")

    def ok(self, method, path, body=None):
        status, result = self.call(method, path, body)
        if status >= 300:
            sys.exit(f"{method} {path} failed ({status}): {result}")
        return result

    def exists(self, path):
        return self.call("GET", path)[0] == 200


def connect_admin():
    wanted = ENV["GEOSERVER_ADMIN_PASSWORD"]
    gs = GeoServer(wanted)
    if gs.call("GET", "/about/version")[0] == 200:
        return gs
    default = GeoServer("geoserver")
    if default.call("GET", "/about/version")[0] != 200:
        sys.exit("Cannot log in as admin with the .env password or the default one.")
    default.ok("PUT", "/security/self/password", {"newPassword": wanted})
    print("admin: default password replaced")
    return gs


def main():
    gs = connect_admin()

    if not gs.exists(f"/namespaces/{WORKSPACE}"):
        gs.ok("POST", "/namespaces", {"namespace": {"prefix": WORKSPACE, "uri": NAMESPACE_URI}})
        print(f"workspace {WORKSPACE}: created")

    store_body = {"dataStore": {"name": STORE, "connectionParameters": {"entry": [
        {"@key": "dbtype", "$": "postgis"},
        {"@key": "host", "$": "localhost"},
        {"@key": "port", "$": "5432"},
        {"@key": "database", "$": ENV["DB_NAME"]},
        {"@key": "schema", "$": "public"},
        {"@key": "user", "$": ENV["DB_USER"]},
        {"@key": "passwd", "$": ENV["DB_PASSWORD"]},
    ]}}}
    store_path = f"/workspaces/{WORKSPACE}/datastores"
    if gs.exists(f"{store_path}/{STORE}"):
        gs.ok("PUT", f"{store_path}/{STORE}", store_body)
        print(f"store {STORE}: connection updated")
    else:
        gs.ok("POST", store_path, store_body)
        print(f"store {STORE}: created")

    ft_path = f"{store_path}/{STORE}/featuretypes"
    if not gs.exists(f"{ft_path}/{LAYER}"):
        gs.ok("POST", ft_path, {"featureType": {
            "name": LAYER, "nativeName": LAYER, "title": "Mushroom observations",
            "srs": "EPSG:4326", "projectionPolicy": "FORCE_DECLARED",
        }})
        print(f"layer {WORKSPACE}:{LAYER}: published")

    wfs = gs.ok("GET", "/services/wfs/settings")
    if wfs["wfs"].get("serviceLevel") != "COMPLETE":
        wfs["wfs"]["serviceLevel"] = "COMPLETE"
        gs.ok("PUT", "/services/wfs/settings", wfs)
        print("wfs: transactions enabled")

    user, password = ENV["FORAGER_USER"], ENV["FORAGER_PASSWORD"]
    users = gs.ok("GET", "/security/usergroup/users")["users"]
    user_body = {"user": {"userName": user, "password": password, "enabled": True}}
    if any(u["userName"] == user for u in users):
        gs.ok("POST", f"/security/usergroup/user/{user}", user_body)
    else:
        gs.ok("POST", "/security/usergroup/users", user_body)
        print(f"user {user}: created")

    if ROLE not in gs.ok("GET", "/security/roles")["roles"]:
        gs.ok("POST", f"/security/roles/role/{ROLE}")
    if ROLE not in gs.ok("GET", f"/security/roles/user/{user}")["roles"]:
        gs.ok("POST", f"/security/roles/role/{ROLE}/user/{user}")
        print(f"user {user}: granted {ROLE}")

    rules = {f"{WORKSPACE}.*.r": f"{ROLE},ADMIN", f"{WORKSPACE}.*.w": f"{ROLE},ADMIN"}
    current = gs.ok("GET", "/security/acl/layers")
    new = {k: v for k, v in rules.items() if k not in current}
    changed = {k: v for k, v in rules.items() if k in current and current[k] != v}
    if new:
        gs.ok("POST", "/security/acl/layers", new)
    if changed:
        gs.ok("PUT", "/security/acl/layers", changed)
    if new or changed:
        print(f"acl: {WORKSPACE} restricted to {ROLE},ADMIN")

    print("GeoServer configured. Next: setup/40-deploy-web.sh")


if __name__ == "__main__":
    main()
