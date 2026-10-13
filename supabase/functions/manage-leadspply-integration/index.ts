import { AdminAuthError, requireAdmin, requirePortalUser } from '../_shared/adminAuth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { parsePortalIntegrationRequest, sanitizePortalIntegrationPreview, sanitizePortalIntegrationStatus, sanitizePortalIntegrationSync, sanitizePortalIntegrationError } from '../_shared/leadspplyIntegration.ts';

const TARGET_URL = 'https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-portal';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Authorization, Origin' },
});

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed', message: 'Method not allowed' });
  if (new URL(req.url).search) return json(400, { error: 'invalid_request', message: 'This request does not accept URL parameters.' });
  let body;
  try {
    if (Number(req.headers.get('Content-Length') ?? '0') > 131072) throw new Error('Body too large');
    const raw = await req.text();
    if (raw.length > 131072) throw new Error('Body too large');
    body = parsePortalIntegrationRequest(JSON.parse(raw));
  } catch {
    return json(400, { error: 'invalid_request', message: 'Check your connection code or account selections and try again.' });
  }
  try {
    const adminAction = body.action === 'preview' || body.action === 'sync';
    const { user } = await (adminAction ? requireAdmin(req) : requirePortalUser(req));
    const key = Deno.env.get('PNCL_INTEGRATION_KEY');
    if (!key) return json(503, { error: 'integration_unavailable', message: 'LeadSpply integration is unavailable right now.' });
    const upstreamBody = adminAction ? { ...body, sourceActorId: user.id } : { ...body, pnclUserId: user.id };
    const response = await fetch(TARGET_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'X-PNCL-Integration-Key': key },
      body: JSON.stringify(upstreamBody),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = sanitizePortalIntegrationError(response.status, payload);
      return json(error.status, error.body);
    }
    const result = body.action === 'preview' ? sanitizePortalIntegrationPreview(payload)
      : body.action === 'sync' ? sanitizePortalIntegrationSync(payload) : sanitizePortalIntegrationStatus(payload);
    return json(200, result);
  } catch (error) {
    if (error instanceof AdminAuthError) return json(error.status, { error: error.code, message: error.message });
    // Never log pairing codes, access tokens, roster data or upstream error bodies.
    console.error('pncl_portal_integration_failed', { kind: error instanceof Error ? error.name : 'Unknown error' });
    return json(502, { error: 'integration_unavailable', message: 'LeadSpply integration is unavailable right now. Try again.' });
  }
});
