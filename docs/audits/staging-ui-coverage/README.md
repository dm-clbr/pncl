# PNCL staging UI coverage audit

Date: October 14, 2026. Base: `origin/staging` at `7514b4cea30593a58e442df030cab55141dc0295`. Local branch: `codex/staging-ui-coverage`. The checkout was initially clean. No AGENTS.md was found in the worktree or its inspected parents. Repository guidance: `docs/DESIGN.md`, the portal tokens and existing component/test patterns.

## Result and limits

All 15 protected Agent Portal pages and all 23 Admin Console destinations were rendered locally with synthetic sessions and inspected at desktop and mobile sizes. The route matrix below records the inspection, corrections, and evidence. The final app has no measured document-level horizontal overflow at 1440×900 or 390×844 on those routes. Additional checks used 768×1024 and 320×740; the crop dialog was also inspected at 354×767.

No live staging credentials or Supabase configuration were available in this checkout. An isolated loopback fixture API supplied synthetic user/session claims and data through the existing Supabase client and existing React route gates. No production authentication or authorization code was bypassed. These results establish local UI coverage, not live Google/Supabase authentication, RLS, storage, provisioning, or write correctness. Fixtures are development-only, use no real secrets, bind to 127.0.0.1, accept only the local preview origins, and reject unimplemented mutations.

## Run locally

```sh
npm ci
node scripts/ui-audit/server.mjs
```

Dependencies are already installed in this prepared worktree. On this host, where Node is absent from the shell PATH, the equivalent launch command is:

```sh
/Users/vel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/ui-audit/server.mjs
```

Open `http://127.0.0.1:54329` and choose an agent/admin role and a data state. The script starts Vite at `http://localhost:8080` with a local-only URL/key supplied to the child process. It does not write an environment file. Use one fixture scenario at a time; its control state is shared by local tabs. Reload the app after changing a fixture state so shared tab data is fetched again. Ctrl+C stops both servers.

For normal staging-service development, configure the frontend variables documented in `.env.example` and use `npm run dev`. Required services and redirect configuration are documented in `docs/portal-email-auth-setup.md` and `docs/portal-google-calendar-setup.md`. This audit did not provision or change those services.

## Inventory and access

- `src/App.tsx` defines 15 protected agent routes, 21 nested admin destinations, and two standalone admin previews. `/portal/admin` renders Overview for full admins and redirects restricted roles.
- `ProtectedRoute` requires a signed-in, email-confirmed user. AuthContext retains the PNCL email-domain and pending-enrollment checks.
- The admin parent uses `AdminRoute allowAdminAssist`; ordinary nested routes also use `AdminFullRoute`. Assistants can view hierarchy, Genesis admins can view Genesis and the two previews, and full admins can view all destinations. The Genesis route is visible in the restricted Genesis navigation and remains routable for full admins.
- Agent shells use `PortalHeader`, `PortalSubpageHeader`, `BottomNav`, `PortalBackground` or `PortalBentoMain`. Dashboard tiles and profile sections provide the secondary destinations.
- AdminLayout owns the desktop sidebar, collapsed rail, mobile drawer and per-role navigation. Preview pages intentionally render outside AdminLayout.
- Browser gate checks: an agent requesting `/portal/admin/users` reached `/portal`; an assistant reached `/portal/admin/hierarchy`; a Genesis admin reached `/portal/admin/genesis`. Existing role/privacy regressions also passed.

## Corrections

1. Brand Assets: replaced legacy masthead and square panels with shared tool chrome, Pane, Skeleton, EmptyState, token-based cards and controls. Copy/download behavior is retained.
2. Compensation Agreement: replaced legacy masthead/purple panels with shared tool chrome, Pane and Field; preserved document-tab return link, consent checks, signing request and signed-copy behavior.
3. Pay & Commissions: restored the shared identity header through the same tool shell.
4. Auth/role loading: replaced public-onboarding spinner shells with PortalLoading and the portal auth theme; guard decisions are unchanged.
5. ICA and W-9: backed signing headings/instructions with the solid bar material; contained PDF.js annotation z-indices beneath the sticky pager. The browser confirmed annotations no longer paint above the pager.
6. Admin previews: added the portal backdrop and materials; placed the preview bar in normal flow with sticky positioning so mobile wrapping does not cover fields.
7. Profile cropping: reused native Sheet for theme, focus, Escape/backdrop dismissal and focus restoration; retained crop, compression and file/preview callbacks.
8. Carrier confirmation, onboarding video and incentive lightbox: applied shared pane/type/control tokens to the existing overlay chrome, preserving media and submission logic.
9. Admin navigation: Add user has the sole current link on `/users/new`; Users remains current on detail routes. Removed the mobile logo filter after intermittent letter clipping was reproduced during navigation.

