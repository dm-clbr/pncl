# LeadSpply inside PNCL: two-week delivery scope

Prepared October 22, 2026. Target launch: November 5, 2026, America/Denver.

This is a code-informed scope and accelerated delivery plan, not a deployment or a promise that the deadline has been validated. The first two working days must prove the identity and frontend integration. No application code, accounts, production settings, or data were changed during scoping.

## Confirmed requirements

- Every current LeadSpply feature is available through the PNCL portal: agent tools, the full admin console, and public/shared experiences such as TV displays and booking links.
- PNCL users sign into the portal once. Opening LeadSpply does not require another credential entry.
- Reconfirmed October 27: LeadSpply account setup lives inside PNCL Hub. Existing users verify/link their account and update its login to their verified PNCL email there; new users are prompted to register there and continue into LeadSpply in Hub. Standalone verification/signup redirects do not satisfy the completed flow. Preserve existing account IDs, separate Supabase projects, and required invitation/approval checks.
- Portal access is for PNCL users. The standalone LeadSpply app remains operational with its existing audience and access rules.
- Portal-hosted LeadSpply screens use the portal's colors, typography, components, navigation, and responsive styling at launch.
- Existing page structures and workflows may be preserved. Bespoke redesign of each page is not required.
- The delivery team is the user and Codex, with parallel agents. There is no assumed additional human engineering team.
- The requested schedule is one to two weeks. This plan targets two weeks; one week is not a dependable estimate for the complete scope.

## Recommended approach

Use one shared LeadSpply feature implementation with two host applications: the PNCL portal and the existing standalone app. Both use the existing LeadSpply operational backend and the same records. The portal remains responsible for its existing onboarding and portal workflows.

The proposed portal entry is `/portal/leadspply/*`. Extract the LeadSpply routes and services into a shared module with explicit host configuration for route prefixes, navigation, theme, assets, and authentication. Choose the least disruptive shared-package/workspace arrangement during the initial proof; do not maintain a second copied application that can drift from standalone.

Keep existing LeadSpply user IDs, customer records, billing relationships, calling infrastructure, CRM integrations, webhooks, scheduled jobs, and storage in place. This avoids making a database migration part of the launch deadline. Shared code must build and run through both entry points.

The portal theme is applied to shared components first, then to custom screens and inline styles. Tables, forms, dialogs, sheets, charts, calendars, chat, and the dialer need explicit visual checks; changing a few global colors is not completion. Standalone can retain its current presentation through host-specific styling while sharing behavior.

Public and token-protected pages receive a portal-branded public layout. Their current access restrictions remain intact: customer booking links cannot suddenly require an employee login, and a token-protected page cannot become unrestricted. Existing standalone links continue to work.

## Evidence and starting point

- Both projects use React 18, Vite, TypeScript, React Router 6, TanStack Query, and Supabase. This supports substantial reuse.
- PNCL already has a LeadSpply account-link flow, a dashboard snapshot, and profile synchronization. These are useful integration foundations, but they do not supply shared authentication.
- PNCL's current auth context restricts portal sessions to `@thepncl.com`. LeadSpply has its own Auth identities, role and capability model, approval gates, account types, subscriptions, and per-user database policies.
- LeadSpply includes long-lived calling, active-book, cart, chat, notification, and global-dialog behavior. These services must survive the new navigation without duplicate instances or lost call state.
- The LeadSpply shared CORS helper inspected on `origin/main` does not include the PNCL production origin. Browser-facing functions and provider return URLs need a deliberate compatibility pass.
- PNCL provides reusable portal tokens, layout components, fields, panes, sheets, navigation, and responsive rules. LeadSpply also has custom screen styles and hard-coded colors that need adaptation.
- The latest locally available LeadSpply `origin/main` reviewed was `bdaa144f`, dated October 21. It contains 169 route declarations, 148 page source files excluding tests, and 208 edge-function handlers. These counts include aliases and development surfaces and are not a count of production features or a promise that all code is deployed.
- PNCL's checked-out main was `c4c6ba15`, dated October 21. Both working directories contain unfinished changes. LeadSpply's checked-out `vel/work` is older than the inspected remote-tracking main. Implementation must establish the deployed baseline and reconcile approved pending changes rather than copying the dirty checkout.

This was a repository review, not a live production audit. Account-link coverage, deployed versions, enabled feature flags, provider configurations, and production data volumes still need verification.

## Feature coverage

The first implementation deliverable is a feature/role/state checklist tied to the agreed production baseline. Development harnesses and disabled experiments are recorded separately. Every enabled production feature must have an owner and evidence of parity.

