#!/bin/sh
# Replaces the live ERP or Keycloak database with a backup. Destructive by design: run only through
# deploy/windows/restore.ps1, which stops the applications and asks for typed confirmation.
#   restore.sh <dump file name in /backups> <erp|keycloak>
set -eu
file="/backups/$1"
db="$2"
case "$db" in erp|keycloak) ;; *) echo "database must be erp or keycloak" >&2; exit 2 ;; esac
[ -f "$file" ] || { echo "not found: $file" >&2; exit 1; }
(cd /backups && sha256sum -c "$(basename "$file").sha256")
owner=erp; [ "$db" = keycloak ] && owner=keycloak
psql -v ON_ERROR_STOP=1 -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();" >/dev/null
dropdb --if-exists "$db"
createdb --owner="$owner" "$db"
pg_restore --no-owner --role="$owner" --exit-on-error --dbname="$db" "$file"
echo "RESTORED $db from $(basename "$file")"
