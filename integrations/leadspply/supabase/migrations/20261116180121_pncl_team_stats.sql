-- Hub supplies an authenticated, server-derived hierarchy allowlist. This RPC
-- is NOT callable by browser roles and does not alter LeadSpply's hierarchy.
-- Reuse the canonical VA attribution helper without granting browser access.
GRANT USAGE ON SCHEMA team_dashboard_private TO service_role;
GRANT EXECUTE ON FUNCTION team_dashboard_private.account_vas() TO service_role;

CREATE OR REPLACE FUNCTION public.get_pncl_team_stats(p_pncl_user_ids uuid[], p_period text DEFAULT 'month')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Boise')::date;
  v_from date;
  v_result jsonb;
BEGIN
  IF current_user IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_pncl_user_ids IS NULL OR cardinality(p_pncl_user_ids) NOT BETWEEN 1 AND 1000
     OR array_position(p_pncl_user_ids, NULL) IS NOT NULL
     OR p_period IS NULL OR p_period NOT IN ('week', 'month', 'last30') THEN
    RAISE EXCEPTION 'Invalid team stats request' USING ERRCODE = '22023';
  END IF;
  v_from := CASE p_period WHEN 'week' THEN date_trunc('week', v_today::timestamp)::date
    WHEN 'month' THEN date_trunc('month', v_today::timestamp)::date ELSE v_today - 29 END;

  WITH requested AS (
    SELECT DISTINCT unnest(p_pncl_user_ids) AS id
  ), vas AS MATERIALIZED (
    SELECT * FROM team_dashboard_private.account_vas()
  ), linked AS MATERIALIZED (
    SELECT r.id, ap.user_id AS agent_id,
      CASE WHEN l.pncl_user_id IS NULL THEN 'not_linked'
        WHEN ap.user_id IS NULL OR ap.deactivated_at IS NOT NULL OR ap.suspended_at IS NOT NULL
          OR ap.license_status = 'suspended' OR ap.email LIKE '%@deleted.local'
          OR l.sync_status = 'source_missing' OR EXISTS (SELECT 1 FROM vas WHERE va_id = ap.user_id)
          THEN 'account_unavailable'
        ELSE 'connected' END AS state
    FROM requested r
    LEFT JOIN public.pncl_account_links l ON l.pncl_user_id = r.id
    LEFT JOIN public.agent_profiles ap ON ap.user_id = l.leadspply_user_id
  ), active AS MATERIALIZED (
    SELECT agent_id FROM linked WHERE state = 'connected'
  ), activity_owners AS MATERIALIZED (
    SELECT agent_id AS actor_id, agent_id FROM active
    UNION
    SELECT v.va_id, a.agent_id FROM active a JOIN vas v ON v.rep_id = a.agent_id
  ), production AS (
    SELECT p.agent_id, sum(coalesce(p.annual_premium_cents, 0))::bigint AS ap
    FROM public.policies_issued p JOIN active a ON a.agent_id = p.agent_id
    WHERE p.voided_at IS NULL AND public.policy_day(p.application_date, p.created_at) BETWEEN v_from AND v_today
    GROUP BY p.agent_id
  ), dialed AS (
    SELECT a.agent_id, count(*)::bigint AS dials
    FROM public.dialer_calls dc JOIN activity_owners a ON a.actor_id = dc.agent_id
    WHERE dc.created_at >= (v_from::timestamp AT TIME ZONE 'America/Boise')
      AND dc.created_at < ((v_today + 1)::timestamp AT TIME ZONE 'America/Boise')
      AND dc.status <> 'blocked' AND coalesce(dc.direction, 'outbound') = 'outbound'
      AND (dc.fail_reason IS DISTINCT FROM 'canceled' OR dc.session_id IS NULL)
    GROUP BY a.agent_id
  ), funnel AS (
    SELECT a.agent_id, count(*) FILTER (WHERE f.stage = 1)::bigint AS sets,
      count(*) FILTER (WHERE f.stage = 3)::bigint AS closes
    FROM public.v_lead_funnel_attainment f JOIN activity_owners a ON a.actor_id = f.agent_id
    WHERE f.attained_at >= (v_from::timestamp AT TIME ZONE 'America/Boise')
      AND f.attained_at < ((v_today + 1)::timestamp AT TIME ZONE 'America/Boise')
    GROUP BY a.agent_id
  )
  SELECT jsonb_build_object('version', 1, 'asOf', now(),
    'period', jsonb_build_object('key', p_period, 'from', v_from, 'to', v_today, 'timezone', 'America/Boise'),
    'people', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'state', l.state,
      'metrics', CASE WHEN l.state = 'connected' THEN jsonb_build_object(
        'annualPremiumCents', coalesce(p.ap, 0), 'dials', coalesce(d.dials, 0),
        'sets', coalesce(f.sets, 0), 'closes', coalesce(f.closes, 0)) ELSE NULL END
    ) ORDER BY l.id), '[]'::jsonb)) INTO v_result
  FROM linked l LEFT JOIN production p ON p.agent_id = l.agent_id
  LEFT JOIN dialed d ON d.agent_id = l.agent_id LEFT JOIN funnel f ON f.agent_id = l.agent_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_pncl_team_stats(uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pncl_team_stats(uuid[], text) TO service_role;
NOTIFY pgrst, 'reload schema';
