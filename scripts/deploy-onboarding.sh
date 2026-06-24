#!/usr/bin/env bash
# Push DB migrations and deploy onboarding Edge Functions to PNCL Supabase.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-dpnajpojbxgsckwrmvnm}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

echo "==> Linking Supabase project (if needed)..."
supabase link --project-ref "$PROJECT_REF" 2>/dev/null || true

echo "==> Pushing database migrations..."
supabase db push

echo "==> Deploying Edge Functions..."
supabase functions deploy submit-onboarding get-onboarding-status reveal-onboarding-credentials setup-portal-account resend-portal-confirmation get-referrer-info create-referral-invite list-referral-invites admin-update-comp-level admin-list-agents admin-get-hierarchy admin-create-user admin-update-role admin-update-referrer admin-resend-activation

echo ""
echo "Deploy complete. Test onboarding at: http://localhost:8080/onboarding"
echo "Ensure .env.local has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
