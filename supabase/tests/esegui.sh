#!/usr/bin/env bash
# Applica le migrazioni e lancia i test SQL su un database Postgres USA E GETTA.
#
#   TEST_DATABASE_URL=postgres://utente:password@localhost:5432/postgres npm run test:db
#
# Lo script crea un database temporaneo, ci simula il minimo di Supabase
# (schema auth e ruoli), applica le migrazioni, esegue i test e lo cancella.
# NON puntarlo al database Supabase di produzione.
set -euo pipefail

: "${TEST_DATABASE_URL:?Imposta TEST_DATABASE_URL verso un Postgres usa e getta (non Supabase di produzione)}"

QUI="$(cd "$(dirname "$0")" && pwd)"
MIGRAZIONI="$QUI/../migrations"
DB="ilenia_test_$$"
URL_TEST="$(printf '%s' "$TEST_DATABASE_URL" | sed -E "s#^(postgres(ql)?://[^/]+)/[^?]*#\1/$DB#")"

psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -qc "create database $DB" >/dev/null
trap 'psql "$TEST_DATABASE_URL" -qc "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

esegui() {
  # i risultati delle query si scartano; restano gli avvisi "ok - …" e gli errori
  psql "$URL_TEST" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$1" 2>&1 \
    | sed -E 's/^psql:[^ ]+ (NOTICE|NOTIZIA): +/  /'
}

esegui "$QUI/stub-supabase.sql"
for f in "$MIGRAZIONI"/*.sql; do
  echo "→ migrazione $(basename "$f")"
  esegui "$f"
done
for f in "$QUI"/test_*.sql; do
  echo "→ test $(basename "$f")"
  esegui "$f"
done
echo "Tutti i test SQL sono passati."