## Route checklist

Every row has final desktop and mobile screenshots. “Theme OK” means the local rendered UI and its applicable states were inspected; live service checks remain subject to the limits above. Data-backed pages also have empty/error captures where applicable. A detail route remains a populated detail fixture in empty mode; document pages render unsigned forms when their records are absent. The 51-state service deliberately treats an incomplete/empty response as an error.

| # | Route | Local health | Inspected / changes | Evidence |
|---|---|---|---|---|
| 01 | `/portal` | Theme OK | Dashboard tiles; sales-tools link; referral, incentives, onboarding dock, carrier-confirmation and video overlays. **Change:** Shared onboarding header action and state across all portal tabs; no reload on tab navigation. | [Desktop](screenshots/01-dashboard-after-desktop.jpg) · [Mobile](screenshots/01-dashboard-after-mobile.jpg) |
| 02 | `/portal/calendar` | Theme OK | Disconnected and connected calendar; error state. Live Google consent and sync remain unverified. **Change:** Shared onboarding header action; calendar fills the portal frame. | [Desktop](screenshots/02-calendar-after-desktop.jpg) · [Mobile](screenshots/02-calendar-after-mobile.jpg) |
| 03 | `/portal/carriers` | Theme OK | Carrier reference section and row layout; empty/error states. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/03-carriers-after-desktop.jpg) · [Mobile](screenshots/03-carriers-after-mobile.jpg) |
| 04 | `/portal/state-map` | Theme OK | Complete 51-state fixture map, status patterns, license cue, neutral error map and responsive rail. **Change:** Shared onboarding header action with persistent progress and checklist. | [Desktop](screenshots/04-state-map-after-desktop.jpg) · [Mobile](screenshots/04-state-map-after-mobile.jpg) |
| 05 | `/portal/brand-assets` | Theme OK | Color and image cards; official file links and color-copy handler retained. **Change:** Shared tool shell, panes, asset cards, copy/download controls, loading and empty states. | [Desktop](screenshots/05-brand-assets-after-desktop.jpg) · [Mobile](screenshots/05-brand-assets-after-mobile.jpg) |
| 06 | `/portal/profile` | Theme OK | Details, contact, address, apparel, business card, Team, Licensing, Documents and Carrier logins; crop/file chooser. **Change:** Photo crop now uses the native Sheet; all profile tabs reviewed. | [Desktop](screenshots/06-profile-after-desktop.jpg) · [Mobile](screenshots/06-profile-after-mobile.jpg) |
| 07 | `/portal/w9` | Theme OK | Unsigned form, completed summary, loading/error handling, pager and signing sheet. No real submission. **Change:** Backed signing intro; PDF annotation containment protects the pager. | [Desktop](screenshots/07-w9-after-desktop.jpg) · [Mobile](screenshots/07-w9-after-mobile.jpg) |
| 08 | `/portal/ica` | Theme OK | Unsigned PDF, introduction/signature/debit-check tabs and completed summary. No real signature. **Change:** Backed signing intro; shared PDF annotation containment. | [Desktop](screenshots/08-ica-after-desktop.jpg) · [Mobile](screenshots/08-ica-after-mobile.jpg) |
| 09 | `/portal/direct-deposit` | Theme OK | Contact, address, banking, signature and authorization fields; fixed submit bar; completed summary. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/09-direct-deposit-after-desktop.jpg) · [Mobile](screenshots/09-direct-deposit-after-mobile.jpg) |
| 10 | `/portal/comp-agreement` | Theme OK | Pending signature, signed summary, empty and error states. Native embedded-PDF pixels unavailable in IAB. **Change:** Shared tool shell, field, consent controls, pending/signed/empty/error panes. | [Desktop](screenshots/10-comp-agreement-after-desktop.jpg) · [Mobile](screenshots/10-comp-agreement-after-mobile.jpg) |
| 11 | `/portal/disclosures` | Theme OK | Training progress, unavailable-video module, empty and error states. Real training playback unverified. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/11-disclosures-after-desktop.jpg) · [Mobile](screenshots/11-disclosures-after-mobile.jpg) |
| 12 | `/portal/support` | Theme OK | Ticket type tabs, subject/details fields, ticket list and API error. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/12-support-after-desktop.jpg) · [Mobile](screenshots/12-support-after-mobile.jpg) |
| 13 | `/portal/pay-policy` | Theme OK | Policy cards, FAQ accordion, empty CTA and error state. **Change:** Added shared identity header and tool shell. | [Desktop](screenshots/13-pay-policy-after-desktop.jpg) · [Mobile](screenshots/13-pay-policy-after-mobile.jpg) |
| 14 | `/portal/clients` | Theme OK | Populated/empty/error client list, search control and native detail sheet. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/14-clients-after-desktop.jpg) · [Mobile](screenshots/14-clients-after-mobile.jpg) |
| 15 | `/portal/clients/new` | Theme OK | Intro, stage indicator, first question, gated Continue and desktop grouping; review/branch behavior covered by existing tests. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/15-client-intake-after-desktop.jpg) · [Mobile](screenshots/15-client-intake-after-mobile.jpg) |
| 16 | `/portal/admin` | Theme OK | Summary stats and destination cards; shared rail, collapsed rail, mobile drawer and role gates. **Change:** Shared admin navigation fix: correct current link and unfiltered mobile logo. | [Desktop](screenshots/16-admin-overview-after-desktop.jpg) · [Mobile](screenshots/16-admin-overview-after-mobile.jpg) |
| 17 | `/portal/admin/hierarchy` | Theme OK | Canvas/tree controls, hierarchy nodes and restricted assistant view; no hierarchy writes. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/17-admin-hierarchy-after-desktop.jpg) · [Mobile](screenshots/17-admin-hierarchy-after-mobile.jpg) |
| 18 | `/portal/admin/users` | Theme OK | Roster, filters, table/card layout and action controls; no recovery/admin writes. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/18-admin-users-after-desktop.jpg) · [Mobile](screenshots/18-admin-users-after-mobile.jpg) |
| 19 | `/portal/admin/gmail-verification` | Theme OK | Verification candidate row, search and actions; no email sent. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/19-admin-gmail-verification-after-desktop.jpg) · [Mobile](screenshots/19-admin-gmail-verification-after-mobile.jpg) |
| 20 | `/portal/admin/onboarding-holds` | Theme OK | Enrollment attention/progress/identifier row and queue/search controls; no retry/release actions submitted. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/20-admin-onboarding-holds-after-desktop.jpg) · [Mobile](screenshots/20-admin-onboarding-holds-after-mobile.jpg) |
| 21 | `/portal/admin/profile-review` | Theme OK | Missing-profile requirements, privacy-limited summary and links. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/21-admin-profile-review-after-desktop.jpg) · [Mobile](screenshots/21-admin-profile-review-after-mobile.jpg) |
| 22 | `/portal/admin/users/new` | Theme OK | Legal name, email, referrer and network fields; no account created. **Change:** Only Add user is current here; Users remains current on user details. | [Desktop](screenshots/22-admin-users-new-after-desktop.jpg) · [Mobile](screenshots/22-admin-users-new-after-mobile.jpg) |
| 23 | `/portal/admin/users/:userId` | Theme OK | Summary, Google/profile/checklist sections, comp attachment area, uploads and document list; full-page evidence. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/23-admin-users-00000000-0000-4000-8000-000000000001-after-desktop.jpg) · [Mobile](screenshots/23-admin-users-00000000-0000-4000-8000-000000000001-after-mobile.jpg) |
| 24 | `/portal/admin/incentives` | Theme OK | Populated incentive row and image/video upload editor; no storage upload. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/24-admin-incentives-after-desktop.jpg) · [Mobile](screenshots/24-admin-incentives-after-mobile.jpg) |
| 25 | `/portal/admin/brand-assets` | Theme OK | Color/file rows and color editor; upload controls reviewed; no storage upload. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/25-admin-brand-assets-after-desktop.jpg) · [Mobile](screenshots/25-admin-brand-assets-after-mobile.jpg) |
| 26 | `/portal/admin/carriers` | Theme OK | Grouped carrier reference table and action controls; no carrier changes submitted. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/26-admin-carriers-after-desktop.jpg) · [Mobile](screenshots/26-admin-carriers-after-mobile.jpg) |
| 27 | `/portal/admin/state-availability` | Theme OK | All 51 state rows, counts and status selects; complete long-page capture. No writes. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/27-admin-state-availability-after-desktop.jpg) · [Mobile](screenshots/27-admin-state-availability-after-mobile.jpg) |
| 28 | `/portal/admin/clients` | Theme OK | Cross-agent client table, search control and responsive card layout. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/28-admin-clients-after-desktop.jpg) · [Mobile](screenshots/28-admin-clients-after-mobile.jpg) |
| 29 | `/portal/admin/dashboard-tabs` | Theme OK | Configured link tab, system tabs, reorder/edit/add controls and new-tab editor; no changes saved. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/29-admin-dashboard-tabs-after-desktop.jpg) · [Mobile](screenshots/29-admin-dashboard-tabs-after-mobile.jpg) |
| 30 | `/portal/admin/todos` | Theme OK | Todo rows, completion counts, publish/hide controls and editor; no changes saved. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/30-admin-todos-after-desktop.jpg) · [Mobile](screenshots/30-admin-todos-after-mobile.jpg) |
| 31 | `/portal/admin/genesis` | Theme OK | Genesis queue/status/filter controls and restricted-role destination; no provisioning/email. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/31-admin-genesis-after-desktop.jpg) · [Mobile](screenshots/31-admin-genesis-after-mobile.jpg) |
| 32 | `/portal/admin/contracting` | Theme OK | Ready-for-contracting row and queue controls; no contracting request. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/32-admin-contracting-after-desktop.jpg) · [Mobile](screenshots/32-admin-contracting-after-mobile.jpg) |
| 33 | `/portal/admin/lead-charges` | Theme OK | CSV chooser, week/report selectors, totals and per-agent table; no upload/payroll changes. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/33-admin-lead-charges-after-desktop.jpg) · [Mobile](screenshots/33-admin-lead-charges-after-mobile.jpg) |
| 34 | `/portal/admin/setter-closer` | Theme OK | Policy row, split stats, search/export controls and editing dialog; no writes. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/34-admin-setter-closer-after-desktop.jpg) · [Mobile](screenshots/34-admin-setter-closer-after-mobile.jpg) |
| 35 | `/portal/admin/tickets` | Theme OK | Ticket table/card, status filter and working dialog; no ticket saved. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/35-admin-tickets-after-desktop.jpg) · [Mobile](screenshots/35-admin-tickets-after-mobile.jpg) |
| 36 | `/portal/admin/pay-policy` | Theme OK | Policy/FAQ rows, editor controls, empty/error states; no publishing. **Change:** Shared theme retained; no page-specific code change. | [Desktop](screenshots/36-admin-pay-policy-after-desktop.jpg) · [Mobile](screenshots/36-admin-pay-policy-after-mobile.jpg) |
| 37 | `/portal/admin/onboarding-preview` | Theme OK | Intro and contract phase of public onboarding in preview; no submission. **Change:** Portal backdrop, glass pane and controls; sticky preview bar stays in normal flow. | [Desktop](screenshots/37-admin-onboarding-preview-after-desktop.jpg) · [Mobile](screenshots/37-admin-onboarding-preview-after-mobile.jpg) |
| 38 | `/portal/admin/w9-preview` | Theme OK | W-9 sections, field callouts, pager and preview controls; no signature/submission. **Change:** Portal backdrop and backed signing intro; responsive preview bar; PDF field containment. | [Desktop](screenshots/38-admin-w9-preview-after-desktop.jpg) · [Mobile](screenshots/38-admin-w9-preview-after-mobile.jpg) |

