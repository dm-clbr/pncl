-- Signing PDFs are owned by onboarding steps. Rollouts reference an immutable
-- step/flow/source edition instead of uploading an unrelated second document.
alter table public.onboarding_content_assets drop constraint onboarding_content_assets_kind_check,
  add constraint onboarding_content_assets_kind_check check (kind in ('ica','w9','direct_deposit','comp_agreement','signing_document','welcome_video','surelc_video','document','video'));
alter table public.portal_todos drop constraint portal_todos_content_type_check,
  add constraint portal_todos_content_type_check check (content_type in ('system','ica','w9','direct_deposit','comp_agreement','signing_document','welcome_video','surelc_video','document','video','link'));
alter table public.portal_document_campaigns alter column created_by drop not null;
alter table public.portal_document_campaigns
  add column source_bucket text not null default 'portal-signing-documents' check (source_bucket in ('portal-signing-documents','onboarding-content')),
  add column onboarding_step_id uuid references public.portal_todos(id),
  add column onboarding_asset_id uuid unique references public.onboarding_content_assets(id),
  add column onboarding_previous_asset_id uuid references public.onboarding_content_assets(id),
  add column onboarding_flow text check (onboarding_flow in ('loa','ibo')),
  add column rollout_request_id uuid unique,
  add constraint document_step_link_complete check ((onboarding_step_id is null and onboarding_asset_id is null and onboarding_flow is null and source_bucket='portal-signing-documents') or
    (onboarding_step_id is not null and onboarding_asset_id is not null and onboarding_flow is not null and source_bucket='onboarding-content'));
create index document_campaign_step_idx on public.portal_document_campaigns(onboarding_step_id);

