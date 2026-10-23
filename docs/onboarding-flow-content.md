# Onboarding content for LOA and IBO

The admin **Onboarding steps** page has separate LOA and IBO uploads for:

- ICA: PDF, up to 20 MB and 100 pages. The bundled ICA remains the default until replaced.
- Welcome/training video: MP4 or WebM upload or supported HTTPS video link. Publishing updates the flow-specific On-Board checklist step and application introduction.
- SureLC walkthrough: MP4 or WebM upload or supported HTTPS video link. Publishing updates that flow's existing SureLC step.

Each row has an **Edit** modal with independent LOA/IBO content, drag-and-drop uploads, a file picker, visibility, stage, and draft/published status. **Add row** creates document, video, link, or manual steps. Uploads are staged first; **Save changes** commits the row and both flows atomically. Cancel does not replace published content. Saving a draft does not replace the active ICA or application video; publish it to apply those assets. Replacing content retains previous files and completion history. The PNCL training library remains independent of the welcome video.

Each row also has a **Preview** action. Its LOA/IBO tabs show the selected flow's video, document, destination, and supporting files without recording progress or signing anything. Hidden and draft states remain visible to the admin.

Preview and Edit use side-by-side eye and pencil buttons with accessible labels. Row descriptions appear in question-mark tooltips on hover, keyboard focus, or tap; they remain editable in the modal and visible in the step preview.

Rows can include one primary video/document plus up to ten supporting PDF, DOC, or DOCX files **per flow**. Supporting files are staged and saved atomically alongside the primary content in `portal_todos.flow_content.attachments`; no schema migration is required. The server verifies every attachment's flow and document asset type and derives its URL from Storage. Existing clients preserve configured attachments. The portal response includes only the authenticated agent's supporting files. ICA supporting files are separate reference documents and are not appended to the signed agreement.

The SureLC row initially displays the existing shared quick-reference PDF. Uploading the first replacement removes that shared reference only for the edited flow. An explicitly empty list removes it; missing settings preserve it. The agent Hub and tutorial player display the configured references, including after video completion. Jordan's new LOA and IBO PDFs must be uploaded separately to replace the legacy content. Supporting-file editing is enabled only when the backend advertises support, or in explicit local preview.

Deploy `admin-onboarding-editor` and `list-portal-todos` before releasing the preview/supporting-file frontend update. The initial 2026-10-23 deployment below predates this extension.

The follow-up release passed all 687 frontend tests across 132 files, TypeScript checking, the production build, and the isolated SQL checks for saving supporting files alongside videos. Browser checks verified row previews, independent LOA/IBO supporting files, description tooltips, and both icon actions.

**Edit logic flow** opens a separate page. Admins can reorder application questions per flow, add conditions to optional NPN/profile-picture fields, reorder checklist steps within a stage, and add prerequisites. The agreement, final review, required application fields, and existing system gates remain mandatory. The preview simulates Yes/No answers without submitting an application. Stale revisions and cyclic, forward, or cross-stage prerequisites are rejected.

## Video uploads and links

The server returns the smaller of the bucket limit, `ONBOARDING_UPLOAD_MAX_BYTES`, and the 50 MiB application cap. Set that optional environment variable to the project's global Storage limit if it is lower; the bucket API alone cannot report the global limit. Documents use the smaller of 20 MiB and this effective limit. Browser and server both enforce the resulting file limit.

Oversized videos are compressed locally to a target of 90% of the effective limit (45 MiB with the default cap), using pinned FFmpeg/WASM with H.264 video and AAC audio. The budget depends on duration, uses 480p or 720p without upscaling, and reserves space for audio/container overhead. Files already under the limit retain their original quality. The output's actual size and playable metadata are checked before upload. Progress, cancellation, and retry are available. If compression fails, the file is too long, or the source exceeds 1 GiB, use a hosted video link. Retrying a network upload starts the upload again.

The compressor is lazy-loaded from same-origin `/ffmpeg/` assets. `postinstall`, `dev`, and `build` copy the pinned runtime from node_modules; generated binaries are ignored by Git and excluded from service-worker precaching. Compression can be slow and memory-intensive on mobile devices.

