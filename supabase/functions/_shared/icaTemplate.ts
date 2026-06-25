const ICA_TEMPLATE_FILENAME = "pncl-ica-standard.pdf";

/** Load the ICA PDF template bundled with the calling edge function. */
export async function loadIcaTemplateBytes(callerModuleUrl: string): Promise<Uint8Array> {
  const candidates = [
    new URL(`./assets/${ICA_TEMPLATE_FILENAME}`, callerModuleUrl),
    new URL(`./assets/${ICA_TEMPLATE_FILENAME}`, import.meta.url),
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
  throw new Error(`ICA template PDF not found: ${message}`);
}
