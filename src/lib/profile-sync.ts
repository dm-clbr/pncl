import {getSupabaseClient} from './supabase';
const client=()=>getSupabaseClient();
export async function profileSyncRequest(body:Record<string,unknown>):Promise<unknown>{
 const {data,error}=await client().functions.invoke('profile-sync',{body});
 if(error){
  const context=(error as {context?:Response}).context;
  const result=await context?.json().catch(()=>null);
  if(result?.outcome==='conflict')return result;
  const messages:Record<string,string>={npn_rejected:'This NPN could not be accepted. Check it in LeadSpply.',unknown_zip:'Check the ZIP code.',request_id_reused:'This save changed during a retry. Refresh before trying again.',invalid_licenses:'Enter a license number for every selected state.',invalid_file_type:'Choose a PDF, JPG, PNG, or WebP file.'};
  throw new Error(messages[result?.error]??'Profile sync could not confirm this save. Keep your changes and retry.');
 }
 return data;
}
