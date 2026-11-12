#!/usr/bin/env bash
# Test production config/ACL/healthcheck with temporary credentials and no physical clients.
set -euo pipefail
umask 077
work=$(mktemp -d /tmp/plant-mosquitto-config.XXXXXX)
container="plant-mosquitto-config-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
chmod 755 "$work"
python3 - "$work" <<'PY'
import pathlib, secrets, sys
root=pathlib.Path(sys.argv[1])
password=secrets.token_hex(32)
(root/'passwords').write_text('health:'+password+'\n')
(root/'health-password').write_text(password)
PY
docker run --rm --user "$(id -u):$(id -g)" -v "$work:/secrets" eclipse-mosquitto:2.0.22 mosquitto_passwd -U /secrets/passwords
docker run --rm --user 0:0 -v "$work:/secrets" --entrypoint sh eclipse-mosquitto:2.0.22 \
 -c 'chown 1883:1883 /secrets/passwords /secrets/health-password && chmod 600 /secrets/passwords /secrets/health-password'
docker run -d --name "$container" -p 127.0.0.1::1883 \
 -v "$PWD/docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro" \
 -v "$PWD/docker/mosquitto/acl:/mosquitto/config/acl:ro" \
 -v "$PWD/docker/mosquitto/healthcheck.sh:/mosquitto/config/healthcheck.sh:ro" \
 -v "$work/passwords:/mosquitto/secrets/passwords:ro" \
 -v "$work/health-password:/mosquitto/secrets/health-password:ro" \
 --health-cmd 'sh /mosquitto/config/healthcheck.sh' --health-interval 1s --health-timeout 3s \
 eclipse-mosquitto:2.0.22 >/dev/null
for attempt in {1..20}; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$container")
  [[ "$status" == healthy ]] && break
  sleep 1
done
[[ "$status" == healthy ]] || { docker logs "$container"; exit 1; }
if docker exec "$container" mosquitto_pub -h 127.0.0.1 -t plant/health -m anonymous >/dev/null 2>&1; then
  echo 'FAIL anonymous access accepted'; exit 1
fi
[[ "$(docker exec "$container" stat -c '%a:%u' /mosquitto/secrets/passwords)" == '600:1883' ]]
if docker logs "$container" 2>&1 | rg -q 'File .*passwords .*world readable'; then
  echo 'FAIL credential permissions warning'; exit 1
fi
echo 'PASS actual Mosquitto config, technical authentication, healthcheck, anonymous denial'
