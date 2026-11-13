-- Direct deposit uses the existing coded bank-details and authorization form.
-- Keep publication, audiences, historical PDFs, and bank records unchanged.
CREATE OR REPLACE FUNCTION public.save_onboarding_editor_step(payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Direct deposit is a coded form. Keep only optional supporting files.
  if content_kind='direct_deposit' then
    merged := jsonb_build_object('attachments',coalesce(merged->'attachments','{}'::jsonb));
    payload := payload || jsonb_build_object('href','/portal/direct-deposit','external',false);
  end if;
  for flow in select unnest(array['loa','ibo']) loop
    media := merged->flow;
    if content_kind in ('ica','w9','comp_agreement','signing_document') and (payload->>'published')::boolean
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
  if content_kind in ('ica','w9','comp_agreement','welcome_video','surelc_video') and (payload->>'published')::boolean then
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
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_onboarding_document_editions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f text; aid uuid; cid uuid; active boolean;
begin
  if new.content_type not in ('ica','w9','comp_agreement','signing_document') then return new; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.set_onboarding_signing_rollout(p_enabled boolean, p_revision integer, p_actor uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare current_row public.onboarding_signing_rollout; step_row public.portal_todos; flow_row public.onboarding_flow_content; source public.onboarding_content_assets; flow text; signing_kind text; source_id uuid;
begin
  select * into current_row from public.onboarding_signing_rollout where id=true for update;
  if not found then raise exception 'Signing activation is not configured.'; end if;
  if current_row.revision <> p_revision then raise exception 'Signing activation changed. Reload before continuing.'; end if;
  if p_enabled then
    for step_row in select * from public.portal_todos where content_type in ('ica','w9','comp_agreement','signing_document') and published for share loop
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
end $function$
;

-- Uploaded-template validation remains on ICA, W-9, and compensation signatures.
-- The coded deposit form validates its fields and authorization in its endpoint.
drop trigger if exists portal_direct_deposit_source on public.portal_direct_deposit_forms;
