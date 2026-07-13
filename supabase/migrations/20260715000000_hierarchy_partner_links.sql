-- Business partner links: two agents displayed as one combined hierarchy node.
create table if not exists hierarchy_partner_links (
  id uuid primary key default gen_random_uuid(),
  user_id_a uuid not null,
  user_id_b uuid not null,
  created_at timestamptz not null default now(),
  created_by_admin_id uuid,
  constraint hierarchy_partner_distinct check (user_id_a < user_id_b),
  constraint hierarchy_partner_unique unique (user_id_a, user_id_b)
);

create index if not exists hierarchy_partner_links_user_a_idx
  on hierarchy_partner_links (user_id_a);

create index if not exists hierarchy_partner_links_user_b_idx
  on hierarchy_partner_links (user_id_b);

alter table hierarchy_partner_links enable row level security;
