# LeadSpply snapshot in the PNCL portal

The portal dashboard provides a read-only snapshot for the signed-in agent’s linked LeadSpply account. It shows own or explicitly assigned lead work, upcoming appointments on their calendar or booked by them, month-to-date paid policy counts and annual premium, and recorded automatic activity. It returns aggregates only, with no customer records, notes, recordings, credentials or internal commission economics.

Account links must already exist in LeadSpply’s PNCL Integration admin page. The panel does not create links or run account, hierarchy or pay-tier synchronization. Synchronization remains manual. Snapshot reads happen on initial authenticated load and the explicit **Refresh data** action; no polling or token-refresh-triggered data reads are added. Unlinked or unavailable accounts have their own states; errors are never shown as zero production.

## Deployment

1. Apply LeadSpply migration `20261008035554_pncl_agent_snapshot.sql` after the account-integration migration.
2. Deploy LeadSpply’s `pncl-agent-snapshot` with `verify_jwt=false`. Its handler requires the existing server-only `PNCL_INTEGRATION_KEY`, or reads the same key through the service-only Vault configuration RPC.
3. Set PNCL server secret `LEADSPPLY_SNAPSHOT_URL=https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot`. Keep the existing matching `PNCL_INTEGRATION_KEY` server-side.
4. Deploy PNCL’s `get-leadspply-snapshot` with `verify_jwt=true`. It also validates the portal user with Auth, derives their UUID on the server and pins the destination. Browser callers cannot select another account or destination.
5. Release the PNCL dashboard frontend. Verify that a linked user sees only their metrics, an unlinked user sees the connection state, a suspended/deactivated account is unavailable, and Refresh data changes the fetched timestamp without changing links, hierarchy or tiers.

The LeadSpply RPC is read-only, SECURITY INVOKER, and executable only by service_role. Each lookup resolves the PNCL UUID through the saved one-to-one account link. The PNCL proxy projects a fixed versioned DTO and sends `Cache-Control: no-store`; upstream errors and unknown fields are not forwarded. Activity excludes manual reports; currency is integer cents, formatted in USD; day/week/month boundaries follow the linked LeadSpply account timezone. Calendar summaries use LeadSpply’s appointment cache rather than starting a GHL synchronization job.

## Checks

Run PNCL’s snapshot UI/proxy tests and LeadSpply’s snapshot endpoint tests. The standalone SQL fixture `supabase/tests/pncl_agent_snapshot.sql` is only for an empty isolated PostgreSQL test database. It rolls back its data and validates ownership, assigned work, callback dates, appointment cancellation/booking scope, production accuracy, access denial and no-write behavior. It must not run on the application database.
