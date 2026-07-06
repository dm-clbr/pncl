-- Phased onboarding checklist: group todos into the four onboarding phases and
-- track how each item is completed (auto-detected, agent check-off, or admin).
alter table portal_todos
  add column if not exists phase text not null default 'on_board',
  add column if not exists completion_type text not null default 'agent',
  add column if not exists auto_key text;

alter table portal_todos drop constraint if exists portal_todos_phase_check;
alter table portal_todos add constraint portal_todos_phase_check
  check (phase in ('on_board', 'pre_license', 'licensing', 'sales_ready'));

alter table portal_todos drop constraint if exists portal_todos_completion_type_check;
alter table portal_todos add constraint portal_todos_completion_type_check
  check (completion_type in ('auto', 'agent', 'admin'));

-- Re-home the existing todos into their phases and the sheet order.
update portal_todos set phase = 'on_board', completion_type = 'auto', auto_key = 'ica', sort_order = 3, updated_at = now()
  where slug = 'ica_setup';
update portal_todos set phase = 'on_board', completion_type = 'auto', auto_key = 'w9', sort_order = 6, updated_at = now()
  where slug = 'w9_setup';
update portal_todos set phase = 'on_board', completion_type = 'auto', auto_key = 'direct_deposit', sort_order = 7, updated_at = now()
  where slug = 'direct_deposit_setup';
update portal_todos set phase = 'sales_ready', completion_type = 'agent', auto_key = null, sort_order = 27, updated_at = now()
  where slug = 'discord_account';
update portal_todos set phase = 'sales_ready', completion_type = 'agent', auto_key = null, sort_order = 28, updated_at = now()
  where slug = 'leadspply_account';
update portal_todos set phase = 'sales_ready', completion_type = 'agent', auto_key = null, sort_order = 29, updated_at = now()
  where slug = 'instagram_follow';
update portal_todos set phase = 'sales_ready', completion_type = 'agent', auto_key = null, sort_order = 30, updated_at = now()
  where slug = 'linkedin_follow';
update portal_todos set phase = 'sales_ready', completion_type = 'agent', auto_key = null, sort_order = 31, updated_at = now()
  where slug = 'facebook_follow';

