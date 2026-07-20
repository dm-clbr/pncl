type FindCounty = (zipCode: string) => { county: string; isValid: boolean };

let findCountyLoader: Promise<FindCounty> | null = null;

function loadFindCounty(): Promise<FindCounty> {
  if (!findCountyLoader) {
    findCountyLoader = import("zipcodes-us").then((mod) => mod.findCounty);
  }
  return findCountyLoader;
}

function normalizeZipDigits(zip: string): string | null {
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

/** Returns the county name for a 5-digit US ZIP, or null when unknown. */
export async function lookupCountyFromZip(zip: string): Promise<string | null> {
  const digits = normalizeZipDigits(zip);
  if (!digits) return null;

  const findCounty = await loadFindCounty();
  const { county, isValid } = findCounty(digits);
  return isValid && county.trim() ? county.trim() : null;
}

/** Resolves county from ZIP or throws a user-facing error. */
export async function requireCountyFromZip(zip: string): Promise<string> {
  const county = await lookupCountyFromZip(zip);
  if (!county) {
    throw new Error("Unable to determine county from that ZIP code. Please check your ZIP and try again.");
  }
  return county;
}