## Other authenticated and entry states

| Surface | Health / scope | Evidence |
|---|---|---|
| Signed-out login | Theme OK; existing Google sign-in entry rendered | [Desktop](screenshots/auth-login-desktop.jpg) · [Mobile](screenshots/auth-login-mobile.jpg) |
| `/portal/set-password` | Theme OK with password-required fixture. No password was entered or changed. | [Desktop](screenshots/auth-set-password-desktop.jpg) · [Mobile](screenshots/auth-set-password-mobile.jpg) |
| Unconfirmed-email gate | Theme OK at `/portal`; protected content stays gated | [Desktop](screenshots/auth-confirm-email-desktop.jpg) · [Mobile](screenshots/auth-confirm-email-mobile.jpg) |

## Interaction and long-page evidence

| Check | Result | Evidence |
|---|---|---|
| Desktop collapse / mobile drawer | Rail stays beside page; drawer makes main inert; Escape restores menu-button focus | [Collapsed](screenshots/interaction-admin-collapsed-desktop.jpg) · [Drawer](screenshots/interaction-admin-drawer-mobile.jpg) |
| Profile photo | Local brand icon selected through file chooser; crop sheet opens/focuses title; closing restores Upload photo focus; backend upload untested | [Before](screenshots/interaction-profile-crop-before-mobile.jpg) · [After mobile](screenshots/interaction-profile-crop-after-mobile.jpg) · [After desktop](screenshots/interaction-profile-crop-after-desktop.jpg) |
| Profile sections | Team, licensing, documents, carrier credentials all inspected | [Team](screenshots/interaction-profile-team-mobile.jpg) · [Licensing](screenshots/interaction-profile-licensing-mobile.jpg) · [Documents](screenshots/interaction-profile-documents-mobile.jpg) · [Carrier entry](screenshots/interaction-carrier-login-sheet-mobile.jpg) |
| Client detail / intake | Client detail sheet, form entry and gated first question | [Detail](screenshots/interaction-client-detail-mobile.jpg) · [Intake](screenshots/interaction-intake-start-mobile.jpg) |
| Document signing chrome | PDF fields contained below pager; W-9 native sheet reviewed; no signing submitted | [Pager](screenshots/07-w9-after-mobile.jpg) · [Signing sheet](screenshots/interaction-w9-signing-sheet-mobile.jpg) |
| Admin editors | Incentive upload editor, color editor, new tab, new todo, policy and ticket dialogs inspected | [Incentive](screenshots/interaction-incentive-modal-mobile.jpg) · [Color](screenshots/interaction-color-modal-mobile.jpg) · [Tab](screenshots/interaction-tab-modal-mobile.jpg) · [Todo](screenshots/interaction-todo-modal-mobile.jpg) · [Policy](screenshots/interaction-policy-modal-mobile.jpg) · [Ticket](screenshots/interaction-ticket-modal-mobile.jpg) |
| Workflow overlays | Carrier selection changes confirmation availability; no confirmation sent. Video fallback and incentive lightbox use shared materials | [Carrier](screenshots/interaction-new-producer-mobile.jpg) · [Video](screenshots/interaction-video-mobile.jpg) · [Incentive](screenshots/interaction-incentive-lightbox-mobile.jpg) |
| Long pages | Lower form and upload controls plus complete state table captured | [Profile](screenshots/06-profile-full-mobile.jpg) · [Deposit](screenshots/09-direct-deposit-full-mobile.jpg) · [Comp](screenshots/10-comp-agreement-full-mobile.jpg) · [User detail](screenshots/23-admin-users-00000000-0000-4000-8000-000000000001-full-mobile.jpg) · [All states](screenshots/27-admin-state-availability-full-mobile.jpg) · [Lead charges](screenshots/33-admin-lead-charges-full-mobile.jpg) |

