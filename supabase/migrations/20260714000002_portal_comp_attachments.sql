-- Comp attachments assigned by admins and signed by agents in the portal
-- (replaces sending DocuSign comp attachments by email).
create table if not exists portal_comp_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Compensation Attachment',
  unsigned_pdf_path text not null,
  signed_pdf_path text,
  status text not null default 'pending',
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  signature_name text,
  signed_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_comp_attachments drop constraint if exists portal_comp_attachments_status_check;
alter table portal_comp_attachments add constraint portal_comp_attachments_status_check
  check (status in ('pending', 'signed'));

create index if not exists portal_comp_attachments_user_id_idx
  on portal_comp_attachments (user_id);

-- Access goes through service-role edge functions only.
alter table portal_comp_attachments enable row level security;

-- Point the existing checklist item at the in-portal signing page.
update portal_todos
set
  href = '/portal/comp-agreement',
  external = false,
  action_label = 'Review & sign',
  description = 'Sign your compensation attachment in PNCL Hub so we know how to pay you. PNCL assigns this document after your ICA is signed.',
  updated_at = now()
where slug = 'comp_agreement';
