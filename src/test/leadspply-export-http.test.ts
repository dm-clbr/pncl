import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { buildLeadSpplyExport,buildLeadSpplyPartners } from '../../supabase/functions/_shared/leadspplyExport';
function load(env:Record<string,string>,db?:unknown) {
 let handler:(req:Request)=>Promise<Response>;
 const file=resolve('supabase/functions/export-leadspply-reps/index.ts');
 const source=readFileSync(file,'utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 new Function('Deno','createClient','crypto','buildLeadSpplyExport','buildLeadSpplyPartners','console',code)(
  {env:{get:(key:string)=>env[key]},serve:(h:typeof handler)=>{handler=h;}},()=>{if(db)return db;throw new Error('Unauthorized database access');},webcrypto,buildLeadSpplyExport,buildLeadSpplyPartners,{error:()=>{}});
 return (req:Request)=>handler(req);
}
describe('PNCL server-only export',()=>{
 it('requires a configured secret',async()=>expect((await load({})(new Request('https://source/export'))).status).toBe(503));
 it('rejects a missing or incorrect secret',async()=>{
  const handler=load({PNCL_INTEGRATION_KEY:'fixture-key'});expect((await handler(new Request('https://source/export'))).status).toBe(401);
  expect((await handler(new Request('https://source/export',{headers:{'X-PNCL-Integration-Key':'wrong'}}))).status).toBe(401);
 });
 it('rejects mutation requests',async()=>expect((await load({PNCL_INTEGRATION_KEY:'fixture-key'})(new Request('https://source/export',{method:'POST'}))).status).toBe(405));
 it('returns a v2 allowlisted snapshot with authoritative partner pairs',async()=>{
  const db={auth:{admin:{listUsers:async()=>({data:{users:[{id:'a',email:'a@thepncl.com'},{id:'b',email:'b@thepncl.com'}]},error:null})}},
    from:(table:string)=>{const chain={select:()=>chain,order:()=>chain,range:async()=>({data:table==='hierarchy_partner_links'?[{id:'row',user_id_a:'b',user_id_b:'a',created_by_admin_id:'private'}]:[],error:null})};return chain;}};
  const response=await load({PNCL_INTEGRATION_KEY:'fixture-key'},db)(new Request('https://source/export',{headers:{'X-PNCL-Integration-Key':'fixture-key'}}));
  expect(response.status).toBe(200);
  const body=await response.json();expect(body.version).toBe(2);expect(body.reps).toHaveLength(2);
  expect(body.partners).toEqual([{user_id_a:'a',user_id_b:'b'}]);
 });
});
