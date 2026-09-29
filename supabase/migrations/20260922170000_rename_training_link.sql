-- The portal dashboard is database-driven in production. Rename the existing
-- internal training link without changing its destination or training content.
update public.portal_dashboard_links
set
  title = 'Video Trainings',
  updated_at = now()
where href = '/portal/disclosures'
  and lower(title) = 'pncl training';
