-- Retire the compensation requirement from the saved legacy checklist too.
-- Agents still use this snapshot while uploaded signing is inactive; changing
-- portal_todos alone does not remove the old requirement.
-- Preserve the entry for history, all other signing steps, and rollout mode.
-- No compensation records, signatures, PDFs, or completion metadata are changed.
with revised as (
  select r.id, jsonb_agg(
    case when step.value->>'slug' = 'comp_agreement'
      then step.value || '{"published":false,"show_loa":false,"show_ibo":false}'::jsonb
      else step.value
    end order by step.ordinality
  ) as legacy_steps
  from public.onboarding_signing_rollout r
  cross join lateral jsonb_array_elements(r.legacy_steps) with ordinality as step(value, ordinality)
  where r.id = true
  group by r.id
)
update public.onboarding_signing_rollout r
set legacy_steps = revised.legacy_steps,
    revision = r.revision + 1,
    updated_at = now()
from revised
where r.id = revised.id
  and r.legacy_steps is distinct from revised.legacy_steps;
