-- Immutable document editions, individual signature requests, and a durable email outbox.
-- Invoker-rights RPCs need only these identity/audience columns, never password,
-- recovery, or token columns. Supabase's service role does not necessarily have
-- direct auth table grants even though its Auth Admin API is privileged.
grant usage on schema auth to service_role;
grant select (id, email, created_at, raw_app_meta_data, raw_user_meta_data, banned_until, deleted_at)
  on auth.users to service_role;
create table public.portal_document_campaigns (
  id uuid primary key,
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  pdf_path text not null unique,
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  filters jsonb not null,
  delivery_mode text not null check (delivery_mode in ('email', 'portal', 'both')),
  rollout_order text not null check (rollout_order in ('together', 'current_first', 'onboarding_first')),
  onboarding_pending boolean not null default false,
  onboarding_enabled boolean not null default false,
  onboarding_audience text not null check (onboarding_audience in ('all', 'loa', 'ibo')),
  onboarding_since timestamptz not null default now()
);
create table public.portal_document_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.portal_document_campaigns(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  released_at timestamptz default now(),
  source text not null check (source in ('rollout', 'onboarding')),
  signed_at timestamptz,
  signature_name text,
  consent_text text,
  signed_pdf_path text,
  ip_address text,
  user_agent text,
  notification_status text not null default 'queued' check (notification_status in ('queued', 'sending', 'sent', 'failed', 'none')),
  notification_attempted_at timestamptz,
  notification_sent_at timestamptz,
  notification_error text,
  unique(campaign_id, user_id),
  check (released_at is not null or (signed_at is null and notification_status = 'none')),
  check ((signed_at is null and signature_name is null and signed_pdf_path is null)
    or (signed_at is not null and signature_name is not null and signed_pdf_path is not null and consent_text is not null))
);
create index portal_document_requests_user_idx on public.portal_document_requests(user_id, assigned_at);
create index portal_document_requests_outbox_idx on public.portal_document_requests(campaign_id, notification_status);
alter table public.portal_document_campaigns enable row level security;
alter table public.portal_document_requests enable row level security;
-- All access goes through authenticated edge functions. No agent can self-complete a request.
revoke all on public.portal_document_campaigns, public.portal_document_requests from anon, authenticated;
grant all on public.portal_document_campaigns, public.portal_document_requests to service_role;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('portal-signing-documents', 'portal-signing-documents', false, 15728640, array['application/pdf']);

-- Use a JSON result so large recipient previews aren't truncated by the REST row limit.
create function public.document_request_recipients(p_filters jsonb, p_domain text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name, r.id), '[]'::jsonb)
  from (
    select u.id, u.email,
      coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(u.raw_user_meta_data->>'full_name', ''), u.email) as name,
      coalesce(d.designation, 'loa') as designation,
      coalesce(p.address_state, '') as state,
      u.created_at as joined_at,
      exists(select 1 from public.portal_ica_signatures i where i.user_id = u.id) as ica_signed
    from auth.users u
    left join public.portal_profiles p on p.user_id = u.id
    left join public.portal_agent_designations d on d.user_id = u.id
    where lower(split_part(u.email, '@', 2)) = lower(p_domain)
      and coalesce(u.raw_app_meta_data->>'role', 'agent') = 'agent'
      and (u.banned_until is null or u.banned_until <= now())
      and u.deleted_at is null
  ) r
  where (p_filters->>'designation' = 'all' or r.designation = p_filters->>'designation')
    and (coalesce(p_filters->>'search', '') = '' or position(lower(p_filters->>'search') in lower(r.name || ' ' || r.email)) > 0)
    and (coalesce(p_filters->>'state', '') = '' or r.state = p_filters->>'state')
    and (p_filters->>'ica' = 'all' or r.ica_signed = (p_filters->>'ica' = 'signed'))
    and (nullif(p_filters->>'joinedAfter', '') is null or r.joined_at >= (p_filters->>'joinedAfter')::date::timestamptz)
    and (nullif(p_filters->>'joinedBefore', '') is null or r.joined_at < ((p_filters->>'joinedBefore')::date + 1)::timestamptz);
$$;

