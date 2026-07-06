-- The invite / Hub account / PNCL email steps happen automatically during
-- onboarding, so they are always complete and add no value on the checklist.
delete from portal_todos
where slug in ('invite_sent', 'hub_account', 'pncl_email');
