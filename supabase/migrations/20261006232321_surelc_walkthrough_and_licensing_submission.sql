-- Brandon's SureLC onboarding update. Keep slugs/completion records intact.
update public.portal_todos
set sort_order = case slug
    when 'surelc_tutorial' then 18
    when 'surelc_account_1' then 19
    when 'surelc_account_2' then 20
    when 'surelc_account_3' then 21
  end,
  updated_at = now()
where slug in ('surelc_tutorial', 'surelc_account_1', 'surelc_account_2', 'surelc_account_3');

-- Retain the current Bunny URL until the final 3.0 upload is processed.
update public.portal_todos
set description = 'Watch the full SureLC walkthrough before creating your accounts or submitting carrier applications. The next steps unlock automatically when the video finishes.',
    action_label = 'Watch SureLC walkthrough',
    external = true,
    show_email_hint = false,
    updated_at = now()
where slug = 'surelc_tutorial';

-- The portal gates these steps on the tutorial, without forcing account 1/2/3
-- to be created sequentially. New Producer still requires every prior step.
update public.portal_todos
set gated = true, updated_at = now()
where slug in ('surelc_account_1', 'surelc_account_2', 'surelc_account_3', 'carrier_applications');

update public.portal_todos
set phase = 'licensing', updated_at = now()
where phase = 'new_producer';

update public.portal_todos
set description = 'MANDATORY - YOU WILL NOT GET ANY CARRIER CONTRACTS WITHOUT COMPLETING THIS STEP. Once every step above is complete, submit for New Producer. This notifies the PNCL team so your profile can be built in PLG''s back-end system.',
    action_label = 'Submit for New Producer',
    gated = true,
    sort_order = 23,
    updated_at = now()
where slug = 'submit_new_producer';
