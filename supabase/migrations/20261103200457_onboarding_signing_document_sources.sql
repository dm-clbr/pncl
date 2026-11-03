-- Keep current agent signing stable while admins prepare uploaded sources.
create table public.onboarding_signing_rollout (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  revision integer not null default 0,
  legacy_ica_sources jsonb not null,
  legacy_steps jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.onboarding_signing_rollout(id,legacy_ica_sources,legacy_steps)
select true,
  coalesce((select jsonb_object_agg(designation,ica_asset_id) from public.onboarding_flow_content),'{}'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(t)) from public.portal_todos t where slug in ('ica_setup','w9_setup','direct_deposit_setup','comp_agreement')),'[]'::jsonb);
create table public.onboarding_signing_preview_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.onboarding_signing_rollout enable row level security;
alter table public.onboarding_signing_preview_users enable row level security;
revoke all on public.onboarding_signing_rollout, public.onboarding_signing_preview_users from public,anon,authenticated;
grant select,update on public.onboarding_signing_rollout to service_role;
grant select,insert,update,delete on public.onboarding_signing_preview_users to service_role;

-- Onboarding Steps owns every new onboarding signature's source document.
alter table public.onboarding_content_assets
  drop constraint onboarding_content_assets_kind_check,
  add constraint onboarding_content_assets_kind_check check (kind in ('ica','w9','direct_deposit','comp_agreement','welcome_video','surelc_video','document','video')),
  add column signing_mode text check (signing_mode in ('ica_fields','w9_fields','signature_record'));
alter table public.portal_todos drop constraint portal_todos_content_type_check,
  add constraint portal_todos_content_type_check check (content_type in ('system','ica','w9','direct_deposit','comp_agreement','welcome_video','surelc_video','document','video','link'));
update public.portal_todos set content_type = case slug when 'w9_setup' then 'w9' when 'direct_deposit_setup' then 'direct_deposit' when 'comp_agreement' then 'comp_agreement' end
where slug in ('w9_setup','direct_deposit_setup','comp_agreement');
alter table public.onboarding_flow_content
  add column w9_asset_id uuid references public.onboarding_content_assets(id),
  add column direct_deposit_asset_id uuid references public.onboarding_content_assets(id),
  add column comp_agreement_asset_id uuid references public.onboarding_content_assets(id);
-- Preserve any ICA already uploaded through the previous content editor.
update public.portal_todos t set flow_content = t.flow_content || coalesce((
  select jsonb_object_agg(c.designation, jsonb_build_object('mode','file','assetId',a.id,'filename',a.filename,'size',a.size_bytes))
  from public.onboarding_flow_content c join public.onboarding_content_assets a on a.id=c.ica_asset_id
  where not (t.flow_content ? c.designation)
), '{}'::jsonb) where t.slug='ica_setup';

alter table public.portal_w9_forms add column template_asset_id uuid references public.onboarding_content_assets(id),
  add column agent_designation text check (agent_designation in ('loa','ibo')), add column template_sha256 text;
alter table public.portal_direct_deposit_forms add column template_asset_id uuid references public.onboarding_content_assets(id),
  add column agent_designation text check (agent_designation in ('loa','ibo')), add column template_sha256 text;
alter table public.portal_comp_attachments add column template_asset_id uuid references public.onboarding_content_assets(id),
  add column agent_designation text check (agent_designation in ('loa','ibo')), add column template_sha256 text;
alter table public.portal_ica_signatures add column template_sha256 text;
alter table public.onboarding_contract_signatures add column template_sha256 text;
-- New source-backed compensation signatures are idempotent per agent/template.
create unique index portal_comp_source_unique on public.portal_comp_attachments(user_id,template_asset_id) where template_asset_id is not null;

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
    if content_kind in ('ica','w9','direct_deposit','comp_agreement') and (payload->>'published')::boolean
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

