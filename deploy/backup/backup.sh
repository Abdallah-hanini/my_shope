#!/bin/sh
# Database backups for the shop server. Runs inside the postgres:16-alpine "backup" container.
#   backup.sh loop     run forever, one backup every BACKUP_INTERVAL_HOURS (container entrypoint)
#   backup.sh once     one backup now (deploy/windows/backup-now.ps1)
#   backup.sh health   exit 1 when the last successful backup is too old (container healthcheck)
#   backup.sh verify   restore the newest backup into a scratch database and check it
# Every dump is checked with pg_restore --list and gets a .sha256 file. Failures are written to
# /backups/LAST_FAILURE.txt and make the container unhealthy; they are never silent.
set -eu

DIR=/backups
INTERVAL_HOURS=${BACKUP_INTERVAL_HOURS:-6}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
KEEP_MIN=14
DATABASES="erp keycloak"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# NOTE: "set -e" does not apply inside a function called as "backup_once || record_failure", so
# every step checks its own exit status explicitly.
backup_once() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$DIR" || return 1
  for db in $DATABASES; do
    out="$DIR/$db-$stamp.dump"
    pg_dump --format=custom --compress=6 --no-owner --dbname="$db" --file="$out.partial" || return 1
    size=$(wc -c < "$out.partial") || return 1
    [ "$size" -ge 1024 ] || { log "dump of $db is only $size bytes"; return 1; }
    pg_restore --list "$out.partial" >/dev/null || return 1
    mv "$out.partial" "$out" || return 1
    (cd "$DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256") || return 1
    log "backup ok: $(basename "$out") ($size bytes)"
  done
  prune || return 1
  date -u +%Y-%m-%dT%H:%M:%SZ > "$DIR/LAST_SUCCESS.txt" || return 1
  rm -f "$DIR/LAST_FAILURE.txt"
}

# Delete dumps older than RETENTION_DAYS, but always keep the newest KEEP_MIN per database.
prune() {
  for db in $DATABASES; do
    ls -1t "$DIR"/"$db"-*.dump 2>/dev/null | tail -n +$((KEEP_MIN + 1)) | while read -r f; do
      if [ -n "$(find "$f" -mtime +"$RETENTION_DAYS" 2>/dev/null)" ]; then
        rm -f "$f" "$f.sha256"
        log "pruned $(basename "$f")"
      fi
    done
  done
}

record_failure() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup failed (see container logs)" > "$DIR/LAST_FAILURE.txt" || true
  find "$DIR" -name '*.partial' -delete 2>/dev/null || true
  log "BACKUP FAILED"
}

health() {
  [ -f "$DIR/LAST_SUCCESS.txt" ] || { echo "no successful backup yet"; exit 1; }
  [ ! -f "$DIR/LAST_FAILURE.txt" ] || { cat "$DIR/LAST_FAILURE.txt"; exit 1; }
  max_age=$(( (INTERVAL_HOURS * 2 + 1) * 3600 ))
  last=$(date -u -d "$(sed 's/T/ /; s/Z//' "$DIR/LAST_SUCCESS.txt")" +%s)
  now=$(date -u +%s)
  [ $((now - last)) -le "$max_age" ] || { echo "last backup is older than $max_age s"; exit 1; }
  echo "ok: last backup $(cat "$DIR/LAST_SUCCESS.txt")"
}

# Restore the newest ERP dump into a throwaway database, check it, then drop it.
verify() {
  latest=$(ls -1t "$DIR"/erp-*.dump 2>/dev/null | head -n 1)
  [ -n "$latest" ] || { echo "no ERP backup found in $DIR"; exit 1; }
  (cd "$DIR" && sha256sum -c "$(basename "$latest").sha256")
  scratch="restore_check_$(date -u +%Y%m%d%H%M%S)"
  createdb "$scratch"
  trap 'dropdb --if-exists "$scratch"' EXIT
  pg_restore --no-owner --exit-on-error --dbname="$scratch" "$latest"
  psql -v ON_ERROR_STOP=1 -X -q -t -A --dbname="$scratch" <<'SQL'
\echo migrations applied:
SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL;
\echo companies / journals / journal lines / audit events:
SELECT (SELECT count(*) FROM org.company) || ' / ' || (SELECT count(*) FROM accounting.journal) || ' / '
    || (SELECT count(*) FROM accounting.journal_line) || ' / ' || (SELECT count(*) FROM platform.audit_event);
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT company_id FROM accounting.journal_line GROUP BY company_id HAVING sum(debit) <> sum(credit)) t;
  IF bad > 0 THEN RAISE EXCEPTION 'ledger out of balance in % companies', bad; END IF;
END $$;
\echo ledger balanced per company: yes
SQL
  echo "VERIFIED: $(basename "$latest") restores cleanly"
}

case "${1:-}" in
  once) if backup_once; then :; else record_failure; exit 1; fi ;;
  health) health ;;
  verify) verify ;;
  loop)
    log "backup loop: every ${INTERVAL_HOURS}h, retention ${RETENTION_DAYS}d (min ${KEEP_MIN} kept)"
    while true; do
      if backup_once; then :; else record_failure; fi
      sleep $((INTERVAL_HOURS * 3600))
    done
    ;;
  *) echo "usage: backup.sh loop|once|health|verify" >&2; exit 2 ;;
esac
