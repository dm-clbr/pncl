export type OnboardingAssetKind = "ica" | "welcome_video" | "surelc_video";
export const ONBOARDING_CONTENT_BUCKET = "onboarding-content";
export const MAX_ICA_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function validateOnboardingAsset(designation: unknown, kind: unknown, file: { type: string; size: number }) {
  if (designation !== "loa" && designation !== "ibo") throw new Error("Select LOA or IBO.");
  if (kind !== "ica" && kind !== "welcome_video" && kind !== "surelc_video") throw new Error("Invalid onboarding content type.");
  const maxBytes = kind === "ica" ? MAX_ICA_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
    throw new Error(kind === "ica" ? "Choose a PDF up to 20 MB." : "Choose a video up to 50 MB.");
  }
  const types = kind === "ica" ? ["application/pdf"] : ["video/mp4", "video/webm"];
  if (!types.includes(file.type)) throw new Error(kind === "ica" ? "ICA documents must be PDFs." : "Videos must be MP4 or WebM.");
  return { designation, kind, extension: file.type === "application/pdf" ? "pdf" : file.type === "video/mp4" ? "mp4" : "webm" } as const;
}

export function assertCurrentIcaTemplate(expectedId: unknown, actualId: string | null): void {
  if ((expectedId ?? null) !== actualId) throw new Error("The agreement has changed. Reload this page and review the current agreement before signing.");
}

/** Do not retain transfer details when an agent changes their answer to No. */
export function validateOtherImoDetails(hasOtherImo: string, name: unknown, carriers: unknown) {
  if (hasOtherImo !== "Yes") return { otherImoName: null, otherImoCarriers: [] as string[] };
  if (typeof name !== "string" || !name.trim() || name.trim().length > 200) throw new Error("Enter the other IMO's name (up to 200 characters).");
  const values = typeof carriers === "string" ? carriers.split(/[,\n]+/) : carriers;
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw new Error("Enter the carriers you are contracted with.");
  const normalized = [...new Map(values.map((value: string) => [value.trim().toLowerCase(), value.trim()])).values()].filter(Boolean);
  if (!normalized.length || normalized.length > 50 || normalized.some((value) => value.length > 160)) throw new Error("Enter 1–50 carrier names, each up to 160 characters.");
  return { otherImoName: name.trim(), otherImoCarriers: normalized };
}
