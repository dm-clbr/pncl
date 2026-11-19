export const CAPACITY_RETRY_MS = 5 * 60 * 1000;
export const CAPACITY_WAIT_MESSAGE = "Your application and signed agreement are saved. PNCL is waiting for Google Workspace capacity or Gmail activation. We’ll retry automatically; you do not need to submit another application.";

export class GoogleCapacityError extends Error {
  constructor(public kind: "user_limit" | "license_limit" | "mailbox_pending", message: string) {
    super(message);
    this.name = "GoogleCapacityError";
  }
}

/** A rate limit, permission error or generic 403 is not a seat shortage. */
export function classifyGoogleCapacity(message: string): "user_limit" | "license_limit" | null {
  if (/\b(domain|customer|account) user limit (reached|exceeded)\b|\bmaximum number of users\b|\buserLimitExceeded\b/i.test(message)) return "user_limit";
  if (/\b(insufficient|no available|not enough) (licenses|licences|seats)\b|\b(license|licence|seat) limit (reached|exceeded)\b|\bno (licenses|licences|seats) (are )?available\b/i.test(message)) return "license_limit";
  return null;
}

export function capacityError(error: unknown): GoogleCapacityError | null {
  if (error instanceof GoogleCapacityError) return error;
  const message = error instanceof Error ? error.message : "";
  const kind = classifyGoogleCapacity(message);
  return kind ? new GoogleCapacityError(kind, message) : null;
}

export function isCapacityQueued(row: { capacity_wait_started_at?: string | null; capacity_recovered_at?: string | null; released_at?: string | null; enrollment_status?: string }): boolean {
  return Boolean(row.capacity_wait_started_at) && !row.capacity_recovered_at && !row.released_at
    && ["waiting_google_capacity", "provisioning_google", "provisioning_portal", "finalizing"].includes(row.enrollment_status ?? "");
}

export function buildCapacityStatus(row: { enrollment_status?: string; capacity_wait_started_at?: string | null; capacity_next_retry_at?: string | null; capacity_recovered_at?: string | null; released_at?: string | null }) {
  if (!isCapacityQueued(row)) return null;
  return {
    status: "waiting_capacity" as const,
    enrollmentStatus: "waiting_google_capacity",
    message: CAPACITY_WAIT_MESSAGE,
    nextRetryAt: row.capacity_next_retry_at ?? undefined,
    retryable: false,
    credentialsAvailable: false,
  };
}

/** Retry provider outages only after this enrollment has entered the capacity queue. */
export function isTransientGoogleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("name" in error && ["AbortError", "TimeoutError"].includes(String(error.name))) return true;
  if (!(error instanceof Error)) return false;
  return (error instanceof TypeError && /fetch|network/i.test(error.message))
    || /\((429|5\d\d)\)/.test(error.message);
}
