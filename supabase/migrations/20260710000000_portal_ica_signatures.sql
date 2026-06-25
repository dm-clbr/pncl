create table if not exists portal_ica_signatures (
  user_id uuid primary key references auth.users (id) on delete cascade,

  legal_name text not null,
  personal_email text not null,
  signature_name text not null,
  ica_version text not null default '2026-standard',

  debit_check_initials jsonb not null default '{}'::jsonb,

  agreement_accepted boolean not null default false,
  counsel_acknowledged boolean not null default false,

  signed_at timestamptz not null default now(),
  pdf_path text not null,

  ip_address text,
  user_agent text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_ica_signatures_signed_at_idx
  on portal_ica_signatures (signed_at desc);

alter table portal_ica_signatures enable row level security;

create policy "Users can read own ICA signature"
  on portal_ica_signatures
  for select
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists portal_ica_signatures_updated_at on portal_ica_signatures;

create trigger portal_ica_signatures_updated_at
before update on portal_ica_signatures
for each row
execute function public.set_updated_at();
