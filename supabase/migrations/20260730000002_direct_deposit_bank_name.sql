-- Capture the bank name on direct deposit requests so accounting can match
-- the routing number to an institution without a lookup.
alter table portal_direct_deposit_forms
  add column if not exists bank_name text;
