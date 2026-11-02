# Hub scripts and carrier updates

Source requests: Donny McGinnis's November 2 "Fwd: Scripts for the HUB" and Jordan Bailey's October 30 "Hub fix: SureLC pop-up carrier lists".

The SureLC warning loads the published Carrier Sheet when opened from either the onboarding checklist or profile. Account membership comes from the sheet's SureLC section. Removed carriers are not restored from a hardcoded fallback. Loading, failed requests, and empty account lists cannot proceed with an unverified carrier list; failed requests offer retry. CICA, Ethos, and United Home Life remain automatic email-link carriers.

The homepage carrier list removes Liberty Bankers and Royal Neighbors.

The eleven PDFs under `public/documents/scripts/2026-11-02/` are unchanged email attachments. Five replace existing script entries; six add the Digital set, Tie Downs, and FEX Inbound. The Financial Inventory script remains published. Original Supabase Storage files are retained.

Publish the frontend and PDF assets first. Verify each deployed PDF against the local file, then run `scripts/publish-hub-scripts-20261102.sql` against PNCL db (`dpnajpojbxgsckwrmvnm`). It changes only Scripts entries and aborts if their inventory or revision timestamps changed since review. It is a one-time release script, not a schema migration.

The October 22 LOA/IBO walkthrough request is already reflected in production: separate videos and reference PDFs were published October 31, with checklist content updated November 1. Preserve those newer admin-managed assets.

Validation: 31 focused tests passed, including both LOA/IBO onboarding journeys, profile links, carrier reassignment/removal, failed loading, and retry. TypeScript, targeted ESLint, and production build passed. All eleven PDFs parsed successfully (70 pages total); downloaded bytes matched email attachment sizes. The build retains the existing large-chunk warning.
