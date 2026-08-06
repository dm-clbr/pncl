export type YesNoAnswer = "Yes" | "No";

export function normalizeRequiredYesNo(value: unknown, field: string): YesNoAnswer {
  if (value !== "Yes" && value !== "No") {
    throw new Error(`${field} must be Yes or No`);
  }
  return value;
}
