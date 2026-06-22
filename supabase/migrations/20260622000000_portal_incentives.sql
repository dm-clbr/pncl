create table if not exists portal_incentives (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  type text not null check (type in ('image', 'video')),
  src text not null,
  poster text,
  href text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_incentives_video_poster check (
    type = 'image' or poster is not null
  )
);

create index if not exists portal_incentives_sort_order_idx
  on portal_incentives (sort_order asc, created_at asc);

alter table portal_incentives enable row level security;

create policy "Authenticated users can read published incentives"
  on portal_incentives
  for select
  to authenticated
  using (published = true);

insert into portal_incentives (slug, title, type, src, poster, sort_order, published)
values
  ('archetype-v4', 'Archetype Poster', 'image', '/ARCHETYPE POSTER V4.png', null, 0, true),
  ('archetype-v3', 'Archetype Poster V3', 'image', '/ARCHETYPE POSTER V3.png', null, 1, true),
  ('pillar-001', 'Pillar 01', 'image', '/001.png', null, 2, true),
  ('pillar-002', 'Pillar 02', 'image', '/002.png', null, 3, true),
  ('pillar-003', 'Pillar 03', 'image', '/003.png', null, 4, true),
  ('pillar-004', 'Pillar 04', 'image', '/004.png', null, 5, true),
  ('culture', 'PNCL Culture', 'image', '/pncl culture 1.png', null, 6, true),
  (
    'agents-video',
    'PNCL Agents',
    'video',
    'https://vz-db1532c9-ef4.b-cdn.net/3b0c4b43-8a73-49c4-8009-c8de3f4007f6/play_720p.mp4',
    'https://vz-db1532c9-ef4.b-cdn.net/3b0c4b43-8a73-49c4-8009-c8de3f4007f6/thumbnail.jpg',
    7,
    true
  )
on conflict (slug) do nothing;