Supported links are Bunny Stream player/embed URLs and direct HTTPS MP4/WebM URLs. Links use the existing playback/completion integration. For typical ten-minute training videos, Bunny Stream is preferable for readable screen text and adaptive playback. A ten-minute synthetic browser test compressed 68.9 MiB to 43.2 MiB and passed playback metadata verification, but that size budget is about 630 kbps total and does not guarantee acceptable quality for every source.

## Local review

Run `npm run dev -- --host 127.0.0.1 --port 8080 --strictPort`, then open `/portal/admin/onboarding-steps?localPreview=1`. This explicit development-only mode uses synthetic rows and browser IndexedDB, including staged file blobs. It requires the existing admin UI session but makes no remote editor writes. The same flag carries into the logic page. It is visibly labeled and is never used as a fallback for a failed live request. Local draft files do not carry into production.

Custom ICAs are shown in a paginated viewer. The agent reviews every page, enters their legal name and personal email, draws their signature, and confirms both acknowledgments. The saved PDF contains the original pages plus an electronic signature record with the source SHA-256. Custom PDFs do not use the bundled ICA's fixed-position fields or company counter-signature. Uploaded agreements should therefore be complete, execution-ready documents. Existing signed agreements remain on file.

The server resolves LOA/IBO from the referral invite or the authenticated agent's designation. A changed or mismatched template cannot be signed silently; the agent must reload and review it. Source files have unique paths and are retained when replaced. Only full admins can upload. Blank templates and training videos are public; signed agreements stay in the existing private storage buckets.

When an applicant answers **Yes** to another IMO, both the IMO name and carrier list are required. Carrier names can be separated with commas or newlines. Answering **No** clears these details. Saved details appear in the admin's agent onboarding information; historical applications without details display “Not recorded.”

## Release

The production Supabase project is `dpnajpojbxgsckwrmvnm` (PNCL db). Both onboarding migrations and the affected Edge Functions were deployed on 2026-10-23. The release also enables RLS and restricts the existing onboarding signature table to server access. Publish custom content only after the matching frontend is deployed.

1. Review migration history before using `db push`: production has older migrations with different timestamps, so do not apply all historical pending files blindly. Apply `20261023192718_onboarding_flow_content_and_imo_details.sql` followed by `20261023193219_onboarding_step_editor.sql` to the intended environment. Confirm the project Storage limit and configure `ONBOARDING_UPLOAD_MAX_BYTES` if needed.
2. Deploy `admin-onboarding-editor`, `admin-onboarding-content`, `get-onboarding-content`, `list-portal-todos`, `submit-onboarding-contract`, `submit-portal-ica`, `submit-onboarding`, and `admin-get-user-profile`. Also redeploy the consumers of the updated agent summary helper: `admin-list-agents`, `admin-export-agents`, `admin-get-hierarchy`, `admin-get-portal-todo-completion`, `admin-link-partners`, and `admin-list-clients`. The editor endpoint verifies full-admin access itself; private rule tables and transactional RPCs are service-role-only.
3. Release the matching frontend in the same rollout. Old open application forms with **Yes** lack the new required IMO details and must be refreshed before submitting. Old signing pages must also be refreshed before signing any newly configured custom ICA.
4. Verify both flow previews, an actual upload in the intended test environment, signing, and persisted admin transfer details before admins publish real content.

## Validation

Run `NODE_OPTIONS=--no-experimental-webstorage npm test` with Node 26 (the flag lets jsdom own browser storage), `tsc -p tsconfig.app.json --noEmit`, and `npm run build`. `supabase/tests/onboarding_flow_content.sql` and `supabase/tests/onboarding_step_editor.sql` verify isolation, privileges, historical asset retention, transactional rollback, draft publication, removal, and stale-edit protection in an isolated database. Frontend tests cover drag-and-drop, preparation/cancellation, invalid uploads/links, separate flow drafts, content editing, PDF signing, page-review gates, and Yes/No transfer details. Release validation passed 678 frontend tests across 131 files, TypeScript checking, a production build, and both isolated SQL migration suites. Production smoke tests confirmed the public content endpoint, unauthenticated editor rejection (401), authenticated editor loading, staged PDF upload, and a successful 50 MiB synthetic video upload. Cancelling both staged uploads left the active content unchanged. The successful limit-size upload verifies that the 45 MiB compression target fits production Storage. No live agreement was signed or replaced during verification.
