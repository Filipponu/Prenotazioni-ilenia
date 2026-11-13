#!/usr/bin/env bash
# Prova end-to-end del pannello nel browser (Playwright) contro un finto
# Supabase in memoria. Non serve nessun progetto Supabase né internet.
#
#   bash strumenti/prova-pannello/esegui.sh
#
# 1. avvia finto-supabase.mjs (porta 54321)
# 2. compila il pannello SENZA chiavi (come nel sito vero)
# 3. serve i file statici (porta 3000) e, al posto del Worker, /api/config
#    (indirizzo del finto Supabase e chiavi) e /api/info
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

VAPID="$(node "$RADICE/strumenti/genera-chiavi-vapid.mjs" | sed -n 's/^NEXT_PUBLIC_VAPID_PUBLIC_KEY=//p')"

echo "→ compilo il pannello"
(
  cd "$RADICE/web"
  env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -u NEXT_PUBLIC_VAPID_PUBLIC_KEY \
  npx next build > "$TMP/build.log" 2>&1 || { cat "$TMP/build.log"; exit 1; }
  cp -r out "$TMP/out"
  rm -rf out .next
)
if grep -rq "$ANON" "$TMP/out"; then echo "La chiave è finita nei file del pannello!"; exit 1; fi
mkdir -p "$TMP/out/api"
printf '{"supabaseUrl":"http://127.0.0.1:54321","supabaseChiave":"%s","chiaveVapid":"%s"}' "$ANON" "$VAPID" > "$TMP/out/api/config"
printf '{"nome":"Ilenia","telefono":"0123 456789","whatsapp":"393000000999","email":null}' > "$TMP/out/api/info"

python3 -m http.server 3000 --directory "$TMP/out" --bind 127.0.0.1 > "$TMP/web.log" 2>&1 &
PID_WEB=$!
sleep 1

echo "→ percorso nel browser"
node "$QUI/percorso.mjs"
