import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const suppliedKey = req.headers.get('X-PNCL-Integration-Key') ?? '';
    if (!suppliedKey) return json(401, { error: 'Unauthorized' });
    const db = createClient(Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPA_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    let expectedKey = Deno.env.get('PNCL_INTEGRATION_KEY');
    if (!expectedKey) {
      const { data, error } = await db.rpc('get_pncl_integration_config');
      expectedKey = !error && typeof data?.pncl_integration_key === 'string' ? data.pncl_integration_key : undefined;
    }
    if (!expectedKey) return json(503, { error: 'Integration unavailable' });
    if (!timingSafeEqual(suppliedKey, expectedKey)) return json(401, { error: 'Unauthorized' });
    const raw = await req.text();
    if (raw.length > 40000) return json(413, { error: 'Request too large' });
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join(',') !== 'period,pnclUserIds'
      || !['week', 'month', 'last30'].includes(body.period)
      || !Array.isArray(body.pnclUserIds) || body.pnclUserIds.length < 1 || body.pnclUserIds.length > 1000
      || !body.pnclUserIds.every((id: unknown) => typeof id === 'string' && uuid.test(id))) {
      return json(400, { error: 'Invalid request body' });
    }
    const { data, error } = await db.rpc('get_pncl_team_stats', {
      p_pncl_user_ids: [...new Set(body.pnclUserIds)], p_period: body.period,
    });
    if (error || !data) return json(502, { error: 'Team stats unavailable' });
    return json(200, data);
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: 'Invalid request body' });
    console.error('pncl_team_stats_failed', { kind: error instanceof Error ? error.name : 'Unknown' });
    return json(502, { error: 'Team stats unavailable' });
  }
});
