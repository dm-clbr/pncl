/** Explicit labels from the uploaded PDF; unrelated text fields stay independent. */
export function signerFieldRole(field: { fieldName: string; alternativeText?: string }): "name" | "email" | null {
  const label = (field.alternativeText || field.fieldName).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (["full legal first and last name", "first and last name", "full legal name", "legal name"].includes(label)) return "name";
  if (["email", "email address", "personal email", "personal email address"].includes(label)) return "email";
  return null;
}
