# Documents & fields and signature rollouts

Full admins manage documents under **Onboarding steps → Documents & fields** at `/portal/admin/onboarding-steps/documents`. Onboarding steps owns each PDF. The catalog uses those same source assets and field layouts; it does not upload a separate campaign document.

## Admin workflow

1. Edit the appropriate onboarding step, or choose **Add signing step** for an additional agreement. Configure its stage, visibility, and LOA/IBO PDFs. A published signing step requires a PDF for every enabled flow. Supporting files remain reference attachments.
2. Choose **Edit input fields** in the step, or **Edit fields** in the catalog, to add, move, resize, or delete fields. Apply the layout, then save the step. A field edit creates an immutable source edition; it cannot alter previous signed copies.
3. When replacing a published signing PDF, optionally select **Request new signatures from existing agents** and choose **Save & review rollout**. This saves the step's other changes while retaining the previously selected PDF. The replacement PDF is carried into rollout review without a second upload.
4. Review recipients, rollout order, and delivery before explicitly starting the rollout. Each rollout belongs to one step and one flow. To send both LOA and IBO documents, start a rollout for each flow's PDF.
5. Open the document's **Rollout history** for held/released recipients, signature status, email delivery, originals, signed copies, and the next-stage action. **All rollout history** also preserves older detached requests.

A replacement saved without the re-sign option selects the new onboarding source without sending existing agents a request. For initial setup, save the PDF first and use **Request signatures** in the catalog if existing agents also need it. A staged replacement handles one flow at a time. A PDF already selected in the step cannot be retroactively deferred; its request sends to existing agents without creating a duplicate future onboarding requirement.

Choose all eligible agents in the PDF's flow or filter by state of residence, ICA on file, account creation dates, or name/email. Review the exact recipient list and deselect individual agents before sending. Admin and banned/deleted portal accounts are excluded. Dates use the database timezone (UTC in production).

Additional signing steps use the same private request/signature mechanism as rollouts. Future assignments apply to matching agents created after that source is selected and enabled, once uploaded signing is active for them. Standard ICA, W-9, direct-deposit, and compensation steps keep their dedicated signing screens and do not get duplicate future request tasks. The global activation remains a separate control: preparing sources does not switch agents over, but an explicitly sent existing-agent rollout is available immediately according to its chosen stage.

Released requests appear at their linked step's stage and position in the checklist, and in Profile → Documents (`/portal/documents`). The step's prerequisites include its released signing tasks. Each request requires review of all pages, completion of required PDF fields, a typed full legal name, and explicit electronic-signature consent. The published source stays unchanged. The signed copy fills and flattens authored inputs, fills added signature/date fields from the signing event, appends a certificate, and embeds the document hash and signature record. Initials and required fields are validated on the server. Requests complete only through signing, never user metadata or manual checklist completion. Pending requests block new New Producer submissions; previously accepted submissions stay accepted.

## Rollout order and delivery

For a replacement PDF, choose **current agents first**, **future onboarding first**, or **both together**. Staged rollouts require the admin to explicitly start the second stage in the request detail page; signatures do not automatically advance it. Current agents are snapshotted from the reviewed selection. Held requests have no portal access, checklist item, signature action, or email until released. Current-agents-first retains the old PDF in the actual onboarding step until **Start future onboarding** is chosen. Onboarding-first selects the new PDF immediately but holds the reviewed current-agent recipients. The second-stage source check rejects an older rollout if another admin has since selected a different PDF. Deferred additional-document onboarding starts its new-account cutoff when activated, so accounts created between stages are not automatically backfilled. Starting a stage twice does not duplicate assignments or requeue emails.

Choose **email only**, **notification action at next login only**, or **both**. The channel choice applies to both stages. Email-only requests remain accessible in Documents/checklist without a dashboard banner or login prompt. Portal delivery adds a dashboard banner and a review-and-sign sheet on the agent’s next portal visit. Dismissing the sheet lasts for the current login and pending document set in that browser tab; unsigned documents prompt again on a later login. This is an in-app notification, not a browser/device push subscription.

## Delivery and retries

Publication links the immutable source edition, exact reviewed recipients, and audit entry in one database transaction. An idempotency ID and `(campaign_id, user_id)` uniqueness prevent duplicate requests. The server revalidates recipients at publication and rejects a changed/ineligible audience. The admin form preserves the same ID after an ambiguous network failure.

Email notifications are optional and link to the authenticated portal; no PDF is attached. Released requests are available regardless of email success; held requests remain unavailable. The admin page drains the durable email outbox in batches of ten while open. Keep the page open to finish delivery; after interruption, use **Send pending emails**. Failed sends remain visible and retryable. Sending uses leased rows and provider idempotency keys. Resend's idempotency retention is finite, so a retry after a very long ambiguous provider failure can deliver another notification, but cannot duplicate the signing request. Future onboarding assignments queue email when the selected channel includes email. The authenticated portal visit materializes those requests and schedules their email batch with EdgeRuntime.waitUntil. Automatic retries have a one-hour failure backoff; admins can retry from the request detail page. There is no scheduled background worker: current-agent batches drain while the admin page is open, and agent visits can drain their own queued requests.

## Deployment

The original document-request and staged-signing release is already deployed. The linked document library uses migration `20261103213249_onboarding_document_library.sql`.

For this change, apply that migration after the two existing signing/document migrations. Deploy the affected Edge Functions and frontend together. Shared checklist, progress, source, and completion helpers have multiple consumers; include their dependent functions, not only `admin-document-requests` and `admin-onboarding-editor`. The migration creates catalog editions from existing selections without assigning current agents, queuing messages, or activating uploaded signing. Keep activation off until setup and review are complete.

Email delivery uses the existing `RESEND_API_KEY`, `PNCL_FROM_NAME`, `PNCL_FROM_EMAIL`, and `PNCL_SITE_URL`. A valid portal URL is required before emails are claimed, so a missing configuration cannot produce broken links.

Signed copies and legacy campaign sources remain in the private `portal-signing-documents` bucket. Linked source PDFs reuse the existing `onboarding-content` assets. Request and campaign tables are accessible only through service-role Edge Functions; signed downloads use expiring, owner-scoped URLs. All RPCs use invoker rights and revoke execution from PUBLIC/anon/authenticated. The service role receives explicit column-level reads for the auth identity/audience fields used by these RPCs; no password, recovery, or token column grants are added.

## Verification

- Linked-library database integration: `supabase/tests/onboarding_document_library.sql` covers source ownership, no-send preparation, activation-off behavior, both staged orders, exact source switching, stale-stage rejection, retry idempotency, linked progress, preserved assignments, and privileges.
- Original request database integration: `supabase/tests/document_requests.sql`, run in a disposable Postgres database after the migration. Covers audience intersections, a 1,205-agent preview, idempotency, atomic rejection, future onboarding cutoffs, staged releases, channel-specific queuing, email leases/backoff, reports and privilege boundaries.
- Frontend and edge-function tests cover review/selection, linked sources, replacement saves, staged releases, next-login prompts, retries, delivery failures, authorization, ownership, source hashes, PDF generation and signature completion.
- On this machine's Node 26 runtime, run the suite with `NODE_OPTIONS=--no-experimental-webstorage npm test` so jsdom owns browser storage.
- Type check: `npx tsc --noEmit -p tsconfig.app.json`; production build: `npm run build`.

An optional sample-data-only preview lives in `output/document-requests-qa/`; it blocks real API requests and is not part of the application routes or production build.
