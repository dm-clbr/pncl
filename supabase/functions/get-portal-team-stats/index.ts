import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { AdminAuthError, requirePortalUser } from '../_shared/adminAuth.ts';
import { loadPortalTeamScope } from '../_shared/portalHierarchyData.ts';
import { sanitizePortalTeamStats, type PortalTeamStats, type TeamStatsPeriod } from '../_shared/portalTeamStats.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Authorization, Origin' },
});
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'GET') return json(405, { message: 'Method not allowed' });
  const params = new URL(req.url).searchParams;
  const period = params.get('period') ?? 'month';
  if ([...params.keys()].some(key => key !== 'period') || params.getAll('period').length > 1
    || !['week', 'month', 'last30'].includes(period)) return json(400, { message: 'Invalid stats request' });
  try {
    const { user, adminClient } = await requirePortalUser(req);
    // Browser input NEVER supplies a member list or viewer identity. Hub owns the hierarchy.
    const { ids } = await loadPortalTeamScope(adminClient, user.id);
    if (!ids.length) return json(200, { state: 'no_hierarchy' });
    const key = Deno.env.get('PNCL_INTEGRATION_KEY');
    const snapshotUrl = Deno.env.get('LEADSPPLY_SNAPSHOT_URL');
    if (!key || !snapshotUrl) return json(503, { message: 'LeadSpply stats are unavailable right now.' });
    const url = new URL(snapshotUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'lhxvbtiepsuohunfmnkm.supabase.co'
      || url.pathname !== '/functions/v1/pncl-agent-snapshot' || url.username || url.password || url.search || url.hash || url.port) {
      return json(503, { message: 'LeadSpply stats are unavailable right now.' });
    }
    url.pathname = '/functions/v1/pncl-team-stats';
    const signal = AbortSignal.timeout(20000);
    let result: PortalTeamStats | null = null;
    // Bound upstream batches; one deadline covers the whole request.
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500);
      const upstream = await fetch(url, { method: 'POST', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json', 'X-PNCL-Integration-Key': key },
        body: JSON.stringify({ pnclUserIds: batch, period }) });
      if (!upstream.ok) throw new Error('Upstream unavailable');
      const clean = sanitizePortalTeamStats(await upstream.json(), batch, period as TeamStatsPeriod);
      if (!result) result = clean;
      else {
        if (result.period.from !== clean.period.from || result.period.to !== clean.period.to) throw new Error('Period changed');
        result.people.push(...clean.people);
      }
    }
    return json(200, result);
  } catch (error) {
    if (error instanceof AdminAuthError) return json(error.status, { message: error.message });
    console.error('portal_team_stats_failed', { kind: error instanceof Error ? error.name : 'Unknown' });
    return json(502, { message: 'Unable to load LeadSpply stats. Try refreshing.' });
  }
});
