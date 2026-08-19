export interface CarrierWritingNumber {
  carrier: string;
  writingNumber: string;
}

export interface CarrierWritingNumberCarrierRow {
  id: string;
  carrier: string;
}

export interface CarrierWritingNumberCredentialRow {
  user_id: string;
  carrier_id: string;
  writing_number: string | null;
}

/**
 * Maps credential rows to the minimal carrier/writing-number data admins need.
 * Carrier rows are expected in display order; usernames and passwords never enter
 * this representation.
 */
export function buildCarrierWritingNumbersByUserId(
  carrierRows: CarrierWritingNumberCarrierRow[],
  credentialRows: CarrierWritingNumberCredentialRow[],
): Map<string, CarrierWritingNumber[]> {
  const carrierById = new Map(carrierRows.map((row) => [row.id, row.carrier.trim()]));
  const carrierOrder = new Map(carrierRows.map((row, index) => [row.id, index]));
  const rowsByUserId = new Map<string, Array<CarrierWritingNumber & { order: number }>>();

  for (const row of credentialRows) {
    const writingNumber = row.writing_number?.trim() ?? "";
    if (!writingNumber) continue;

    const entries = rowsByUserId.get(row.user_id) ?? [];
    entries.push({
      carrier: carrierById.get(row.carrier_id) || "Unknown carrier",
      writingNumber,
      order: carrierOrder.get(row.carrier_id) ?? Number.MAX_SAFE_INTEGER,
    });
    rowsByUserId.set(row.user_id, entries);
  }

  return new Map(
    [...rowsByUserId.entries()].map(([userId, entries]) => [
      userId,
      entries
        .sort((left, right) => left.order - right.order || left.carrier.localeCompare(right.carrier))
        .map(({ carrier, writingNumber }) => ({ carrier, writingNumber })),
    ]),
  );
}

function toSingleLine(value: string): string {
  return value.trim().replace(/\s*[\r\n]+\s*/g, " ");
}

/** Human-readable single-cell representation for one or many carrier numbers. */
export function formatCarrierWritingNumbers(entries: CarrierWritingNumber[] | undefined): string {
  return (entries ?? [])
    .map((entry) => ({
      carrier: toSingleLine(entry.carrier),
      writingNumber: toSingleLine(entry.writingNumber),
    }))
    .filter((entry) => entry.carrier && entry.writingNumber)
    .map((entry) => `${entry.carrier}: ${entry.writingNumber}`)
    .join("; ");
}
