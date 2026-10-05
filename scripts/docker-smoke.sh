#!/usr/bin/env bash
# Docker smoke test: build, boot, check sqlite WAL persistence across restart, tear down.
set -euo pipefail
cd "$(dirname "$0")/.."

P=(docker compose -p voltops-smoke)
MADE_ENV=0
fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
  rc=$?
  "${P[@]}" down -v >/dev/null 2>&1 || true
  [ "$MADE_ENV" = 1 ] && rm -f .env
  [ $rc -eq 0 ] && echo "PASS" || echo "docker-smoke failed (exit $rc)" >&2
}
trap cleanup EXIT

docker version --format '{{.Server.Version}}' >/dev/null 2>&1 \
  || fail "Docker engine not reachable (is Docker Desktop running?)"
[ -f compose.yaml ] || fail "compose.yaml not found"

# 1. throwaway .env
if [ ! -f .env ]; then
  MADE_ENV=1
  cat > .env <<'ENV'
SESSION_SECRET=smoke-test-secret-smoke-test-secret-0000
TESLA_CLIENT_ID=dummy
TESLA_CLIENT_SECRET=dummy
TESLA_REDIRECT_URI=http://localhost:3000/api/auth/callback
VOLTOPS_SECRET_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ENV
fi

# 2. build + start
"${P[@]}" up -d --build

# 3. wait for /login or /setup to return 200 (<= 90 s)
ok=0
for _ in $(seq 1 45); do
  for path in login setup; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/$path" || true)
    [ "$code" = 200 ] && ok=1 && break
  done
  [ $ok = 1 ] && break
  sleep 2
done
[ $ok = 1 ] || { "${P[@]}" logs --tail 50 >&2 || true; fail "/login and /setup never returned 200 within 90s"; }

# 4. db file exists and is WAL (slim image has no sqlite3 CLI; use better-sqlite3)
check_db() {
  "${P[@]}" exec -T web node -e '
    const D=require("better-sqlite3");
    const fs=require("fs");
    if(!fs.existsSync("/data/voltops.db")){console.error("missing /data/voltops.db");process.exit(1)}
    const m=new D("/data/voltops.db",{readonly:true}).pragma("journal_mode",{simple:true});
    if(m!=="wal"){console.error("journal_mode="+m);process.exit(1)}
  ' || fail "$1: /data/voltops.db missing or journal_mode != wal"
}
check_db "after boot"

# 5. restart; db persists
"${P[@]}" restart
sleep 5
check_db "after restart"
# 6. down -v runs in the EXIT trap