| Area | Included work |
|---|---|
| Access and account | Portal entry, shared login, linked identity, account availability, settings, profiles, licensing and existing approval/agreement gates |
| Leads and CRM | Marketplace and lead packs where enabled, purchases, contacts, lead detail, imports, assignment/distribution, intake, notes, DNC controls, returns and existing filters/actions |
| Calling and communications | Softphone, call queues, inbound/outbound calls, transfers, monitoring where permitted, recordings, call history, messages, conversations, notifications and phone/email health |
| Scheduling and automation | Calendars, booking/availability, callbacks, sequences, follow-ups, AI SMS settings/activity/agreements, integrations and Facebook/Meta workflows |
| Production and business | Policies, funnel, commissions, billing, subscriptions, reports, activity tracking, goals and leaderboards |
| Team and resources | Hierarchy, shared downlines, setters, assistants, producer-specific access, team calls, chat, training, resources, playbook, signing and other enabled tools |
| Administration | Existing lead, user, permission, pricing, finance, telephony, integration, AI, policy, commission, activity, moderation and operational controls |
| Public/shared pages | TV/history/raffle, transfer displays, availability/booking, call review, customer completion links, agreements/legal and other enabled public routes |

Existing portal features remain usable. Overlapping profile, team, support, calendar, and client surfaces need explicit navigation and data ownership decisions. A portal intake is not automatically the same record as a LeadSpply contact; the Google calendar summary is not automatically the appointment-booking calendar. Present them coherently without silently removing either workflow.

## Critical identity proof

The existing PNCL-to-LeadSpply UUID mapping is an identity reference, not a transferable login session. The integration must yield access as the correct existing LeadSpply user, preserving native database policies and edge-function authorization.

