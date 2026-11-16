# Hub My Team

`/portal/team` is available to every authenticated portal rep from **My Team** in dashboard navigation, the referral tile's team link, and Profile → Team. A rep sees their own account, all descendant levels, and shared business-partner branches. A rep without descendants still sees their own card and the invite action.

The page provides Chart/List, 2/3/all levels, branch focus and reset, zoom/fit, full-screen focus, and member details. It shows current compensation levels and effective dates, NPNs, photos, onboarding stages, direct/total downline, and onboarding/sales-ready counts. Pending recruits without portal accounts remain in Profile → Team's progress list.

## Authorization

`get-portal-hierarchy` validates the existing portal session and fixes the root to the verified user ID. Client-selected root/user/view parameters never expand access. The server uses the same referral and partner relationships as the admin hierarchy and serializes only names, NPNs, in-branch relationships, and the explicitly allowed comp/onboarding/photo fields. Focus options and counts are scoped to the returned branch. Emails, contact details, documents, credentials, and financial account data are excluded. Responses are not cached. The page provides no editing actions and does not grant admin-console access.

## Release

On 2026-11-16, deployed `get-portal-hierarchy` and `get-portal-team-stats` to Hub (`dpnajpojbxgsckwrmvnm`), and `pncl-team-stats` plus `get_pncl_team_stats(uuid[], text)` to LeadSpply (`lhxvbtiepsuohunfmnkm`). The matching frontend is released from `main` through the existing Vercel production integration. No Hub database migration is required. Hub functions retain gateway JWT verification. The LeadSpply function validates the existing integration key itself. Other local onboarding/account-repair work is outside this release.

## LeadSpply stats

The chart, list, and member details display AP, dials, sets, and closes. Week-to-date, month-to-date, and last-30-day filters use LeadSpply's America/Boise calendar. AP is non-voided annual premium by application date, not the personal dashboard's paid-date production. Dials and funnel stages match the LeadSpply My Team query, including VA activity credited to its owning rep. Hub remains the authority for team membership and comp levels.

The browser sends only a period. `get-portal-team-stats` validates the portal session, rebuilds that user's permitted hierarchy, and sends only scoped PNCL IDs to a fixed LeadSpply endpoint using the existing `PNCL_INTEGRATION_KEY` and `LEADSPPLY_SNAPSHOT_URL`. The service-only invoker RPC maps verified account links and returns aggregate figures. The Hub proxy rechecks identities and strips unapproved fields. No integration key, LeadSpply identity, or customer record reaches the browser.

Branch totals count each person once, including branch roots. Shared partners have combined figures on their shared card and separate personal figures in details. Missing links and unavailable accounts remain explicit; partial totals identify how many accounts are included. Stats failures do not remove the hierarchy. Account/period changes abort requests and suppress stale results.

The LeadSpply deployment source and isolated SQL test fixture live under `integrations/leadspply/`; these migrations must never run against Hub. `scripts/package-portal-team-functions.py` emits the relative dependency package for a single Edge Function, without reading env files.

## Verification

Focused tests cover subtree/privacy boundaries, comp visibility, indirect descendants, shared partners, missing roots, cycles, auth failures, attempted root overrides, read-only HTTP methods, account changes/in-flight requests, navigation, chart/list, level limits, member details, branch focus, retries, solo reps, and full-screen exit. Browser checks use synthetic fixture accounts; production accounts and hierarchy records are not modified.


Verification for the stats connection: isolated Postgres fixtures passed metric filters, VA attribution, duplicate IDs, unlinked/suspended accounts, invalid periods, and service-only access. A hosted service-role query returned 20 requested people (19 connected) with the expected field allowlist. A live authenticated bridge request returned HTTP 200 for two requested accounts. A live comparison against `get_agency_hierarchy` matched AP, dials, sets, and closes. Security advisors reported no new findings. Desktop and mobile Chart/List/Focus/detail checks used synthetic data; the deployed Hub endpoints have startup/auth smoke checks and HTTP-handler auth/scope tests, with signed-in Hub-to-LeadSpply smoke checks performed after the frontend release.

Final local validation: 50 focused tests passed across hierarchy, stats, account/period races, and existing admin/dashboard/profile behavior; production build, TypeScript, focused lint, and diff checks passed. Existing jsdom canvas and React Router warnings do not fail these tests.

Card readability: Hub chart cards use a uniform 90% size factor: 252 px wide (306 px for partners) and 288 px tall. Text, avatars, padding, borders, and branch spacing scale together by 10%, preserving the established card proportions. The chart opens centered on its root at 100% zoom; Fit still offers a full-tree overview. Branch layout reserves the widest card in each subtree to keep partner branches from overlapping.

Canvas navigation disables browser text selection and native image dragging while retaining card clicks and keyboard access.
