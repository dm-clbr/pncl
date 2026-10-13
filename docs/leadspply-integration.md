# LeadSpply integration controls

PNCL is the source of truth for rep identity links, hierarchy, and pay tiers. The portal does not poll or synchronize in the background.

Administrators use **Admin Console → LeadSpply** to load a point-in-time review. They must explicitly choose every new account link, review its hierarchy effect, check the review acknowledgement, then run a manual sync. A `409` response means the preview token is stale; the acknowledgement is cleared and the review must be loaded again. Name-only and conflicting matches always require an explicit administrator choice.

Agents use **LeadSpply** in the portal to open the verification flow and submit their own expiring connection code. Redeeming a code creates the verified account link; hierarchy and pay tier remain **awaiting the next manual admin sync**. Agents do not have controls to review or run organization-wide syncs.

The frontend sends only these actions to `manage-leadspply-integration`: `preview`, `sync` with a preview token and explicit links, `status`, and `redeem` with the user-entered code. The server derives the authenticated PNCL user and applies `portal_readonly_scope`; browser requests never supply a PNCL user ID.