-- One edition per uploaded source. Field edits create a new source and preserve
-- old signed copies. Creating an edition does not send or assign anything.
create function public.ensure_onboarding_document_edition(p_step uuid, p_flow text, p_asset uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare t public.portal_todos; a public.onboarding_content_assets; c public.portal_document_campaigns;
begin
  select * into t from public.portal_todos where id=p_step;
  select * into a from public.onboarding_content_assets where id=p_asset;
  if t.id is null or a.id is null or p_flow not in ('loa','ibo') or a.designation<>p_flow or a.kind<>t.content_type
    or t.content_type not in ('ica','w9','direct_deposit','comp_agreement','signing_document') or coalesce(a.sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'The selected signing PDF does not belong to this step and flow.';
  end if;
  insert into public.portal_document_campaigns(id,title,description,pdf_path,pdf_sha256,created_by,filters,
    onboarding_enabled,onboarding_audience,delivery_mode,rollout_order,source_bucket,onboarding_step_id,onboarding_asset_id,onboarding_flow)
  values(a.id,left(t.title,160),t.description,a.path,a.sha256,a.created_by,
    jsonb_build_object('designation',p_flow,'search','','state','','ica','all','joinedBefore','','joinedAfter',''),
    false,p_flow,'portal','together','onboarding-content',t.id,a.id,p_flow)
  on conflict(onboarding_asset_id) do nothing;
  select * into c from public.portal_document_campaigns where onboarding_asset_id=a.id;
  if c.onboarding_step_id<>t.id or c.onboarding_flow<>p_flow or c.pdf_sha256<>a.sha256 or c.pdf_path<>a.path then
    raise exception 'This PDF edition is already linked to another step.';
  end if;
  return c.id;
end $$;

-- Keep the document catalog and onboarding selection in sync even when an admin
-- saves directly from the step editor. Generic PDFs get a signing edition too.
create function public.sync_onboarding_document_editions() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare f text; aid uuid; cid uuid; active boolean;
begin
  if new.content_type not in ('ica','w9','direct_deposit','comp_agreement','signing_document') then return new; end if;
  for f in select unnest(array['loa','ibo']) loop
    aid := nullif(new.flow_content->f->>'assetId','')::uuid;
    active := new.published and (case f when 'loa' then new.show_loa else new.show_ibo end);
    if aid is not null then
      cid := public.ensure_onboarding_document_edition(new.id,f,aid);
      update public.portal_document_campaigns set
        onboarding_since=case when active and not onboarding_enabled then clock_timestamp() else onboarding_since end,
        onboarding_enabled=active,
        onboarding_pending=case when active then false else onboarding_pending end
      where id=cid;
    end if;
    update public.portal_document_campaigns set onboarding_enabled=false
      where onboarding_step_id=new.id and onboarding_flow=f and onboarding_asset_id is distinct from aid;
  end loop;
  return new;
end $$;
create trigger sync_onboarding_document_editions after insert or update of flow_content,published,show_loa,show_ibo on public.portal_todos
for each row execute function public.sync_onboarding_document_editions();

-- Add the generic signing kind to the existing atomic save function.
create or replace function public.save_onboarding_editor_step(payload jsonb)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  row_id uuid := coalesce(nullif(payload->>'id','')::uuid, gen_random_uuid());
  row_slug text := payload->>'slug';
  content_kind text := payload->>'contentType';
  sibling text;
  flow text;
  media jsonb;
  asset_row public.onboarding_content_assets;
  merged jsonb := coalesce(payload->'flowContent','{}');
  expected text := payload->>'updatedAt';
begin
  perform 1 from public.portal_todos where id = row_id for update;
  if found and expected is not null and not exists(select 1 from public.portal_todos where id=row_id and updated_at=expected::timestamptz) then
    raise exception 'This step changed in another session. Reload before saving.';
  end if;
  if row_slug in ('ica_setup','w9_setup','direct_deposit_setup','comp_agreement') and content_kind <> (case row_slug when 'ica_setup' then 'ica' when 'w9_setup' then 'w9' when 'direct_deposit_setup' then 'direct_deposit' else 'comp_agreement' end) then
    raise exception 'The signing document type cannot be changed.';
  end if;
  for flow in select unnest(array['loa','ibo']) loop
    media := merged->flow;
    if content_kind in ('ica','w9','direct_deposit','comp_agreement','signing_document') and (payload->>'published')::boolean
      and (case flow when 'loa' then (payload->>'showLoa')::boolean else (payload->>'showIbo')::boolean end)
      and (coalesce(media->>'mode','') <> 'file' or nullif(media->>'assetId','') is null) then
      raise exception 'Upload the signing PDF for % before publishing.', upper(flow);
    end if;
    if media->>'mode' = 'file' then
      select * into asset_row from public.onboarding_content_assets where id=(media->>'assetId')::uuid and designation=flow and kind=content_kind;
      if not found then raise exception 'The selected file is not available for this flow.'; end if;
    end if;
  end loop;
  insert into public.portal_todos(id,slug,title,description,href,external,action_label,show_email_hint,show_loa,show_ibo,sort_order,published,phase,completion_type,auto_key,gated,content_type,flow_content,updated_at)
  values(row_id,row_slug,payload->>'title',payload->>'description',payload->>'href',coalesce((payload->>'external')::boolean,false),payload->>'actionLabel',false,
    (payload->>'showLoa')::boolean,(payload->>'showIbo')::boolean,coalesce((payload->>'sortOrder')::integer,999),(payload->>'published')::boolean,payload->>'phase',payload->>'completionType',payload->>'autoKey',coalesce((payload->>'gated')::boolean,false),content_kind,merged,now())
  on conflict(id) do update set title=excluded.title,description=excluded.description,href=excluded.href,external=excluded.external,
    action_label=excluded.action_label,show_loa=excluded.show_loa,show_ibo=excluded.show_ibo,published=excluded.published,phase=excluded.phase,
    content_type=excluded.content_type,flow_content=excluded.flow_content,updated_at=now();
  sibling := case row_slug when 'onboarding_welcome_loa' then 'onboarding_welcome_ibo' when 'surelc_tutorial' then 'surelc_tutorial_ibo' end;
  if sibling is not null then
    update public.portal_todos set show_ibo=false where id=row_id;
    update public.portal_todos set title=payload->>'title',description=payload->>'description',phase=payload->>'phase',
      published=(payload->>'published')::boolean,show_loa=false,show_ibo=(payload->>'showIbo')::boolean,
      content_type=content_kind,flow_content=merged,updated_at=now() where slug=sibling;
    if not found then raise exception 'The paired flow step is missing.'; end if;
  end if;
  -- Draft files remain on the row until publication. Existing active agreements
  -- and introduction videos must not change merely because a draft was saved.
  if content_kind in ('ica','w9','direct_deposit','comp_agreement','welcome_video','surelc_video') and (payload->>'published')::boolean then
    for flow in select unnest(array['loa','ibo']) loop
      media := merged->flow;
      update public.onboarding_flow_content set
        w9_asset_id=case when content_kind='w9' then (media->>'assetId')::uuid else w9_asset_id end,
        direct_deposit_asset_id=case when content_kind='direct_deposit' then (media->>'assetId')::uuid else direct_deposit_asset_id end,
        comp_agreement_asset_id=case when content_kind='comp_agreement' then (media->>'assetId')::uuid else comp_agreement_asset_id end,
        ica_asset_id=case when content_kind='ica' then (media->>'assetId')::uuid else ica_asset_id end,
        welcome_video_asset_id=case when content_kind='welcome_video' then (media->>'assetId')::uuid else welcome_video_asset_id end,
        surelc_video_asset_id=case when content_kind='surelc_video' then (media->>'assetId')::uuid else surelc_video_asset_id end,
        welcome_video_url=case when content_kind='welcome_video' and media->>'mode'='link' then media->>'url' when content_kind='welcome_video' then null else welcome_video_url end,
        surelc_video_url=case when content_kind='surelc_video' and media->>'mode'='link' then media->>'url' when content_kind='surelc_video' then null else surelc_video_url end,
        updated_at=now() where designation=flow;
    end loop;
  end if;
  return row_id;
end $$;
revoke all on function public.save_onboarding_editor_step(jsonb) from public,anon,authenticated;
grant execute on function public.save_onboarding_editor_step(jsonb) to service_role;


-- Select an edition without replacing other fields or another flow's PDF.
create function public.select_onboarding_document_edition(p_campaign uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.portal_document_campaigns; t public.portal_todos; a public.onboarding_content_assets; selected uuid;
begin
  select * into c from public.portal_document_campaigns where id=p_campaign;
  if c.onboarding_step_id is null then raise exception 'This document is not linked to an onboarding step.'; end if;
  select * into t from public.portal_todos where id=c.onboarding_step_id for update;
  selected := nullif(t.flow_content->c.onboarding_flow->>'assetId','')::uuid;
  if selected is distinct from c.onboarding_previous_asset_id and selected is distinct from c.onboarding_asset_id then
    raise exception 'The step PDF changed after this rollout was prepared. Review the current step before continuing.';
  end if;
  if not t.published or not (case c.onboarding_flow when 'loa' then t.show_loa else t.show_ibo end) then
    raise exception 'Publish and enable this onboarding step for the selected flow first.';
  end if;
  select * into a from public.onboarding_content_assets where id=c.onboarding_asset_id and kind=t.content_type and designation=c.onboarding_flow and sha256=c.pdf_sha256;
  if not found then raise exception 'The linked signing PDF is no longer valid for this step.'; end if;
  update public.portal_todos set flow_content=jsonb_set(coalesce(flow_content,'{}'::jsonb),array[c.onboarding_flow],
    jsonb_build_object('mode','file','assetId',a.id,'filename',a.filename,'size',a.size_bytes)),updated_at=clock_timestamp() where id=t.id;
  -- Standard signing endpoints read these same selections.
  update public.onboarding_flow_content set
    ica_asset_id=case when a.kind='ica' then a.id else ica_asset_id end,
    w9_asset_id=case when a.kind='w9' then a.id else w9_asset_id end,
    direct_deposit_asset_id=case when a.kind='direct_deposit' then a.id else direct_deposit_asset_id end,
    comp_agreement_asset_id=case when a.kind='comp_agreement' then a.id else comp_agreement_asset_id end,
    updated_at=clock_timestamp() where designation=c.onboarding_flow;
end $$;

create function public.publish_onboarding_document_rollout(
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
  insert into public.portal_document_requests(campaign_id,user_id,source,released_at,notification_status)
  select cid,recipient,'rollout',case when stage_order='onboarding_first' then null else now() end,
    case when stage_order<>'onboarding_first' and p_delivery in ('email','both') then 'queued' else 'none' end
  from unnest(p_recipients) recipient on conflict(campaign_id,user_id) do nothing;
  insert into public.admin_audit_log(admin_user_id,action,changes) values(p_admin,'publish_onboarding_document_rollout',
    jsonb_build_object('campaignId',cid,'stepId',p_step,'assetId',p_asset,'flow',p_flow,'recipientCount',cardinality(p_recipients),'order',stage_order,'delivery',p_delivery));
  return cid;
end $$;

-- Old campaigns retain their behavior. Linked editions change the actual step.
create or replace function public.set_document_onboarding(p_id uuid,p_admin uuid,p_enabled boolean,p_audience text)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.portal_document_campaigns;
begin
  if not exists(select 1 from auth.users where id=p_admin and raw_app_meta_data->>'role'='admin') then raise exception 'Full admin access required'; end if;
  select * into c from public.portal_document_campaigns where id=p_id;
  if not found then raise exception 'Document not found'; end if;
  if c.onboarding_step_id is not null then
    if not p_enabled or p_audience<>c.onboarding_flow then raise exception 'Manage this document visibility and flow in its onboarding step.'; end if;
    perform public.select_onboarding_document_edition(c.id);
  else
    update public.portal_document_campaigns set onboarding_since=case when p_enabled and not onboarding_enabled then now() else onboarding_since end,
      onboarding_enabled=p_enabled,onboarding_pending=case when p_enabled then false else onboarding_pending end,onboarding_audience=p_audience where id=p_id;
  end if;
  insert into public.admin_audit_log(admin_user_id,action,changes) values(p_admin,'set_document_onboarding',jsonb_build_object('campaignId',p_id,'enabled',p_enabled,'audience',p_audience));
end $$;

create or replace function public.ensure_onboarding_document_requests(p_user uuid,p_domain text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.portal_document_requests(campaign_id,user_id,source,notification_status)
  select c.id,u.id,'onboarding',case when c.delivery_mode in ('email','both') then 'queued' else 'none' end
  from public.portal_document_campaigns c
  join auth.users u on u.id=p_user and u.created_at>=c.onboarding_since
  left join public.portal_agent_designations d on d.user_id=u.id
  left join public.portal_todos t on t.id=c.onboarding_step_id
  where c.onboarding_enabled
    and (c.onboarding_audience='all' or c.onboarding_audience=coalesce(d.designation,'loa'))
    and lower(split_part(u.email,'@',2))=lower(p_domain)
    and coalesce(u.raw_app_meta_data->>'role','agent')='agent'
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
    and (c.onboarding_step_id is null or (t.content_type='signing_document' and t.published
      and (case c.onboarding_flow when 'loa' then t.show_loa else t.show_ibo end)
      and t.flow_content->c.onboarding_flow->>'assetId'=c.onboarding_asset_id::text
      and (exists(select 1 from public.onboarding_signing_rollout where id and enabled)
        or exists(select 1 from public.onboarding_signing_preview_users where user_id=p_user))))
  on conflict(campaign_id,user_id) do nothing;
$$;

-- Reject browser-side manual completion for signing rows. Signatures still use
-- the existing private request endpoint and immutable request history.
create function public.guard_generic_signing_step() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.content_type='signing_document' then
    new.completion_type := 'auto'; new.auto_key := null; new.href := '/portal/documents'; new.action_label := 'Review & sign'; new.external := false;
    if new.published and ((new.show_loa and coalesce(new.flow_content->'loa'->>'assetId','')='') or (new.show_ibo and coalesce(new.flow_content->'ibo'->>'assetId','')='')) then
      raise exception 'Upload a signing PDF for every enabled flow before publishing.';
    end if;
  end if;
  return new;
end $$;
create trigger guard_generic_signing_step before insert or update on public.portal_todos for each row execute function public.guard_generic_signing_step();

-- Extend activation validation to arbitrary signing-document rows as well.
create or replace function public.set_onboarding_signing_rollout(p_enabled boolean, p_revision integer, p_actor uuid)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.onboarding_signing_rollout; step_row public.portal_todos; flow_row public.onboarding_flow_content; source public.onboarding_content_assets; flow text; signing_kind text; source_id uuid;
begin
  select * into current_row from public.onboarding_signing_rollout where id=true for update;
  if not found then raise exception 'Signing activation is not configured.'; end if;
  if current_row.revision <> p_revision then raise exception 'Signing activation changed. Reload before continuing.'; end if;
  if p_enabled then
    for step_row in select * from public.portal_todos where content_type in ('ica','w9','direct_deposit','comp_agreement','signing_document') and published for share loop
      signing_kind := step_row.content_type;
      for flow in select unnest(array['loa','ibo']) loop
        if (case flow when 'loa' then step_row.show_loa else step_row.show_ibo end) then
          select * into flow_row from public.onboarding_flow_content where designation=flow for share;
          source_id := case when signing_kind='signing_document' then nullif(step_row.flow_content->flow->>'assetId','')::uuid else nullif(to_jsonb(flow_row)->>(signing_kind||'_asset_id'),'')::uuid end;
          select * into source from public.onboarding_content_assets where id=source_id and designation=flow and onboarding_content_assets.kind=signing_kind;
          if not found or coalesce(source.sha256,'')='' then raise exception 'Configure the % PDF for % before activating uploaded signing.',signing_kind,upper(flow); end if;
        end if;
      end loop;
    end loop;
  end if;
  update public.onboarding_signing_rollout set enabled=p_enabled, revision=revision+1,updated_at=now(),updated_by=p_actor where id=true returning revision into p_revision;
  return p_revision;
end $$;
revoke all on function public.set_onboarding_signing_rollout(boolean,integer,uuid) from public,anon,authenticated;
grant execute on function public.set_onboarding_signing_rollout(boolean,integer,uuid) to service_role;

revoke all on function public.ensure_onboarding_document_edition(uuid,text,uuid),public.sync_onboarding_document_editions(),
  public.select_onboarding_document_edition(uuid),public.publish_onboarding_document_rollout(uuid,uuid,uuid,text,uuid,uuid,jsonb,uuid[],text,text,text),
  public.guard_generic_signing_step() from public,anon,authenticated;
grant execute on function public.ensure_onboarding_document_edition(uuid,text,uuid),public.sync_onboarding_document_editions(),
  public.select_onboarding_document_edition(uuid),public.publish_onboarding_document_rollout(uuid,uuid,uuid,text,uuid,uuid,jsonb,uuid[],text,text,text),
  public.guard_generic_signing_step() to service_role;
-- Existing selected PDFs become catalog editions without sending anything.
update public.portal_todos set flow_content=flow_content where content_type in ('ica','w9','direct_deposit','comp_agreement','signing_document');

-- Team/admin totals include the same released document tasks and new-agent
-- requirements, even before the agent first opens the portal.
create function public.onboarding_document_progress(p_users uuid[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) from (
    select r.user_id,c.id as campaign_id,coalesce(t.phase,'on_board') as phase,r.signed_at
    from public.portal_document_requests r join public.portal_document_campaigns c on c.id=r.campaign_id
    left join public.portal_todos t on t.id=c.onboarding_step_id
    where r.user_id=any(p_users) and r.released_at is not null
    union all
    select u.id,c.id,coalesce(t.phase,'on_board'),null::timestamptz
    from auth.users u join public.portal_document_campaigns c on c.onboarding_enabled and u.created_at>=c.onboarding_since
    join public.portal_todos t on t.id=c.onboarding_step_id and t.content_type='signing_document' and t.published
    left join public.portal_agent_designations d on d.user_id=u.id
    where u.id=any(p_users) and coalesce(u.raw_app_meta_data->>'role','agent')='agent'
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and c.onboarding_flow=coalesce(d.designation,'loa') and (case c.onboarding_flow when 'loa' then t.show_loa else t.show_ibo end)
      and t.flow_content->c.onboarding_flow->>'assetId'=c.onboarding_asset_id::text
      and (exists(select 1 from public.onboarding_signing_rollout where id and enabled) or exists(select 1 from public.onboarding_signing_preview_users where user_id=u.id))
      and not exists(select 1 from public.portal_document_requests r where r.campaign_id=c.id and r.user_id=u.id)
  ) result;
$$;
revoke all on function public.onboarding_document_progress(uuid[]) from public,anon,authenticated;
grant execute on function public.onboarding_document_progress(uuid[]) to service_role;
