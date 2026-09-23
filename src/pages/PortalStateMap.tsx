import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, MapPinned, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
import BottomNav from "@/components/portal/BottomNav";
import Chip, { type ChipVariant } from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalBackground from "@/components/portal/PortalBackground";
import Sheet from "@/components/portal/Sheet";
import { matchesFilter, type StateMapFilter } from "@/components/portal/state-map-filter";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { useStateAvailability } from "@/hooks/useStateAvailability";
import {
  STATE_AVAILABILITY_META,
  STATE_AVAILABILITY_STATUSES,
  countStateAvailability,
  licensedStateCodes,
} from "@/lib/portal-state-availability";
import { US_STATES, isUsStateCode, type UsStateCode } from "@/lib/us-states";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";
import "@/styles/portal-state-map.css";

const StateAvailabilityCanvas = lazy(() => import("@/components/StateAvailabilityCanvas"));

/** The three company statuses, then the agent's own licences. */
const MAP_FILTERS = [...STATE_AVAILABILITY_STATUSES, "Licensed"] as const;
const CHIP_VARIANT: Record<StateMapFilter, ChipVariant> = {
  Active: "active",
  Pending: "pending",
  Inactive: "inactive",
  Licensed: "licensed",
};
/** Where the detail moves from a right Pane to a bottom Sheet. Same number as
    the shell's breakpoint, which is the one the Sheet itself switches on. */
const COMPACT_QUERY = "(max-width: 620px)";