-- Block stale, missing and wrong-flow sources at the final database write too.
create function public.guard_onboarding_signing_source() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare step_slug text := tg_argv[0]; kind text := tg_argv[1]; flow_row public.onboarding_flow_content; step_row public.portal_todos; source public.onboarding_content_assets; active_id uuid;
begin
  -- Serialize activation against signature writes. Preview is server-granted only.
  perform 1 from public.onboarding_signing_rollout where id=true for share;
  if not exists(select 1 from public.onboarding_signing_rollout where id=true and enabled)
    and not exists(select 1 from public.onboarding_signing_preview_users where user_id=nullif(to_jsonb(new)->>'user_id','')::uuid) then
    return new;
  end if;
  -- Previously assigned individual compensation requests remain signable.
  if tg_table_name='portal_comp_attachments' and tg_op='UPDATE' and old.template_asset_id is null then return new; end if;
  -- Historical signed PDFs stay immutable; ordinary metadata repairs do not re-sign them.
  if tg_op='UPDATE' and new.signed_at is not distinct from old.signed_at then return new; end if;
  if new.signed_at is null then return new; end if;
  select * into step_row from public.portal_todos where slug=step_slug for share;
  if not found or not step_row.published or not (case new.agent_designation when 'loa' then step_row.show_loa when 'ibo' then step_row.show_ibo else false end) then
    raise exception 'This signing document is not enabled for your onboarding flow.';
  end if;
  select * into flow_row from public.onboarding_flow_content where designation=new.agent_designation for share;
  active_id := (to_jsonb(flow_row)->>(kind || '_asset_id'))::uuid;
  if new.template_asset_id is null or active_id is distinct from new.template_asset_id then
    raise exception 'The document has changed or is missing. Reload and review it before signing.';
  end if;
  select * into source from public.onboarding_content_assets where id=active_id and designation=new.agent_designation and onboarding_content_assets.kind=tg_argv[1];
  if not found or new.template_sha256 is distinct from source.sha256 then raise exception 'The uploaded document failed verification.'; end if;
  return new;
end $$;
revoke all on function public.guard_onboarding_signing_source() from public,anon,authenticated;
grant execute on function public.guard_onboarding_signing_source() to service_role;
create trigger onboarding_ica_source before insert or update on public.onboarding_contract_signatures for each row execute function public.guard_onboarding_signing_source('ica_setup','ica');
create trigger portal_ica_source before insert or update on public.portal_ica_signatures for each row execute function public.guard_onboarding_signing_source('ica_setup','ica');
create trigger portal_w9_source before insert or update on public.portal_w9_forms for each row execute function public.guard_onboarding_signing_source('w9_setup','w9');
create trigger portal_direct_deposit_source before insert or update on public.portal_direct_deposit_forms for each row execute function public.guard_onboarding_signing_source('direct_deposit_setup','direct_deposit');
create trigger portal_comp_source before insert or update on public.portal_comp_attachments for each row execute function public.guard_onboarding_signing_source('comp_agreement','comp_agreement');

update public.portal_todos set completion_type='auto',auto_key='comp_agreement',description='Review and sign the compensation agreement uploaded for your onboarding flow.' where slug='comp_agreement';
revoke all on public.portal_comp_attachments from public,anon,authenticated;
grant all on public.portal_comp_attachments to service_role;

-- Activation is a separate, explicit admin action after the sources are ready.
create function public.set_onboarding_signing_rollout(p_enabled boolean, p_revision integer, p_actor uuid)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.onboarding_signing_rollout; step_row public.portal_todos; flow_row public.onboarding_flow_content; source public.onboarding_content_assets; flow text; signing_kind text; source_id uuid;
begin
  select * into current_row from public.onboarding_signing_rollout where id=true for update;
  if not found then raise exception 'Signing activation is not configured.'; end if;
  if current_row.revision <> p_revision then raise exception 'Signing activation changed. Reload before continuing.'; end if;
  if p_enabled then
    for step_row in select * from public.portal_todos where slug in ('ica_setup','w9_setup','direct_deposit_setup','comp_agreement') and published for share loop
      signing_kind := case step_row.slug when 'ica_setup' then 'ica' when 'w9_setup' then 'w9' when 'direct_deposit_setup' then 'direct_deposit' else 'comp_agreement' end;
      for flow in select unnest(array['loa','ibo']) loop
        if (case flow when 'loa' then step_row.show_loa else step_row.show_ibo end) then
          select * into flow_row from public.onboarding_flow_content where designation=flow for share;
          source_id := nullif(to_jsonb(flow_row)->>(signing_kind||'_asset_id'),'')::uuid;
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
