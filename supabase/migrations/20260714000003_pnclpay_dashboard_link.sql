-- Connect PNCL Hub to pnclpay.com via the dashboard links CMS.
-- Admins can rename/move/unpublish it at /portal/admin/dashboard-tabs.
insert into portal_dashboard_links (section_id, title, description, href, external, icon, sort_order, published)
select 'pncl', 'PNCL Pay', 'Commission statements and pay portal.', 'https://pnclpay.com', true, 'DollarSign', 1, true
where exists (select 1 from portal_dashboard_sections where id = 'pncl')
  and not exists (
    select 1 from portal_dashboard_links where href = 'https://pnclpay.com'
  );
