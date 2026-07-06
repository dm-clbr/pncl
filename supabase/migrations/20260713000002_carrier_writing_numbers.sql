-- Writing numbers arrive with carrier welcome letters and are recorded
-- alongside the agent's carrier credentials.
alter table portal_carrier_credentials
  add column if not exists writing_number text not null default '';
