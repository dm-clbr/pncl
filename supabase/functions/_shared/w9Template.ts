const W9_TEMPLATE_FILENAME = "pncl-w9-standard.pdf";

/** Load the W-9 PDF template bundled with the calling edge function. */
export async function loadW9TemplateBytes(callerModuleUrl: string): Promise<Uint8Array> {
  const candidates = [
    new URL(`./assets/${W9_TEMPLATE_FILENAME}`, callerModuleUrl),
    new URL(`./assets/${W9_TEMPLATE_FILENAME}`, import.meta.url),
  ];

  let lastError: unknown;
  for (const path of candidates) {
    try {
      return await Deno.readFile(path);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown error";
  throw new Error(`W-9 template PDF not found: ${message}`);
}
