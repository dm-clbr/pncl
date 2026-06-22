create table if not exists portal_brand_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text not null,
  file_name text not null,
  content_type text not null,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_brand_assets_sort_order_idx
  on portal_brand_assets (sort_order asc, created_at asc);

alter table portal_brand_assets enable row level security;

create policy "Authenticated users can read published brand assets"
  on portal_brand_assets
  for select
  to authenticated
  using (published = true);