Evaluate a supported identity-provider flow or a tightly scoped server-mediated native-session handoff. The exact mechanism is a feasibility decision, not settled by this scope. Supabase documents [OAuth/OIDC server support](https://supabase.com/docs/guides/auth/oauth-server) and [third-party authentication](https://supabase.com/docs/guides/auth/third-party/overview), but those capabilities do not by themselves resolve different subject UUIDs or existing `auth.getUser()` assumptions.

Required properties:

- Validate the current PNCL session and account eligibility on the server.
- Verify that the destination is the authorized, existing LeadSpply account. Audit link provenance: name-based automatic matching alone is not sufficient evidence for issuing a login credential.
- Reject ambiguous, unlinked, suspended, deactivated, or otherwise unavailable accounts with a useful resolution path. Identify all affected launch users early.
- Prevent duplicate account creation, accidental relinking, email-change races, or silent bypass of MFA and existing agreement/subscription/approval gates.
- Preserve LeadSpply permissions. PNCL administrator status does not automatically confer every LeadSpply administrator capability.
- Define and test refresh, expiration, logout, account switching, and revocation across both entry points. A LeadSpply refresh session must not become an uncontrolled way to retain access after PNCL eligibility is revoked.
- Keep privileged credentials server-side. Do not bypass row-level permissions through a general-purpose service-role proxy.

The initial proof must demonstrate authenticated reads, writes, an authenticated edge-function action, session refresh, access denial, and continued standalone access using controlled test identities. Prototype success alone is not production sign-off.

## Two-week execution schedule

Scoping is October 22. The ten-working-day implementation schedule below starts October 23 and ends November 5. Work can begin earlier if available; weekend work is not required by this calendar.

| Working days | Dates | Outcome |
|---|---|---|
| 1–2 | Oct 23 and Oct 26 | Establish deployed baseline, complete feature/role inventory, prove shared login and shared module, and style representative complex screens. Decide whether the target remains credible. |
| 3–6 | Oct 27–30 | Parallel migration and portal styling across all feature families. Harden authentication, routing, persistent services, permissions and provider-origin compatibility. Integrate completed work daily. |
| 7–8 | Nov 2–3 | Finish parity gaps, run full workflow and responsive/design checks, validate external integrations and standalone behavior, and resolve release blockers. |
| 9 | Nov 4 | Pilot with a small PNCL group using the complete feature set. Check real operational behavior, fix issues, and rehearse rollback. |
| 10 | Nov 5 | Final acceptance, controlled rollout, and post-release verification if release criteria pass. |

November 5 is a stretch target. It becomes a defensible commitment only after the first two days show that authentication, shared hosting, design adaptation, and the remaining workload fit the schedule. If they do not, report the exact blocker, work remaining, and revised date immediately. Do not silently cut features or replace portal screens with external links to claim completion.

The earlier 6–10-week planning range described a less compressed full integration and design effort. The approved use of existing layouts and workflows, shared component styling, and parallel implementation is the acceleration strategy for this two-week attempt. That changes how we deliver; it does not remove authentication or verification work.

## Agent allocation

Use up to six specialist agents plus the primary integration lead. Start with the foundation work, then expand feature work when the host interface is stable.

| Owner | Responsibility |
|---|---|
| Primary agent | Architecture, shared-file ownership, integration, review, user decisions, scope tracking and release readiness |
| Agent 1 | Identity/session handoff, link eligibility, roles and backend compatibility |
| Agent 2 | Shared application module, route/asset prefixes, portal theme/components and persistent service lifecycle |
| Agent 3 | Leads, contacts, sales, policies, business reporting and related agent workflows |
| Agent 4 | Calling, messaging, calendar, automation, AI, chat and realtime behavior |
| Agent 5 | Full administration, billing management, settings and operational screens |
| Agent 6 | Public/shared pages and independent parity, visual and end-to-end verification |

Agents work in isolated branches/worktrees with explicit file ownership. Router, auth, global providers, theme contracts, and shared components have one owner each. Merge small changes daily and validate both host applications. Rotate agents to testing as their feature families finish. The user supplies quick product decisions and acceptance feedback; no additional human developer is assumed.

## First checkpoint: by the end of working day 2

To keep the November 5 target, demonstrate:

1. Portal login opens the correct existing LeadSpply account without another credential entry, and negative permission cases fail correctly.
2. The actual contacts workflow, its dialogs and mobile state, one admin data screen, and one public token page run with portal styling and real authorization in a safe test environment.
3. Deep links, refresh, back/forward navigation, and host-specific asset paths work.
4. A controlled call and realtime updates survive the intended portal navigation. If the product deliberately restricts leaving an active call, that behavior is explicit and accepted rather than an accidental disconnect.
5. Standalone still builds and passes relevant existing checks.
6. Each production feature is assigned, and measured styling/integration effort supports the remaining days.
7. Required deployment/provider access and safe integration-test accounts are available. Account-link exceptions are counted and have an owner.

## Launch criteria

- Every agreed production feature is reachable and functional for each entitled role in the portal, with no changes to billing entitlements or compensation rules caused by the merge.
- Portal design covers desktop/mobile, navigation, overlays, forms, loading, empty, error and permission states. Dense operational screens remain usable; focus, contrast and mobile safe areas are checked.
- Changes made through either host appear against the same authoritative records. No duplicate purchases, subscriptions, charges, appointments, outbound messages, or background workers are introduced.
- Calling, inbound routing, recordings, transfers, DNC controls, sequences and message delivery pass controlled end-to-end checks. Mocked call tests alone are insufficient.
- Stripe, GHL, Twilio, Meta and Google interactions are checked for affected callback/return URLs, authentication and origin handling using test/sandbox facilities where available. Real sends, calls or charges require explicit test arrangements.
- Existing public/token links preserve their audience and access controls. Standalone web access and its existing mobile wrappers continue working; new native packaging is not part of this portal release.
- Relevant automated suites and both builds pass without newly introduced failures. Existing known debt is distinguished from new regressions.
- A small-user pilot exercises the full feature set before broad enablement. Piloting fewer users does not mean shipping fewer features.

## Rollout and rollback

Enable the portal module for controlled PNCL users first, then expand once acceptance passes. Retain the standalone app, existing backend and provider endpoints throughout.

Rollback disables the portal module/entry for affected users and returns them to standalone access using the same operational records. Additive integration changes must remain compatible with standalone. Session cleanup and revocation follow the reviewed identity design.

Monitor authentication errors, calls, webhook processing, background queues, billing and messages during rollout. A UI rollback does not undo an already placed call, sent message or charge; those effects need reconciliation if a failure occurs.

## Remaining implementation decisions

These do not require another scope round, but must be resolved during the first checkpoint:

- Which deployed version and feature flags define launch parity, and how approved changes during the two weeks enter the shared baseline.
- Which existing account links meet the identity assurance needed for SSO; how unmatched PNCL users are provisioned or verified without granting unintended roles or paid features.
- Whether portal logout also ends a concurrently open standalone session, and how organization removal revokes access.
- The host packaging approach and exact public URL plan. Preserve existing external links by default.
- How duplicate portal/LeadSpply navigation is presented while preserving each workflow and its authoritative data.

## Source references

- PNCL: `src/App.tsx`, `src/contexts/AuthContext.tsx`, `src/pages/PortalLeadSpply.tsx`, `src/components/portal/PortalToolLayout.tsx`, `src/styles/portal-tokens.css`, `docs/DESIGN.md`, `docs/leadspply-integration.md`, `docs/leadspply-snapshot.md`, `docs/production-profile-sync.md`.
- LeadSpply `origin/main` at `bdaa144f`: `src/App.tsx`, `src/context/AuthContext.tsx`, `src/pages/MyLeads.tsx`, `src/components/Navbar.tsx`, `supabase/functions/_shared/cors.ts`, `docs/pncl-integration.md`, route and backend file inventories.
- LeadSpply local `capacitor.config.ts`: existing native wrappers point at the standalone production URL; verify deployed native configuration before release.
- Official Supabase documentation linked in the identity section supports candidate mechanisms, not proof that this project's shared login is already implemented.
