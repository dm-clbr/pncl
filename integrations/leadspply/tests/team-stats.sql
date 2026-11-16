-- ISOLATED DATABASE ONLY. Minimal fixture, no production data or credentials.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA team_dashboard_private;
CREATE TABLE agent_profiles(user_id uuid PRIMARY KEY, parent_agent_id uuid, account_type text, deactivated_at timestamptz, suspended_at timestamptz, license_status text, email text);
CREATE TABLE pncl_account_links(pncl_user_id uuid PRIMARY KEY, leadspply_user_id uuid UNIQUE, sync_status text);
CREATE TABLE book_members(user_id uuid, preset text, status text, is_owner boolean);
CREATE TABLE policies_issued(agent_id uuid, annual_premium_cents bigint, application_date date, created_at timestamptz, voided_at timestamptz);
CREATE TABLE dialer_calls(agent_id uuid, created_at timestamptz, status text, direction text, fail_reason text, session_id uuid);
CREATE TABLE v_lead_funnel_attainment(agent_id uuid, attained_at timestamptz, stage int);
CREATE FUNCTION public.policy_day(d date, t timestamptz) RETURNS date LANGUAGE sql STABLE AS $$ SELECT coalesce(d, (t AT TIME ZONE 'America/Boise')::date) $$;
CREATE FUNCTION team_dashboard_private.account_vas() RETURNS TABLE(va_id uuid, rep_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT ap.user_id, ap.parent_agent_id FROM agent_profiles ap WHERE ap.account_type = 'assistant' OR EXISTS (SELECT 1 FROM book_members b WHERE b.user_id = ap.user_id AND b.preset='va_setter' AND b.status='active' AND NOT b.is_owner)
$$;
REVOKE ALL ON FUNCTION team_dashboard_private.account_vas() FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
\ir ../supabase/migrations/20261116180121_pncl_team_stats.sql
INSERT INTO agent_profiles(user_id, account_type, email) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','rep','one@example.test'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','rep','two@example.test'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','rep','three@example.test'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','assistant','va@example.test'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','rep','outsider@example.test');
UPDATE agent_profiles SET suspended_at=now() WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
UPDATE agent_profiles SET parent_agent_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
INSERT INTO pncl_account_links VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','synced'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','synced'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','synced'),
 ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','synced');
INSERT INTO policies_issued VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',123456,(now() AT TIME ZONE 'America/Boise')::date,now(),NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',99999,(now() AT TIME ZONE 'America/Boise')::date,now(),now()),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',99999,(now() AT TIME ZONE 'America/Boise')::date-40,now(),NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',99999,(now() AT TIME ZONE 'America/Boise')::date+1,now(),NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',999999,(now() AT TIME ZONE 'America/Boise')::date,now(),NULL);
INSERT INTO dialer_calls VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),'completed','outbound',NULL,NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now(),'completed','outbound',NULL,NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),'completed',NULL,'canceled',NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),'blocked','outbound',NULL,NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),'completed','inbound',NULL,NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),'completed','outbound','canceled','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now()-interval '40 days','completed','outbound',NULL,NULL),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',now(),'completed','outbound',NULL,NULL);
INSERT INTO v_lead_funnel_attainment VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),1),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now(),1),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),3),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now(),2),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now()-interval '40 days',1),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',now(),3);
DO $$ BEGIN
 ASSERT NOT has_function_privilege('anon','get_pncl_team_stats(uuid[],text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','get_pncl_team_stats(uuid[],text)','EXECUTE');
 ASSERT has_function_privilege('service_role','get_pncl_team_stats(uuid[],text)','EXECUTE');
 ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE proname='get_pncl_team_stats');
END $$;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.get_pncl_team_stats(ARRAY['11111111-1111-4111-8111-111111111111']::uuid[], 'month');
  RAISE EXCEPTION 'Expected permission denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ DECLARE r jsonb; p text; BEGIN
 FOREACH p IN ARRAY ARRAY['week','month','last30'] LOOP
  r := public.get_pncl_team_stats(ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111']::uuid[], p);
  ASSERT jsonb_array_length(r->'people')=4, 'duplicate users are counted once';
  ASSERT r#>>'{people,0,metrics,annualPremiumCents}'='123456', 'AP includes only current non-voided policies';
  ASSERT r#>>'{people,0,metrics,dials}'='3', 'VA attribution and qualifying call filters';
  ASSERT r#>>'{people,0,metrics,sets}'='2';
  ASSERT r#>>'{people,0,metrics,closes}'='1';
  ASSERT r#>>'{people,1,state}'='connected' AND r#>>'{people,1,metrics,dials}'='0', 'zero activity is distinct from missing';
  ASSERT r#>>'{people,2,state}'='account_unavailable' AND r#>'{people,2,metrics}'='null'::jsonb;
  ASSERT r#>>'{people,3,state}'='not_linked' AND r#>'{people,3,metrics}'='null'::jsonb;
  ASSERT r::text NOT LIKE '%55555555%' AND r::text NOT LIKE '%aaaaaaaa%' AND r::text NOT LIKE '%email%', 'no outsiders or source identities';
  ASSERT r#>>'{period,key}'=p AND r#>>'{period,timezone}'='America/Boise';
 END LOOP;
 BEGIN
  PERFORM public.get_pncl_team_stats(ARRAY[]::uuid[], 'month');
  RAISE EXCEPTION 'Expected invalid request';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM public.get_pncl_team_stats(ARRAY['11111111-1111-4111-8111-111111111111']::uuid[], 'all');
  RAISE EXCEPTION 'Expected invalid period';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT 'Team stats SQL fixtures passed' AS result;
