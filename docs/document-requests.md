# Document requests

Full admins manage requests under **Onboarding steps → Document requests** at `/portal/admin/onboarding-steps/documents`.

Upload a final PDF (10 MB maximum), name it, and optionally add instructions. Choose all eligible portal agents or filter by LOA/IBO, state of residence, ICA on file, account creation dates, or name/email. Review the exact recipient list and deselect individual agents before sending. Admin and banned/deleted portal accounts are excluded. Dates are interpreted in the database timezone (UTC in production).

Before publication, choose **Place input fields** to add, move, or resize text, initials, signature, signing-date, and checkbox fields directly on each PDF page. Labels, required status, exact position/size, and agent preview are available. Apply the layout before reviewing recipients. Layout changes become part of the immutable published PDF and its hash. Use a new request for changes after publication.

Existing-agent delivery and future onboarding are independent. Future onboarding can target LOA, IBO, or both and applies to accounts created after the onboarding stage is activated. Assignments are materialized when the new agent loads their checklist or document page, after their invitation designation has been initialized. Current-recipient filters do not apply to future agents. Disabling onboarding stops new assignments and preserves existing requests/signatures; re-enabling starts a new creation-date cutoff. Changing the onboarding audience while enabled retains the original cutoff.

Released requests appear in the On-Board checklist and Profile → Documents → Document requests (`/portal/documents`). Each request requires review of all pages, completion of required PDF fields, a typed full legal name, and explicit electronic-signature consent. The published source PDF stays unchanged. The signed copy fills and flattens authored inputs, automatically fills added signature/date fields from the signing event, appends a certificate, and embeds a UTF-8 signature record with the document hash. Initials and required fields are validated against the source PDF on the server. The database also records the timestamp, consent, IP and user agent. Requests are completed only by the signing endpoint, never through user metadata or manual checklist completion. Pending documents block new New Producer submissions; previously accepted submissions stay accepted.

The admin detail view shows rollout stages, held/released recipients, signed/pending status, email status, original and signed PDFs, and future-onboarding settings. Uploaded editions are immutable. Publish a new request to distribute a changed document.

## Rollout order and delivery

When both audiences are selected, choose **current agents first**, **future onboarding first**, or **both together**. Staged rollouts require the admin to explicitly start the second stage in the request detail page; signatures do not automatically advance it. Current agents are snapshotted from the reviewed selection. Held requests have no portal access, checklist item, signature action, or email until released. Deferred onboarding starts its new-account cutoff when activated, so accounts created between the two stages are not automatically backfilled. Starting a stage twice does not duplicate assignments or requeue emails.

Choose **email only**, **notification action at next login only**, or **both**. The channel choice applies to both stages. Email-only requests remain accessible in Documents/checklist without a dashboard banner or login prompt. Portal delivery adds a dashboard banner and a review-and-sign sheet on the agent’s next portal visit. Dismissing the sheet lasts for the current login and pending document set in that browser tab; unsigned documents prompt again on a later login. This is an in-app notification, not a browser/device push subscription.

## Delivery and retries

Publication inserts the campaign, exact reviewed recipients, and audit entry in one database transaction. An idempotency ID and `(campaign_id, user_id)` uniqueness prevent duplicate requests. The server revalidates recipients at publication and rejects a changed/ineligible audience. The admin form preserves the same ID after an ambiguous network failure.

Email notifications are optional and link to the authenticated portal; no PDF is attached. Released requests are available regardless of email success; held requests remain unavailable. The admin page drains the durable email outbox in batches of ten while open. Keep the page open to finish delivery; after interruption, use **Send pending emails**. Failed sends remain visible and retryable. Sending uses leased rows and provider idempotency keys. Resend's idempotency retention is finite, so a retry after a very long ambiguous provider failure can deliver another notification, but cannot duplicate the signing request. Future onboarding assignments queue email when the selected channel includes email. The authenticated portal visit materializes those requests and schedules their email batch with EdgeRuntime.waitUntil. Automatic retries have a one-hour failure backoff; admins can retry from the request detail page. There is no scheduled background worker: current-agent batches drain while the admin page is open, and agent visits can drain their own queued requests.

## Deployment

The document request and staged signing migrations are applied in production. Uploaded signing remains inactive; no campaigns or emails are sent by deployment.

1. Apply `supabase/migrations/20261103200437_document_requests.sql`.
2. Deploy `admin-document-requests`, `portal-document-requests`, `list-portal-todos`, and `notify-new-producer` together. Both new endpoints verify JWTs and validate the caller again through the existing auth helpers. The admin endpoint requires the full admin role.
3. Deploy the frontend.
4. Verify a sample PDF with a test agent before a real rollout.

Email delivery uses the existing `RESEND_API_KEY`, `PNCL_FROM_NAME`, `PNCL_FROM_EMAIL`, and `PNCL_SITE_URL`. A valid portal URL is required before emails are claimed, so a missing configuration cannot produce broken links.

The private `portal-signing-documents` bucket and both new tables are accessible only through service-role edge functions. Agents receive expiring, owner-scoped signed URLs. All RPCs use invoker rights and revoke execution from PUBLIC/anon/authenticated. The service role receives explicit column-level reads for the auth identity/audience fields used by these RPCs; no password, recovery, or token column grants are added.

## Verification

- Database integration: `supabase/tests/document_requests.sql`, run in a disposable Postgres database after the migration. Covers audience intersections, a 1,205-agent preview, idempotency, atomic rejection, future onboarding cutoffs, staged releases, channel-specific queuing, email leases/backoff, reports and privilege boundaries.
- Frontend and edge-function tests cover review/selection, future-only publication, staged releases, next-login prompts, retries, delivery failures, authorization, ownership, source hashes, PDF generation and signature completion.
- On this machine's Node 26 runtime, run the suite with `NODE_OPTIONS=--no-experimental-webstorage npm test` so jsdom owns browser storage.
- Type check: `npx tsc --noEmit -p tsconfig.app.json`; production build: `npm run build`.

An optional sample-data-only preview lives in `output/document-requests-qa/`; it blocks real API requests and is not part of the application routes or production build.
