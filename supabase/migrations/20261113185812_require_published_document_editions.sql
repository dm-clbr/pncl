-- Publication makes a signing edition required for its whole applicable audience.
-- Staging/uploading a PDF alone does not publish it or assign requests.
create function public.assign_required_document_edition(p_campaign uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare c public.portal_document_campaigns; t public.portal_todos; added integer; task_filters jsonb;
begin
  select * into c from public.portal_document_campaigns where id=p_campaign;
  if c.onboarding_step_id is null then return 0; end if;
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
    and not exists(select 1 from public.onboarding_contract_signatures s join public.onboarding_records o on o.id=s.onboarding_id where o.supabase_user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.portal_w9_forms s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.portal_direct_deposit_forms s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
    and not exists(select 1 from public.portal_comp_attachments s where s.user_id=(agent->>'id')::uuid and s.template_asset_id=c.onboarding_asset_id and s.template_sha256=c.pdf_sha256 and s.signed_at is not null)
  on conflict(campaign_id,user_id) do nothing;
  get diagnostics added = row_count;
  if added>0 and c.created_by is not null then
    insert into public.admin_audit_log(admin_user_id,action,changes) values(c.created_by,'require_published_document_edition',jsonb_build_object('campaignId',c.id,'assetId',c.onboarding_asset_id,'flow',c.onboarding_flow,'sha256',c.pdf_sha256,'newRequests',added,'order',c.rollout_order,'automaticDelivery',case when c.rollout_request_id is null then 'portal' else c.delivery_mode end));
  end if;
  return added;
end $$;

create function public.require_published_document_edition() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.onboarding_step_id is not null and (
    (new.onboarding_enabled and (tg_op='INSERT' or not old.onboarding_enabled)) or
    (new.rollout_request_id is not null and (tg_op='INSERT' or old.rollout_request_id is null))
  ) then perform public.assign_required_document_edition(new.id); end if;
  return new;
end $$;
create trigger require_published_document_edition
  after insert or update of onboarding_enabled,rollout_request_id on public.portal_document_campaigns
  for each row execute function public.require_published_document_edition();
revoke all on function public.assign_required_document_edition(uuid),public.require_published_document_edition() from public,anon,authenticated;
grant execute on function public.assign_required_document_edition(uuid),public.require_published_document_edition() to service_role;
-- Deliberately no backfill: unrelated existing editions and rollout history stay unchanged.

create or replace function public.publish_onboarding_document_rollout(
  p_request uuid,p_admin uuid,p_step uuid,p_flow text,p_asset uuid,p_expected_asset uuid,
  p_filters jsonb,p_recipients uuid[],p_delivery text,p_order text,p_domain text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare t public.portal_todos; c public.portal_document_campaigns; cid uuid; selected uuid; eligible jsonb; stage_order text;
begin
  if not exists(select 1 from auth.users where id=p_admin and raw_app_meta_data->>'role'='admin') then raise exception 'Full admin access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into c from public.portal_document_campaigns where rollout_request_id=p_request;
  if found then return c.id; end if;
  select * into t from public.portal_todos where id=p_step for update;
  if not found or not t.published or not (case p_flow when 'loa' then t.show_loa when 'ibo' then t.show_ibo else false end) then
    raise exception 'Publish and enable this onboarding step for the selected flow first.';
  end if;
  selected := nullif(t.flow_content->p_flow->>'assetId','')::uuid;
  if selected is distinct from p_expected_asset then raise exception 'The step PDF changed. Reload and review the rollout again.'; end if;
  if coalesce(cardinality(p_recipients),0)=0 then raise exception 'Select at least one existing agent.'; end if;
  if p_delivery not in ('email','portal','both') or p_order not in ('current_first','onboarding_first','together') then raise exception 'Choose delivery and rollout order.'; end if;
  if p_filters->>'designation' is distinct from p_flow then raise exception 'Recipients must match the document flow.'; end if;
  if coalesce(p_filters->>'ica','')<>'all' or coalesce(p_filters->>'state','')<>'' or coalesce(p_filters->>'search','')<>'' or coalesce(p_filters->>'joinedAfter','')<>'' or coalesce(p_filters->>'joinedBefore','')<>'' then raise exception 'Required editions include every active agent in the selected flow.'; end if;
  eligible := public.document_request_recipients(p_filters,p_domain);
  if exists(select 1 from unnest(p_recipients) recipient where not exists(select 1 from jsonb_array_elements(eligible) e where (e->>'id')::uuid=recipient)) then
    raise exception 'The audience changed. Review recipients again before sending.';
  end if;
  cid := public.ensure_onboarding_document_edition(p_step,p_flow,p_asset);
  select * into c from public.portal_document_campaigns where id=cid for update;
  if c.rollout_request_id is not null then raise exception 'A rollout already exists for this PDF edition. Open its rollout history.'; end if;
  -- A PDF already selected in onboarding cannot be retroactively held back.
  stage_order := case when selected=p_asset then 'together' else p_order end;
  update public.portal_document_campaigns set rollout_request_id=p_request,created_by=p_admin,filters=p_filters,
    delivery_mode=p_delivery,rollout_order=stage_order,onboarding_previous_asset_id=selected,
    onboarding_enabled=(selected=p_asset),onboarding_pending=(selected is distinct from p_asset and stage_order='current_first')
  where id=cid;
  if stage_order<>'current_first' then perform public.select_onboarding_document_edition(cid); end if;
  -- The publication trigger assigns the complete audience, preserving exact-edition signatures.
  insert into public.admin_audit_log(admin_user_id,action,changes) values(p_admin,'publish_onboarding_document_rollout',
    jsonb_build_object('campaignId',cid,'stepId',p_step,'assetId',p_asset,'flow',p_flow,'recipientCount',cardinality(p_recipients),'order',stage_order,'delivery',p_delivery));
  return cid;
end $$;
