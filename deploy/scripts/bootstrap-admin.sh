#!/bin/bash
# Creates a shop user in Keycloak (realm "erp") and prints the Keycloak user id. Runs inside the
# keycloak container. A temporary password is generated; the user must change it and enrol an
# authenticator app (TOTP) at first sign-in.
#   bootstrap-admin.sh <username> <email> <first name> <last name> [--no-otp]
set -euo pipefail
username="$1"; email="$2"; first="$3"; last="$4"; otp="${5:-}"
kc=/opt/keycloak/bin/kcadm.sh
$kc config credentials --server "${KC_ADMIN_SERVER_URL:-http://localhost:8080/auth}" --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" --config /tmp/kcadm.config >/dev/null
existing=$($kc get users -r erp -q "username=$username" -q exact=true --fields id --format csv --noquotes --config /tmp/kcadm.config)
if [ -n "$existing" ]; then
  echo "USER_ID=$existing"
  echo "EXISTING=1"
  exit 0
fi
actions='["UPDATE_PASSWORD","CONFIGURE_TOTP"]'
[ "$otp" = "--no-otp" ] && actions='["UPDATE_PASSWORD"]'
id=$($kc create users -r erp -i --config /tmp/kcadm.config \
  -s "username=$username" -s "email=$email" -s "firstName=$first" -s "lastName=$last" \
  -s enabled=true -s emailVerified=true -s "requiredActions=$actions")
temp=$(head -c 18 /dev/urandom | base64 | tr '+/' 'xy' | tr -d '=')
$kc set-password -r erp --userid "$id" --new-password "$temp" --temporary --config /tmp/kcadm.config
rm -f /tmp/kcadm.config
echo "USER_ID=$id"
echo "TEMP_PASSWORD=$temp"
