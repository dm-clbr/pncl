-- Authoritative PNCL operating availability by U.S. state.
-- All states start Inactive until a full admin records PNCL's real status.
create table if not exists public.portal_state_availability (
  state_code text primary key,
  state_name text not null unique,
  status text not null default 'Inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint portal_state_availability_state_code_valid check (
    state_code in (
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    )
  ),
  constraint portal_state_availability_status_valid check (
    status in ('Active', 'Pending', 'Inactive')
  )
);

comment on table public.portal_state_availability is
  'Company-wide PNCL operating availability for each of the 50 U.S. states.';

comment on column public.portal_state_availability.status is
  'One of Active, Pending, or Inactive. This is company availability, not an individual agent license status.';

insert into public.portal_state_availability (state_code, state_name, status)
values
  ('AL', 'Alabama', 'Inactive'),
  ('AK', 'Alaska', 'Inactive'),
  ('AZ', 'Arizona', 'Inactive'),
  ('AR', 'Arkansas', 'Inactive'),
  ('CA', 'California', 'Inactive'),
  ('CO', 'Colorado', 'Inactive'),
  ('CT', 'Connecticut', 'Inactive'),
  ('DE', 'Delaware', 'Inactive'),
  ('FL', 'Florida', 'Inactive'),
  ('GA', 'Georgia', 'Inactive'),
  ('HI', 'Hawaii', 'Inactive'),
  ('ID', 'Idaho', 'Inactive'),
  ('IL', 'Illinois', 'Inactive'),
  ('IN', 'Indiana', 'Inactive'),
  ('IA', 'Iowa', 'Inactive'),
  ('KS', 'Kansas', 'Inactive'),
  ('KY', 'Kentucky', 'Inactive'),
  ('LA', 'Louisiana', 'Inactive'),
  ('ME', 'Maine', 'Inactive'),
  ('MD', 'Maryland', 'Inactive'),
  ('MA', 'Massachusetts', 'Inactive'),
  ('MI', 'Michigan', 'Inactive'),
  ('MN', 'Minnesota', 'Inactive'),
  ('MS', 'Mississippi', 'Inactive'),
  ('MO', 'Missouri', 'Inactive'),
  ('MT', 'Montana', 'Inactive'),
  ('NE', 'Nebraska', 'Inactive'),
  ('NV', 'Nevada', 'Inactive'),
  ('NH', 'New Hampshire', 'Inactive'),
  ('NJ', 'New Jersey', 'Inactive'),
  ('NM', 'New Mexico', 'Inactive'),
  ('NY', 'New York', 'Inactive'),
  ('NC', 'North Carolina', 'Inactive'),
  ('ND', 'North Dakota', 'Inactive'),
  ('OH', 'Ohio', 'Inactive'),
  ('OK', 'Oklahoma', 'Inactive'),
  ('OR', 'Oregon', 'Inactive'),
  ('PA', 'Pennsylvania', 'Inactive'),
  ('RI', 'Rhode Island', 'Inactive'),
  ('SC', 'South Carolina', 'Inactive'),
  ('SD', 'South Dakota', 'Inactive'),
  ('TN', 'Tennessee', 'Inactive'),
  ('TX', 'Texas', 'Inactive'),
  ('UT', 'Utah', 'Inactive'),
  ('VT', 'Vermont', 'Inactive'),
  ('VA', 'Virginia', 'Inactive'),
  ('WA', 'Washington', 'Inactive'),
  ('WV', 'West Virginia', 'Inactive'),
  ('WI', 'Wisconsin', 'Inactive'),
  ('WY', 'Wyoming', 'Inactive')
on conflict (state_code) do nothing;

drop trigger if exists portal_state_availability_updated_at
on public.portal_state_availability;

create trigger portal_state_availability_updated_at
before update on public.portal_state_availability
for each row
execute function public.set_updated_at();

alter table public.portal_state_availability enable row level security;

drop policy if exists "Authenticated portal users can read state availability"
on public.portal_state_availability;

create policy "Authenticated portal users can read state availability"
on public.portal_state_availability
for select
to authenticated
using ((select auth.uid()) is not null);

-- Writes are intentionally service-role only. The admin Edge Function performs
-- a fresh full-admin check before using its service-role client.
revoke all on table public.portal_state_availability from anon, authenticated;
grant select (state_code, state_name, status, created_at, updated_at)
on table public.portal_state_availability to authenticated;
grant select, insert, update, delete on table public.portal_state_availability to service_role;
