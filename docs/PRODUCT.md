# PNCL agent portal

## Who uses it
PNCL life-insurance agents, from onboarding through selling. Design for a phone between calls; the desktop view carries the paperwork (ICA, W-9, carrier logins). Admins use a separate register under `/portal/admin`.

## What it does (route inventory)
- `/portal`: the dashboard. Nine cards (referral links, sales tools, training, account, PNCL, incentives, brand assets, scripts, tracking sheets), the progress strip, notice banners and the onboarding checklist.
- `/portal/profile` (5 tabs): details form with photo, names, phone, recovery email, address and apparel sizes; PDF business card; team (referral links and downline); licensing (NPN, E&O, state licenses, driver license); documents; carrier logins (three SureLC links and a 14-row username, password and writing number table).
- Onboarding checklist (component): 5 stages, 31 steps, one CTA and a mark-complete per step.
- `/portal/calendar`: read-only Google Calendar. Connect state, the next 10 events over 14 days, refresh, disconnect.
- `/portal/state-map`: SVG US map with a small-state rail, search, status filters, a 51-state list, an answer card per state (PNCL status and the agent's license) and a legend; a snap sheet on a phone, a side panel on a desktop.
- `/portal/carriers`: read-only carrier table grouped by SureLC account, with e-app links.
- `/portal/clients`: search and list of intake forms.
- `/portal/clients/new`: 16-question financial inventory wizard, then the Pinnacle form fields, then review.
- `/portal/support`: ticket form (type, subject, details) and the agent's tickets.
- `/portal/pay-policy`: placeholder until the policy is finalized.
- `/portal/disclosures` (PNCL Training): 7 YouTube modules in sequence with a per-module completion.
- `/portal/ica`: 14-page pdf.js canvas with section jumps, inline fields and a signing sidebar.
- `/portal/w9`: 6-page pdf.js canvas, same pattern.
- `/portal/direct-deposit`: plain form with bank fields and a signature.
- `/portal/admin` (21 sub-pages): collapsible nav and overview cards. Separate register, out of the facelift.
- Auth: `/portal/login`, set-password, confirm-email, onboarding activate and success. Single forms.

## Constraints
- Frontend-only facelift. `api/`, `supabase/`, `scripts/`, `src/lib/`, `src/hooks/`, `src/contexts/` and build config are read-only; see CLAUDE.md.
- The local dev server talks to production Supabase. Read, never click destructive actions.
- No new dependencies. `src/components/ui/` holds only toast, tooltip and sonner; every other primitive is hand-rolled.
- Every loading, empty and error state stays; restyle, never remove.

## What success looks like
- One material across all portal pages: the tokens in `src/styles/portal-tokens.css`, the primitives in `src/components/portal/`.
- Every page usable one-handed at 390px: 44px targets, 16px inputs, single-column forms, a bottom nav, sheets instead of sidebars.
- Text on glass passes 4.5:1 for body and 3:1 for labels under the shipped gradient's brightest stop.
- `npm run build`, `npx tsc --noEmit -p tsconfig.app.json` and `npm test` green on every commit; no test removed.
