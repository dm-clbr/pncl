import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { getEmailDomain } from "./onboarding.ts";
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
}

function getFallbackRecoveryEmail(): string {
  return Deno.env.get("PNCL_GOOGLE_RECOVERY_EMAIL")
    ?? Deno.env.get("GOOGLE_WORKSPACE_ADMIN_EMAIL")
    ?? "";
}

/** Normalize a US phone (111-222-3333) to E.164 (+11112223333) for Google Admin SDK. */
export function normalizeUsPhoneToE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `+1${digits}`;
}

function resolveRecoveryEmail(input: CreateWorkspaceUserInput): string {
  const workspaceDomain = getEmailDomain().toLowerCase();
  const provided = input.recoveryEmail?.trim().toLowerCase() ?? "";

  if (provided) {
    if (!provided.includes("@")) {
      throw new Error("Invalid recovery email for Google Workspace user");
    }
    if (provided.endsWith(`@${workspaceDomain}`)) {
      throw new Error("Recovery email cannot use the PNCL workspace domain");
    }
    return provided;
  }

  const fallback = getFallbackRecoveryEmail().trim().toLowerCase();
  if (!fallback) {
    throw new Error("Missing recovery email for Google Workspace user");
  }
  return fallback;
}

export async function createWorkspaceUser(input: CreateWorkspaceUserInput): Promise<string> {
  const recoveryEmail = resolveRecoveryEmail(input);

  logOnboarding("google_user_create_started", {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    recoveryEmail,
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
        // Recovery phone is intentionally NOT set at creation. Attaching the
        // same phone to accounts before first sign-in accumulates
        // phone-to-account associations in Google's abuse systems and burns
        // the number for SMS verification. The phone is synced later via
        // recovery sync once the account is active.
        recoveryEmail,
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

  if (user.suspended) {
    const suspensionReason = typeof user.suspensionReason === "string"
      ? user.suspensionReason
      : "unknown reason";
    logOnboarding(
      "google_user_auto_suspended",
      {
        email: input.email,
        googleUserId: user.id,
        suspensionReason,
      },
      "error",
    );
    throw new GoogleWorkspaceAutoSuspendedError(user.id as string, suspensionReason);
  }

  logOnboarding("google_user_create_succeeded", {
    email: input.email,
    googleUserId: user.id,
    isAdmin: user.isAdmin,
    isDelegatedAdmin: user.isDelegatedAdmin,
    recoveryEmail,
  });

  return user.id as string;
}

export class GoogleWorkspaceAutoSuspendedError extends Error {
  readonly googleUserId: string;
  readonly suspensionReason: string;

  constructor(googleUserId: string, suspensionReason: string) {
    super(`Google Workspace account was automatically suspended: ${suspensionReason}`);
    this.name = "GoogleWorkspaceAutoSuspendedError";
    this.googleUserId = googleUserId;
    this.suspensionReason = suspensionReason;
  }
}

export function isAutomaticallySuspendedGoogleUser(user: WorkspaceUserDetails): boolean {
  if (!user.suspended) return false;

  const reason = user.suspensionReason?.trim().toLowerCase() ?? "";

  // Only exclude accounts Google explicitly marks as admin-suspended.
  if (
    reason.includes("suspended by admin")
    || reason.includes("admin suspended")
    || reason.includes("by admin")
  ) {
    return false;
  }

  // PNCL suspended accounts are Google-side holds (verification, policy, etc.)
  // unless Admin Console suspension is indicated in the reason text.
  return true;
}

function mapGoogleDirectoryUser(user: Record<string, unknown>): WorkspaceUserDetails | null {
  const primaryEmail = typeof user.primaryEmail === "string" ? user.primaryEmail.toLowerCase() : "";
  const id = typeof user.id === "string" ? user.id : "";
  if (!primaryEmail || !id) return null;

  return {
    id,
    primaryEmail,
    suspended: Boolean(user.suspended),
    suspensionReason: typeof user.suspensionReason === "string" ? user.suspensionReason : null,
    lastLoginTime: typeof user.lastLoginTime === "string" ? user.lastLoginTime : null,
    recoveryEmail: parseGoogleRecoveryEmail(user.recoveryEmail),
    recoveryPhone: parseGooglePhoneValue(user.recoveryPhone),
    mobilePhone: parsePrimaryMobilePhone(user),
  };
}

/** Paginated directory listing keyed by primary email — one sync pass for admin status columns. */
export async function listWorkspaceUsersByEmail(): Promise<Map<string, WorkspaceUserDetails>> {
  const token = await getAccessToken();
  const customerId = getRequiredEnv("GOOGLE_WORKSPACE_CUSTOMER_ID");
  const byEmail = new Map<string, WorkspaceUserDetails>();
  let pageToken: string | undefined;

  do {
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
    url.searchParams.set("customer", customerId);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Unable to list Google Workspace users (${response.status}): ${body.slice(0, 300)}`);
    }

    const payload = await response.json();
    for (const rawUser of payload.users ?? []) {
      const mapped = mapGoogleDirectoryUser(rawUser as Record<string, unknown>);
      if (mapped) byEmail.set(mapped.primaryEmail, mapped);
    }
    pageToken = payload.nextPageToken;
  } while (pageToken);

  logOnboarding("google_workspace_directory_listed", { count: byEmail.size });
  return byEmail;
}

export type GoogleWorkspaceStatus = "active" | "suspended" | "auto_suspended" | "not_found";

export function resolveGoogleWorkspaceStatus(
  googleUser: WorkspaceUserDetails | undefined,
): { status: GoogleWorkspaceStatus; suspensionReason: string | null } {
  if (!googleUser) {
    return { status: "not_found", suspensionReason: null };
  }
  if (!googleUser.suspended) {
    return { status: "active", suspensionReason: null };
  }
  if (isAutomaticallySuspendedGoogleUser(googleUser)) {
    return { status: "auto_suspended", suspensionReason: googleUser.suspensionReason };
  }
  return { status: "suspended", suspensionReason: googleUser.suspensionReason };
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

export interface WorkspaceUserDetails {
  id: string;
  primaryEmail: string;
  suspended: boolean;
  suspensionReason: string | null;
  lastLoginTime: string | null;
  recoveryEmail: string | null;
  recoveryPhone: string | null;
  mobilePhone: string | null;
}

function parseGoogleRecoveryEmail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toLowerCase();
}

function parseGooglePhoneValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function parsePrimaryMobilePhone(user: Record<string, unknown>): string | null {
  const phones = user.phones;
  if (!Array.isArray(phones)) return null;

  const mobilePhone = phones.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return (entry as { type?: string }).type === "mobile";
  });

  if (!mobilePhone || typeof mobilePhone !== "object") return null;
  return parseGooglePhoneValue((mobilePhone as { value?: string }).value);
}

function mapWorkspaceUserDetails(user: Record<string, unknown>): WorkspaceUserDetails {
  return {
    id: user.id as string,
    primaryEmail: user.primaryEmail as string,
    suspended: Boolean(user.suspended),
    suspensionReason: typeof user.suspensionReason === "string" ? user.suspensionReason : null,
    lastLoginTime: typeof user.lastLoginTime === "string" ? user.lastLoginTime : null,
    recoveryEmail: parseGoogleRecoveryEmail(user.recoveryEmail),
    recoveryPhone: parseGooglePhoneValue(user.recoveryPhone),
    mobilePhone: parsePrimaryMobilePhone(user),
  };
}

export async function getWorkspaceUser(userKey: string): Promise<WorkspaceUserDetails | null> {
  const token = await getAccessToken();
  const customerId = getRequiredEnv("GOOGLE_WORKSPACE_CUSTOMER_ID");
  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(userKey)}?customer=${customerId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to load Google Workspace user (${response.status}): ${body.slice(0, 300)}`);
  }

  const user = await response.json();
  return mapWorkspaceUserDetails(user as Record<string, unknown>);
}

export interface UpdateWorkspaceUserRecoveryInput {
  userKey: string;
  recoveryEmail: string;
  recoveryPhone?: string;
  /** Pass when already loaded to avoid an extra Google API read. */
  currentUser?: WorkspaceUserDetails | null;
}

function phoneDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const digitsA = phoneDigits(a);
  const digitsB = phoneDigits(b);
  if (!digitsA || !digitsB) return false;
  const normalizedA = digitsA.length === 11 && digitsA.startsWith("1") ? digitsA.slice(1) : digitsA;
  const normalizedB = digitsB.length === 11 && digitsB.startsWith("1") ? digitsB.slice(1) : digitsB;
  return normalizedA === normalizedB;
}

