import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { createProfileSyncHandler } from '../_shared/profileSyncServer.ts';
import { lookupCountyFromZip } from '../_shared/usZipCounty.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createProfileSyncHandler({system:'pncl',db,fetch,county:lookupCountyFromZip,defer:task=>EdgeRuntime.waitUntil(task)}));
