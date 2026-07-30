-- "Submit for New Producer" becomes its own stage between Licensing and Sales
-- Ready, so the action stands alone behind a confirmation warning instead of
-- sitting at the bottom of the licensing checklist.
alter table portal_todos drop constraint if exists portal_todos_phase_check;
alter table portal_todos add constraint portal_todos_phase_check
  check (phase in ('on_board', 'pre_license', 'licensing', 'new_producer', 'sales_ready'));

update portal_todos set phase = 'new_producer', updated_at = now()
  where slug = 'submit_new_producer';

-- Agents confirm which carriers they hold contracts with when they submit for
-- New Producer. Kept alongside the admin-set application status so admins can
-- compare what PNCL submitted against what the agent reports.
alter table portal_carrier_statuses
  add column if not exists contract_confirmed_at timestamptz;
