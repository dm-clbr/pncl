export interface TodoCompletionRecord {
  slug: string;
  completion_type: "auto" | "agent" | "admin";
  auto_key: string | null;
}

/** Combines server-calculated completion rules with permitted manual checkoffs. */
export function isTodoCompleteForUser(
  row: TodoCompletionRecord,
  userId: string,
  completedMetadata: Record<string, boolean>,
  autoSets: Map<string, Set<string>>,
): boolean {
  // This step represents the current published training. Legacy metadata must
  // never bypass current-version module acknowledgments.
  if (row.completion_type === "auto" && row.auto_key === "disclosures") {
    return autoSets.get("disclosures")?.has(userId) ?? false;
  }

  if (completedMetadata[row.slug] === true) return true;
  if (row.completion_type === "auto" && row.auto_key) {
    return autoSets.get(row.auto_key)?.has(userId) ?? false;
  }
  return false;
}
