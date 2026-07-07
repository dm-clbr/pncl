-- "Pay & Commissions" CMS: policies and FAQs that Bill/Matt can edit from the
-- admin console without a deploy. Agents read published entries directly
-- (RLS); admin writes go through service-role edge functions.
create table if not exists portal_pay_policy_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  category text not null default 'policy',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_pay_policy_entries drop constraint if exists portal_pay_policy_entries_category_check;
alter table portal_pay_policy_entries add constraint portal_pay_policy_entries_category_check
  check (category in ('policy', 'faq'));

drop trigger if exists portal_pay_policy_entries_updated_at on portal_pay_policy_entries;
create trigger portal_pay_policy_entries_updated_at
before update on portal_pay_policy_entries
for each row
execute function public.set_updated_at();

alter table portal_pay_policy_entries enable row level security;

drop policy if exists "Authenticated users can view published pay policy entries" on portal_pay_policy_entries;
create policy "Authenticated users can view published pay policy entries"
  on portal_pay_policy_entries
  for select
  to authenticated
  using (published);

-- Surface the page on the agent dashboard via the links CMS.
insert into portal_dashboard_links (section_id, title, description, href, external, icon, sort_order, published)
select 'pncl', 'Pay & Commissions', 'How you get paid: policies, examples, and FAQs.', '/portal/pay-policy', false, 'DollarSign', 3, true
where exists (select 1 from portal_dashboard_sections where id = 'pncl')
  and not exists (
    select 1 from portal_dashboard_links where href = '/portal/pay-policy'
  );
