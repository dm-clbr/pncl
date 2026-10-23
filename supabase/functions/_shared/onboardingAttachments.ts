import type { FlowMedia } from "./onboardingEditorRules.ts";

export type SupportingFile = FlowMedia & { mode: "file"; filename: string };
export type FlowAttachments = {
  loa?: SupportingFile[];
  ibo?: SupportingFile[];
};
export const MAX_SUPPORTING_FILES = 10;
export const SURELC_REFERENCE_FILE: SupportingFile = {
  mode: "file",
  url: "/documents/PNCL-SureLC-Quick-Reference.pdf",
  filename: "SureLC quick reference (PDF)",
};

/** An explicit empty list removes the legacy reference; an absent list preserves it. */
export function supportingFilesForFlow(
  slug: string,
  attachments: FlowAttachments | undefined,
  flow: "loa" | "ibo",
): SupportingFile[] {
  return (
    attachments?.[flow] ??
    (slug === "surelc_tutorial" || slug === "surelc_tutorial_ibo"
      ? [{ ...SURELC_REFERENCE_FILE }]
      : [])
  );
}

type AttachmentAsset = {
  id: string;
  designation: string;
  kind: string;
  filename: string;
  size_bytes: number;
  url: string;
};

/** Resolve URLs and file metadata on the server, never from submitted client URLs. */
export async function validateSupportingFiles(
  input: unknown,
  slug: string,
  findAsset: (id: string) => Promise<AttachmentAsset | null>,
): Promise<FlowAttachments> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["loa", "ibo"].includes(key))
  )
    throw new Error("Invalid supporting files.");
  const result: FlowAttachments = {};
  for (const flow of ["loa", "ibo"] as const) {
    const files = (input as Record<string, unknown>)[flow];
    if (files === undefined) continue;
    if (!Array.isArray(files) || files.length > MAX_SUPPORTING_FILES)
      throw new Error(
        `Add up to ${MAX_SUPPORTING_FILES} supporting files per flow.`,
      );
    const ids = new Set<string>();
    result[flow] = [];
    for (const file of files) {
      if (!file || file.mode !== "file")
        throw new Error("Upload a supporting document file.");
      if (
        !file.assetId &&
        file.url === SURELC_REFERENCE_FILE.url &&
        ["surelc_tutorial", "surelc_tutorial_ibo"].includes(slug)
      ) {
        if (ids.has("standard"))
          throw new Error("Remove duplicate supporting files.");
        ids.add("standard");
        result[flow]!.push({ ...SURELC_REFERENCE_FILE });
        continue;
      }
      if (
        typeof file.assetId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(file.assetId)
      )
        throw new Error("Choose an uploaded supporting file.");
      if (ids.has(file.assetId))
        throw new Error("Remove duplicate supporting files.");
      ids.add(file.assetId);
      const asset = await findAsset(file.assetId);
      if (!asset || asset.designation !== flow || asset.kind !== "document")
        throw new Error(
          `The supporting file is not available for ${flow.toUpperCase()}.`,
        );
      result[flow]!.push({
        mode: "file",
        assetId: asset.id,
        url: asset.url,
        filename: asset.filename,
        size: asset.size_bytes,
      });
    }
  }
  return result;
}
