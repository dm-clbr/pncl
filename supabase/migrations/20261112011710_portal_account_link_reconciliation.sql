-- Only the server may bind an enrollment to an existing Auth identity. These
-- functions need definer privileges to inspect Auth; browser roles cannot call them.
create or replace function public.check_portal_account_link(p_onboarding uuid, p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.onboarding_records; u auth.users;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into o from public.onboarding_records where id = p_onboarding;
  select * into u from auth.users where id = p_user;
  if o.id is null or u.id is null then raise exception 'account_not_found'; end if;
  if o.released_at is not null then raise exception 'onboarding_released'; end if;
  if p_email is null or p_email <> lower(p_email) or p_email !~ '^[^[:space:]@]+@thepncl[.]com$'
    or o.workspace_email is distinct from p_email or lower(u.email) is distinct from p_email
    or u.email_confirmed_at is null or u.deleted_at is not null or u.banned_until > now()
    or coalesce(u.is_anonymous, false) or coalesce(u.email_change, '') <> '' then
    raise exception 'work_email_unverified';
  end if;
  if (o.supabase_user_id is not null and o.supabase_user_id <> p_user::text)
    or (nullif(u.raw_app_meta_data->>'onboarding_id', '') is not null and u.raw_app_meta_data->>'onboarding_id' <> p_onboarding::text)
    or exists(select 1 from public.onboarding_records x where x.id <> o.id and x.supabase_user_id = p_user::text)
    or (select count(*) from auth.users where lower(email) = p_email) <> 1
    or (select count(*) from public.onboarding_records where lower(workspace_email) = p_email and released_at is null) <> 1 then
    raise exception 'identity_conflict';
  end if;
  -- An existing account needs server-owned provenance, not editable names or
  -- user_metadata. Google subject ties a legacy OAuth account to Workspace.
  if o.supabase_user_id is distinct from p_user::text
    and u.raw_app_meta_data->>'onboarding_id' is distinct from p_onboarding::text
    and not exists(select 1 from auth.identities i where i.user_id = p_user and i.provider = 'google'
      and i.provider_id = o.google_user_id and i.identity_data->>'sub' = o.google_user_id
      and lower(i.identity_data->>'email') = p_email and i.identity_data->>'email_verified' = 'true') then
    raise exception 'identity_conflict';
  end if;
  if o.supabase_user_id is null and u.raw_app_meta_data->>'onboarding_id' is distinct from p_onboarding::text
    and (o.google_account_status is distinct from 'ready'
      or (o.onboarding_completed_at is null and o.enrollment_status is distinct from 'provisioning_portal')) then
    raise exception 'onboarding_incomplete';
  end if;
end $$;

create or replace function public.persist_portal_account_link(p_onboarding uuid, p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Same lock order as the repair operation; serialize competing claims for a user.
  perform pg_advisory_xact_lock(hashtextextended('portal-link:' || p_user::text, 0));
  perform 1 from public.onboarding_records where id = p_onboarding for update;
  perform 1 from auth.users where id = p_user for share;
  perform public.check_portal_account_link(p_onboarding, p_user, p_email);
  update public.onboarding_records set supabase_user_id = p_user::text,
    portal_linked_at = coalesce(portal_linked_at, now())
    where id = p_onboarding and supabase_user_id is null;
  -- Binding an identity does not finalize onboarding or grant SSO access.
end $$;

create or replace function public.portal_link_repair_status(p_onboarding uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.onboarding_records; u auth.users;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into o from public.onboarding_records where id = p_onboarding;
  if o.id is null then return jsonb_build_object('canRepair', false, 'reason', 'account_not_found'); end if;
  if o.released_at is not null then return jsonb_build_object('canRepair', false, 'reason', 'onboarding_released'); end if;
  if o.provisioning_lock_expires_at > now() then return jsonb_build_object('canRepair', false, 'reason', 'onboarding_in_progress'); end if;
  if o.onboarding_completed_at is null or o.status is null or o.status not in ('ready', 'credentials_viewed')
    or o.referral_status is null or o.referral_status not in ('none', 'finalized') or o.contract_status is distinct from 'finalized'
    or o.application_status is distinct from 'finalized' or o.google_account_status is distinct from 'ready'
    or o.google_user_id is null then
    return jsonb_build_object('canRepair', false, 'reason', 'onboarding_incomplete');
  end if;
  if p_user is null then return jsonb_build_object('canRepair', false, 'reason', 'no_existing_account'); end if;
  begin
    perform public.check_portal_account_link(p_onboarding, p_user, o.workspace_email);
  exception when raise_exception then
    return jsonb_build_object('canRepair', false, 'reason', sqlerrm);
  end;
  select * into u from auth.users where id = p_user;
  if u.raw_app_meta_data->>'enrollment_version' = '3'
    and u.raw_app_meta_data->>'enrollment_ready' is distinct from 'true' then
    return jsonb_build_object('canRepair', false, 'reason', 'onboarding_incomplete');
  end if;
  if not exists(select 1 from auth.identities i where i.user_id = p_user and i.provider = 'google'
      and i.provider_id = o.google_user_id and i.identity_data->>'sub' = o.google_user_id
      and lower(i.identity_data->>'email') = o.workspace_email and i.identity_data->>'email_verified' = 'true')
    or (select count(*) from auth.identities where provider = 'google' and provider_id = o.google_user_id) <> 1
    or (select count(*) from public.onboarding_records where google_user_id = o.google_user_id and released_at is null) <> 1 then
    return jsonb_build_object('canRepair', false, 'reason', 'identity_conflict');
  end if;
  if o.supabase_user_id = p_user::text then
    return jsonb_build_object('canRepair', false, 'reason', 'already_linked');
  end if;
  if o.failure_code is not null and o.failure_code <> 'legacy_portal_link_missing' then
    return jsonb_build_object('canRepair', false, 'reason', 'other_failure_requires_review');
  end if;
  return jsonb_build_object('canRepair', true, 'reason', 'repair_available');
end $$;

create or replace function public.reconcile_portal_account_link(p_admin uuid, p_onboarding uuid, p_expected_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.onboarding_records; updated public.onboarding_records; eligibility jsonb;
  audit_id uuid; before_values jsonb; after_values jsonb;
  fields text[] := array['supabase_user_id','portal_account_status','finalization_status','enrollment_status',
    'failed_step','failure_code','failure_detail','portal_linked_at','finalized_at','updated_at'];
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = p_admin and raw_app_meta_data->>'role' = 'admin'
    and email ~ '^[^[:space:]@]+@thepncl[.]com$' and email_confirmed_at is not null
    and deleted_at is null and (banned_until is null or banned_until <= now())
    and not coalesce(is_anonymous, false)
    and not (coalesce(raw_app_meta_data->>'enrollment_version', '') = '3' and coalesce(raw_app_meta_data->>'enrollment_ready', '') <> 'true') for share;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('portal-link:' || p_expected_user::text, 0));
  select * into o from public.onboarding_records where id = p_onboarding for update;
  perform 1 from auth.users where id = p_expected_user for share;
  perform 1 from auth.identities where user_id = p_expected_user and provider = 'google' for share;
  eligibility := public.portal_link_repair_status(p_onboarding, p_expected_user);
  if eligibility->>'reason' = 'already_linked' and o.enrollment_status = 'ready'
    and o.portal_account_status = 'ready' and o.finalization_status = 'ready'
    and o.failed_step is null and o.failure_code is null and o.failure_detail is null then
    return jsonb_build_object('repaired', false, 'alreadyLinked', true);
  end if;
  if eligibility->>'canRepair' is distinct from 'true' then raise exception '%', eligibility->>'reason'; end if;
  select jsonb_object_agg(key, value) into before_values from jsonb_each(to_jsonb(o)) where key = any(fields);
  update public.onboarding_records set supabase_user_id = p_expected_user::text,
    portal_account_status = 'ready', finalization_status = 'ready', enrollment_status = 'ready',
    failed_step = null, failure_code = null, failure_detail = null,
    portal_linked_at = coalesce(portal_linked_at, now()), finalized_at = coalesce(finalized_at, now())
    where id = p_onboarding returning * into updated;
  if (to_jsonb(o) - fields) is distinct from (to_jsonb(updated) - fields) then raise exception 'preservation_check_failed'; end if;
  select jsonb_object_agg(key, value) into after_values from jsonb_each(to_jsonb(updated)) where key = any(fields);
  insert into public.admin_audit_log(admin_user_id, target_user_id, action, changes)
    values(p_admin, p_expected_user, 'onboarding_link_reconciled', jsonb_build_object(
      'onboarding_id', p_onboarding, 'before', before_values, 'after', after_values,
      'ownership_evidence', 'verified_google_subject', 'original_completion_preserved', true)) returning id into audit_id;
  return jsonb_build_object('repaired', true, 'alreadyLinked', false, 'auditId', audit_id);
end $$;

revoke all on function public.check_portal_account_link(uuid,uuid,text), public.persist_portal_account_link(uuid,uuid,text),
  public.portal_link_repair_status(uuid,uuid), public.reconcile_portal_account_link(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.check_portal_account_link(uuid,uuid,text), public.persist_portal_account_link(uuid,uuid,text),
  public.portal_link_repair_status(uuid,uuid), public.reconcile_portal_account_link(uuid,uuid,uuid) to service_role;
