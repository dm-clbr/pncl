export const AGENT_PHONE_PATTERN = /^\d{3}-\d{3}-\d{4}$/;
export const AGENT_PHONE_PLACEHOLDER = "000-000-0000";

export function formatAgentPhoneInput(value: string): string {
  const rawDigits = value.replace(/\D/g, "");
  const nationalDigits = rawDigits.length === 11 && rawDigits.startsWith("1")
    ? rawDigits.slice(1)
    : rawDigits;
  const digits = nationalDigits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidAgentPhoneNumber(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  return AGENT_PHONE_PATTERN.test(normalized) && normalized !== AGENT_PHONE_PLACEHOLDER;
}

export function requireValidAgentPhoneNumber(value: string | null | undefined): string {
  const formatted = formatAgentPhoneInput(value ?? "");
  if (!isValidAgentPhoneNumber(formatted)) {
    throw new Error("A valid 10-digit phone number is required.");
  }
  return formatted;
}
