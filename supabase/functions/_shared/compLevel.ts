export const COMP_LEVEL_MIN = 70;
export const COMP_LEVEL_MAX = 145;
export const COMP_LEVEL_STEP = 5;

export const REFERRAL_INVITE_EXPIRY_DAYS = 90;

export const ACTIVE_ONBOARDING_STATUSES_FOR_DEDUP = [
  "pending",
  "creating_email",
  "email_created",
  "ready",
  "credentials_viewed",
  "manual",
] as const;

export function isValidCompLevel(value: number): boolean {
  return (
    Number.isInteger(value)
    && value >= COMP_LEVEL_MIN
    && value <= COMP_LEVEL_MAX
    && (value - COMP_LEVEL_MIN) % COMP_LEVEL_STEP === 0
  );
}

export function getReferralCompOptions(referrerCompLevel: number | null | undefined): number[] {
  if (referrerCompLevel == null || !isValidCompLevel(referrerCompLevel)) {
    return [];
  }

  const options: number[] = [];
  for (let level = referrerCompLevel - COMP_LEVEL_STEP; level >= COMP_LEVEL_MIN; level -= COMP_LEVEL_STEP) {
    options.push(level);
  }
  return options;
}

export function assertReferralCompAllowed(
  referrerCompLevel: number | null | undefined,
  requestedCompLevel: number,
): void {
  const allowed = getReferralCompOptions(referrerCompLevel);
  if (!allowed.includes(requestedCompLevel)) {
    throw new Error("Selected comp level is not allowed for your account.");
  }
}

/** Comp levels an admin may assign based on the agent's upline. Org roots allow any level. */
export function getAdminCompOptionsForAgent(
  referrerUserId: string | null | undefined,
  referrerCompLevel: number | null | undefined,
  hasOnboardingRecord = true,
): number[] {
  if (!hasOnboardingRecord || !referrerUserId) {
    return Array.from(
      { length: (COMP_LEVEL_MAX - COMP_LEVEL_MIN) / COMP_LEVEL_STEP + 1 },
      (_, index) => COMP_LEVEL_MIN + index * COMP_LEVEL_STEP,
    );
  }
  return getReferralCompOptions(referrerCompLevel);
}

export function assertAdminCompAllowed(
  referrerUserId: string | null | undefined,
  referrerCompLevel: number | null | undefined,
  requestedCompLevel: number,
  hasOnboardingRecord = true,
): void {
  if (!hasOnboardingRecord || !referrerUserId) {
    return;
  }

  if (referrerCompLevel == null || !isValidCompLevel(referrerCompLevel)) {
    throw new Error("Upline comp level must be set before assigning a comp level to this user.");
  }

  assertReferralCompAllowed(referrerCompLevel, requestedCompLevel);
}

export function getReferralInviteExpiresAt(from = new Date()): string {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + REFERRAL_INVITE_EXPIRY_DAYS);
  return expires.toISOString();
}
