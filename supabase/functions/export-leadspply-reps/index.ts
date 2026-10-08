import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { buildLeadSpplyExport, type ExportUser } from '../_shared/leadspplyExport.ts';

// Deliberately a server-only endpoint with an explicit field allowlist.
// Never export onboarding documents, SSNs, passwords, or service credentials.
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
async function sameSecret(a: string, b: string) {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x,y] = await Promise.all([digest(a),digest(b)]);
  return x.reduce((n,v,i) => n | (v ^ y[i]),0) === 0;
}
Deno.serve(async req => {
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
  const key = Deno.env.get('PNCL_INTEGRATION_KEY');
  if (!key) return json(503, { error: 'Integration is not configured' });
  if (!await sameSecret(req.headers.get('X-PNCL-Integration-Key') ?? '', key)) return json(401, { error: 'Unauthorized' });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    async function allRows(table: string, columns: string) {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await db.from(table).select(columns).order(table === 'onboarding_records' ? 'id' : table === 'portal_profile_comp_level_history' ? 'id' : 'user_id').range(from, from + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) break;
      }
      return rows;
    }
    const [profiles, onboarding, history] = await Promise.all([
      allRows('portal_profiles','user_id,first_name,last_name,npn,agent_number,comp_level'),
      allRows('onboarding_records','id,supabase_user_id,referrer_user_id,personal_email,workspace_email,first_name,last_name,npn,status,released_at,created_at'),
      allRows('portal_profile_comp_level_history','id,user_id,comp_level,effective_at,created_at'),
    ]);
    const users: ExportUser[] = [];
    const domain = Deno.env.get('PNCL_EMAIL_DOMAIN') ?? 'thepncl.com';
    for (let page = 1; ; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 500 });
      if (error) throw error;
      for (const user of data.users) if (user.email?.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) users.push(user);
      if (data.users.length < 500) break;
    }
    const reps = buildLeadSpplyExport(users,profiles,onboarding,history).sort((a,b)=>a.id.localeCompare(b.id));
    return json(200, { version: 1, reps });
  } catch (error) {
    console.error('pncl_export_failed', error instanceof Error ? error.message : 'Unknown error');
    return json(500, { error: 'PNCL export failed' });
  }
});
