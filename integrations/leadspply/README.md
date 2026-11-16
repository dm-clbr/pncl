# LeadSpply team stats bridge

This package deploys to **LeadSpply** (`lhxvbtiepsuohunfmnkm`), not the Hub database. It is kept separately from Hub migrations to prevent deployment to the wrong project.

Hub's `get-portal-team-stats` authenticates the rep and derives the permitted PNCL IDs from the same hierarchy as `get-portal-hierarchy`. Only that server sends this allowlist to `pncl-team-stats` using the existing `PNCL_INTEGRATION_KEY`. The SQL function is service-role-only, runs as invoker, and returns aggregate metrics for explicitly linked accounts. No customer records, credentials, balances, or LeadSpply identities are returned.

Metric definitions match LeadSpply's `get_agency_hierarchy`: non-voided annual premium by application date (`policy_day`), qualifying outbound calls, and funnel attainment stages 1/3. VA activity is credited to its owning rep with `account_vas()`. Periods are week-to-date, month-to-date, and the last 30 calendar days in America/Boise. Hub controls team membership; LeadSpply supplies individual metrics. Totals sum distinct people in the displayed Hub branch and label missing coverage.

Apply only this package's migration to LeadSpply, deploy `pncl-team-stats` with gateway JWT verification disabled (the function validates the shared integration key), and deploy Hub's `get-portal-team-stats` with JWT verification enabled. The existing integration key and snapshot URL are reused; no additional secret is required. Run the SQL fixture with `psql -v ON_ERROR_STOP=1 -f integrations/leadspply/tests/team-stats.sql` against an isolated test database. Never apply that fixture to a hosted project.

The migration filename is aligned with the hosted migration version `20261116180121` recorded by Supabase on deployment.
