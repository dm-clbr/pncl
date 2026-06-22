alter table portal_dashboard_sections
  add column if not exists section_type text not null default 'links';

alter table portal_dashboard_sections
  drop constraint if exists portal_dashboard_sections_section_type_check;

alter table portal_dashboard_sections
  add constraint portal_dashboard_sections_section_type_check
  check (section_type in ('links', 'incentives', 'brand_assets'));

insert into portal_dashboard_sections (id, title, sort_order, published, section_type)
values
  ('incentives', 'Incentives', 4, true, 'incentives'),
  ('brand-assets', 'Brand assets', 5, true, 'brand_assets')
on conflict (id) do update set
  title = excluded.title,
  sort_order = excluded.sort_order,
  published = excluded.published,
  section_type = excluded.section_type;
