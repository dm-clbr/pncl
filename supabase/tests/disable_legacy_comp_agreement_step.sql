-- Run in an empty disposable PostgreSQL database. All documents are synthetic.
begin;
create table public.onboarding_signing_rollout (
  id boolean primary key, enabled boolean, revision integer,
  legacy_steps jsonb, legacy_ica_sources jsonb, updated_at timestamptz, updated_by uuid
);
insert into public.onboarding_signing_rollout values (
  true, false, 7,
  '[{"slug":"ica_setup","published":true,"show_loa":true,"show_ibo":true},
    {"slug":"comp_agreement","published":true,"show_loa":true,"show_ibo":false,"title":"Sign comp","flow_content":{"keep":"source"}},
    {"slug":"w9_setup","published":true,"show_loa":true,"show_ibo":false}]',
  '{"loa":"test-ica-source"}', '2026-01-01', null
);
create table public.portal_comp_attachments (id integer, status text, signed_pdf_path text);
insert into public.portal_comp_attachments values (1,'signed','test/signed.pdf'),(2,'pending',null);
create schema storage;
create table storage.objects (name text, metadata jsonb);
insert into storage.objects values ('test/signed.pdf','{"size":1234}');
create temp table before_retirement as select
  (select to_jsonb(r) from public.onboarding_signing_rollout r) as rollout,
  (select jsonb_agg(to_jsonb(a) order by id) from public.portal_comp_attachments a) as documents,
  (select jsonb_agg(to_jsonb(o) order by name) from storage.objects o) as files;

\ir ../migrations/20261113231124_disable_legacy_comp_agreement_step.sql
do $$
declare previous jsonb; current_row public.onboarding_signing_rollout;
begin
  select rollout into previous from before_retirement;
  select * into current_row from public.onboarding_signing_rollout where id=true;
  if current_row.legacy_steps is distinct from jsonb_set(previous->'legacy_steps','{1}',
    previous->'legacy_steps'->1 || '{"published":false,"show_loa":false,"show_ibo":false}'::jsonb)
    then raise exception 'Unexpected checklist change'; end if;
  if current_row.enabled or current_row.revision<>8 or current_row.legacy_ica_sources is distinct from previous->'legacy_ica_sources'
    then raise exception 'Unexpected rollout change'; end if;
  if (select jsonb_agg(to_jsonb(a) order by id) from public.portal_comp_attachments a) is distinct from (select documents from before_retirement)
    or (select jsonb_agg(to_jsonb(o) order by name) from storage.objects o) is distinct from (select files from before_retirement)
    then raise exception 'Existing records or PDFs were changed'; end if;
end $$;
\ir ../migrations/20261113231124_disable_legacy_comp_agreement_step.sql
do $$begin
  if (select revision from public.onboarding_signing_rollout where id=true)<>8 then raise exception 'Retirement is not idempotent'; end if;
  raise notice 'PASS: legacy comp disabled, other steps and PDFs preserved, repeat is a no-op';
end $$;
rollback;
