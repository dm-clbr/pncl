import { describe, expect, it, vi } from "vitest";
import {
  supportingFilesForFlow,
  validateSupportingFiles,
  SURELC_REFERENCE_FILE,
} from "../../supabase/functions/_shared/onboardingAttachments";

const loaId = "00000000-0000-4000-8000-000000000401";
const iboId = "00000000-0000-4000-8000-000000000402";
const lookup = async (id: string) =>
  [
    {
      id: loaId,
      designation: "loa",
      kind: "document",
      filename: "LOA.pdf",
      size_bytes: 200,
      url: "https://storage.example/loa.pdf",
    },
    {
      id: iboId,
      designation: "ibo",
      kind: "document",
      filename: "IBO.pdf",
      size_bytes: 300,
      url: "https://storage.example/ibo.pdf",
    },
  ].find((asset) => asset.id === id) ?? null;

describe("Supporting file ownership and publication", () => {
  it("resolves each flow's document from registered storage metadata", async () => {
    const files = await validateSupportingFiles(
      {
        loa: [
          {
            mode: "file",
            assetId: loaId,
            url: "https://forged.example/wrong.pdf",
            filename: "fake.pdf",
          },
        ],
        ibo: [{ mode: "file", assetId: iboId }],
      },
      "surelc_tutorial",
      lookup,
    );
    expect(files.loa?.[0]).toMatchObject({
      url: "https://storage.example/loa.pdf",
      filename: "LOA.pdf",
    });
    expect(files.ibo?.[0]).toMatchObject({
      url: "https://storage.example/ibo.pdf",
      filename: "IBO.pdf",
    });
  });
  it("rejects another flow's assets, missing files, and video assets used as documents", async () => {
    await expect(
      validateSupportingFiles(
        { ibo: [{ mode: "file", assetId: loaId }] },
        "surelc_tutorial",
        lookup,
      ),
    ).rejects.toThrow("not available for IBO");
    await expect(
      validateSupportingFiles(
        { loa: [{ mode: "file", assetId: loaId }] },
        "surelc_tutorial",
        async () => null,
      ),
    ).rejects.toThrow("not available");
    await expect(
      validateSupportingFiles(
        { loa: [{ mode: "file", assetId: loaId }] },
        "surelc_tutorial",
        async () => ({ ...(await lookup(loaId))!, kind: "video" }),
      ),
    ).rejects.toThrow("not available");
  });
  it("does not accept arbitrary document links or duplicate assets", async () => {
    await expect(
      validateSupportingFiles(
        { loa: [{ mode: "file", url: "https://forged.example/document.pdf" }] },
        "surelc_tutorial",
        lookup,
      ),
    ).rejects.toThrow("uploaded supporting file");
    await expect(
      validateSupportingFiles(
        { loa: [{ mode: "link", url: SURELC_REFERENCE_FILE.url }] },
        "surelc_tutorial",
        lookup,
      ),
    ).rejects.toThrow("Upload");
    await expect(
      validateSupportingFiles(
        {
          loa: [
            { mode: "file", assetId: loaId },
            { mode: "file", assetId: loaId },
          ],
        },
        "surelc_tutorial",
        lookup,
      ),
    ).rejects.toThrow("duplicate");
    await expect(
      validateSupportingFiles(
        { loa: Array(11).fill({ mode: "file", assetId: loaId }) },
        "surelc_tutorial",
        lookup,
      ),
    ).rejects.toThrow("up to 10");
  });
  it("preserves the legacy reference only until that flow explicitly changes it", async () => {
    expect(supportingFilesForFlow("surelc_tutorial", undefined, "loa")).toEqual(
      [SURELC_REFERENCE_FILE],
    );
    expect(
      supportingFilesForFlow("surelc_tutorial_ibo", { loa: [] }, "ibo"),
    ).toEqual([SURELC_REFERENCE_FILE]);
    expect(
      supportingFilesForFlow("surelc_tutorial", { loa: [] }, "loa"),
    ).toEqual([]);
    expect(supportingFilesForFlow("custom_video", undefined, "loa")).toEqual(
      [],
    );
    const find = vi.fn(lookup);
    expect(
      await validateSupportingFiles(
        { loa: [SURELC_REFERENCE_FILE] },
        "surelc_tutorial",
        find,
      ),
    ).toEqual({ loa: [SURELC_REFERENCE_FILE] });
    expect(find).not.toHaveBeenCalled();
    await expect(
      validateSupportingFiles(
        { loa: [SURELC_REFERENCE_FILE] },
        "custom_video",
        lookup,
      ),
    ).rejects.toThrow();
  });
});
