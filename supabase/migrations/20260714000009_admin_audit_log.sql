-- Audit trail for sensitive admin edits (agent profile corrections etc.).
-- Written only by service-role edge functions.
create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  target_user_id uuid,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_user_id_idx
  on admin_audit_log (target_user_id);

alter table admin_audit_log enable row level security;
