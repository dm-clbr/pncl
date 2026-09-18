-- Mutual of Omaha contracts through the Pinnacle Life Group SureLC account.
-- The Stage 3 application instructions are built from these carrier rows, so
-- moving the source row updates both the carrier sheet and onboarding copy.
do $$
declare
  mutual_name_pattern constant text := 'mutual of omaha%';
  destination_section text;
  destination_last_order integer;
begin
  select section
  into destination_section
  from public.portal_carriers
  where section ilike 'SureLC #3%'
  order by sort_order asc, created_at asc
  limit 1;

  destination_section := coalesce(
    destination_section,
    'SureLC #3 — "Pinnacle Life Group"'
  );

  -- An admin may already have corrected the carrier sheet before this
  -- migration reaches an environment. In that case, preserve its saved order.
  if not exists (
    select 1
    from public.portal_carriers
    where carrier ilike mutual_name_pattern
      and section is distinct from destination_section
  ) then
    return;
  end if;

  select coalesce(
    max(sort_order),
    (select coalesce(max(sort_order), -1) from public.portal_carriers)
  )
  into destination_last_order
  from public.portal_carriers
  where section = destination_section
    and carrier not ilike mutual_name_pattern;

  update public.portal_carriers
  set section = destination_section,
      updated_at = now()
  where carrier ilike mutual_name_pattern;

  -- Place Mutual immediately after the last existing SureLC #3 carrier and
  -- normalize the integer positions without changing any other relative order.
  with ranked as (
    select
      id,
      (row_number() over (
        order by
          case
            when carrier ilike mutual_name_pattern then destination_last_order
            else sort_order
          end,
          case
            when carrier ilike mutual_name_pattern then 1
            when section = destination_section then 0
            else 2
          end,
          created_at,
          id
      ) - 1)::integer as next_sort_order
    from public.portal_carriers
  )
  update public.portal_carriers as carrier
  set sort_order = ranked.next_sort_order,
      updated_at = case
        when carrier.sort_order <> ranked.next_sort_order then now()
        else carrier.updated_at
      end
  from ranked
  where carrier.id = ranked.id;
end
$$;
