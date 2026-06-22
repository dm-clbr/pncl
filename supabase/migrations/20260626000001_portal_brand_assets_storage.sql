insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-brand-assets',
  'portal-brand-assets',
  true,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read portal brand assets"
  on storage.objects
  for select
  to public
  using (bucket_id = 'portal-brand-assets');