## Verification

Commands below correspond to the package scripts. This host used the bundled Node executable directly against the checked-out package CLIs because npm/node were absent from the shell PATH. Dependencies were copied from the existing PNCL checkout into this worktree; the lockfile was preserved.

| Check | Result |
|---|---|
| `npm test` / `vitest run` | 87 files, 399 tests passed. Baseline: 83 files, 378 tests passed. |
| `npx tsc -b` | Passed; no diagnostics. |
| `npm run build` | Passed, including PWA service-worker generation. Existing large-chunk warning remains. |
| `npm run lint` | 2 errors and 29 warnings, identical to baseline. Errors: `src/lib/analytics.ts:55` (`no-explicit-any`) and `tailwind.config.ts:122` (`no-require-imports`). No new lint errors. |
| `git diff --check` | Passed. |

Focused regressions cover shared chrome, loading/error/empty states, compensation consent and request shape, signed-summary heading hierarchy, current admin navigation, backdrop composition through shared layouts, preview backdrops, PDF layering containment, and photo-crop confirmation/cancel behavior. Existing authorization, assistant privacy, intake branching/review, PDF, carrier, onboarding and state-availability tests also passed.

Logs: [tests](verification/tests.log), [types](verification/types.log), [lint](verification/lint.log), [production build](verification/build.log).

