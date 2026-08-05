-- Additional state licensing should begin only after the agent has been
-- submitted as a New Producer. Keep it first in Sales Ready so agents see it
-- as soon as that stage unlocks.
update portal_todos
set phase = 'sales_ready', sort_order = 24, updated_at = now()
where slug = 'additional_state_licenses';
