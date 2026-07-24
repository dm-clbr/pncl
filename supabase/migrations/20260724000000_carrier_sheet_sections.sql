-- Carrier sheet rework: group carriers into SureLC-account sections and trim
-- the list to the current recommended carriers. Carriers no longer offered are
-- unpublished (not deleted) so existing credential/status rows are preserved.

alter table portal_carriers
  add column if not exists section text not null default '';

-- Section 1: SureLC #1 — "Basso Montemurro"
update portal_carriers set
  carrier = 'American Amicable',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 0, published = true, updated_at = now()
where carrier ilike 'american am%icable%';

update portal_carriers set
  carrier = 'American General Life (AIG/Corebridge)',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 1, published = true, updated_at = now()
where carrier ilike 'american general%' or carrier ilike '%corebridge%';

update portal_carriers set
  carrier = 'American Home Life',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 2, published = true, updated_at = now()
where carrier ilike 'american home life%';

update portal_carriers set
  carrier = 'Liberty Bankers Life',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 3, published = true, updated_at = now()
where carrier ilike 'liberty bankers%';

update portal_carriers set
  carrier = 'Mutual of Omaha',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 4, published = true, updated_at = now()
where carrier ilike 'mutual of omaha%';

update portal_carriers set
  carrier = 'Royal Neighbors',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 5, published = true, updated_at = now()
where carrier ilike 'royal neighbors%';

update portal_carriers set
  carrier = 'TransAmerica',
  section = 'SureLC #1 — "Basso Montemurro"',
  sort_order = 6, published = true, updated_at = now()
where carrier ilike 'transamerica%';

-- Section 2: SureLC #2 — "The Pinnacle Life Group"
update portal_carriers set
  carrier = 'Banner - Beyond Term',
  section = 'SureLC #2 — "The Pinnacle Life Group"',
  sort_order = 7, published = true, updated_at = now()
where carrier ilike 'banner%';

update portal_carriers set
  carrier = 'Fidelity & Guaranty',
  section = 'SureLC #2 — "The Pinnacle Life Group"',
  sort_order = 8, published = true, updated_at = now()
where carrier ilike 'f&g%' or carrier ilike 'fidelity%';

-- Section 3: SureLC #3 — "Pinnacle Life Group"
update portal_carriers set
  carrier = 'AuguStar',
  section = 'SureLC #3 — "Pinnacle Life Group"',
  sort_order = 9, published = true, updated_at = now()
where carrier ilike 'augustar%';

update portal_carriers set
  carrier = 'Foresters',
  section = 'SureLC #3 — "Pinnacle Life Group"',
  sort_order = 10, published = true, updated_at = now()
where carrier ilike 'for%esters%';

update portal_carriers set
  carrier = 'Kansas City Life',
  section = 'SureLC #3 — "Pinnacle Life Group"',
  sort_order = 11, published = true, updated_at = now()
where carrier ilike 'kansas city life%';

-- Section 4: Automatic
update portal_carriers set
  carrier = 'Ethos',
  section = 'Automatic',
  sort_order = 12, published = true, updated_at = now()
where carrier ilike 'ethos%';

update portal_carriers set
  carrier = 'United Home Life',
  section = 'Automatic',
  sort_order = 13, published = true, updated_at = now()
where carrier ilike 'united home life%';

-- Insert carriers that don't exist yet.
insert into portal_carriers (carrier, company_number, e_app_label, e_app_url, section, sort_order, published)
select 'AuguStar', '', '', null, 'SureLC #3 — "Pinnacle Life Group"', 9, true
where not exists (select 1 from portal_carriers where carrier = 'AuguStar');

insert into portal_carriers (carrier, company_number, e_app_label, e_app_url, section, sort_order, published)
select 'United Home Life', '', '', null, 'Automatic', 13, true
where not exists (select 1 from portal_carriers where carrier = 'United Home Life');

-- Hide everything that isn't part of the new sectioned list
-- (e.g. COMBINE, NLG, North American Company).
update portal_carriers set published = false, updated_at = now()
where section = '';
