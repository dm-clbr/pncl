import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { logOnboarding } from "./logger.ts";

const DIRECTORY_USER_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";

let cachedToken: { value: string; expiresAt: number } | null = null;

function getPrivateKey(): string {
  const key = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!key) {
    throw new Error("Missing Google service account private key");
  }
  return key.replace(/\\n/g, "\n");
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientEmail = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const adminEmail = getRequiredEnv("GOOGLE_WORKSPACE_ADMIN_EMAIL");
  const privateKey = getPrivateKey();
  const cryptoKey = await importPKCS8(privateKey, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: DIRECTORY_USER_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(adminEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(cryptoKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    logOnboarding("google_auth_failed", { status: response.status }, "error");
    throw new Error("Unable to authenticate with Google Workspace");
  }

  const payload = await response.json();
  logOnboarding("google_auth_succeeded");
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

interface GoogleDirectoryUser {
  id?: string;
  primaryEmail?: string;
  deletionTime?: string;
}

export type WorkspaceEmailAvailability =
  | { status: "available" }
  | { status: "active"; userId: string; email: string }
  | { status: "deleted"; userId: string; email: string; deletionTime?: string }
  | { status: "error"; message: string };

async function listWorkspaceUsers(
  query: string,
  showDeleted: boolean,
): Promise<GoogleDirectoryUser[]> {
  const token = await getAccessToken();
  const customerId = getRequiredEnv("GOOGLE_WORKSPACE_CUSTOMER_ID");
  const users: GoogleDirectoryUser[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
    url.searchParams.set("customer", customerId);
    url.searchParams.set("query", query);
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("showDeleted", showDeleted ? "true" : "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Unable to list Google Workspace users (${response.status}): ${body.slice(0, 300)}`);
    }

    const payload = await response.json();
    users.push(...(payload.users ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return users;
}

export async function getWorkspaceEmailAvailability(
  email: string,
): Promise<WorkspaceEmailAvailability> {
  const normalizedEmail = email.toLowerCase();

  try {
    const token = await getAccessToken();
    const customerId = getRequiredEnv("GOOGLE_WORKSPACE_CUSTOMER_ID");
    const response = await fetch(
      `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}?customer=${customerId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (response.ok) {
      const user = await response.json();
      return {
        status: "active",
        userId: user.id as string,
        email: user.primaryEmail as string,
      };
    }

    if (response.status !== 404) {
      const body = await response.text();
      return { status: "error", message: `Google API ${response.status}: ${body.slice(0, 200)}` };
    }

    const deletedMatches = await listWorkspaceUsers(`email:${email}`, true);
    const deletedUser = deletedMatches.find(
      (user) => user.primaryEmail?.toLowerCase() === normalizedEmail && user.deletionTime,
    );

    if (deletedUser?.id) {
      return {
        status: "deleted",
        userId: deletedUser.id,
        email: deletedUser.primaryEmail ?? email,
        deletionTime: deletedUser.deletionTime,
      };
    }

    return { status: "available" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify Google Workspace user";
    return { status: "error", message };
  }
}

export async function checkWorkspaceUserExists(email: string): Promise<boolean> {
  const availability = await getWorkspaceEmailAvailability(email);
  return availability.status === "active";
}

export interface WorkspaceEmailInventory {
  active: string[];
  deleted: string[];
}

export async function listWorkspaceEmailsForLocalPart(
  localPartPrefix: string,
  domain: string,
): Promise<WorkspaceEmailInventory> {
  const query = `email:${localPartPrefix}*@${domain}`;
  const [activeUsers, deletedUsers] = await Promise.all([
    listWorkspaceUsers(query, false),
    listWorkspaceUsers(query, true),
  ]);

  const active = activeUsers
    .map((user) => user.primaryEmail?.toLowerCase())
    .filter((value): value is string => Boolean(value));
  const deleted = deletedUsers
    .filter((user) => user.deletionTime)
    .map((user) => user.primaryEmail?.toLowerCase())
    .filter((value): value is string => Boolean(value));

  return {
    active: [...new Set(active)],
    deleted: [...new Set(deleted.filter((email) => !active.includes(email)))],
  };
}

function parseGoogleErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message ?? body.slice(0, 500);
  } catch {
    return body.slice(0, 500);
  }
}

export interface CreateWorkspaceUserInput {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  recoveryEmail?: string;
  orgUnitPath?: string;
}

function getFallbackRecoveryEmail(): string {
  return Deno.env.get("PNCL_GOOGLE_RECOVERY_EMAIL")
    ?? Deno.env.get("GOOGLE_WORKSPACE_ADMIN_EMAIL")
    ?? "";
}

export async function createWorkspaceUser(input: CreateWorkspaceUserInput): Promise<string> {
  const recoveryEmail = input.recoveryEmail?.trim() || getFallbackRecoveryEmail();
  if (!recoveryEmail) {
    throw new Error("Missing recovery email for Google Workspace user");
  }

  logOnboarding("google_user_create_started", {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    recoveryEmail,
    orgUnitPath: input.orgUnitPath ?? "(root)",
  });

  const token = await getAccessToken();
  const customerId = getRequiredEnv("GOOGLE_WORKSPACE_CUSTOMER_ID");

  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users?customer=${customerId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        primaryEmail: input.email,
        name: {
          givenName: input.firstName,
          familyName: input.lastName,
        },
        password: input.temporaryPassword,
        changePasswordAtNextLogin: true,
        recoveryEmail,
        // Standard agent accounts only — admin privileges are never granted here.
        // Phone is stored in onboarding_records only — not on the Google profile.
        // recoveryEmail enables "Try another way" during Google's first sign-in challenge.
        ...(input.orgUnitPath ? { orgUnitPath: input.orgUnitPath } : {}),
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    const googleError = parseGoogleErrorBody(errorBody);
    logOnboarding(
      "google_user_create_failed",
      { email: input.email, status: response.status, googleError, rawError: errorBody.slice(0, 1000) },
      "error",
    );
    throw new Error(`Google Workspace user creation failed: ${googleError}`);
  }

  const user = await response.json();

  if (user.isAdmin || user.isDelegatedAdmin) {
    logOnboarding(
      "google_user_create_admin_rejected",
      { email: input.email, googleUserId: user.id, isAdmin: user.isAdmin, isDelegatedAdmin: user.isDelegatedAdmin },
      "error",
    );
    throw new Error("Google Workspace user was created with admin privileges");
  }

  logOnboarding("google_user_create_succeeded", {
    email: input.email,
    googleUserId: user.id,
    isAdmin: user.isAdmin,
    isDelegatedAdmin: user.isDelegatedAdmin,
  });

  return user.id as string;
}

const DEFAULT_MAILBOX_READY_DELAY_MS = 30_000;

function getMailboxReadyDelayMs(): number {
  const raw = Deno.env.get("PNCL_MAILBOX_READY_DELAY_MS");
  if (raw === undefined || raw === "") return DEFAULT_MAILBOX_READY_DELAY_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAILBOX_READY_DELAY_MS;
  return parsed;
}

/** Pause after Workspace user creation so inbound mail routing is live before Resend delivers. */
export async function waitForWorkspaceMailboxReady(email: string): Promise<void> {
  const delayMs = getMailboxReadyDelayMs();
  if (delayMs === 0) return;

  logOnboarding("google_mailbox_ready_wait_started", { email, delayMs });
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  logOnboarding("google_mailbox_ready_wait_completed", { email, delayMs });
}
