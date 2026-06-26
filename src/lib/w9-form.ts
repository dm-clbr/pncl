export const W9_PDF_URL = "/documents/pncl-w9-standard.pdf";
export const W9_TOTAL_PAGES = 6;

/** 1-based page numbers in the PNCL W-9 PDF. */
export const W9_PDF_PAGES = {
  form: 1,
} as const;

export const W9_FORM_VERSION = "2024-03-irs";

/** Signature image placement on page 1 (PDF user space, bottom-left origin). */
export const W9_SIGNATURE_IMAGE_RECT = {
  pageIndex: 0,
  x: 58.6,
  y: 310,
  width: 320,
  height: 24,
} as const;
