create table if not exists onboarding_contract_signatures (
  id uuid primary key default gen_random_uuid(),

  onboarding_id uuid references onboarding_records(id) on delete set null,

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

  created_at timestamptz not null default now()
);

create index if not exists onboarding_contract_signatures_onboarding_id_idx
  on onboarding_contract_signatures (onboarding_id);

create index if not exists onboarding_contract_signatures_unsigned_idx
  on onboarding_contract_signatures (signed_at desc)
  where onboarding_id is null;

create index if not exists onboarding_contract_signatures_personal_email_idx
  on onboarding_contract_signatures (personal_email);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'onboarding-documents',
  'onboarding-documents',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;
