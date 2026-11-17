export interface ProfileName { first_name?: string | null; last_name?: string | null }

export function profileDisplayName(profile?: ProfileName | null): string {
  return [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean).join(" ");
}

export function resolveDisplayName(user: { user_metadata?: Record<string, unknown>; email?: string }, onboardingName?: string | null, profile?: ProfileName | null): string {
  const editedName = profileDisplayName(profile);
  if (editedName) return editedName;
  if (onboardingName?.trim()) return onboardingName.trim();

  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();

  const firstName = user.user_metadata?.first_name;
  const lastName = user.user_metadata?.last_name;
  if (typeof firstName === "string" && firstName.trim()) {
    const last = typeof lastName === "string" ? lastName.trim() : "";
    return [firstName.trim(), last].filter(Boolean).join(" ");
  }

  return user.email?.split("@")[0] ?? "Agent";
}
