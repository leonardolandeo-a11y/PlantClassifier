#!/usr/bin/env bash
# Interactive technical credentials; does not touch existing Wi-Fi, .env.lab or PostgreSQL.
set -euo pipefail
secrets="$PWD/docker/mosquitto/secrets"
if [[ -e "$secrets/passwords" ]]; then echo 'Existing MQTT credentials preserved; provision manually to rotate.' >&2; exit 1; fi
mkdir -p "$secrets"
chmod 700 "$secrets"
umask 077
staging=$(mktemp -d "$secrets/.provision.XXXXXX")
trap 'rm -rf "$staging"' EXIT
for account in backend movement sensor health; do
  read -r -s -p "New MQTT password for $account (at least 32 characters): " secret
  echo
  [[ ${#secret} -ge 32 && "$secret" != *:* ]] || { echo 'Invalid secret' >&2; exit 1; }
  printf '%s:%s\n' "$account" "$secret" >> "$staging/passwords"
  if [[ "$account" == health ]]; then printf '%s' "$secret" > "$staging/health-password"; fi
  unset secret
done
# Hash in-place with the exact broker image; no password in process arguments.
docker run --rm --user "$(id -u):$(id -g)" -v "$staging:/secrets" eclipse-mosquitto:2.0.22 mosquitto_passwd -U /secrets/passwords
# Only newly generated files: Mosquitto drops privileges to container UID 1883.
# Parent stays owner-only on host; existing credentials are never changed.
docker run --rm --user 0:0 -v "$staging:/secrets" --entrypoint sh eclipse-mosquitto:2.0.22 \
  -c 'chown 1883:1883 /secrets/passwords /secrets/health-password && chmod 600 /secrets/passwords /secrets/health-password'
mv "$staging/passwords" "$staging/health-password" "$secrets/"
echo 'Ready. Copy the backend password into a separate private env file, device passwords into ignored mqtt_config.h files.'
