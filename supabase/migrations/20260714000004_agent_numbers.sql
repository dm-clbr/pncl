-- Unique auto-assigned agent number (rendered as PNCL-00001) so production
-- can be mapped to agents before an NPN exists (e.g. setters).
create sequence if not exists portal_agent_number_seq;

alter table portal_profiles
  add column if not exists agent_number integer;

-- Backfill existing profiles in creation order.
update portal_profiles p
set agent_number = sub.rn
from (
  select user_id, row_number() over (order by created_at, user_id) as rn
  from portal_profiles
) sub
where p.user_id = sub.user_id
  and p.agent_number is null;

select setval(
  'portal_agent_number_seq',
  coalesce((select max(agent_number) from portal_profiles), 0) + 1,
  false
);

alter table portal_profiles
  alter column agent_number set default nextval('portal_agent_number_seq');

create unique index if not exists portal_profiles_agent_number_idx
  on portal_profiles (agent_number);
