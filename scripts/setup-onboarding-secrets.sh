#!/usr/bin/env bash
# Loads Google service account JSON + sets Supabase Edge Function secrets for PNCL onboarding.
# Usage:
#   1. Save your Google JSON key locally (gitignored), e.g. ./google-service-account.json
#   2. export CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)"
#   3. ./scripts/setup-onboarding-secrets.sh ./google-service-account.json
#
# Requires: supabase CLI linked to PNCL project (dpnajpojbxgsckwrmvnm)

set -euo pipefail

KEY_FILE="${1:-./google-service-account.json}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-dpnajpojbxgsckwrmvnm}"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Missing key file: $KEY_FILE"
  echo "Save your Google service account JSON locally and pass the path as the first argument."
  exit 1
fi

if [[ -z "${CREDENTIAL_ENCRYPTION_KEY:-}" ]]; then
  echo "Set CREDENTIAL_ENCRYPTION_KEY first, e.g.:"
  echo '  export CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)"'
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq)"
  exit 1
fi

SERVICE_EMAIL="$(jq -r '.client_email' "$KEY_FILE")"
PRIVATE_KEY="$(jq -r '.private_key' "$KEY_FILE")"
CLIENT_ID="$(jq -r '.client_id' "$KEY_FILE")"
ADMIN_EMAIL="${GOOGLE_WORKSPACE_ADMIN_EMAIL:-dm@thepncl.com}"
EMAIL_DOMAIN="${PNCL_EMAIL_DOMAIN:-thepncl.com}"
CUSTOMER_ID="${GOOGLE_WORKSPACE_CUSTOMER_ID:-my_customer}"

echo "Setting Supabase secrets for project: $PROJECT_REF"
echo "  GOOGLE_SERVICE_ACCOUNT_EMAIL=$SERVICE_EMAIL"
echo "  GOOGLE_WORKSPACE_ADMIN_EMAIL=$ADMIN_EMAIL"
echo "  GOOGLE_SERVICE_ACCOUNT_CLIENT_ID=$CLIENT_ID"
echo "  GOOGLE_WORKSPACE_CUSTOMER_ID=$CUSTOMER_ID"
echo "  PNCL_EMAIL_DOMAIN=$EMAIL_DOMAIN"

supabase secrets set \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="$SERVICE_EMAIL" \
  GOOGLE_WORKSPACE_ADMIN_EMAIL="$ADMIN_EMAIL" \
  GOOGLE_SERVICE_ACCOUNT_CLIENT_ID="$CLIENT_ID" \
  GOOGLE_WORKSPACE_CUSTOMER_ID="$CUSTOMER_ID" \
  PNCL_EMAIL_DOMAIN="$EMAIL_DOMAIN" \
  CREDENTIAL_ENCRYPTION_KEY="$CREDENTIAL_ENCRYPTION_KEY" \
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="$PRIVATE_KEY"

echo "Done. Deploy functions with:"
echo "  supabase functions deploy submit-onboarding get-onboarding-status reveal-onboarding-credentials"
