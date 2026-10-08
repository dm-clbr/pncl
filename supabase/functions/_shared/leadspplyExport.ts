type Row = Record<string, unknown>;
export interface ExportUser { id: string; email?: string; app_metadata?: { onboarding_id?: string }; user_metadata?: { first_name?: string; last_name?: string } }
export function buildLeadSpplyExport(users: ExportUser[], profiles: Row[], onboarding: Row[], history: Row[]) {
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
      parent_id:o?.referrer_user_id || null };
  });
}
