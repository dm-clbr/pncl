create table if not exists portal_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  shirt_size text,
  polo_shirt_size text,
  hoodie_size text,
  waist_size text,
  shoe_size text,
  profile_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_profiles_updated_at_idx
  on portal_profiles (updated_at desc);

alter table portal_profiles enable row level security;

drop policy if exists "Users can read own profile" on portal_profiles;
create policy "Users can read own profile"
  on portal_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile" on portal_profiles;
create policy "Users can insert own profile"
  on portal_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on portal_profiles;
create policy "Users can update own profile"
  on portal_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists portal_profiles_updated_at on portal_profiles;

create trigger portal_profiles_updated_at
before update on portal_profiles
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-profile-photos',
  'portal-profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read portal profile photos" on storage.objects;
create policy "Public read portal profile photos"
  on storage.objects
  for select
  to public
  using (bucket_id = 'portal-profile-photos');

drop policy if exists "Users can upload own profile photo" on storage.objects;
create policy "Users can upload own profile photo"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own profile photo" on storage.objects;
create policy "Users can update own profile photo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'portal-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'portal-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own profile photo" on storage.objects;
create policy "Users can delete own profile photo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'portal-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant select, insert, update on table public.portal_profiles to authenticated;
