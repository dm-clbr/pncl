# LeadSpply integration controls

PNCL is the source of truth for rep identity links, hierarchy, and pay tiers. The portal does not poll or synchronize in the background.

Administrators use **Admin Console → LeadSpply** to load a point-in-time review. They must explicitly choose every new account link, review its hierarchy effect, check the review acknowledgement, then run a manual sync. A `preview_stale` response clears the acknowledgement and requires a fresh review. Other conflicts retain their specific explanation. Name-only and conflicting matches always require an explicit administrator choice.

Agents use **LeadSpply** in the portal to open the verification flow and submit their own expiring connection code. Redeeming a code creates the verified account link; hierarchy and pay tier remain **awaiting the next manual admin sync**. Agents do not have controls to review or run organization-wide syncs.

The frontend sends only these actions to `manage-leadspply-integration`: `preview`, `sync` with a preview token and explicit links, `status`, and `redeem` with the user-entered code. The server derives the authenticated PNCL user. Only full PNCL administrators may review and sync; browser requests never supply an actor or agent ID for account status or code redemption.

LeadSpply verifies account ownership at `/pncl/connect`. A signed-in agent explicitly generates a 128-bit random code, expires after 10 minutes, and pastes it into `/portal/leadspply`. The server stores only the SHA-256 hash. Redemption uses the existing exact email/personal email/NPN matcher across both rosters; name-only, competing, and conflicting matches go to administrator review. Creation of a pending link is atomic with code consumption, the integration revision, and an audit event. It does not apply hierarchy or compensation.

The source proxy keeps `PNCL_INTEGRATION_KEY` server-side and uses a fixed target URL. The target checks the shared key for source actions and validates real LeadSpply Auth identity for code issuance. New code/event tables and mutation RPCs are service-role-only with RLS enabled. Existing target admin routes and the hierarchy/pay-tier sync engine remain available.