## Remaining service and browser checks

- **Live staging authentication/authorization:** no real staging session or environment was supplied. Repeat Google sign-in and backend role/RLS checks with agent, admin, admin-assist and Genesis-admin accounts. Browser fixture redirects prove frontend gating only.
- **Storage and writes:** real uploads/download URLs, signatures/PDF generation, carrier-confirmation writes, profile saves, administrative saves, emails, enrollment provisioning/retries, CSV ingestion/payroll and hierarchy changes were not sent to live services. The fixture API rejects those writes.
- **Real data/media:** synthetic roster, client, carrier, enrollment, policy, calendar and document states validate layout. Real signed documents, large rosters, training playback and actual Google Calendar consent/sync remain unverified. The native embedded PDF in the compensation iframe remained gray in IAB; PDF.js W-9 and ICA rendering was visible.
- **Browser/accessibility breadth:** actual desktop/mobile render and selected keyboard/focus checks were completed in IAB. iOS Safari, device keyboard/zoom, assistive technology, reduced-motion rendering and a full WCAG contrast/semantics audit were not performed. Existing reduced-motion and control tokens were reused.
- **Rollout:** the user authorized publishing these UI updates to the staging branch after local validation. Production configuration and data were not changed. Hosted deployment verification remains pending.

## Evidence handling

