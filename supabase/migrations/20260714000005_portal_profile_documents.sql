-- Generic "My documents" uploads on the agent profile (licenses, certs,
-- anything an admin asks for). Files live in the private
-- portal-profile-documents bucket under {user_id}/documents/.
create table if not exists portal_profile_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  file_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists portal_profile_documents_user_id_idx
  on portal_profile_documents (user_id);

alter table portal_profile_documents enable row level security;

drop policy if exists "Users can view own profile document records" on portal_profile_documents;
create policy "Users can view own profile document records"
  on portal_profile_documents
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can add own profile document records" on portal_profile_documents;
create policy "Users can add own profile document records"
  on portal_profile_documents
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own profile document records" on portal_profile_documents;
create policy "Users can delete own profile document records"
  on portal_profile_documents
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Agents could already upload/read their own files; allow removing them too.
drop policy if exists "Users can delete own profile documents" on storage.objects;
create policy "Users can delete own profile documents"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'portal-profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
