import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

const DIRECTORY_USER_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const DIRECTORY_GROUP_SCOPE = "https://www.googleapis.com/auth/admin.directory.group";
const DIRECTORY_GROUP_MEMBER_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.group.member";

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

async function getAccessToken(includeGroups = false): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientEmail = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const adminEmail = getRequiredEnv("GOOGLE_WORKSPACE_ADMIN_EMAIL");
  const privateKey = getPrivateKey();
  const cryptoKey = await importPKCS8(privateKey, "RS256");

  const scopes = includeGroups
    ? [DIRECTORY_USER_SCOPE, DIRECTORY_GROUP_SCOPE, DIRECTORY_GROUP_MEMBER_SCOPE]
    : [DIRECTORY_USER_SCOPE];

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT()
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(adminEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setClaim("scope", scopes.join(" "))
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
    throw new Error("Unable to authenticate with Google Workspace");
  }

  const payload = await response.json();
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export async function checkWorkspaceUserExists(email: string): Promise<boolean> {
  try {
    const token = await getAccessToken();
    const customerId = getRequiredEnv("GOOGLE_WORKSPACE_CUSTOMER_ID");
    const response = await fetch(
      `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}?customer=${customerId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error("Unable to verify Google Workspace user");
    }
    return true;
  } catch {
    return false;
  }
}

export interface CreateWorkspaceUserInput {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  orgUnitPath?: string;
}

export async function createWorkspaceUser(input: CreateWorkspaceUserInput): Promise<string> {
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
        orgUnitPath: input.orgUnitPath ?? "/Agents",
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Google Workspace user creation failed", response.status, errorBody);
    throw new Error("Google Workspace user creation failed");
  }

  const user = await response.json();
  return user.id as string;
}

const groupMap: Record<string, (domain: string) => string[]> = {
  Agent: (domain) => [`agents@${domain}`, `training@${domain}`],
  Admin: (domain) => [`admin-team@${domain}`],
  Leadership: (domain) => [`leadership@${domain}`],
};

export function getGroupsForRole(role?: string): string[] {
  if (!role) return [];
  const domain = Deno.env.get("PNCL_EMAIL_DOMAIN") ?? "thepncl.com";
  const resolver = groupMap[role];
  return resolver ? resolver(domain) : [];
}

export async function addUserToGroups(email: string, groups: string[]): Promise<string | null> {
  if (!groups.length) return null;

  try {
    const token = await getAccessToken(true);
    const errors: string[] = [];

    for (const groupEmail of groups) {
      const response = await fetch(
        `https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupEmail)}/members`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            role: "MEMBER",
          }),
        },
      );

      if (!response.ok) {
        errors.push(groupEmail);
      }
    }

    return errors.length ? `Failed to add user to groups: ${errors.join(", ")}` : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Group assignment failed";
  }
}
