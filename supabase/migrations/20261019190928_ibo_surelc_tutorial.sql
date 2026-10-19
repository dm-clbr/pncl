-- Brandon's IBO walkthrough (Jordan's 4.7, 1080p website export).
-- Separate slugs keep the existing LOA completion from satisfying IBO playback.
-- Deploy the frontend's two-tutorial playback support before applying this data change.
do $$
begin
  if not exists (select 1 from public.portal_todos where slug = 'surelc_tutorial') then
    raise exception 'The existing LOA SureLC tutorial must be present';
  end if;
end $$;

insert into public.portal_todos (
  slug, title, description, href, external, action_label, show_email_hint,
  sort_order, published, phase, completion_type, gated, show_loa, show_ibo
)
select
  'surelc_tutorial_ibo',
  'Watch the IBO SureLC tutorial video',
  'Watch the full IBO SureLC walkthrough before creating your accounts or submitting carrier applications. The next steps unlock automatically when the video finishes. Keep the quick reference PDF handy while you complete your contracting.',
  'https://player.mediadelivery.net/embed/687293/16ccac46-8ef3-411f-a09d-ad27015174d3',
  true, 'Watch IBO SureLC walkthrough', false,
  sort_order, true, phase, 'agent', false, false, true
from public.portal_todos where slug = 'surelc_tutorial'
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  href = excluded.href,
  external = excluded.external,
  action_label = excluded.action_label,
  show_email_hint = excluded.show_email_hint,
  sort_order = excluded.sort_order,
  published = excluded.published,
  phase = excluded.phase,
  completion_type = excluded.completion_type,
  gated = excluded.gated,
  show_loa = excluded.show_loa,
  show_ibo = excluded.show_ibo,
  updated_at = now();

update public.portal_todos
set show_loa = true, show_ibo = false, updated_at = now()
where slug = 'surelc_tutorial';