-- Seed the full 29-step onboarding journey (existing slugs untouched).
insert into portal_todos (
  slug, title, description, href, external, action_label, show_email_hint,
  sort_order, published, phase, completion_type, auto_key
)
values
  (
    'invite_sent',
    'Get your PNCL invite',
    'Your PNCL recruiter sends you an invite to start onboarding. This is completed automatically when you join.',
    '', false, '', false, 0, true, 'on_board', 'auto', 'account_created'
  ),
  (
    'hub_account',
    'PNCL Hub account creation',
    'Your PNCL Hub account is created automatically when you complete onboarding.',
    '', false, '', false, 1, true, 'on_board', 'auto', 'account_created'
  ),
  (
    'pncl_email',
    'PNCL email created',
    'Your @thepncl.com email is created automatically when you complete onboarding.',
    '', false, '', false, 2, true, 'on_board', 'auto', 'account_created'
  ),
  (
    'profile_setup',
    'Complete your profile',
    'Provide all the required information — your name MUST be your legal name. Add a profile photo and keep your details current.',
    '/portal/profile', false, 'Go to profile', false, 4, true, 'on_board', 'auto', 'profile'
  ),
  (
    'drivers_license',
    'Upload your driver''s license',
    'Upload a clear and legible image of your driver''s license to your profile.',
    '/portal/profile', false, 'Upload driver''s license', false, 5, true, 'on_board', 'auto', 'drivers_license'
  ),
  (
    'comp_agreement',
    'Sign your comp agreement',
    'Sign your compensation attachment so we know how to pay you. PNCL will provide this document.',
    '', false, '', false, 8, true, 'on_board', 'agent', null
  ),
  (
    'disclosures',
    'Watch the disclosures',
    'Watch the short video modules and agree that you will comply with all state/national regulations.',
    '', false, '', false, 9, true, 'on_board', 'agent', null
  ),
  (
    'exam_study_tools',
    'Exam study tools',
    'Use this free training resource to prepare for your exam — use the code "Quantum25".',
    '', false, '', false, 10, true, 'pre_license', 'agent', null
  ),
  (
    'schedule_exam',
    'Schedule your exam',
    'Schedule your exam at a local facility or online through NIPR.com or Prometric.',
    'https://nipr.com', true, 'Go to NIPR', false, 11, true, 'pre_license', 'agent', null
  ),
  (
    'take_exam',
    'Take your exam',
    'Good luck!',
    '', false, '', false, 12, true, 'pre_license', 'agent', null
  ),
  (
    'fingerprints',
    'Complete fingerprinting',
    'On-site facilities will complete this when you take your test. If you take it online, you need to schedule fingerprints separately.',
    '', false, '', false, 13, true, 'pre_license', 'agent', null
  ),
  (
    'apply_license',
    'Apply for your license (NPN)',
    'Apply for your "Individual" license at NIPR.com.',
    'https://nipr.com', true, 'Apply at NIPR', false, 14, true, 'pre_license', 'agent', null
  ),
  (
    'record_npn',
    'Record your NPN in PNCL Hub',
    'Add your NPN to your profile as soon as you have it.',
    '/portal/profile', false, 'Add NPN to profile', false, 15, true, 'licensing', 'auto', 'npn'
  ),
  (
    'eo_insurance',
    'Get E&O insurance',
    'Purchase E&O coverage at NAPA-Benefits.com — you will need the "Newly Licensed <2 yrs." option, and select "Option A".',
    'https://www.napa-benefits.com', true, 'Go to NAPA Benefits', false, 16, true, 'licensing', 'agent', null
  ),
  (
    'record_eo_policy',
    'Record your E&O policy number in PNCL Hub',
    'Add your errors and omissions policy number to your profile.',
    '/portal/profile', false, 'Add E&O policy number', false, 17, true, 'licensing', 'auto', 'eo_policy'
  ),
  (
    'sure_lc_profile',
    'Sure LC profile',
    'PNCL Admin team will complete this step for you.',
    '', false, '', false, 18, true, 'licensing', 'admin', null
  ),
  (
    'sure_lc_validation',
    'Validate your Sure LC emails (3x)',
    'You will receive three validation emails from Sure LC. Validate each link independently so our admins can submit for carrier assignments.',
    '', false, '', false, 19, true, 'licensing', 'agent', null
  ),
  (
    'request_carrier_assignments',
    'Request carrier assignments',
    'PNCL Admin team will complete this step for you.',
    '', false, '', false, 20, true, 'licensing', 'admin', null
  ),
  (
    'additional_state_licenses',
    'Apply for additional state licenses',
    'Apply for additional states so you can get leads and sell in more areas than your resident state. Apply at NIPR.com.',
    'https://nipr.com', true, 'Go to NIPR', false, 21, true, 'licensing', 'agent', null
  ),
  (
    'record_state_licenses',
    'Update your profile with new state licenses',
    'Add states in your profile as you get additional licenses.',
    '/portal/profile', false, 'Add state licenses', false, 22, true, 'sales_ready', 'auto', 'state_licenses'
  ),
  (
    'receive_carrier_assignments',
    'Receive carrier assignments',
    'Keep an eye on your email for welcome letters with writing numbers from each carrier. This can take 3 days to 3 weeks.',
    '', false, '', false, 23, true, 'sales_ready', 'agent', null
  ),
  (
    'record_writing_numbers',
    'Record your carrier writing numbers',
    'Add writing numbers to your profile as you get them.',
    '/portal/profile', false, 'Add writing numbers', false, 24, true, 'sales_ready', 'auto', 'writing_numbers'
  ),
  (
    'create_carrier_credentials',
    'Create carrier credentials',
    'Use your writing numbers to create a login for each carrier so you can quote and write business.',
    '', false, '', false, 25, true, 'sales_ready', 'agent', null
  ),
  (
    'record_carrier_credentials',
    'Enter carrier credentials into PNCL Hub',
    'Add each carrier login (username and password) to your profile for easy documentation.',
    '/portal/profile', false, 'Add carrier credentials', false, 26, true, 'sales_ready', 'auto', 'carrier_credentials'
  )
on conflict (slug) do nothing;
