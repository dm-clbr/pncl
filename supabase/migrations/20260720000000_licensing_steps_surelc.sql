-- Licensing steps rework (worklist "Modify licensing steps"):
--   1-3. NPN / E&O steps unchanged.
--   4.   Create 3 SureLC accounts (one step per account, punch-out links).
--   5.   Watch the SureLC tutorial video (video link added later via admin to-dos).
--   6.   Submit applications for recommended carriers per SureLC account.
--   7.   Submit for New Producer — gated until steps 1-6 are complete; completing
--        it notifies admins so the agent's PLG back-end profile can be built.
--   8.   Apply for additional state licenses (unchanged).

-- Per-step gating: a gated step is visible but locked until every earlier step
-- in the same stage is complete.
alter table portal_todos
  add column if not exists gated boolean not null default false;

-- Dedupe guard for the "Submit for New Producer" admin notification.
alter table portal_profiles
  add column if not exists new_producer_notification_sent_at timestamptz;

-- Make room: push sales-ready steps (sort_order 22+) down by 6.
update portal_todos set sort_order = sort_order + 6, updated_at = now()
  where sort_order >= 22;

-- Retire the old SureLC admin-managed steps (hidden, completion data kept).
update portal_todos set published = false, updated_at = now()
  where slug in ('sure_lc_profile', 'sure_lc_validation', 'request_carrier_assignments');

-- Keep "Apply for additional state licenses" as-is, last in the licensing stage.
update portal_todos set sort_order = 24, updated_at = now()
  where slug = 'additional_state_licenses';

insert into portal_todos (
  slug, title, description, href, external, action_label, show_email_hint,
  sort_order, published, phase, completion_type, auto_key, gated
)
values
  (
    'surelc_account_1',
    'Create SureLC account #1 — "Basso Montemurro"',
    'Create your first SureLC producer account under the "Basso Montemurro" branch. Use the link below to punch out to SureLC and complete your contact info.',
    'https://accounts.surancebay.com/oauth/authorize?redirect_uri=https:%2F%2Fsurelc.surancebay.com%2Fproducer%2Foauth%3FreturnUrl%3D%252Fprofile%252Fcontact-info%253FgaId%253D323%2526branch%253DBasso-Montemurro&gaId=323&client_id=surecrmweb&response_type=code',
    true, 'Open SureLC #1', false, 18, true, 'licensing', 'agent', null, false
  ),
  (
    'surelc_account_2',
    'Create SureLC account #2 — "The Pinnacle Life Group"',
    'Create your second SureLC producer account under the "The Pinnacle Life Group" branch. Use the link below to punch out to SureLC and complete your contact info.',
    'https://accounts.surancebay.com/oauth/authorize?redirect_uri=https:%2F%2Fsurelc.surancebay.com%2Fproducer%2Foauth%3FreturnUrl%3D%252Fprofile%252Fcontact-info%253FgaId%253D233%2526gaId%253D233%2526branch%253DJoe%252520Basso%2526branchVisible%253Dtrue%2526branchEditable%253Dfalse%2526branchRequired%253Dtrue%2526autoAdd%253Dfalse%2526requestMethod%253DGET&gaId=233&client_id=surecrmweb&response_type=code',
    true, 'Open SureLC #2', false, 19, true, 'licensing', 'agent', null, false
  ),
  (
    'surelc_account_3',
    'Create SureLC account #3 — "Pinnacle Life Group"',
    'Create your third SureLC producer account under the "Pinnacle Life Group" branch. Use the link below to punch out to SureLC and complete your contact info.',
    'https://accounts.surancebay.com/oauth/authorize?redirect_uri=https:%2F%2Fsurelc.surancebay.com%2Fproducer%2Foauth%3FreturnUrl%3D%252Fprofile%252Fcontact-info%253FgaId%253D1313%2526gaId%253D1313%2526branchVisible%253Dtrue%2526branchEditable%253Dfalse%2526branchRequired%253Dtrue%2526autoAdd%253Dfalse%2526requestMethod%253DGET&gaId=1313&client_id=surecrmweb&response_type=code',
    true, 'Open SureLC #3', false, 20, true, 'licensing', 'agent', null, false
  ),
  (
    'surelc_tutorial',
    'Watch the SureLC tutorial video',
    'Watch the short tutorial video on how to apply for carriers through SureLC before submitting your applications.',
    '', false, '', false, 21, true, 'licensing', 'agent', null, false
  ),
  (
    'carrier_applications',
    'Submit applications for recommended carriers',
    E'Submit carrier applications in each SureLC account:\n• SureLC #1, "Basso Montemurro": Mutual of Omaha, TransAmerica, Kansas City Life, Liberty Bankers, American General Life, American Home Life, Royal Neighbors\n• SureLC #2, "The Pinnacle Life Group": Banner (Beyond Term), Fidelity & Guaranty\n• SureLC #3, "Pinnacle Life Group": Foresters\n• Ethos will happen automatically — no action needed.',
    '', false, '', false, 22, true, 'licensing', 'agent', null, false
  ),
  (
    'submit_new_producer',
    'Submit for New Producer',
    'Once every step above is complete, submit for New Producer. This notifies the PNCL team so your profile can be built in PLG''s back-end system.',
    '', false, '', false, 23, true, 'licensing', 'agent', null, true
  )
on conflict (slug) do nothing;
