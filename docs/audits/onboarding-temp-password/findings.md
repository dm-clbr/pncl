# New-agent Gmail handoff audit

Audited: 2026-08-18

## Evidence

- [Current onboarding entry](./02-current-onboarding-entry-stable.jpg)
- [Improved Gmail-ready state](./04-improved-gmail-ready.jpg)
- [Improved credential handoff](./06-improved-password-handoff-stable.jpg)

The live credential screen requires a valid, private handoff token. No agent token or temporary password was opened during this audit. The credential-state findings below are based on the production database aggregates and the matching frontend/Edge Function state transitions.

## Findings and resolution

1. **Critical — the successful provisioning state could not reveal credentials.** Successful enrollments finish in `awaiting_google_sign_in`, but the reveal endpoint previously accepted only `ready`. Ten recent production enrollments were in this exact state with both accounts and an encrypted temporary password present, while none had viewed credentials. The reveal endpoint now treats `awaiting_google_sign_in` as the intended revealable state.

2. **High — a refresh permanently removed the agent's only copy of the password.** The first reveal immediately deleted the encrypted password, so closing or refreshing the page forced an admin reset. The encrypted password now remains available through the original 24-hour handoff link and can be shown again. It is deleted after the first confirmed Google sign-in.

3. **High — a later Gmail verification retry could invalidate a password the agent had already copied.** Because the first reveal deleted the stored encrypted value, a verification retry generated and applied a new Google password. Preserving the encrypted value until successful sign-in prevents that reset race for new handoffs.

4. **Medium — Gmail setup and PNCL portal login appeared as competing actions.** The revised screen presents two explicit stages: set up Gmail with the temporary password, then enter the portal with Google. It now states that there is no separate PNCL portal password.

5. **Medium — password failure help arrived only after the user was already blocked.** The revised handoff adds copy-first instructions, the exact account to use, guidance that only the newest admin-issued password works, and a collapsed Google verification troubleshooting section.

## Verification

- Credential-handoff regression tests: 5 passed.
- Full application test suite: 70 passed.
- Changed frontend files: ESLint passed.
- Production frontend build: passed.
- Desktop credential-handoff preview: visually inspected.
- Mobile DOM geometry: 390 px viewport with 390 px document width and no horizontal overflow.

## Release status

- Production Edge Functions deployed: `reveal-onboarding-credentials` v26, `get-onboarding-status` v32, and `activate-onboarding-google-signin` v2.
- Sixteen encrypted temporary passwords left on already-completed Google sign-ins were cleared; a verification query returned zero remaining.
- The revised frontend is implemented and production-build verified in the workspace. It still needs the repository's normal frontend release step before agents see the new copy and layout on the public site.
