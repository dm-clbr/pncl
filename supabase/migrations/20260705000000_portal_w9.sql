create table if not exists portal_w9_forms (
  user_id uuid primary key references auth.users (id) on delete cascade,
  legal_name text not null,
  business_name text,
  tax_classification text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  zip text not null,
  tin_type text not null check (tin_type in ('ssn', 'ein')),
  tin_encrypted text not null,
  signature_name text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_w9_forms_signed_at_idx
  on portal_w9_forms (signed_at desc);

alter table portal_w9_forms enable row level security;

create policy "Users can read own W-9"
  on portal_w9_forms
  for select
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists portal_w9_forms_updated_at on portal_w9_forms;

create trigger portal_w9_forms_updated_at
before update on portal_w9_forms
for each row
execute function public.set_updated_at();

-- W-9 is the first required setup step for new agents.
do $$
begin
  if not exists (select 1 from portal_todos where slug = 'w9_setup') then
    update portal_todos set sort_order = sort_order + 1;
  end if;
end $$;

insert into portal_todos (
  slug,
  title,
  description,
  href,
  external,
  action_label,
  show_email_hint,
  sort_order,
  published
)
values (
  'w9_setup',
  'Complete your W-9 form',
  'Submit your IRS Form W-9 so PNCL can process commission payments. This is required before you can get started.',
  '/portal/w9',
  false,
  'Fill out W-9',
  false,
  0,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  href = excluded.href,
  external = excluded.external,
  action_label = excluded.action_label,
  show_email_hint = excluded.show_email_hint,
  sort_order = excluded.sort_order,
  published = excluded.published,
  updated_at = now();
