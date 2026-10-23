-- Immutable source files; changing a flow never edits an already signed PDF.
create table public.onboarding_content_assets (
  id uuid primary key,
  designation text not null check (designation in ('loa', 'ibo')),
  kind text not null check (kind in ('ica', 'welcome_video', 'surelc_video')),
  path text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.onboarding_flow_content (
  designation text primary key check (designation in ('loa', 'ibo')),
  ica_asset_id uuid references public.onboarding_content_assets(id),
  welcome_video_asset_id uuid references public.onboarding_content_assets(id),
  surelc_video_asset_id uuid references public.onboarding_content_assets(id),
  updated_at timestamptz not null default now()
);
insert into public.onboarding_flow_content(designation) values ('loa'), ('ibo');
alter table public.onboarding_content_assets enable row level security;
alter table public.onboarding_flow_content enable row level security;
revoke all on public.onboarding_content_assets, public.onboarding_flow_content from anon, authenticated;
grant all on public.onboarding_content_assets, public.onboarding_flow_content to service_role;

-- Blank templates and training videos are public, like the existing bundled ICA
-- and Bunny videos. Signed agreements remain in the existing private buckets.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding-content', 'onboarding-content', true, 52428800,
  array['application/pdf', 'video/mp4', 'video/webm'])
on conflict(id) do nothing;

insert into public.portal_todos
  (slug, title, description, href, external, action_label, show_email_hint, sort_order, published, phase, completion_type, auto_key, gated, show_loa, show_ibo)
values
  ('onboarding_welcome_loa', 'Watch your LOA welcome & training video', 'Watch the full onboarding video to get started with PNCL.', '', true, 'Watch welcome video', false, 9, false, 'on_board', 'agent', null, false, true, false),
  ('onboarding_welcome_ibo', 'Watch your IBO welcome & training video', 'Watch the full onboarding video to get started with PNCL.', '', true, 'Watch welcome video', false, 9, false, 'on_board', 'agent', null, false, false, true)
on conflict(slug) do nothing;

-- Lock one flow row so concurrent uploads publish whole versions atomically.
create function public.publish_onboarding_content(asset jsonb, video_url text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  flow text := asset->>'designation';
  asset_kind text := asset->>'kind';
  asset_id uuid := (asset->>'id')::uuid;
  todo_slug text;
begin
  if flow not in ('loa', 'ibo') or asset_kind not in ('ica', 'welcome_video', 'surelc_video') then
    raise exception 'Invalid onboarding content';
  end if;
  perform 1 from public.onboarding_flow_content where designation = flow for update;
  if not found then raise exception 'Onboarding flow not found'; end if;
  insert into public.onboarding_content_assets(id, designation, kind, path, filename, content_type, size_bytes, sha256, created_by)
  values (asset_id, flow, asset_kind, asset->>'path', asset->>'filename', asset->>'content_type',
    (asset->>'size_bytes')::bigint, asset->>'sha256', (asset->>'created_by')::uuid);
  update public.onboarding_flow_content set
    ica_asset_id = case when asset_kind = 'ica' then asset_id else ica_asset_id end,
    welcome_video_asset_id = case when asset_kind = 'welcome_video' then asset_id else welcome_video_asset_id end,
    surelc_video_asset_id = case when asset_kind = 'surelc_video' then asset_id else surelc_video_asset_id end,
    updated_at = now()
  where designation = flow;
  if asset_kind <> 'ica' then
    if video_url is null or video_url not like 'https://%' then raise exception 'Video URL required'; end if;
    todo_slug := case when asset_kind = 'welcome_video' then 'onboarding_welcome_' || flow
      when flow = 'ibo' then 'surelc_tutorial_ibo' else 'surelc_tutorial' end;
    update public.portal_todos set href = video_url, external = true,
      published = true, show_loa = (flow = 'loa'), show_ibo = (flow = 'ibo'), updated_at = now()
    where slug = todo_slug;
    if not found then raise exception 'Video checklist step not found'; end if;
  end if;
end;
$$;
revoke all on function public.publish_onboarding_content(jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_onboarding_content(jsonb, text) to service_role;

alter table public.onboarding_contract_signatures
  add column agent_designation text check (agent_designation in ('loa', 'ibo')),
  add column template_asset_id uuid references public.onboarding_content_assets(id);
-- Signature records are accessed only by authenticated server endpoints.
alter table public.onboarding_contract_signatures enable row level security;
revoke all on public.onboarding_contract_signatures from public, anon, authenticated;
grant all on public.onboarding_contract_signatures to service_role;
alter table public.portal_ica_signatures
  add column agent_designation text check (agent_designation in ('loa', 'ibo')),
  add column template_asset_id uuid references public.onboarding_content_assets(id);
alter table public.onboarding_records
  add column other_imo_name text,
  add column other_imo_carriers text[] not null default '{}',
  add constraint onboarding_other_imo_name_length check (char_length(other_imo_name) <= 200),
  add constraint onboarding_other_imo_carrier_count check (cardinality(other_imo_carriers) <= 50);