create function public.publish_document_request(
  p_id uuid, p_admin uuid, p_title text, p_description text, p_path text, p_hash text,
  p_filters jsonb, p_recipients uuid[], p_onboarding boolean, p_audience text, p_delivery text, p_order text, p_domain text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare eligible jsonb; campaign public.portal_document_campaigns; rollout_order text; begin
  if not exists(select 1 from auth.users where id = p_admin and raw_app_meta_data->>'role' = 'admin') then
    raise exception 'Full admin access required';
  end if;
  -- Serialize retries for this edition, including when the first HTTP response was lost.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into campaign from public.portal_document_campaigns where id = p_id;
  if found then
    if campaign.created_by <> p_admin then raise exception 'Document ID already in use'; end if;
    return p_id;
  end if;
  if cardinality(p_recipients) = 0 and not p_onboarding then raise exception 'Choose recipients or enable future onboarding'; end if;
  rollout_order := case when p_onboarding and cardinality(p_recipients) > 0 then p_order else 'together' end;
  eligible := public.document_request_recipients(p_filters, p_domain);
  if exists(select 1 from unnest(p_recipients) recipient
      where not exists(select 1 from jsonb_array_elements(eligible) e where (e->>'id')::uuid = recipient)) then
    raise exception 'The audience changed. Review recipients again before sending.';
  end if;
  insert into public.portal_document_campaigns(id, title, description, pdf_path, pdf_sha256, created_by, filters, onboarding_enabled, onboarding_audience, delivery_mode, rollout_order, onboarding_pending)
  values(p_id, p_title, p_description, p_path, p_hash, p_admin, p_filters,
    p_onboarding and rollout_order <> 'current_first', p_audience, p_delivery, rollout_order,
    p_onboarding and rollout_order = 'current_first');
  insert into public.portal_document_requests(campaign_id, user_id, source, released_at, notification_status)
  select p_id, recipient, 'rollout', case when rollout_order = 'onboarding_first' then null else now() end,
    case when rollout_order <> 'onboarding_first' and p_delivery in ('email', 'both') then 'queued' else 'none' end from unnest(p_recipients) recipient
  on conflict(campaign_id, user_id) do nothing;
  insert into public.admin_audit_log(admin_user_id, action, changes)
  values(p_admin, 'publish_document_request', jsonb_build_object('campaignId', p_id, 'recipientCount', cardinality(p_recipients), 'filters', p_filters, 'onboarding', p_onboarding, 'onboardingAudience', p_audience, 'delivery', p_delivery, 'rolloutOrder', rollout_order, 'sha256', p_hash));
  return p_id;
end; $$;

-- Called after authentication, when the invitation's final LOA/IBO designation is available.
-- Existing accounts are excluded by the fixed cutoff; current-recipient filters never carry forward.
create function public.ensure_onboarding_document_requests(p_user uuid, p_domain text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.portal_document_requests(campaign_id, user_id, source, notification_status)
  select c.id, u.id, 'onboarding', case when c.delivery_mode in ('email', 'both') then 'queued' else 'none' end
  from public.portal_document_campaigns c
  join auth.users u on u.id = p_user and u.created_at >= c.onboarding_since
  left join public.portal_agent_designations d on d.user_id = u.id
  where c.onboarding_enabled
    and (c.onboarding_audience = 'all' or c.onboarding_audience = coalesce(d.designation, 'loa'))
    and lower(split_part(u.email, '@', 2)) = lower(p_domain)
    and coalesce(u.raw_app_meta_data->>'role', 'agent') = 'agent'
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  on conflict(campaign_id, user_id) do nothing;
$$;

create function public.set_document_onboarding(p_id uuid, p_admin uuid, p_enabled boolean, p_audience text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id = p_admin and raw_app_meta_data->>'role' = 'admin') then raise exception 'Full admin access required'; end if;
  update public.portal_document_campaigns set
    onboarding_since = case when p_enabled and not onboarding_enabled then now() else onboarding_since end,
    onboarding_enabled = p_enabled, onboarding_pending = case when p_enabled then false else onboarding_pending end, onboarding_audience = p_audience where id = p_id;
  if not found then raise exception 'Document not found'; end if;
  insert into public.admin_audit_log(admin_user_id, action, changes)
  values(p_admin, 'set_document_onboarding', jsonb_build_object('campaignId', p_id, 'enabled', p_enabled, 'audience', p_audience));
end; $$;

-- The reviewed current-agent audience stays fixed until an admin releases it.
create function public.release_document_current_agents(p_id uuid, p_admin uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id = p_admin and raw_app_meta_data->>'role' = 'admin') then raise exception 'Full admin access required'; end if;
  if not exists(select 1 from public.portal_document_campaigns where id = p_id) then raise exception 'Document not found'; end if;
  update public.portal_document_requests r set released_at = now(), assigned_at = now(),
    notification_status = case when c.delivery_mode in ('email', 'both') then 'queued' else 'none' end
  from public.portal_document_campaigns c where c.id = p_id and r.campaign_id = c.id and r.released_at is null;
  if found then
    insert into public.admin_audit_log(admin_user_id, action, changes)
    values(p_admin, 'release_document_current_agents', jsonb_build_object('campaignId', p_id));
  end if;
end; $$;

create function public.claim_document_notifications(p_campaign uuid default null, p_user uuid default null, p_retry boolean default true)
returns setof public.portal_document_requests language sql security invoker set search_path = '' as $$
  update public.portal_document_requests set notification_status = 'sending', notification_attempted_at = now(), notification_error = null
  where id in (
    select id from public.portal_document_requests
    where (p_campaign is not null or p_user is not null)
      and (p_campaign is null or campaign_id = p_campaign) and (p_user is null or user_id = p_user)
      and released_at is not null and signed_at is null
      and (notification_status = 'queued'
        or (notification_status = 'failed' and (p_retry or notification_attempted_at < now() - interval '1 hour'))
        or (notification_status = 'sending' and notification_attempted_at < now() - interval '10 minutes'))
    order by notification_attempted_at nulls first, assigned_at for update skip locked limit 10
  ) returning *;
$$;

revoke all on function public.document_request_recipients(jsonb, text),
  public.publish_document_request(uuid, uuid, text, text, text, text, jsonb, uuid[], boolean, text, text, text, text),
  public.ensure_onboarding_document_requests(uuid, text), public.set_document_onboarding(uuid, uuid, boolean, text),
  public.release_document_current_agents(uuid, uuid), public.claim_document_notifications(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.document_request_recipients(jsonb, text),
  public.publish_document_request(uuid, uuid, text, text, text, text, jsonb, uuid[], boolean, text, text, text, text),
  public.ensure_onboarding_document_requests(uuid, text), public.set_document_onboarding(uuid, uuid, boolean, text),
  public.release_document_current_agents(uuid, uuid), public.claim_document_notifications(uuid, uuid, boolean) to service_role;

create function public.document_request_report(p_campaign uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when p_campaign is null then (
    select coalesce(jsonb_agg(to_jsonb(summary) order by summary.created_at desc), '[]'::jsonb) from (
      select c.*, count(r.id) filter(where r.released_at is not null)::int as recipient_count,
        count(r.id) filter(where r.released_at is null)::int as held_count,
        count(r.id) filter(where r.source = 'rollout')::int as current_count,
        count(r.id) filter(where r.signed_at is not null)::int as signed_count,
        count(r.id) filter(where r.released_at is not null and r.signed_at is null and r.notification_status in ('queued','failed','sending'))::int as email_pending_count
      from public.portal_document_campaigns c left join public.portal_document_requests r on r.campaign_id = c.id
      group by c.id
    ) summary
  ) else (
    select coalesce(jsonb_agg(to_jsonb(detail) order by detail.name, detail.id), '[]'::jsonb) from (
      select r.id, r.user_id, r.source, r.assigned_at, r.released_at, r.signed_at, r.signature_name,
        r.notification_status, r.notification_sent_at, r.notification_error,
        coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email) as name,
        u.email, coalesce(d.designation, 'loa') as designation
      from public.portal_document_requests r join auth.users u on u.id = r.user_id
      left join public.portal_profiles p on p.user_id = r.user_id
      left join public.portal_agent_designations d on d.user_id = r.user_id
      where r.campaign_id = p_campaign
    ) detail
  ) end;
$$;
revoke all on function public.document_request_report(uuid) from public, anon, authenticated;
grant execute on function public.document_request_report(uuid) to service_role;
