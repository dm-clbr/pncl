-- Licensing data agents record in PNCL Hub: NPN, E&O policy number,
-- additional state licenses, and a driver's license image.
alter table portal_profiles
  add column if not exists npn text,
  add column if not exists eo_policy_number text,
  add column if not exists state_licenses text[] not null default '{}'::text[],
  add column if not exists drivers_license_path text;

alter table onboarding_records
  add column if not exists drivers_license_path text;

-- Driver's license images live next to signed PDFs in the private buckets.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
where id in ('onboarding-documents', 'portal-profile-documents');

drop policy if exists "Users can upload own profile documents" on storage.objects;
create policy "Users can upload own profile documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own profile documents" on storage.objects;
create policy "Users can update own profile documents"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'portal-profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'portal-profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Backfill NPNs already collected during onboarding so the checklist
-- auto-completes for existing agents.
insert into portal_profiles (user_id, first_name, last_name, npn)
select distinct on (o.supabase_user_id)
  o.supabase_user_id::uuid,
  coalesce(o.first_name, ''),
  coalesce(o.last_name, ''),
  o.npn
from onboarding_records o
where o.supabase_user_id is not null
  and coalesce(o.npn, '') <> ''
  and exists (select 1 from auth.users u where u.id = o.supabase_user_id::uuid)
order by o.supabase_user_id, o.created_at desc
on conflict (user_id) do update
  set npn = coalesce(nullif(portal_profiles.npn, ''), excluded.npn);
