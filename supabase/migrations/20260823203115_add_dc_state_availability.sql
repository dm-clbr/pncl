-- Add Washington, D.C. as a supported state-availability jurisdiction without
-- changing any existing company availability values.
alter table public.portal_state_availability
drop constraint if exists portal_state_availability_state_code_valid;

alter table public.portal_state_availability
add constraint portal_state_availability_state_code_valid check (
  state_code in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  )
) not valid;

alter table public.portal_state_availability
validate constraint portal_state_availability_state_code_valid;

insert into public.portal_state_availability (state_code, state_name, status)
values ('DC', 'District of Columbia', 'Inactive')
on conflict (state_code) do nothing;
