create table if not exists portal_todos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  href text not null,
  external boolean not null default true,
  action_label text not null,
  show_email_hint boolean not null default true,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_todos_sort_order_idx
  on portal_todos (sort_order asc, created_at asc);

alter table portal_todos enable row level security;

create policy "Authenticated users can read published todos"
  on portal_todos
  for select
  to authenticated
  using (published = true);

insert into portal_todos (
  slug,
  title,
  description,
  href,
  external,
  action_label,
  show_email_hint,
  sort_order,
  published
)
values
  (
    'leadspply_account',
    'Create your LeadSpply account',
    'Sign up at LeadSpply using your @thepncl.com email so leads and quotes stay tied to your PNCL account.',
    'https://leadspply.com/register',
    true,
    'Go to LeadSpply',
    true,
    0,
    true
  ),
  (
    'discord_account',
    'Create a Discord account and join the PNCL server',
    'Set up Discord (or sign in if you already have an account), then join our community server for announcements, training, and support.',
    'https://discord.gg/aHqQDtTmp',
    true,
    'Join Discord',
    false,
    1,
    true
  ),
  (
    'instagram_follow',
    'Follow PNCL on Instagram',
    'Follow @thepncl_ on Instagram for updates, culture posts, and agent highlights.',
    'https://www.instagram.com/thepncl_/',
    true,
    'Follow on Instagram',
    false,
    2,
    true
  ),
  (
    'linkedin_follow',
    'Follow PNCL on LinkedIn',
    'Follow The PNCL on LinkedIn to stay connected with company news and opportunities.',
    'https://www.linkedin.com/company/the-pncl/?viewAsMember=true',
    true,
    'Follow on LinkedIn',
    false,
    3,
    true
  ),
  (
    'facebook_follow',
    'Follow PNCL on Facebook',
    'Like and follow PNCL on Facebook for announcements and community updates.',
    'https://www.facebook.com/profile.php?id=61588062292202',
    true,
    'Follow on Facebook',
    false,
    4,
    true
  )
on conflict (slug) do nothing;
