create table if not exists portal_direct_deposit_forms (
  user_id uuid primary key references auth.users (id) on delete cascade,
  legal_name text not null,
  address_line1 text not null,
  city text not null,
  state text not null,
  zip text not null,
  account_type text not null check (account_type in ('checking', 'savings')),
  account_number_encrypted text not null,
  routing_number_encrypted text not null,
  signature_name text not null,
  signed_at timestamptz not null default now(),
  pdf_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_direct_deposit_forms_signed_at_idx
  on portal_direct_deposit_forms (signed_at desc);

alter table portal_direct_deposit_forms enable row level security;

create policy "Users can read own direct deposit form"
  on portal_direct_deposit_forms
  for select
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists portal_direct_deposit_forms_updated_at on portal_direct_deposit_forms;

create trigger portal_direct_deposit_forms_updated_at
before update on portal_direct_deposit_forms
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-profile-documents',
  'portal-profile-documents',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Users can read own profile documents" on storage.objects;
create policy "Users can read own profile documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Direct deposit is the second required setup step (after W-9).
do $$
begin
  if not exists (select 1 from portal_todos where slug = 'direct_deposit_setup') then
    update portal_todos set sort_order = sort_order + 1 where sort_order >= 1;
  end if;
end $$;

insert into portal_todos (
  slug,
  title,
  description,
  href,
  external,
  action_label,
  show_email_hint,
  sort_order,
  published
)
values (
  'direct_deposit_setup',
  'Set up direct deposit',
  'Submit your direct deposit request so PNCL can pay commissions straight to your bank account. A signed PDF is saved to your profile.',
  '/portal/direct-deposit',
  false,
  'Fill out direct deposit form',
  false,
  1,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  href = excluded.href,
  external = excluded.external,
  action_label = excluded.action_label,
  show_email_hint = excluded.show_email_hint,
  sort_order = excluded.sort_order,
  published = excluded.published,
  updated_at = now();
