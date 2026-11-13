-- Preserve the existing full-audience default while allowing an explicitly
-- configured future-onboarding-only edition. This migration assigns no requests.
alter table public.portal_document_campaigns add column require_existing_agents boolean not null default true;
comment on column public.portal_document_campaigns.require_existing_agents is 'Whether publication automatically requests signatures from existing applicable agents. Explicit rollouts still apply when false.';

-- onboarding_records.supabase_user_id is text in production.
CREATE OR REPLACE FUNCTION public.assign_required_document_edition(p_campaign uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.portal_document_campaigns; t public.portal_todos; added integer; task_filters jsonb;
begin
  select * into c from public.portal_document_campaigns where id=p_campaign;
  if c.onboarding_step_id is null then return 0; end if;
  -- Future-only editions stay available to new onboarding without reissuing existing agents.
  if not c.require_existing_agents and c.rollout_request_id is null then return 0; end if;
  select * into t from public.portal_todos where id=c.onboarding_step_id;
  if not t.published or not (case c.onboarding_flow when 'loa' then t.show_loa else t.show_ibo end) then return 0; end if;
  if not c.onboarding_enabled and c.rollout_request_id is null then return 0; end if;
  if c.rollout_request_id is null and t.flow_content->c.onboarding_flow->>'assetId' is distinct from c.onboarding_asset_id::text then return 0; end if;
  if not exists(select 1 from public.onboarding_content_assets a where a.id=c.onboarding_asset_id and a.kind=t.content_type and a.designation=c.onboarding_flow and a.sha256=c.pdf_sha256 and a.path=c.pdf_path) then
    raise exception 'The required document edition does not match its published source.';
  end if;
  task_filters := jsonb_build_object('designation',c.onboarding_flow,'ica','all','search','','state','','joinedAfter','','joinedBefore','');
  insert into public.portal_document_requests(campaign_id,user_id,source,released_at,notification_status)
  select c.id,(agent->>'id')::uuid,'rollout',
    case when c.rollout_request_id is not null and c.rollout_order='onboarding_first' then null else clock_timestamp() end,
    case when c.rollout_request_id is not null and c.rollout_order<>'onboarding_first' and c.delivery_mode in ('email','both') then 'queued' else 'none' end
  from jsonb_array_elements(public.document_request_recipients(task_filters,'thepncl.com')) agent
  -- An actual signature of this exact source already satisfies the edition.
  -- Historical signatures of other sources never satisfy it.
  where not exists(select 1 from public.portal_ica_signatures s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.onboarding_contract_signatures s join public.onboarding_records o on o.id=s.onboarding_id where o.supabase_user_id=(agent->>'id') and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.portal_w9_forms s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.portal_direct_deposit_forms s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.portal_comp_attachments s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
  on conflict(campaign_id,user_id) do nothing;
  get diagnostics added = row_count;
  if added>0 and c.created_by is not null then
    insert into public.admin_audit_log(admin_user_id,action,changes) values(c.created_by,'require_published_document_edition',jsonb_build_object('campaignId',c.id,'assetId',c.onboarding_asset_id,'flow',c.onboarding_flow,'sha256',c.pdf_sha256,'newRequests',added,'order',c.rollout_order,'automaticDelivery',case when c.rollout_request_id is null then 'portal' else c.delivery_mode end));
  end if;
  return added;
end $function$
;