export default function PortalStateMap() {
  const { user } = useAuth();
  const { profile, photoUrl, initials, displayName, loading: profileLoading } = usePortalProfile(user);
  const { states, loading, error, reload } = useStateAvailability();
  const [selectedState, setSelectedState] = useState<UsStateCode | null>(null);
  const [hoveredState, setHoveredState] = useState<UsStateCode | null>(null);
  const [filter, setFilter] = useState<StateMapFilter | null>(null);
  const [search, setSearch] = useState("");
  const [compact, setCompact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const licensedStates = useMemo(
    () => licensedStateCodes(profile?.state_license_numbers),
    [profile?.state_license_numbers],
  );
  const hasStateAvailability = !error && states.length === US_STATES.length;
  const usingAvailabilityFallback = !loading && !hasStateAvailability;
  const displayStates = useMemo(
    () => hasStateAvailability
      ? states
      : US_STATES.map((state) => ({
        stateCode: state.code,
        stateName: state.name,
        status: "Inactive" as const,
        createdAt: "",
        updatedAt: "",
      })),
    [hasStateAvailability, states],
  );
  const stateByCode = useMemo(
    () => new Map(displayStates.map((state) => [state.stateCode, state])),
    [displayStates],
  );
  const counts = useMemo(() => countStateAvailability(states), [states]);
  const visibleState = stateByCode.get(hoveredState ?? selectedState ?? "AL") ?? null;

  const term = search.trim().toLowerCase();
  const matches = useMemo(
    () => displayStates.filter((state) => {
      const kept = matchesFilter(filter, state.status, licensedStates.has(state.stateCode));
      return kept && (term === ""
        || state.stateName.toLowerCase().includes(term)
        || state.stateCode.toLowerCase().startsWith(term));
    }),
    [displayStates, filter, licensedStates, term],
  );

  useEffect(() => {
    document.title = "State Map — PNCL Portal";
    trackPageView("portal_state_map");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const sync = () => {
      setCompact(media.matches);
      // A sheet left open on a rotate would come back as the desktop panel's
      // content behind a modal backdrop.
      if (!media.matches) setSheetOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (selectedState || displayStates.length === 0) return;
    const addressState = profile?.address_state?.trim().toUpperCase() ?? "";
    if (isUsStateCode(addressState) && stateByCode.has(addressState)) {
      setSelectedState(addressState);
      return;
    }
    const firstLicensedState = [...licensedStates][0];
    setSelectedState(firstLicensedState ?? displayStates[0].stateCode);
  }, [displayStates, licensedStates, profile?.address_state, selectedState, stateByCode]);

  // Picking opens the sheet on a phone; the selection the page makes for you on
  // load goes through setSelectedState instead, so the page never opens with a
  // modal already over the map.
  const selectState = (stateCode: UsStateCode) => {
    setSelectedState(stateCode);
    if (compact) setSheetOpen(true);
  };

  const detail = visibleState && (
    <div className="state-map-detail-body">
      <p className="state-map-detail-code">{visibleState.stateCode}</p>
      {usingAvailabilityFallback ? (
        <>
          <Chip>Availability unavailable</Chip>
          <p>No verified company availability is available for this state right now.</p>
        </>
      ) : (
        <>
          <Chip variant={CHIP_VARIANT[visibleState.status]}>{visibleState.status}</Chip>
          <p>{STATE_AVAILABILITY_META[visibleState.status].description}</p>
        </>
      )}
      {licensedStates.has(visibleState.stateCode) ? (
        <p className="state-map-license-note licensed">
          <CheckCircle2 size={17} aria-hidden="true" />
          Licensed on your profile
        </p>
      ) : (
        <p className="state-map-license-note">No license recorded on your profile.</p>
      )}
    </div>
  );

  return (
    <div className="home2-page">
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark portal-state-map-page">
        <div className="wrap portal-map-wrap">
          <header className="portal-hero portal-map-hero">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={44} />
            </Link>
            <Link to="/portal/profile" className="portal-hero-profile" aria-label="View profile">
              <span className="portal-hero-profile-avatar" aria-hidden="true">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="portal-hero-profile-photo" />
                ) : (
                  <span className="portal-hero-profile-initials">{initials}</span>
                )}
              </span>
              <span className="portal-hero-profile-copy">
                <span className="portal-welcome">Welcome, {displayName}</span>
                {user?.email && <span className="portal-meta">{user.email}</span>}
              </span>
            </Link>
          </header>

          <PortalPrimaryNav />

          <section className="state-map-intro" aria-labelledby="state-map-title">
            <div>
              <p className="state-map-eyebrow">Company availability</p>
              <h1 id="state-map-title">PNCL State Map</h1>
              <p>
                Explore PNCL&apos;s current operating availability. Your licensed states are
                marked with a light ring and remain separate from the company status color.
              </p>
            </div>
          </section>

          {loading && (
            <div className="state-map-loading" role="status">
              <span className="onboarding-spinner" aria-hidden="true" />
              <span>Loading state availability…</span>
            </div>
          )}

          {usingAvailabilityFallback && (
            <div className="state-map-error state-map-limited-notice" role="status" aria-live="polite">
              <MapPinned size={24} aria-hidden="true" />
              <div>
                <strong>Live state availability is temporarily unavailable.</strong>
                <p>
                  The map and state directory remain available with a neutral placeholder.
                  No company status should be inferred from these colors.
                </p>
              </div>
              <button type="button" className="admin-secondary-btn" onClick={() => void reload()}>
                <RefreshCw size={16} aria-hidden="true" />
                Try again
              </button>
            </div>
          )}

          {!loading && displayStates.length === US_STATES.length && (
            <>
              {/* The directory comes first in the DOM: a screen reader and a
                  keyboard reach all 51 states before the canvas they cannot
                  use. CSS order puts the map back on top visually. */}
              <div className="state-map-board">
                <Pane title="All jurisdictions" id="state-directory">
                  <p className="state-map-directory-note">
                    Pick a state to move the map and the detail panel.
                  </p>

                  {!usingAvailabilityFallback && (
                    <div className="state-map-filters" role="group" aria-label="Filter states">
                      {MAP_FILTERS.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="state-map-filter"
                          aria-pressed={filter === name}
                          onClick={() => setFilter((current) => (current === name ? null : name))}
                        >
                          <Chip variant={CHIP_VARIANT[name]}>
                            {name === "Licensed" ? licensedStates.size : counts[name]} {name}
                          </Chip>
                        </button>
                      ))}
                    </div>
                  )}

                  <Field
                    label="Search states"
                    id="state-map-search"
                    type="search"
                    autoComplete="off"
                    placeholder="State name or code"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />

                  {matches.length === 0 ? (
                    <EmptyState
                      title="No states match"
                      body="Clear the search or the status filter."
                    />
                  ) : (
                    <ul className="state-map-list">
                      {matches.map((state) => (
                        <li key={state.stateCode}>
                          <ListRow
                            label={state.stateName}
                            icon={<span className="state-map-row-code">{state.stateCode}</span>}
                            current={selectedState === state.stateCode}
                            onClick={() => selectState(state.stateCode)}
                            trailing={
                              <>
                                <Chip
                                  variant={usingAvailabilityFallback
                                    ? "neutral"
                                    : CHIP_VARIANT[state.status]}
                                >
                                  {usingAvailabilityFallback ? "Unavailable" : state.status}
                                </Chip>
                                {licensedStates.has(state.stateCode) && (
                                  <Chip variant="licensed">Licensed</Chip>
                                )}
                              </>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  {!profileLoading && licensedStates.size === 0 && (
                    <p className="state-map-profile-note">
                      No state licenses are currently recorded on your profile. Add license
                      numbers in <Link to="/portal/profile">My Profile</Link> to display the overlay.
                    </p>
                  )}
                </Pane>

                <div className="state-map-layout">
                  <div className="state-map-visual-panel">
                    <Suspense fallback={<div className="state-map-canvas-placeholder">Loading interactive map…</div>}>
                      <StateAvailabilityCanvas
                        states={displayStates}
                        licensedStates={licensedStates}
                        selectedState={selectedState}
                        filter={filter}
                        availabilityUnavailable={usingAvailabilityFallback}
                        onHover={setHoveredState}
                        onSelect={selectState}
                      />
                    </Suspense>
                  </div>

                  {!compact && (
                    <div className="state-map-detail" aria-live="polite">
                      {visibleState && (
                        <Pane as="aside" title={visibleState.stateName}>
                          {detail}
                        </Pane>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 40% of the viewport, so the map keeps the other 60%. */}
              {compact && visibleState && (
                <Sheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  title={visibleState.stateName}
                  size="half"
                >
                  {detail}
                </Sheet>
              )}
            </>
          )}
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing
          block. It replaces the primary nav at 620px and below. */}
      <BottomNav />
    </div>
  );
}
