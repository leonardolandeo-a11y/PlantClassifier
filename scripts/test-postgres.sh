#!/usr/bin/env bash
# Uses an isolated, ephemeral container; never reads .env or mounts project database volumes.
set -euo pipefail
container=$(docker run --rm -d -e POSTGRES_USER=plant_test -e POSTGRES_PASSWORD=isolated_test_only \
  -e POSTGRES_DB=plant_test -p 127.0.0.1::5432 postgres:17-alpine)
trap 'docker stop "$container" >/dev/null' EXIT
ready=false
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -U plant_test -d plant_test >/dev/null; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'Isolated PostgreSQL did not start' >&2; exit 1; fi
port=$(docker port "$container" 5432 | sed 's/.*://')
export PLANT_TEST_DB_URL="jdbc:postgresql://127.0.0.1:$port/plant_test"
export PLANT_TEST_DB_USER=plant_test
export PLANT_TEST_DB_PASSWORD=isolated_test_only
if (( $# )); then
  ./mvnw "$@"
else
  ./mvnw -B -Dtest=PostgresMigrationTest test
fi
