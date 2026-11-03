import { describe, it, expect, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readCustomPdfInputValues } from "./pdf-input-values";

describe("custom PDF form input collection", () => {
  it("uses visible entries and retains values on virtualized pages without submitting automatic fields", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<input id="pdfjs_internal_id_1R" value="Current office"><input id="pdfjs_internal_id_3R" type="checkbox" checked>';
    const storage = { "1R": { value: "Old office" }, "2R": { value: "AM" } };
    const pdf = {
      getFieldObjects: async () => ({
        pncl_text_office: [{ id: "1R" }], pncl_initials_approval: [{ id: "2R" }],
        pncl_checkbox_accepted: [{ id: "3R", value: false }],
        pncl_text_optional: [{ id: "4R" }],
        pncl_signature_agent: [{ id: "5R", value: "Stale name" }],
        pncl_date_signed: [{ id: "6R", value: "Stale date" }],
        core_name: [{ id: "7R", value: "Existing mapped field" }],
      }),
      annotationStorage: { getValue: vi.fn((id: string, fallback: unknown) => storage[id as keyof typeof storage] ?? fallback) },
    } as unknown as PDFDocumentProxy;
    expect(await readCustomPdfInputValues(pdf, container)).toEqual({ pncl_text_office: "Current office", pncl_initials_approval: "AM", pncl_checkbox_accepted: true, pncl_text_optional: "" });
  });
});
