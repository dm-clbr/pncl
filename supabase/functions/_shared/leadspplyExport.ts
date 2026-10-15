type Row = Record<string, unknown>;
// Partner pairs share a hierarchy; they remain two distinct user identities.
export function buildLeadSpplyPartners(reps: { id: string }[], links: Row[]) {
  const ids = new Set(reps.map(rep => rep.id));
  return links.filter(link => ids.has(String(link.user_id_a)) && ids.has(String(link.user_id_b)))
    .map(link => {
      const [user_id_a, user_id_b] = [String(link.user_id_a), String(link.user_id_b)].sort();
      return { user_id_a, user_id_b };
    }).sort((a, b) => a.user_id_a.localeCompare(b.user_id_a));
}
export interface ExportUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  is_anonymous?: boolean;
  app_metadata?: { onboarding_id?: string };
  user_metadata?: { first_name?: string; last_name?: string };
}

function isConfirmedEmail(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now;
}

function isUnbanned(value: string | null | undefined, now: number): boolean {
  if (!value) return true;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now;
}

/** Only Auth lifecycle fields determine whether LeadSpply may auto-connect this identity. */
export function leadSpplyExportEligibility(user: ExportUser, now = Date.now()) {
  return {
    email_verified: isConfirmedEmail(user.email_confirmed_at, now),
    account_active: !user.deleted_at && user.is_anonymous !== true && isUnbanned(user.banned_until, now),
  };
}

export function buildLeadSpplyExport(users: ExportUser[], profiles: Row[], onboarding: Row[], history: Row[], now = Date.now()) {
  return users.map(user => {
    const p=profiles.find(p=>p.user_id===user.id);
    const active=onboarding.filter(o=>o.status!=='failed'&&!o.released_at)
      .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
    // Resolve onboarding the same way as PNCL's hierarchy: server metadata,
    // then user ID, then workspace email. Only approved source fields leave.
    const o=active.find(o=>o.id===user.app_metadata?.onboarding_id)
      ?? active.find(o=>o.supabase_user_id===user.id)
      ?? active.find(o=>String(o.workspace_email??'').trim().toLowerCase()===user.email?.trim().toLowerCase());
    const h=history.filter(h=>h.user_id===user.id&&h.comp_level===p?.comp_level)
      .sort((a,b)=>String(b.effective_at).localeCompare(String(a.effective_at)) || String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)))[0];
    return { id:user.id,email:user.email ?? '',personal_email:o?.personal_email ?? null,
      first_name:o?.first_name || p?.first_name || user.user_metadata?.first_name || '',
      last_name:o?.last_name || p?.last_name || user.user_metadata?.last_name || '',
      npn:p?.npn || o?.npn || null,agent_number:p?.agent_number ?? null,
      comp_level:p?.comp_level ?? null,comp_effective_at:p?.comp_level==null ? null : h?.effective_at ?? null,
      parent_id:o?.referrer_user_id || null, ...leadSpplyExportEligibility(user, now) };
  });
}
