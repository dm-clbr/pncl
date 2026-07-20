import { findCounty } from "https://esm.sh/zipcodes-us@1.1.3";

export function lookupCountyFromZip(zip: string): string | null {
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  if (digits.length !== 5) return null;

  const { county, isValid } = findCounty(digits);
  return isValid && county.trim() ? county.trim() : null;
}

export function requireCountyFromZip(zip: string): string {
  const county = lookupCountyFromZip(zip);
  if (!county) {
    throw new Error("Unable to determine county from that ZIP code. Please check the ZIP and try again.");
  }
  return county;
}
