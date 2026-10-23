#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Always use this environment's local managed daemon; never a remote context.
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
container="storyboard-db-test-$$"
trap 'docker --host=unix:///var/run/docker.sock rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker --host=unix:///var/run/docker.sock run -d --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker --host=unix:///var/run/docker.sock logs "$container" 2>&1 | rg -q "PostgreSQL init process complete" && docker --host=unix:///var/run/docker.sock exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
run_sql() { docker --host=unix:///var/run/docker.sock exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres; }
run_sql < tests/sql/bootstrap.sql
for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  run_sql < "$migration"
done
run_sql < tests/sql/collaboration.sql
run_sql < tests/sql/private-images.sql