export async function updateWorkspaceUserRecovery(
  input: UpdateWorkspaceUserRecoveryInput,
): Promise<{ updated: boolean }> {
  const recoveryEmail = input.recoveryEmail.trim().toLowerCase();
  const workspaceDomain = getEmailDomain().toLowerCase();
  if (!recoveryEmail.includes("@")) {
    throw new Error("Invalid recovery email for Google Workspace user");
  }
  if (recoveryEmail.endsWith(`@${workspaceDomain}`)) {
    throw new Error("Recovery email cannot use the PNCL workspace domain");
  }

  const recoveryPhoneE164 = input.recoveryPhone
    ? normalizeUsPhoneToE164(input.recoveryPhone)
    : null;
  if (input.recoveryPhone && !recoveryPhoneE164) {
    throw new Error("Invalid phone number for Google Workspace user recovery");
  }

  // Only PATCH fields that differ from what Google already has. Re-asserting
  // the same phone across accounts feeds Google's phone-abuse signals.
  const currentUser = input.currentUser !== undefined
    ? input.currentUser
    : await getWorkspaceUser(input.userKey);

  const emailUpToDate = currentUser?.recoveryEmail === recoveryEmail;
  const phoneUpToDate = !recoveryPhoneE164 || (
    phonesMatch(currentUser?.recoveryPhone, recoveryPhoneE164)
    && phonesMatch(currentUser?.mobilePhone, recoveryPhoneE164)
  );

  if (currentUser && emailUpToDate && phoneUpToDate) {
    logOnboarding("google_user_recovery_update_skipped", {
      userKey: input.userKey,
      recoveryEmail,
      reason: "already_up_to_date",
    });
    return { updated: false };
  }

  const body: Record<string, unknown> = {};
  if (!currentUser || !emailUpToDate) {
    body.recoveryEmail = recoveryEmail;
  }
  if (recoveryPhoneE164 && (!currentUser || !phoneUpToDate)) {
    body.recoveryPhone = recoveryPhoneE164;
    body.phones = [{ value: recoveryPhoneE164, type: "mobile", primary: true }];
  }

  const token = await getAccessToken();
  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(input.userKey)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    const googleError = parseGoogleErrorBody(responseBody);
    logOnboarding(
      "google_user_recovery_update_failed",
      { userKey: input.userKey, recoveryEmail, googleError },
      "error",
    );
    throw new Error(`Google Workspace recovery update failed: ${googleError}`);
  }

  logOnboarding("google_user_recovery_update_succeeded", {
    userKey: input.userKey,
    recoveryEmail,
    recoveryPhone: recoveryPhoneE164 ?? null,
    updatedFields: Object.keys(body),
  });
  return { updated: true };
}

export async function resetWorkspaceUserTemporaryPassword(
  userKey: string,
  temporaryPassword: string,
): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(userKey)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password: temporaryPassword,
        changePasswordAtNextLogin: true,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    const googleError = parseGoogleErrorBody(body);
    logOnboarding(
      "google_user_password_reset_failed",
      { userKey, googleError },
      "error",
    );
    throw new Error(`Google Workspace password reset failed: ${googleError}`);
  }

  logOnboarding("google_user_password_reset_succeeded", { userKey });
}

export async function unsuspendWorkspaceUser(userKey: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(userKey)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ suspended: false }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    const googleError = parseGoogleErrorBody(body);
    logOnboarding(
      "google_user_unsuspend_failed",
      { userKey, googleError },
      "error",
    );
    throw new Error(`Google Workspace unsuspend failed: ${googleError}`);
  }

  logOnboarding("google_user_unsuspend_succeeded", { userKey });
}
