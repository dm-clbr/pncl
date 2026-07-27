-- Add the SureLC tutorial video link (Bunny.net player) to the
-- "Watch the SureLC tutorial video" licensing step.
update portal_todos set
  href = 'https://player.mediadelivery.net/play/687293/38ad7bc0-adc1-4c37-af86-7f49705a18b6',
  external = true,
  action_label = 'Watch tutorial video',
  updated_at = now()
where slug = 'surelc_tutorial';
