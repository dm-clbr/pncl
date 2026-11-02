-- One-time content release: deploy and verify all PDF URLs before running.
-- Source: Donny McGinnis, "Fwd: Scripts for the HUB", 2026-11-02.
-- Keeps the existing Financial Inventory PDF and all previous Storage objects.
BEGIN;
LOCK TABLE public.portal_dashboard_files IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.portal_dashboard_files WHERE section_id = 'scripts') <> 6 THEN
    RAISE EXCEPTION 'Script inventory changed; review before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_dashboard_files WHERE id = '6c799d2f-236e-4c03-9d78-7e729da180a8' AND updated_at = '2026-08-11T18:14:25.347+00:00'::timestamptz) THEN
    RAISE EXCEPTION 'Script 6c799d2f-236e-4c03-9d78-7e729da180a8 changed; review before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_dashboard_files WHERE id = 'f0fab58e-5124-4114-b005-4ce479071be4' AND updated_at = '2026-08-11T18:14:26.331+00:00'::timestamptz) THEN
    RAISE EXCEPTION 'Script f0fab58e-5124-4114-b005-4ce479071be4 changed; review before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_dashboard_files WHERE id = 'b9ea3d06-58d6-41f7-81a9-c9f94fd47956' AND updated_at = '2026-08-11T18:14:27.268+00:00'::timestamptz) THEN
    RAISE EXCEPTION 'Script b9ea3d06-58d6-41f7-81a9-c9f94fd47956 changed; review before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_dashboard_files WHERE id = 'fd1d985b-3a05-4743-8ec2-d0d4492d5b61' AND updated_at = '2026-08-11T18:14:28.212+00:00'::timestamptz) THEN
    RAISE EXCEPTION 'Script fd1d985b-3a05-4743-8ec2-d0d4492d5b61 changed; review before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_dashboard_files WHERE id = 'e16eeb5f-8e64-4929-b4d5-68a8878d53f2' AND updated_at = '2026-08-11T18:14:29.207+00:00'::timestamptz) THEN
    RAISE EXCEPTION 'Script e16eeb5f-8e64-4929-b4d5-68a8878d53f2 changed; review before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_dashboard_files WHERE id = '3393729c-efbe-4bcd-956a-2aec7f98234e' AND updated_at = '2026-08-11T18:14:30.644+00:00'::timestamptz) THEN
    RAISE EXCEPTION 'Script 3393729c-efbe-4bcd-956a-2aec7f98234e changed; review before publishing';
  END IF;
END $$;
UPDATE public.portal_dashboard_files SET title = 'Dialing 123', url = 'https://www.thepncl.com/documents/scripts/2026-11-02/dialing-123.pdf', file_name = 'Dialing 123.pdf', content_type = 'application/pdf', sort_order = 0, published = true, updated_at = now() WHERE id = '6c799d2f-236e-4c03-9d78-7e729da180a8' AND section_id = 'scripts';
INSERT INTO public.portal_dashboard_files (section_id, title, url, file_name, content_type, sort_order, published) VALUES ('scripts', 'Tie Downs', 'https://www.thepncl.com/documents/scripts/2026-11-02/tie-downs.pdf', 'Tie Downs.pdf', 'application/pdf', 2, true);
INSERT INTO public.portal_dashboard_files (section_id, title, url, file_name, content_type, sort_order, published) VALUES ('scripts', 'Digital — Healthy Client', 'https://www.thepncl.com/documents/scripts/2026-11-02/healthy-client-digital.pdf', 'Healthy Client Digital.pdf', 'application/pdf', 3, true);
INSERT INTO public.portal_dashboard_files (section_id, title, url, file_name, content_type, sort_order, published) VALUES ('scripts', 'Digital — Sick Client', 'https://www.thepncl.com/documents/scripts/2026-11-02/sick-client-digital.pdf', 'Sick Client Digital.pdf', 'application/pdf', 4, true);
INSERT INTO public.portal_dashboard_files (section_id, title, url, file_name, content_type, sort_order, published) VALUES ('scripts', 'Digital — GIWL Client', 'https://www.thepncl.com/documents/scripts/2026-11-02/giwl-client-digital.pdf', 'GIWL Client Digital.pdf', 'application/pdf', 5, true);
INSERT INTO public.portal_dashboard_files (section_id, title, url, file_name, content_type, sort_order, published) VALUES ('scripts', 'Digital — Approval Call', 'https://www.thepncl.com/documents/scripts/2026-11-02/approval-call.pdf', 'Approval Call.pdf', 'application/pdf', 6, true);
UPDATE public.portal_dashboard_files SET title = 'Mail — Healthy Client', url = 'https://www.thepncl.com/documents/scripts/2026-11-02/mail-healthy-client.pdf', file_name = 'Mail-Healthy Client.pdf', content_type = 'application/pdf', sort_order = 7, published = true, updated_at = now() WHERE id = 'e16eeb5f-8e64-4929-b4d5-68a8878d53f2' AND section_id = 'scripts';
UPDATE public.portal_dashboard_files SET title = 'Mail — Sick Client', url = 'https://www.thepncl.com/documents/scripts/2026-11-02/mail-sick-client.pdf', file_name = 'Mail-Sick Client.pdf', content_type = 'application/pdf', sort_order = 8, published = true, updated_at = now() WHERE id = '3393729c-efbe-4bcd-956a-2aec7f98234e' AND section_id = 'scripts';
UPDATE public.portal_dashboard_files SET title = 'Mail — GIWL', url = 'https://www.thepncl.com/documents/scripts/2026-11-02/mail-giwl.pdf', file_name = 'Mail-GIWL.pdf', content_type = 'application/pdf', sort_order = 9, published = true, updated_at = now() WHERE id = 'fd1d985b-3a05-4743-8ec2-d0d4492d5b61' AND section_id = 'scripts';
UPDATE public.portal_dashboard_files SET title = 'Mail — Approval Call', url = 'https://www.thepncl.com/documents/scripts/2026-11-02/mail-approval-call.pdf', file_name = 'Mail-Approval Call.pdf', content_type = 'application/pdf', sort_order = 10, published = true, updated_at = now() WHERE id = 'b9ea3d06-58d6-41f7-81a9-c9f94fd47956' AND section_id = 'scripts';
INSERT INTO public.portal_dashboard_files (section_id, title, url, file_name, content_type, sort_order, published) VALUES ('scripts', 'FEX Inbound', 'https://www.thepncl.com/documents/scripts/2026-11-02/fex-inbound-script.pdf', 'FEX Inbound script.pdf', 'application/pdf', 11, true);
COMMIT;
