-- Support tickets: agents raise hierarchy changes, pay tier questions,
-- commission disputes, etc.; admins work them from a queue.
create table if not exists portal_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'other',
  subject text not null,
  description text not null,
  status text not null default 'open',
  assigned_to uuid,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_tickets drop constraint if exists portal_tickets_type_check;
alter table portal_tickets add constraint portal_tickets_type_check
  check (type in ('hierarchy_change', 'pay_tier', 'commission_dispute', 'other'));

alter table portal_tickets drop constraint if exists portal_tickets_status_check;
alter table portal_tickets add constraint portal_tickets_status_check
  check (status in ('open', 'in_progress', 'resolved'));

create index if not exists portal_tickets_user_id_idx on portal_tickets (user_id);
create index if not exists portal_tickets_status_idx on portal_tickets (status);

drop trigger if exists portal_tickets_updated_at on portal_tickets;
create trigger portal_tickets_updated_at
before update on portal_tickets
for each row
execute function public.set_updated_at();

-- Access goes through service-role edge functions only.
alter table portal_tickets enable row level security;

-- Surface the support page on the agent dashboard via the links CMS.
insert into portal_dashboard_links (section_id, title, description, href, external, icon, sort_order, published)
select 'pncl', 'Support tickets', 'Request hierarchy changes, dispute commissions, or ask PNCL a question.', '/portal/support', false, 'LifeBuoy', 2, true
where exists (select 1 from portal_dashboard_sections where id = 'pncl')
  and not exists (
    select 1 from portal_dashboard_links where href = '/portal/support'
  );
