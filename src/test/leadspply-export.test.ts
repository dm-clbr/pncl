import { describe,it,expect } from 'vitest';
import { buildLeadSpplyExport } from '../../supabase/functions/_shared/leadspplyExport';
describe('LeadSpply export',()=>{
 const user={id:'u1',email:'jane@thepncl.com',app_metadata:{onboarding_id:'o1'}};
 const onboarding=[{id:'o1',supabase_user_id:'u1',first_name:'Jane',last_name:'Doe',personal_email:'jane@gmail.com',workspace_email:user.email,referrer_user_id:'parent',npn:'1234',status:'ready',created_at:'2026-10-01',ssn_encrypted:'secret',temporary_password_encrypted:'secret'}];
 it('exports identity, parent and tier with effective date',()=>{
  const [r]=buildLeadSpplyExport([user],[{user_id:'u1',comp_level:90,agent_number:12}],onboarding,[{user_id:'u1',comp_level:90,effective_at:'2026-10-01'}]);
  expect(r).toMatchObject({first_name:'Jane',parent_id:'parent',comp_level:90,npn:'1234',comp_effective_at:'2026-10-01'});
  expect(r).not.toHaveProperty('ssn_encrypted');expect(r).not.toHaveProperty('temporary_password_encrypted');expect(r).not.toHaveProperty('app_metadata');
 });
 it('resolves metadata ahead of later duplicate records',()=>expect(buildLeadSpplyExport([user],[],[...onboarding,{...onboarding[0],id:'o2',created_at:'2026-10-02',referrer_user_id:'wrong'}],[])[0].parent_id).toBe('parent'));
 it('falls back to workspace email for legacy records',()=>expect(buildLeadSpplyExport([{id:'legacy',email:user.email}],[],onboarding,[])[0].parent_id).toBe('parent'));
 it('ignores released and failed enrollments',()=>expect(buildLeadSpplyExport([user],[],[{...onboarding[0],released_at:'2026-10-02'},{...onboarding[0],id:'bad',status:'failed'}],[])[0].parent_id).toBeNull());
 it('includes PNCL users without portal profile instead of omitting an upline',()=>expect(buildLeadSpplyExport([user],[],onboarding,[])[0]).toMatchObject({id:'u1',comp_level:null,agent_number:null}));
 it('does not invent the date of an unknown or cleared tier',()=>{
  expect(buildLeadSpplyExport([user],[{user_id:'u1',comp_level:95}],[],[{user_id:'u1',comp_level:90,effective_at:'2026-10-01'}])[0].comp_effective_at).toBeNull();
  expect(buildLeadSpplyExport([user],[{user_id:'u1',comp_level:null}],[],[{user_id:'u1',comp_level:90,effective_at:'2026-10-01'}])[0].comp_effective_at).toBeNull();
 });
});
