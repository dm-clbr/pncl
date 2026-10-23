-- Content drafts are staged as immutable assets and committed with the row in one transaction.
alter table public.portal_todos add column content_type text not null default 'system'
  check (content_type in ('system','ica','welcome_video','surelc_video','document','video','link')),
  add column flow_content jsonb not null default '{}'::jsonb;
update public.portal_todos set content_type = case
  when slug = 'ica_setup' then 'ica'
  when slug in ('onboarding_welcome_loa','onboarding_welcome_ibo') then 'welcome_video'
  when slug in ('surelc_tutorial','surelc_tutorial_ibo') then 'surelc_video' else 'system' end;
alter table public.onboarding_content_assets drop constraint onboarding_content_assets_kind_check;
alter table public.onboarding_content_assets add constraint onboarding_content_assets_kind_check
  check (kind in ('ica','welcome_video','surelc_video','document','video'));
alter table public.onboarding_flow_content add column welcome_video_url text, add column surelc_video_url text;
update storage.buckets set allowed_mime_types = array['application/pdf','video/mp4','video/webm','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id='onboarding-content';
create table public.onboarding_flow_rules (
  designation text primary key check (designation in ('loa','ibo')),
  rules jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.onboarding_flow_rules enable row level security;
revoke all on public.onboarding_flow_rules from anon, authenticated;
grant all on public.onboarding_flow_rules to service_role;

create function public.save_onboarding_editor_step(payload jsonb)
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
  for flow in select unnest(array['loa','ibo']) loop
    media := merged->flow;
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
  if content_kind in ('ica','welcome_video','surelc_video') and (payload->>'published')::boolean then
    for flow in select unnest(array['loa','ibo']) loop
      media := merged->flow;
      update public.onboarding_flow_content set
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

create function public.save_onboarding_flow_rules(flow text, settings jsonb, expected_revision integer)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_revision integer;
begin
  -- Serialize the first insert as well as subsequent updates.
  perform pg_advisory_xact_lock(hashtext('onboarding-flow-' || flow));
  select revision into current_revision from public.onboarding_flow_rules where designation=flow for update;
  if coalesce(current_revision,0) <> expected_revision then raise exception 'This flow changed in another session. Reload before saving.'; end if;
  insert into public.onboarding_flow_rules(designation,rules,revision) values(flow,settings,1)
    on conflict(designation) do update set rules=excluded.rules,revision=onboarding_flow_rules.revision+1,updated_at=now()
    returning revision into current_revision;
  return current_revision;
end $$;
revoke all on function public.save_onboarding_flow_rules(text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_onboarding_flow_rules(text,jsonb,integer) to service_role;
