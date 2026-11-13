export const SIGNATURE_ADOPTION_VERSION = "2026-11-13";
export const SIGNATURE_ADOPTION_CONSENT = "I adopt the signature shown above as my electronic signature and authorize its use to sign this document.";
export type SignatureMethod = "typed" | "drawn";
export interface SignatureAdoption {
  method: SignatureMethod;
  accepted: true;
  version: typeof SIGNATURE_ADOPTION_VERSION;
  name: string;
}
export interface AdoptedSignature extends SignatureAdoption { imageDataUrl: string; }
export function validateSignatureAdoption(value: unknown, name: string): SignatureAdoption {
  const input = value as Partial<SignatureAdoption> | null;
  if (!input || input.accepted !== true || input.version !== SIGNATURE_ADOPTION_VERSION || !["typed", "drawn"].includes(input.method ?? "")) {
    throw new Error("Review and adopt your signature before signing. Refresh the page if needed.");
  }
  if (input.name !== name.trim().replace(/\s+/g, " ")) throw new Error("Your name changed. Review and adopt your signature again.");
  return { method: input.method!, accepted: true, version: SIGNATURE_ADOPTION_VERSION, name: input.name };
}
export function signaturePngBytes(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length > 500_000) throw new Error("Choose a valid signature image.");
  const encoded = value.replace(/^data:image\/png;base64,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Choose a valid PNG signature.");
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) throw new Error("Choose a valid PNG signature.");
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 2048 || width * height > 4_000_000) throw new Error("The signature image is too large.");
  return bytes;
}
