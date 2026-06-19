import { getEmailDomain } from "./onboarding.ts";
import {
  getWorkspaceEmailAvailability,
  listWorkspaceEmailsForLocalPart,
} from "./googleWorkspace.ts";
import { logOnboarding } from "./logger.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ACTIVE_ONBOARDING_STATUSES = [
  "pending",
  "creating_email",
  "email_created",
  "ready",
  "credentials_viewed",
] as const;

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

async function emailTakenInActiveOnboarding(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select("id, status")
    .eq("workspace_email", email)
    .in("status", [...ACTIVE_ONBOARDING_STATUSES])
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
  const localPartBase = buildEmailLocalPart(firstName, lastName);

  const inventory = await listWorkspaceEmailsForLocalPart(localPartBase, domain);
  logOnboarding("workspace_email_inventory", {
    localPartBase,
    activeInGoogle: inventory.active,
    deletedInGoogle: inventory.deleted,
  });

  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = attempt === 0 ? "" : String(attempt + 1);
    const email = buildWorkspaceEmail(firstName, lastName, suffix, domain);

    const inDatabase = await emailTakenInActiveOnboarding(supabase, email);
    if (inDatabase) {
      logOnboarding("workspace_email_taken_in_db", { email, attempt });
      continue;
    }

    const availability = await getWorkspaceEmailAvailability(email);
    if (availability.status === "error") {
      logOnboarding("workspace_email_check_failed", { email, attempt, error: availability.message }, "error");
      throw new Error(availability.message);
    }

    if (availability.status === "active") {
      logOnboarding("workspace_email_taken_in_google", {
        email,
        attempt,
        userId: availability.userId,
      });
      continue;
    }

    if (availability.status === "deleted") {
      logOnboarding("workspace_email_reserved_in_google_trash", {
        email,
        attempt,
        userId: availability.userId,
        deletionTime: availability.deletionTime ?? null,
      });
      continue;
    }

    logOnboarding("workspace_email_selected", { email, attempt });
    return email;
  }

  logOnboarding("workspace_email_exhausted", {
    firstName,
    lastName,
    activeInGoogle: inventory.active,
    deletedInGoogle: inventory.deleted,
  }, "error");

  throw new Error(
    "Unable to generate an available workspace email. Check Google Admin for active or recently deleted users with this name.",
  );
}
