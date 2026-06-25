-- ICA signing is the first required setup step for portal agents.
do $$
begin
  if not exists (select 1 from portal_todos where slug = 'ica_setup') then
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
  'ica_setup',
  'Sign your Independent Contractor Agreement',
  'Review and sign the PNCL Independent Contractor Agreement. A signed PDF is saved to your profile and is required before you can get started.',
  '/portal/ica',
  false,
  'Review and sign agreement',
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
