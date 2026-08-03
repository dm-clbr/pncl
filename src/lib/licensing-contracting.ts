/**
 * Carrier contracting can begin only after the agent has supplied the two
 * artifacts Contracting needs to review: an NPN and their E&O certificate.
 * An E&O policy number is useful context, but is not a substitute for the
 * certificate itself.
 */
export function isReadyForContracting(input: {
  npn?: string | null;
  eoCertificatePath?: string | null;
}): boolean {
  return Boolean(input.npn?.trim() && input.eoCertificatePath?.trim());
}
