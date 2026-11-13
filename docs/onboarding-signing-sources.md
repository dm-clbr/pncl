# Onboarding signing sources

The release separates admin document preparation from activation for agents. Uploaded signing starts inactive; activation is an explicit full-admin action in Onboarding steps.

## Admin workflow

Manage all standard onboarding signing documents in **Onboarding steps**. The reserved ICA, W-9, direct deposit, and compensation rows each have independent LOA and IBO PDF uploads. Save a draft while preparing a document. Publishing a visible flow requires its main PDF; supporting files remain reference attachments and are not part of the signed document.

The admin page lists missing signing documents. Once uploaded signing is activated, an agent cannot sign an unconfigured, hidden, or unpublished step, and every new standard signature uses the uploaded source for that flow. Until activation, temporary legacy components and generators preserve the existing signing process. The migration freezes existing ICA selections and signing checklist rows so preparing new documents cannot change current agent requirements. Existing signed records and downloadable signed copies remain available after a source changes. Replacing a source does not automatically require previous signers to sign again; select **Request new signatures from existing agents** when replacing the PDF, or request signatures from its entry in **Documents & fields**.

Use **Documents & fields** to inspect the same onboarding PDFs, edit fields, or open rollout history. For an additional agreement, add a **Signing document** step and configure its PDF and audience there. A replacement can retain the old onboarding PDF while existing agents sign the new edition, then select that same edition when the admin starts the next stage. Recipients, delivery channels, and rollout order are documented in `docs/document-requests.md`. Standalone request uploads are retired; historical requests and signed copies remain available.

## Place and adjust input fields

After selecting an uploaded PDF in a signing step, choose **Edit input fields**. Select a page, add text, initials, signature, signing-date, or checkbox fields, and drag them into place. Drag a field's corner to resize it, use arrow keys for fine adjustments, or enter exact position/size percentages in the inspector. Labels and required status are editable. Added fields can move between pages or be deleted; Undo restores recent layout changes. Agent preview lets the admin try inputs without saving those sample entries.

Choose **Apply fields**, then **Save changes** on the step. The fields are embedded in a new PDF source version and bound to that asset's hash. Existing signed copies retain their original layout and values. Existing mapped ICA and W-9 data fields keep their field identities and pages; admins can reposition and resize them. This preserves their onboarding data connections. **Documents & fields → Edit fields** opens this same editor and saves back to the onboarding step. Field changes can also use the optional re-sign rollout prompt.

Agents complete the positioned text, initials, and checkbox fields while reviewing the PDF. Required values and initials are validated on the server against that exact source. In the ICA and document-request signing flows, clicking a signature box opens an overlay to type or draw and explicitly adopt a signature. The same adopted image previews in every added signature box and is embedded before PDF flattening. Typed signatures use the bundled Allura font; signing is blocked if that font cannot load, with drawing available as a fallback. Changing the legal name invalidates adoption. Signing-date fields receive the server signing date. The original ICA drawing experience remains available for its existing signature. Completed values are flattened into the signed PDF, with a private embedded field-value record. Arbitrary fields do not automatically map to profile or banking details.

## PDF compatibility

- ICA: a compatible uploaded 14-page ICA keeps the mapped fields, full-name guidance, initials validation, and drawn signature. Other layouts retain their uploaded pages, complete their authored fields, and append a signature record.
- W-9: upload a compatible fillable PDF with the expected tax, signature, and date fields on page 1. Validation runs before storage. Additional pages remain viewable and are preserved in the signed copy. The local `npm run prepare:w9` utility produces an upload-ready PDF from the repository's IRS source, with corrected signature/date placement; it does not select or publish that file or copy it into Edge Function assets.
- Direct deposit: agents review the uploaded authorization, then supply their banking details and signature. The signed PDF preserves the uploaded pages and appends the completed details and source identifier.
- Compensation: agents review the configured uploaded PDF and sign with their full legal name and consent. The signed copy appends a signature record.

Source assets have immutable paths, flow/kind ownership, and a SHA-256 hash. Signing requests include the exact reviewed source ID. The server verifies the file bytes; database guards recheck the active source while locking the step and flow so a replacement cannot commit a signature for the wrong edition. New signed PDFs use unique paths, so even a rejected signing attempt cannot overwrite an earlier signed file. After activation, signing checklist completion comes from signed records, not editable user metadata. Before activation, previous completion semantics are retained across agent checklists, admin progress, and submission checks.

## Staged deployment and activation

1. Apply the document request migration, onboarding signing source migration, and linked-document-library migration, then deploy the affected Edge Functions and frontend together. The signing rollout row starts disabled and the preview allowlist starts empty.
2. Admins can upload PDFs, place fields, and prepare published steps while agents keep their previous signing screens, ICA source selections, and signing checklist requirements. Existing unsigned compensation assignments remain signable before and after activation.
3. Configure the source PDF for every published and visible signing step in LOA and IBO. Supporting files are not signing sources. No local QA selections or synthetic PDFs are copied into production.
4. Use **Preview new signing on my account** to route only the current full admin's account through uploaded signing and its matching checklist. Reopen signing pages after changing preview. This uses real account records for standard signing screens; PDF review and input previews can be tested without submitting a signature. Additional signing-document steps use new-agent assignment eligibility; inspect their fields with the editor preview and test their signing flow with an explicitly selected test-agent rollout. End account preview when finished.
5. After both flows have been reviewed and tested, check the acknowledgment and choose **Activate uploaded signing**. The server rechecks all enabled sources and uses a revision check to reject stale activation requests. Signing writes and activation serialize in the database.
6. **Return to previous signing** restores the saved prior process; completed signed records remain intact. Clear any account preview separately. Keep temporary legacy modules and assets until the staged transition and outstanding legacy assignments are complete.

Private rollout and preview tables are accessible only to the server service role. Activation and own-account preview actions require full admin authorization. Deployment does not activate uploaded signing or send document campaigns.

The linked document library migration does not activate signing or send requests.

## Local validation

`supabase/tests/onboarding_signing_sources.sql` passed in disposable local PostgreSQL: missing/wrong-flow publication, stale signing sources, hashes, valid source signatures, preserved history, compensation completion, and privilege boundaries. Browser checks covered separate flow uploads, missing-source publication errors, uploaded ICA/W-9 review, and ICA initials validation. Generated sample PDFs were rendered and inspected; the W-9 signature/date placement was corrected during that check.

Validation includes the frontend suite, signing/editor/storage regressions, TypeScript, targeted ESLint, production build, and disposable PostgreSQL migration tests. Activation tests cover default-off behavior, frozen requirements, admin-only preview, missing-source rejection, stale revisions, rollback, continued legacy compensation signing, and permission boundaries. Browser field-editor checks cover adding, dragging, resizing, deleting, undo, previewing, applying, saving, and reopening a layout. Signed field-output PDFs were rendered and inspected.

Local review: `http://127.0.0.1:5191/output/document-requests-qa/sources.html?localPreview=1`. It uses browser-local uploads and fake account data, blocks real API submissions, and is excluded from production application routes.

## Signature adoption release (2026-11-13)

New uploaded ICA and document-request submissions require explicit signature adoption, bound to the legal name and consent version. The saved PDF embeds the exact signature image and an audit attachment containing the adoption method, consent text/version, server signing time, source hash, and signature-image hash. Document-request rows also retain the consent text. No database migration or signing-rollout activation is required. Deploy `submit-onboarding-contract`, `submit-portal-ica`, and `portal-document-requests` with the frontend; the ICA functions must retain their configured static PDF assets for legacy signing. Old open signing screens must refresh to adopt a signature before submitting.
