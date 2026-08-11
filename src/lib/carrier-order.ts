export type SectionedCarrier = {
  section: string;
};

/**
 * Moves a carrier into the adjacent table position and, when it crosses a
 * section boundary, assigns it to the destination carrier's section.
 */
export function moveCarrierIntoAdjacentSection<T extends SectionedCarrier>(
  carriers: readonly T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= carriers.length || nextIndex < 0 || nextIndex >= carriers.length) {
    return [...carriers];
  }

  const reordered = [...carriers];
  const source = carriers[index];
  const destination = carriers[nextIndex];

  reordered[index] = destination;
  reordered[nextIndex] = { ...source, section: destination.section };

  return reordered;
}
