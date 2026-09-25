import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { X } from "lucide-react";
import Chip, { type ChipVariant } from "@/components/portal/Chip";
import ListRow from "@/components/portal/ListRow";
import {
  STATE_AVAILABILITY_META,
  type StateAvailability,
  type StateAvailabilityStatus,
} from "@/lib/portal-state-availability";

export const STATUS_CHIP: Record<StateAvailabilityStatus, ChipVariant> = {
  Active: "active",
  Pending: "pending",
  Inactive: "inactive",
};

const UPDATED = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Aug 19, 2026", or null for an empty or unreadable timestamp. */
export function formatUpdated(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : UPDATED.format(date);
}

/** The licensed mark: a filled ring with a check when licensed, an empty ring
    when not. The same glyph as the map badge, at text size. Ring-check versus
    empty ring after the ssych ui Onboarding Checklist (21st.dev). */
export function LicenseGlyph({ licensed }: { licensed: boolean }) {
  return (
    <svg className={`smap-license-glyph${licensed ? " is-on" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" />
      {licensed && <path d="M4.9 8.2 7 10.2l4.1-4.3" />}
    </svg>
  );
}

type StateDetailProps = {
  state: StateAvailability;
  licensed: boolean;
  licenseNumber?: string;
  /** Live availability failed: the status row goes neutral. */
  unavailable: boolean;
  /** The sheet's close, which clears the selection. Omitted in the panel. */
  onClose?: () => void;
  /** The heading takes focus after a keyboard pick. */
  headingRef?: Ref<HTMLHeadingElement>;
};

/** The answer card: the two facts an agent needs about one state, PNCL's
    status there and their own license, plus when the status last changed. It
    stops at the facts: carrier appointments are not in this data, so there is
    no combined "you can sell here" verdict. Header and single footer action
    after the kavikatiyar Trip Details Card, the label / value / description
    rows after the corr Key Value List (21st.dev). Moving to another state
    swaps the content, 160ms out and 240ms in with a 6px rise, inside a
    wrapper held at its last height so nothing below it jumps. Instant under
    reduced motion. */
export default function StateDetail({
  state,
  licensed,
  licenseNumber,
  unavailable,
  onClose,
  headingRef,
}: StateDetailProps) {
  const [shown, setShown] = useState({ state, licensed, licenseNumber, unavailable });
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const next = { state, licensed, licenseNumber, unavailable };
    const body = bodyRef.current;
    const still = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The same state with fresher data is an update, not a move.
    if (state.stateCode === shown.state.stateCode || !body || still || typeof body.animate !== "function") {
      setShown(next);
      return;
    }
    body.style.minHeight = `${body.offsetHeight}px`;
    const out = body.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: "ease-in",
      fill: "forwards",
    });
    out.onfinish = () => setShown(next);
    return () => out.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, licensed, licenseNumber, unavailable]);

  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const body = bodyRef.current;
    if (!body || typeof body.animate !== "function") return;
    body.getAnimations?.().forEach((animation) => animation.cancel());
    const inward = body.animate(
      [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    inward.onfinish = () => {
      body.style.minHeight = "";
    };
  }, [shown.state.stateCode]);

  const current = shown.state;
  const updated = formatUpdated(current.updatedAt);
  const headingId = `smap-detail-${current.stateCode}`;

  return (
    <article className="smap-detail" aria-labelledby={headingId}>
      <div ref={bodyRef} className="smap-detail-body">
        <header className="smap-detail-head">
          <span className="smap-code is-large" aria-hidden="true" translate="no">{current.stateCode}</span>
          <h2 ref={headingRef} id={headingId} className="smap-detail-title" tabIndex={-1}>
            {current.stateName}
          </h2>
          {onClose && (
            <button type="button" className="smap-detail-close" onClick={onClose} aria-label="Close">
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </header>

        <dl className="smap-kv">
          <div className="smap-kv-row">
            <dt>PNCL status</dt>
            <dd>
              {shown.unavailable ? (
                <>
                  <Chip>Availability unavailable</Chip>
                  <p className="smap-kv-note">
                    No verified company availability is available for this state right now.
                  </p>
                </>
              ) : (
                <>
                  <Chip variant={STATUS_CHIP[current.status]}>{current.status}</Chip>
                  <p className="smap-kv-note">{STATE_AVAILABILITY_META[current.status].description}</p>
                </>
              )}
            </dd>
          </div>

          <div className="smap-kv-row">
            <dt>Your license</dt>
            <dd>
              {shown.licensed ? (
                <p className="smap-kv-license">
                  <LicenseGlyph licensed />
                  <span>
                    Licensed on your profile
                    {shown.licenseNumber && (
                      <span className="smap-kv-number">{shown.licenseNumber}</span>
                    )}
                  </span>
                </p>
              ) : (
                <>
                  <p className="smap-kv-license">
                    <LicenseGlyph licensed={false} />
                    <span>No license recorded on your profile.</span>
                  </p>
                  <div className="smap-kv-action">
                    <ListRow label="Add a license" href="/portal/profile?tab=licensing" />
                  </div>
                </>
              )}
            </dd>
          </div>

          {updated && (
            <div className="smap-kv-row">
              <dt>Updated</dt>
              <dd>
                <span className="smap-kv-date">{updated}</span>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}
