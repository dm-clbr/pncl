-- Contracting workflow markers: when admins were notified that an agent
-- finished licensing inputs (NPN + E&O), when contracting was initiated, and
-- when admins were notified of a portal ICA signature.
alter table portal_profiles
  add column if not exists licensing_notification_sent_at timestamptz,
  add column if not exists contracting_initiated_at timestamptz,
  add column if not exists contracting_initiated_by uuid;

alter table portal_ica_signatures
  add column if not exists admin_notification_sent_at timestamptz;
