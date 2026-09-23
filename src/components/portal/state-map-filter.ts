import type { StateAvailabilityStatus } from "@/lib/portal-state-availability";

export type StateMapFilter = StateAvailabilityStatus | "Licensed";

/** The one filter predicate: the canvas dim, the directory list and the tests
    all read it, so "Licensed" cannot mean one thing in a chip and another on
    the map. It lives outside StateAvailabilityCanvas because that module is
    lazy-loaded to keep three.js out of the page chunk, and a value import of
    it from the page would pull the whole renderer back in. */
export const matchesFilter = (
  filter: StateMapFilter | null,
  status: StateAvailabilityStatus,
  licensed: boolean,
) => filter === null || (filter === "Licensed" ? licensed : status === filter);
