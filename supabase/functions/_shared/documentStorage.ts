import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const DOCUMENT_BUCKET = "portal-signing-documents";

export async function documentUrl(client: SupabaseClient, path: string, bucket = DOCUMENT_BUCKET): Promise<string> {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Unable to open the document. Please retry.");
  return data.signedUrl;
}
