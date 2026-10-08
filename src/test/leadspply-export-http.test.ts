import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { buildLeadSpplyExport } from '../../supabase/functions/_shared/leadspplyExport';
function load(env:Record<string,string>) {
 let handler:(req:Request)=>Promise<Response>;
 const file=resolve('supabase/functions/export-leadspply-reps/index.ts');
 const source=readFileSync(file,'utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 new Function('Deno','createClient','crypto','buildLeadSpplyExport','console',code)(
  {env:{get:(key:string)=>env[key]},serve:(h:typeof handler)=>{handler=h;}},()=>{throw new Error('Unauthorized database access');},webcrypto,buildLeadSpplyExport,{error:()=>{}});
 return (req:Request)=>handler(req);
}
describe('PNCL server-only export',()=>{
 it('requires a configured secret',async()=>expect((await load({})(new Request('https://source/export'))).status).toBe(503));
 it('rejects a missing or incorrect secret',async()=>{
  const handler=load({PNCL_INTEGRATION_KEY:'fixture-key'});expect((await handler(new Request('https://source/export'))).status).toBe(401);
  expect((await handler(new Request('https://source/export',{headers:{'X-PNCL-Integration-Key':'wrong'}}))).status).toBe(401);
 });
 it('rejects mutation requests',async()=>expect((await load({PNCL_INTEGRATION_KEY:'fixture-key'})(new Request('https://source/export',{method:'POST'}))).status).toBe(405));
});
