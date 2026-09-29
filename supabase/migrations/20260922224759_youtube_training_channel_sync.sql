-- Track the YouTube identity separately from the display URL so repeated
-- channel refreshes can add new videos without duplicating existing modules.
alter table public.portal_disclosures
  add column if not exists youtube_video_id text,
  add column if not exists youtube_published_at timestamptz;

update public.portal_disclosures
set youtube_video_id = (
  regexp_match(
    video_url,
    '(v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})'
  )
)[2]
where youtube_video_id is null
  and video_url is not null
  and video_url ~ '(v=|youtu\.be/|embed/)[A-Za-z0-9_-]{11}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_disclosures_youtube_video_id_valid'
      and conrelid = 'public.portal_disclosures'::regclass
  ) then
    alter table public.portal_disclosures
      add constraint portal_disclosures_youtube_video_id_valid
      check (
        youtube_video_id is null
        or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_disclosures_youtube_video_id_key'
      and conrelid = 'public.portal_disclosures'::regclass
  ) then
    alter table public.portal_disclosures
      add constraint portal_disclosures_youtube_video_id_key
      unique (youtube_video_id);
  end if;
end
$$;
