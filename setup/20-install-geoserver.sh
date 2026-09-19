#!/usr/bin/env bash
# Download GeoServer (platform-independent binary) into $GEOSERVER_HOME and run
# it as a systemd *user* service on localhost:8080. No root needed.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
. "$root/.env"

java_home=/usr/lib/jvm/java-17-openjdk-amd64
[ -x "$java_home/bin/java" ] || { echo "Java 17 not found — run setup/10-install-system.sh first." >&2; exit 1; }

if [ ! -x "$GEOSERVER_HOME/bin/startup.sh" ]; then
	zip="$HOME/.cache/geoserver-$GEOSERVER_VERSION-bin.zip"
	if [ ! -s "$zip" ]; then
		mkdir -p "$(dirname "$zip")"
		echo "Downloading GeoServer $GEOSERVER_VERSION"
		wget -q --show-progress -O "$zip.part" \
			"https://sourceforge.net/projects/geoserver/files/GeoServer/$GEOSERVER_VERSION/geoserver-$GEOSERVER_VERSION-bin.zip/download"
		mv "$zip.part" "$zip"
	fi
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' EXIT
	unzip -q "$zip" -d "$tmp"
	# The zip may or may not wrap everything in a single top-level directory.
	src="$tmp"
	if [ ! -d "$tmp/bin" ] && [ "$(find "$tmp" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ]; then
		src="$(find "$tmp" -mindepth 1 -maxdepth 1)"
	fi
	mkdir -p "$(dirname "$GEOSERVER_HOME")"
	mv "$src" "$GEOSERVER_HOME"
	chmod +x "$GEOSERVER_HOME"/bin/*.sh
	echo "Installed to $GEOSERVER_HOME"
fi

unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
cat >"$unit_dir/geoserver.service" <<EOF
[Unit]
Description=GeoServer $GEOSERVER_VERSION (mushroom-foraging)

[Service]
Environment=JAVA_HOME=$java_home
Environment=GEOSERVER_HOME=$GEOSERVER_HOME
Environment=GEOSERVER_DATA_DIR=$GEOSERVER_HOME/data_dir
ExecStart=$GEOSERVER_HOME/bin/startup.sh
Restart=on-failure

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now geoserver.service

echo -n "Waiting for GeoServer to answer"
for _ in $(seq 90); do
	if wget -q -O /dev/null "$GEOSERVER_URL/web/"; then
		echo " — up."
		echo "Next: python3 setup/30-configure-geoserver.py"
		exit 0
	fi
	echo -n .
	sleep 2
done
echo
echo "GeoServer did not come up; check: journalctl --user -u geoserver -e" >&2
exit 1
