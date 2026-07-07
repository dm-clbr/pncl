-- Contracting needs the agent's home address and county (alongside the
-- driver's license already collected). Store on onboarding and sync to the
-- portal profile. Also add a slot for the agent's E&O certificate upload.
alter table onboarding_records
  add column if not exists address_line1 text,
  add column if not exists address_city text,
  add column if not exists address_zip text,
  add column if not exists county text;

alter table portal_profiles
  add column if not exists address_line1 text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists county text,
  add column if not exists eo_certificate_path text;
