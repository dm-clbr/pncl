import { getEmailDomain } from "./onboarding.ts";
import { checkWorkspaceUserExists } from "./googleWorkspace.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function normalizeNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "");
}

export function buildEmailLocalPart(firstName: string, lastName: string, suffix = ""): string {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  const base = `${first}.${last}${suffix}`;
  return base.replace(/\.+/g, ".").replace(/^\.+|\.+$/g, "");
}

export function buildWorkspaceEmail(
  firstName: string,
  lastName: string,
  suffix = "",
  domain = getEmailDomain(),
): string {
  const localPart = buildEmailLocalPart(firstName, lastName, suffix);
  return `${localPart}@${domain}`;
}

async function emailTakenInDatabase(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select("id")
    .eq("workspace_email", email)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to verify email availability");
  }

  return !!data;
}

export async function generateAvailableWorkspaceEmail(
  supabase: SupabaseClient,
  firstName: string,
  lastName: string,
): Promise<string> {
  const domain = getEmailDomain();

  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = attempt === 0 ? "" : String(attempt + 1);
    const email = buildWorkspaceEmail(firstName, lastName, suffix, domain);

    const inDatabase = await emailTakenInDatabase(supabase, email);
    if (inDatabase) continue;

    const inGoogle = await checkWorkspaceUserExists(email);
    if (inGoogle) continue;

    return email;
  }

  throw new Error("Unable to generate an available workspace email");
}