Final route screenshots were captured at explicit 1440×900 and 390×844 browser viewports. Initial baseline shots were captured at 1310×818 and 354×767 browser sizes; they establish old-theme appearance rather than pixel-identical comparisons. Interaction files retain their actual image dimensions. Raw screenshots and DOM/accessibility notes are preserved; contact sheets and the gallery are convenience views. `screenshots/observations.json` records route/state/viewport and document-width measurements, and `screenshots/role-checks.json` records restricted-role redirects.

Open [the local evidence gallery](index.html) for the numbered screenshots and their inspection notes.

## Header stage follow-up

Removed the duplicate onboarding stage from dashboard and profile mastheads. OnboardingDock already presents the stage with progress and the next task; the profile summary retains it too. Dashboard, Calendar and State Map now measure 75px headers with matching navigation positions at 1253px desktop width. All three plus Profile measure 56px headers at 390px mobile width. [Measurements](screenshots/header-stage-measurements.json) · [Desktop](screenshots/header-stage-desktop.jpg) · [Mobile](screenshots/header-stage-mobile.jpg). The populated dashboard gallery captures were refreshed; earlier state/interaction captures retain the original masthead.

Follow-up verification: 39 existing component/dashboard/profile tests passed; TypeScript and `git diff --check` passed.

## Onboarding urgency cue follow-up

Unfinished onboarding now carries a steady 8px orange dot beside the stage label. The compact capsule keeps the cue beside its progress ring; completed onboarding has no urgency dot. Desktop and 390×680 compact mobile views were inspected with no horizontal overflow. Thirty existing primitive/dashboard tests passed. [Desktop](screenshots/onboarding-urgency-desktop.jpg) · [Compact mobile](screenshots/onboarding-urgency-compact-mobile.jpg).

