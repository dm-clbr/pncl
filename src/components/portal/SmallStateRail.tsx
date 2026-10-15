import type { StateAvailability } from "@/lib/portal-state-availability";
import type { UsStateCode } from "@/lib/us-states";
import { LicenseGlyph } from "@/components/portal/StateDetail";
import { SMALL_STATES, STATE_MAP_FILL, UNAVAILABLE_FILL } from "@/components/portal/state-map-geometry";

type SmallStateRailProps = {
  stateByCode: ReadonlyMap<UsStateCode, StateAvailability>;
  licensed: ReadonlySet<UsStateCode>;
  selected: UsStateCode | null;
  unavailable: boolean;
  onPick: (code: UsStateCode) => void;
  /** Under the phone sheet: out of the tab order and the pointer's way. */
  covered?: boolean;
};

/** The nine states a finger cannot hit on the map at zoom 1, as 44px buttons
    along the bottom of the map card. Each carries its code, a 10px swatch of
    its map fill (hatched for Pending, as on the map) and the licensed badge,
    so the rail repeats the map's encoding rather than inventing one, and its
    accessible name says all three in words. A tap selects exactly like a map
    tap. Scrolls sideways when it runs out of room. */
export default function SmallStateRail({
  stateByCode,
  licensed,
  selected,
  unavailable,
  onPick,
  covered = false,
}: SmallStateRailProps) {
  return (
    <div
      className="smap-rail"
      role="group"
      aria-label="Small states"
      translate="no"
      {...(covered ? { inert: "" } : {})}
    >
      {SMALL_STATES.map((code) => {
        const state = stateByCode.get(code);
        if (!state) return null;
        const status = unavailable ? "Unavailable" : state.status;
        const isLicensed = licensed.has(code);
        return (
          <button
            key={code}
            type="button"
            className="smap-rail-item"
            aria-label={`${state.stateName}, ${status}${isLicensed ? ", Licensed" : ""}`}
            aria-current={selected === code ? "true" : undefined}
            onClick={() => onPick(code)}
          >
            <span
              className={`smap-swatch${!unavailable && state.status === "Pending" ? " is-hatched" : ""}`}
              style={{ backgroundColor: unavailable ? UNAVAILABLE_FILL : STATE_MAP_FILL[state.status] }}
              aria-hidden="true"
            />
            <span aria-hidden="true">{code}</span>
            {isLicensed && <LicenseGlyph licensed />}
          </button>
        );
      })}
    </div>
  );
}
