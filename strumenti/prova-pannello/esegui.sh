#!/usr/bin/env bash
# Prova end-to-end del pannello nel browser (Playwright) contro un finto
# Supabase in memoria. Non serve nessun progetto Supabase né internet.
#
#   bash strumenti/prova-pannello/esegui.sh
#
# 1. avvia finto-supabase.mjs (porta 54321)
# 2. compila il pannello puntando al finto Supabase
# 3. serve i file statici (porta 3000)
# 4. esegue percorso.mjs e salva le foto in strumenti/prova-pannello/foto/
#
# Requisiti: Node 20+, Python 3, Playwright con Chromium
# (npm i -g playwright && npx playwright install chromium).
set -euo pipefail

QUI="$(cd "$(dirname "$0")" && pwd)"
RADICE="$(cd "$QUI/../.." && pwd)"
TMP="$(mktemp -d)"
PID_FINTO=""
PID_WEB=""

pulizia() {
  [ -n "$PID_FINTO" ] && kill "$PID_FINTO" 2>/dev/null || true
  [ -n "$PID_WEB" ] && kill "$PID_WEB" 2>/dev/null || true
  rm -rf "$TMP"
}
trap pulizia EXIT

node "$QUI/finto-supabase.mjs" > "$TMP/finto.log" 2>&1 &
PID_FINTO=$!
sleep 1
ANON="$(sed -n 's/.*ANON=//p' "$TMP/finto.log")"
[ -n "$ANON" ] || { cat "$TMP/finto.log"; echo "Finto Supabase non partito"; exit 1; }

echo "→ compilo il pannello"
(
  cd "$RADICE/web"
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON" \
  npx next build > "$TMP/build.log" 2>&1 || { cat "$TMP/build.log"; exit 1; }
  cp -r out "$TMP/out"
  rm -rf out .next
)

python3 -m http.server 3000 --directory "$TMP/out" --bind 127.0.0.1 > "$TMP/web.log" 2>&1 &
PID_WEB=$!
sleep 1

echo "→ percorso nel browser"
node "$QUI/percorso.mjs"
