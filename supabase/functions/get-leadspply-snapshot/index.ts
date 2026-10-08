import { AdminAuthError, requirePortalUser } from '../_shared/adminAuth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeLeadSpplySnapshot } from '../_shared/leadspplySnapshot.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers:{ ...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Authorization, Origin' },
});

Deno.serve(async req => {
  if (req.method==='OPTIONS') return new Response(null,{ status:204,headers:corsHeaders });
  if (req.method!=='GET') return json(405,{ error:'method_not_allowed',message:'Method not allowed' });
  // Identity and destination are always derived on the server. Browser callers
  // cannot select an agent, a LeadSpply user ID, or an upstream URL.
  if ([...new URL(req.url).searchParams.keys()].length) return json(400,{ error:'invalid_request',message:'This request does not accept agent identifiers or parameters.' });
  try {
    const { user }=await requirePortalUser(req);
    const key=Deno.env.get('PNCL_INTEGRATION_KEY');
    const endpoint=Deno.env.get('LEADSPPLY_SNAPSHOT_URL');
    if (!key || !endpoint) return json(503,{ error:'snapshot_unavailable',message:'LeadSpply data is unavailable right now.' });
    const url=new URL(endpoint);
    if (url.protocol!=='https:' || url.hostname!=='lhxvbtiepsuohunfmnkm.supabase.co' || url.pathname!=='/functions/v1/pncl-agent-snapshot' || url.username || url.password || url.search || url.hash || url.port) {
      return json(503,{ error:'snapshot_unavailable',message:'LeadSpply data is unavailable right now.' });
    }
    const response=await fetch(url.toString(),{ method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'application/json','X-PNCL-Integration-Key':key},body:JSON.stringify({pnclUserId:user.id}) });
    if (!response.ok) {
      console.error('portal_leadspply_snapshot_upstream_failed',{status:response.status});
      return json(502,{ error:'snapshot_unavailable',message:'Unable to load LeadSpply data right now. Try refreshing.' });
    }
    return json(200,sanitizeLeadSpplySnapshot(await response.json()));
  } catch(error) {
    if (error instanceof AdminAuthError) return json(error.status,{error:error.code,message:error.message});
    console.error('portal_leadspply_snapshot_failed',{kind:error instanceof Error ? error.name : 'Unknown error'});
    return json(502,{ error:'snapshot_unavailable',message:'Unable to load LeadSpply data right now. Try refreshing.' });
  }
});
