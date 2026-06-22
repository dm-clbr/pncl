alter table portal_brand_assets
  add column if not exists asset_type text not null default 'file',
  add column if not exists hex_color text;

alter table portal_brand_assets
  drop constraint if exists portal_brand_assets_asset_type_check;

alter table portal_brand_assets
  add constraint portal_brand_assets_asset_type_check
  check (asset_type in ('file', 'color'));

alter table portal_brand_assets
  alter column url drop not null,
  alter column file_name drop not null,
  alter column content_type drop not null;

alter table portal_brand_assets
  drop constraint if exists portal_brand_assets_payload_check;

alter table portal_brand_assets
  add constraint portal_brand_assets_payload_check
  check (
    (
      asset_type = 'file'
      and url is not null
      and file_name is not null
      and content_type is not null
    )
    or (
      asset_type = 'color'
      and hex_color is not null
    )
  );
