/** Capture the exact self-hosted script font the signer reviews, never a fallback. */
export async function typedSignatureImage(name: string): Promise<string> {
  const loaded = await document.fonts.load('64px "PNCL Signature"', name);
  if (!loaded.length) throw new Error("The signature font could not load. Retry or draw your signature.");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Signature preview unavailable. Please retry.");
  canvas.width = 1200; canvas.height = 200;
  context.font = '96px "PNCL Signature"';
  const measured = context.measureText(name);
  const size = Math.min(96, 96 * 1140 / Math.max(1, measured.width));
  context.font = `${size}px "PNCL Signature"`;
  context.fillStyle = "#1a2838";
  context.textBaseline = "middle";
  context.fillText(name, 30, 100);
  return canvas.toDataURL("image/png");
}
