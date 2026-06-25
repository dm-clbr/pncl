/** Matches server-side formatIcaEffectiveDate in onboardingContract.ts */
export function formatIcaEffectiveDate(signedAt: Date): {
  full: string;
  day: string;
  month: string;
  yearLast2: string;
} {
  const full = signedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return {
    full,
    day: String(signedAt.getDate()),
    month: signedAt.toLocaleDateString("en-US", { month: "long" }),
    yearLast2: String(signedAt.getFullYear()).slice(-2),
  };
}
