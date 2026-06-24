alter table portal_w9_forms
  add column if not exists has_foreign_partners boolean not null default false,
  add column if not exists exempt_payee_code text,
  add column if not exists fatca_exemption_code text,
  add column if not exists account_numbers text;