## Onboarding header placement follow-up

Moved the dashboard capsule into the header action slot immediately before the user profile. Desktop retains the stage, next task, progress ring and orange dot; widths at or below 900px show the ring and urgency cue, with the full button label retained for assistive technology. The profile retains its existing in-page progress card. No capsule remains in the dashboard bottom corner.

Browser checks at 1253, 768, 621, 620, 390 and 320px found no horizontal overflow. Headers remain 75px above the phone breakpoint and 56px at or below it. Desktop and mobile native dialogs open, focus the title, close and restore capsule focus. Thirty-nine existing component/dashboard/profile tests and TypeScript passed. [Measurements](screenshots/onboarding-header-measurements.json) · [Desktop](screenshots/onboarding-header-desktop.jpg) · [Mobile](screenshots/onboarding-header-mobile.jpg) · [Desktop panel](screenshots/onboarding-header-panel-desktop.jpg) · [Mobile panel](screenshots/onboarding-header-panel-mobile.jpg). Earlier captures document superseded capsule positions.

## Calendar width follow-up

Removed the calendar-only 880px cap. The heading, note and calendar panes now fill the shared portal frame: 1124px at the marked 1492px desktop viewport, and 362px at 390px mobile width. Both checks matched the available inner width and showed no horizontal overflow. [Desktop](screenshots/calendar-full-width-desktop.jpg) · [Mobile](screenshots/calendar-full-width-mobile.jpg) · [Measurements](screenshots/calendar-full-width-measurements.json).

## Shared onboarding across tab pages

Dashboard, Calendar, State Map and Profile now render the same onboarding header action. Their protected route parent owns one onboarding lifetime, retaining todo/form/carrier data and in-flight completion state across tab navigation. Profile uses the shared checklist instead of a duplicate in-page capsule. Existing signature fallbacks, metadata check-offs, role previews and completion guards are retained.

At 1492px desktop width all four pills measured x=792.92px, y=26.5px, width=340px, with a 75px header. At 390px mobile width all four measured x=274px, y=21px, width=46px, with a 56px header. All showed the same stage, next task and 50% fixture progress, without horizontal overflow. Native checklist dialogs opened and focused their title on every mobile tab. [Measurements](screenshots/shared-onboarding-measurements.json) · [Calendar header](screenshots/shared-onboarding-calendar-header.jpg) · [State Map checklist](screenshots/shared-onboarding-state-map-panel-mobile.jpg). The main gallery captures for these four pages were refreshed.

Verification: 86 test files / 399 tests passed; TypeScript and production build passed. Lint remains at the baseline 2 errors / 29 warnings. New regressions verify one todo fetch across four route changes, local signed-form completion resolution, a pending completion/error surviving navigation, and progress staying visible while refreshed completion arrives. Profile and licensing saves refresh the shared progress.

## Profile title and tab styling follow-up

The profile title/back-link area now has no background, radius or surrounding border, with one divider along its bottom edge. On phones it remains in page flow so transparent chrome does not overlay form content. Profile tabs now match the primary portal navigation: outline icons, uppercase mono labels, no recessed track, and an orange active label/underline. Changes are scoped to Profile. Native tab roles, keyboard navigation and horizontally scrolling phone tabs are retained.

Desktop (1492px) and mobile (390px) checks confirmed transparent chrome and no document overflow; Team → Right selected and focused Licensing, and Carrier logins scrolled into view on mobile. Thirty-six existing profile/primitive tests, TypeScript and `git diff --check` passed. [Desktop](screenshots/profile-chrome-desktop.jpg) · [Mobile](screenshots/profile-chrome-mobile.jpg). Main profile gallery captures were refreshed.

## New-look announcement

Added a centered native dialog announcing the refreshed portal, with highlights for the dashboard, header onboarding progress and responsive layout. It appears on the first visit to a protected tab page for an account and release. Explore, Close, Escape or backdrop dismissal remembers the account-specific choice in localStorage for this browser; other open tabs also dismiss. Blocked storage falls back to the current layout lifetime. No backend acknowledgement, email or browser notification permission is involved.

