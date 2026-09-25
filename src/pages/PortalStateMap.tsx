import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import StateMapView from "@/components/portal/StateMapView";
import type { StateMapFilter } from "@/components/portal/state-map-filter";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { useStateAvailability } from "@/hooks/useStateAvailability";
import {
  STATE_AVAILABILITY_STATUSES,
  countStateAvailability,
  licensedStateCodes,
} from "@/lib/portal-state-availability";
import { normalizeStateLicenseNumbers } from "@/lib/portal-profile";
import { US_STATES, isUsStateCode, type UsStateCode } from "@/lib/us-states";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";
import "@/styles/portal-bento.css";
import "@/styles/portal-state-map.css";

const FILTERS: readonly string[] = [...STATE_AVAILABILITY_STATUSES, "Licensed"];

const readState = (value: string | null): UsStateCode | null => {
  const code = value?.trim().toUpperCase() ?? "";
  return isUsStateCode(code) ? code : null;
};
const readFilter = (value: string | null): StateMapFilter | null =>
  value && FILTERS.includes(value) ? (value as StateMapFilter) : null;

/** The state map's container: every hook and derivation, then StateMapView
    for the markup. The selection and the filter live in the URL as
    ?state=TX and ?filter=Pending, written with replace so picks do not pile
    up history, which also gives other pages a deep link. */
export default function PortalStateMap() {
  const { user } = useAuth();
  const { profile, photoUrl, initials, displayName, loading: profileLoading } = usePortalProfile(user);
  const { states, loading, error, reload } = useStateAvailability();
  const [params, setParams] = useSearchParams();

  const licensedStates = useMemo(
    () => licensedStateCodes(profile?.state_license_numbers),
    [profile?.state_license_numbers],
  );
  const licenseNumbers = useMemo(
    () => normalizeStateLicenseNumbers(profile?.state_license_numbers),
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

  useEffect(() => {
    document.title = "State Map — PNCL Portal";
    trackPageView("portal_state_map");
    window.scrollTo(0, 0);
  }, []);

  const urlState = readState(params.get("state"));
  const urlFilter = readFilter(params.get("filter"));
  // A status filter means nothing over placeholder data; Licensed still does.
  const filter = usingAvailabilityFallback && urlFilter !== "Licensed" ? null : urlFilter;
  const [openOnLoad] = useState(() => urlState !== null);
  // Once the agent has picked or cleared anything, the page stops choosing.
  const [touched, setTouched] = useState(false);

  // The agent's own state, else their first licensed state, else nothing.
  const defaultState = useMemo(() => {
    const addressState = profile?.address_state?.trim().toUpperCase() ?? "";
    if (isUsStateCode(addressState) && stateByCode.has(addressState)) return addressState;
    return [...licensedStates][0] ?? null;
  }, [licensedStates, profile?.address_state, stateByCode]);
  const selected = urlState ?? (touched ? null : defaultState);

  const setParam = (key: string, value: string | null) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  return (
    <StateMapView
      agent={{ name: displayName, email: user?.email, initials, photoUrl }}
      states={displayStates}
      licensed={licensedStates}
      licenseNumbers={licenseNumbers}
      counts={counts}
      loading={loading}
      unavailable={usingAvailabilityFallback}
      profileLoading={profileLoading}
      onRetry={() => void reload()}
      selected={selected}
      onSelect={(code) => {
        setTouched(true);
        setParam("state", code);
      }}
      filter={filter}
      onFilterChange={(value) => setParam("filter", value)}
      openOnLoad={openOnLoad}
    />
  );
}
