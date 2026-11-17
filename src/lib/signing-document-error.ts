import { version } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Only allowlisted diagnostics: never URLs, PDF fields, signatures or raw errors. */
export function signingDocumentError(error: unknown, stage: "load" | "render", sourceId?: string, page?: number) {
  const value = error && typeof error === "object" ? error as { name?: unknown; message?: unknown; status?: unknown } : {};
  const message = typeof value.message === "string" ? value.message : "";
  let code = stage === "load" ? "document_load_failed" : "page_render_failed";
  if (value.name === "InvalidPDFException") code = "invalid_pdf";
  else if (value.name === "MissingPDFException" || value.status === 404) code = "document_missing";
  else if (value.name === "PasswordException") code = "password_protected";
  else if (/API version.*Worker version|worker.*failed|fake worker/i.test(message)) code = "worker_failed";
  else if (/fetch|network|connection/i.test(message)) code = "network_failed";
  else if (value.name === "UnexpectedResponseException") code = "http_failed";
  else if (message === "Canvas unavailable") code = "canvas_unavailable";
  const browser = typeof navigator === "undefined" ? "unknown" : navigator.userAgent.match(/(?:Edg|Firefox|Chrome|Version)\/[\d.]+/)?.[0] ?? "unknown";
  return {
    code, stage, pdfjsVersion: version, browser,
    sourceId: sourceId && /^[a-f\d-]{36}$/i.test(sourceId) ? sourceId : "configured-document",
    ...(stage === "render" ? { page } : {}),
    ...(typeof value.status === "number" && value.status >= 100 && value.status < 600 ? { httpStatus: value.status } : {}),
  };
}
