insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-incentives',
  'portal-incentives',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read portal incentive media"
  on storage.objects
  for select
  to public
  using (bucket_id = 'portal-incentives');