The announcement belongs to PortalTabLayout, leaving the shared onboarding provider and its data lifetime intact. The development-only [announcement preview](http://localhost:8080/portal?announcement=new-look) reopens it without changing the saved dismissal; production builds ignore the preview query.

Desktop and phone layouts were inspected, including title focus and Escape dismissal. Actual CSS viewports measured 1253×1077 and 354×767 (the phone capture is 390×844 device pixels). Neither overflowed the document. [Desktop](screenshots/new-look-announcement-desktop.jpg) · [Phone](screenshots/new-look-announcement-mobile.jpg) · [Measurements](screenshots/new-look-announcement-measurements.json).

All 87 files / 397 tests passed, including six announcement regressions for initial focus, persistent dismissal, account separation, blocked storage, cross-tab dismissal and preview behavior. TypeScript and production build passed; lint retains the same baseline 2 errors / 29 warnings.

## Shared title/back-link styling

Promoted the Profile title treatment into the shared `PortalSubpageHeader` styles. Calendar, State Map, Carriers, Brand Assets, W-9, ICA, Direct Deposit, Compensation Agreement, Video Trainings, Support, Pay & Commissions, Clients and Client Intake now use the same transparent title/back-link area as Profile, with one bottom divider and no surrounding card border or radius. Removed the duplicate Profile override. On phones the header stays in normal flow so its transparent text cannot overlap scrolling content; the compact back control and existing badges/actions remain.

Desktop checks at 1254px verified shared chrome across the portal routes. Phone checks at 390px covered Calendar, Profile, Video Trainings, State Map and Client Intake, including title badges/actions, with no horizontal overflow. [Desktop](screenshots/shared-subhead-calendar-desktop.jpg) · [Phone](screenshots/shared-subhead-calendar-mobile.jpg) · [Phone measurements](screenshots/shared-subhead-mobile-measurements.json). Earlier gallery captures retain the previous card treatment for comparison.

All 87 test files / 397 tests passed; TypeScript and production build passed. Removed obsolete header-fill assertions and retained shared backdrop composition coverage. `git diff --check` passed.

## Description-to-content spacing

The Clients description had zero bottom margin, while `ptools-stack` spaced only its own children. Added `--portal-gap` below descriptions immediately following a sub-page header on the backdrop-based pages, covering Clients, Carriers, Support, Brand Assets, Pay Policy, Compensation Agreement and Video Trainings. Bento pages already use a parent flex gap and do not receive another margin.

Browser measurements confirmed 14px gaps on desktop Clients, Carriers, Support and Brand Assets, the existing 14px Calendar gap, and 10px on phone Clients. No document overflow. [Desktop](screenshots/clients-note-gap-desktop.jpg) · [Phone](screenshots/clients-note-gap-mobile.jpg) · [Measurements](screenshots/clients-note-gap-measurements.json). CSS-only change; verified visually and with `git diff --check`.

## Uniform sub-page title height and spacing coverage

State Map and Clients had a 44px title action row; Calendar and Profile shrank that row to the 26.4px title text. The shared header now reserves two 44px desktop rows, producing 115px including padding and divider on every page. Phone headers use 53px to fit the 52px actions plus the divider, and cannot shrink in the State Map flex layout.

All 14 protected portal sub-pages were measured at 1280px and 390px widths. Every title header measured 115px desktop and 53px phone, with no document overflow. Description-to-content gaps were checked across those routes: top-level notes retain 14px desktop / 10px phone; Profile and Direct Deposit retain their existing larger spacing. Extended the shared gap to notes immediately followed by content inside block panes, including signed-form summaries. Grid/flex-owned gaps retain their own spacing.

[Measurements](screenshots/uniform-subhead-measurements.json) · [Calendar](screenshots/uniform-subhead-calendar-desktop.jpg) · [Profile](screenshots/uniform-subhead-profile-desktop.jpg) · [State Map desktop](screenshots/uniform-subhead-state-map-desktop.jpg) · [State Map phone](screenshots/uniform-subhead-state-map-mobile.jpg).

All 87 files / 397 tests passed; production build and `git diff --check` passed.
