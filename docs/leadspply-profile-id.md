# LeadSpply ID on PNCL profiles and hierarchy exports

PNCL displays the confirmed LeadSpply account UUID as a read-only field on the
agent's own profile and on the full-admin user detail page. It is not a form
input or a second editable identity link. Genesis/admin-assist roles receive no
new cross-account identity access.

The admin hierarchy/agents CSV appends `LeadSpply User ID` after the existing
columns. Every row is joined by PNCL UUID against LeadSpply's authoritative
`pncl_account_links` table, including saved links still pending hierarchy/profile
sync. Unlinked users have a blank cell. Existing export filters and order are
preserved. A failed lookup blocks the download with a retry message rather than
silently representing linked users as unlinked. A profile lookup failure leaves
other profile fields available and shows an error for this field.

The private `profile_sync_private.accounts.peer_id` cache is not used: it can be
empty before the first profile sync. No migration or backfill is required.

## Release order

1. Deploy the companion LeadSpply `pncl-portal` function. It adds a read-only,
   server-secret-authenticated `links` action for at most 500 requested PNCL UUIDs
   and includes `leadspply_user_id` in connected own-account status responses.
   Browser origins are rejected for the bulk lookup; PNCL's public integration
   proxy does not accept that action.
2. Deploy PNCL `admin-export-agents`, `admin-get-user-profile`, and
   `manage-leadspply-integration` with their updated shared modules. They use the
   existing server-only `PNCL_INTEGRATION_KEY`. No new key is needed.
3. Release the PNCL frontend. Verify a linked user, an unlinked user, a filtered
   export, and the full organization export. The CSV includes linked IDs even
   when profile synchronization has not initialized the local peer cache.

Deploy LeadSpply first: the newer PNCL CSV intentionally fails if its lookup API
is unavailable. Old PNCL clients remain compatible with the additive LeadSpply
responses. The own-status proxy accepts an older response without an ID during a
staged rollout, showing `Not available` rather than inventing an ID.

## Verification

Focused tests cover authenticated endpoint boundaries, selected-ID scoping,
batched lookups, malformed/duplicate mappings, unlinked users, upstream failures,
full-admin versus Genesis access, CSV row association and unchanged column order,
and the read-only profile field. PNCL's existing profile and integration tests
are included. The PNCL production build, focused lint, and a scoped TypeScript
check of the shared lookup/projection/CSV modules pass. Hosted deployment and
live-data smoke tests are separate release steps.
