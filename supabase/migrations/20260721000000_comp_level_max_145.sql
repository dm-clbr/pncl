-- Extend the comp level range to include 145 (was 70-140, step 5).
alter table portal_profiles
  drop constraint if exists portal_profiles_comp_level_check;

alter table portal_profiles
  add constraint portal_profiles_comp_level_check
  check (
    comp_level is null
    or (comp_level between 70 and 145 and (comp_level - 70) % 5 = 0)
  );

alter table portal_referral_invites
  drop constraint if exists portal_referral_invites_comp_level_check;

alter table portal_referral_invites
  add constraint portal_referral_invites_comp_level_check
  check (comp_level between 70 and 145 and (comp_level - 70) % 5 = 0);
