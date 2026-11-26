#!/bin/bash
# Creates or updates the Keycloak service client the ERP API uses for staff onboarding
# ("erp-api-admin"). Idempotent; safe on fresh installs and upgrades. Runs inside the keycloak
# container and needs ERP_API_ADMIN_CLIENT_SECRET and the bootstrap admin credentials.
#
# The service account receives only user-management roles of the realm (manage-users, view-users,
# query-users): it cannot change realm settings, clients or roles.
set -euo pipefail
: "${ERP_API_ADMIN_CLIENT_SECRET:?ERP_API_ADMIN_CLIENT_SECRET is not set}"
realm="${KEYCLOAK_REALM:-erp}"
client="erp-api-admin"
kc=/opt/keycloak/bin/kcadm.sh
cfg=/tmp/kcadm-ensure.config

$kc config credentials --server "${KC_ADMIN_SERVER_URL:-http://localhost:8080/auth}" --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" --config "$cfg" >/dev/null

id=$($kc get clients -r "$realm" -q "clientId=$client" --fields id --format csv --noquotes --config "$cfg")
if [ -z "$id" ]; then
  id=$($kc create clients -r "$realm" -i --config "$cfg" \
    -s "clientId=$client" -s "name=ERP API (user administration)" -s enabled=true -s protocol=openid-connect \
    -s publicClient=false -s clientAuthenticatorType=client-secret -s "secret=$ERP_API_ADMIN_CLIENT_SECRET" \
    -s standardFlowEnabled=false -s implicitFlowEnabled=false -s directAccessGrantsEnabled=false \
    -s serviceAccountsEnabled=true)
  echo "created client $client"
else
  # Keep the secret in step with deploy/.env (it may have been rotated).
  $kc update "clients/$id" -r "$realm" -s "secret=$ERP_API_ADMIN_CLIENT_SECRET" -s serviceAccountsEnabled=true \
    -s standardFlowEnabled=false -s directAccessGrantsEnabled=false --config "$cfg"
  echo "updated client $client"
fi

$kc add-roles -r "$realm" --uusername "service-account-$client" --cclientid realm-management \
  --rolename manage-users --rolename view-users --rolename query-users --config "$cfg"
echo "service account roles: manage-users, view-users, query-users"
