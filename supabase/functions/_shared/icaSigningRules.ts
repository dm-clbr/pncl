/** Signing rules shared by the ICA browser flow and both submission endpoints. */
export function normalizeIcaLegalName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function nameParts(value: string): string[] {
  const parts = normalizeIcaLegalName(value).split(" ");
  // A suffix is not the last name and does not need to appear in initials.
  if (parts.length > 2 && /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts;
}

export function validateIcaLegalName(value: string): string | null {
  const name = normalizeIcaLegalName(value);
  const parts = nameParts(name);
  if (name.length > 200 || parts.length < 2 || !/^[\p{L}\p{M}'’.-]+(?: [\p{L}\p{M}'’.-]+)+$/u.test(name)
    || [parts[0], parts[parts.length - 1]].some(part => (part.match(/\p{L}/gu)?.length ?? 0) < 2)) {
    return "Enter your full legal first and last name, not initials or a placeholder.";
  }
  return null;
}

export function normalizeIcaInitials(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[.\s]/g, "").toUpperCase();
}

function initialParts(legalName: string): string[][] {
  return nameParts(legalName).map(part => part.split("-").map(piece => normalizeIcaInitials(piece).match(/\p{L}/u)?.[0] ?? "").filter(Boolean));
}

export function suggestedIcaInitials(legalName: string): string {
  if (validateIcaLegalName(legalName)) return "";
  const parts = initialParts(legalName);
  return parts[0][0] + parts[parts.length - 1][0];
}

export function matchesIcaInitials(value: string, legalName: string): boolean {
  if (validateIcaLegalName(legalName)) return false;
  const initials = normalizeIcaInitials(value);
  if (initials.length > 20 || !/^\p{L}+$/u.test(initials)) return false;
  const parts = initialParts(legalName);
  // First and last initials are required. Middle names and additional parts of
  // hyphenated names may be included, in name order; surnames keep apostrophes.
  const pattern = parts.map((letters, index) => letters.map((letter, letterIndex) =>
    `${letter}${letterIndex === 0 && (index === 0 || index === parts.length - 1) ? "" : "?"}`
  ).join("")).join("");
  return new RegExp(`^${pattern}$`, "u").test(initials);
}

export function icaInitialsError(value: string, legalName: string, field: string): string | null {
  if (matchesIcaInitials(value, legalName)) return null;
  const suggested = suggestedIcaInitials(legalName);
  return `${field}: enter your actual initials${suggested ? ` (${suggested} for ${normalizeIcaLegalName(legalName)}; middle initials may be included)` : " after entering your full legal name"}. Do not enter “YES” or the statement letter.`;
}
