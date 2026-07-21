export const COMP_LEVEL_MIN = 70;
export const COMP_LEVEL_MAX = 145;
export const COMP_LEVEL_STEP = 5;

export const COMP_LEVELS: number[] = Array.from(
  { length: (COMP_LEVEL_MAX - COMP_LEVEL_MIN) / COMP_LEVEL_STEP + 1 },
  (_, index) => COMP_LEVEL_MIN + index * COMP_LEVEL_STEP,
);

export function isValidCompLevel(value: number): boolean {
  return (
    Number.isInteger(value)
    && value >= COMP_LEVEL_MIN
    && value <= COMP_LEVEL_MAX
    && (value - COMP_LEVEL_MIN) % COMP_LEVEL_STEP === 0
  );
}

/** Comp levels a referrer may assign (strictly below their own level). */
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

/** Comp levels an admin may assign based on the agent's upline. Org roots allow any level. */
export function getAdminCompOptionsForAgent(
  referrerId: string | null | undefined,
  referrerCompLevel: number | null | undefined,
  hasOnboardingRecord = true,
): number[] {
  if (!hasOnboardingRecord || !referrerId) {
    return COMP_LEVELS;
  }
  return getReferralCompOptions(referrerCompLevel);
}

export function adminCompLevelUnavailableReason(
  referrerId: string | null | undefined,
  referrerCompLevel: number | null | undefined,
  hasOnboardingRecord = true,
): string | null {
  if (!hasOnboardingRecord || !referrerId) return null;
  if (referrerCompLevel == null || !isValidCompLevel(referrerCompLevel)) {
    return "Upline comp level is not set.";
  }
  if (getReferralCompOptions(referrerCompLevel).length === 0) {
    return `Upline comp is ${referrerCompLevel}; no lower levels available.`;
  }
  return null;
}

export function formatCompLevel(level: number | null | undefined): string {
  if (level == null) return "Not set";
  return String(level);
}
