import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, MapPinned, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
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

const StateAvailabilityCanvas = lazy(() => import("@/components/StateAvailabilityCanvas"));

export default function PortalStateMap() {
  const { user } = useAuth();
  const { profile, photoUrl, initials, displayName, loading: profileLoading } = usePortalProfile(user);
  const { states, loading, error, reload } = useStateAvailability();
  const [selectedState, setSelectedState] = useState<UsStateCode | null>(null);
  const [hoveredState, setHoveredState] = useState<UsStateCode | null>(null);

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

  useEffect(() => {
    document.title = "State Map — PNCL Portal";
    trackPageView("portal_state_map");
    window.scrollTo(0, 0);
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

  return (
    <div className="home2-page">
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
            {!loading && hasStateAvailability && (
              <div className="state-map-counts" aria-label="Company state availability totals">
                {STATE_AVAILABILITY_STATUSES.map((status) => (
                  <span key={status} className={`state-map-count state-status-${status.toLowerCase()}`}>
                    <strong>{counts[status]}</strong> {status}
                  </span>
                ))}
              </div>
            )}
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
              <div className="state-map-layout">
                <div className="state-map-visual-panel">
                  <div className="state-map-legend" aria-label="Map legend">
                    {usingAvailabilityFallback ? (
                      <span>
                        <i className="state-map-unavailable-swatch" aria-hidden="true" />
                        Availability unavailable
                      </span>
                    ) : (
                      STATE_AVAILABILITY_STATUSES.map((status) => (
                        <span key={status}>
                          <i
                            style={{ backgroundColor: STATE_AVAILABILITY_META[status].color }}
                            aria-hidden="true"
                          />
                          {status}
                        </span>
                      ))
                    )}
                    <span>
                      <i className="state-map-license-ring" aria-hidden="true" />
                      Licensed on your profile
                    </span>
                  </div>

                  <Suspense fallback={<div className="state-map-canvas-placeholder">Loading interactive map…</div>}>
                    <StateAvailabilityCanvas
                      states={displayStates}
                      licensedStates={licensedStates}
                      selectedState={selectedState}
                      availabilityUnavailable={usingAvailabilityFallback}
                      onHover={setHoveredState}
                      onSelect={setSelectedState}
                    />
                  </Suspense>
                </div>

                <aside className="state-map-detail" aria-live="polite">
                  {visibleState && (
                    <>
                      <span className="state-map-detail-code">{visibleState.stateCode}</span>
                      <h2>{visibleState.stateName}</h2>
                      {usingAvailabilityFallback ? (
                        <>
                          <span className="state-map-detail-status state-status-unavailable">
                            Availability unavailable
                          </span>
                          <p>No verified company availability is available for this state right now.</p>
                        </>
                      ) : (
                        <>
                          <span className={`state-map-detail-status state-status-${visibleState.status.toLowerCase()}`}>
                            {visibleState.status}
                          </span>
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
                    </>
                  )}
                </aside>
              </div>

              <section className="state-map-list-section" aria-labelledby="state-list-title">
                <div className="state-map-list-head">
                  <div>
                    <p className="state-map-eyebrow">Accessible state directory</p>
                    <h2 id="state-list-title">All states</h2>
                  </div>
                  <p>
                    Use Tab to move through states. Selecting a state updates the detail panel
                    and interactive map.
                  </p>
                </div>

                <div className="state-map-state-grid">
                  {displayStates.map((state) => {
                    const licensed = licensedStates.has(state.stateCode);
                    const statusLabel = usingAvailabilityFallback
                      ? "availability unavailable"
                      : state.status;
                    return (
                      <button
                        type="button"
                        key={state.stateCode}
                        className={`state-map-state-button state-status-${usingAvailabilityFallback ? "unavailable" : state.status.toLowerCase()}${selectedState === state.stateCode ? " selected" : ""}`}
                        aria-pressed={selectedState === state.stateCode}
                        aria-label={`${state.stateName}: ${statusLabel}${licensed ? ", licensed on your profile" : ""}`}
                        onClick={() => setSelectedState(state.stateCode)}
                        onFocus={() => setSelectedState(state.stateCode)}
                        onMouseEnter={() => setHoveredState(state.stateCode)}
                        onMouseLeave={() => setHoveredState(null)}
                      >
                        <span className="state-map-state-code">{state.stateCode}</span>
                        <span className="state-map-state-name">{state.stateName}</span>
                        <span className="state-map-state-status">
                          {usingAvailabilityFallback ? "Unavailable" : state.status}
                        </span>
                        {licensed && (
                          <CheckCircle2 className="state-map-state-license" size={16} aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {!profileLoading && licensedStates.size === 0 && (
                  <p className="state-map-profile-note">
                    No state licenses are currently recorded on your profile. Add license
                    numbers in <Link to="/portal/profile">My Profile</Link> to display the overlay.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
