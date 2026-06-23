#!/usr/bin/env bash
# Send a test Genesis onboarding notification to all genesis admin users.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="${SUPABASE_PROJECT_REF:-dpnajpojbxgsckwrmvnm}"
SUPABASE_URL="${VITE_SUPABASE_URL:-https://${PROJECT_REF}.supabase.co}"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  echo "RESEND_API_KEY is required (set in .env.local or environment)."
  exit 1
fi

SERVICE_ROLE="$(supabase projects api-keys --project-ref "$PROJECT_REF" -o json | jq -r '.[] | select(.name=="service_role") | .api_key')"

if [[ -z "$SERVICE_ROLE" || "$SERVICE_ROLE" == "null" ]]; then
  echo "Unable to read Supabase service role key."
  exit 1
fi

USERS_JSON="$(curl -sS "${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200" \
  -H "Authorization: Bearer ${SERVICE_ROLE}" \
  -H "apikey: ${SERVICE_ROLE}")"

RECIPIENTS="$(echo "$USERS_JSON" | jq -r '
  .users[]
  | select((.email // "") | test("@thepncl\\.com$"; "i"))
  | select(.app_metadata.role == "genesis_admin")
  | .email
')"

if [[ -z "$RECIPIENTS" ]]; then
  echo "No genesis admin users found. Assign the genesis admin role in User management first."
  exit 1
fi

FROM_NAME="${PNCL_FROM_NAME:-PNCL}"
FROM_EMAIL="${PNCL_FROM_EMAIL:-no-reply@thepncl.com}"
SITE_URL="${PNCL_SITE_URL:-https://thepncl.com}"
GENESIS_URL="${SITE_URL%/}/portal/admin/genesis"
COMPLETED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

read -r -d '' HTML <<EOF || true
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
  <h2 style="background:#0f0f0f;color:#fff;margin:0;padding:20px 24px;font-size:16px;">
    New agent onboarding completed
  </h2>
  <div style="padding:24px;font-size:14px;color:#111;line-height:1.6;">
    <p style="margin:0 0 16px;padding:10px 12px;background:#fff3cd;color:#664d03;font-size:13px;border-radius:4px;">
      This is a test notification. No new agent onboarding occurred.
    </p>
    <p>A new agent finished onboarding and needs a Pinnacle Genesis account.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;">
      <tr><td style="padding:6px 0;color:#555;">Name</td><td style="padding:6px 0;"><strong>Test Agent (Sample)</strong></td></tr>
      <tr><td style="padding:6px 0;color:#555;">PNCL email</td><td style="padding:6px 0;">test.agent@thepncl.com</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Phone</td><td style="padding:6px 0;">555-555-0100</td></tr>
      <tr><td style="padding:6px 0;color:#555;">State</td><td style="padding:6px 0;">TX</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Upline network</td><td style="padding:6px 0;">PNCL Test Team</td></tr>
    </table>
    <p style="margin:28px 0;">
      <a href="${GENESIS_URL}" style="display:inline-block;background:#c8ff00;color:#0f0f0f;padding:12px 20px;text-decoration:none;font-weight:600;border-radius:4px;">
        Open Genesis queue
      </a>
    </p>
  </div>
</div>
EOF

SENT=0
while IFS= read -r recipient; do
  [[ -z "$recipient" ]] && continue
  echo "Sending test notification to ${recipient}..."
  curl -sS https://api.resend.com/emails \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg from "${FROM_NAME} <${FROM_EMAIL}>" \
      --arg to "$recipient" \
      --arg html "$HTML" \
      '{from: $from, to: [$to], subject: "[Test] New onboarding: Test Agent (Sample)", html: $html}')" \
    >/dev/null
  SENT=$((SENT + 1))
done <<< "$RECIPIENTS"

echo "Done. Sent ${SENT} test notification(s)."
