import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Info, MapPinned, RefreshCw, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
import BottomNav from "@/components/portal/BottomNav";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import PortalBentoMain from "@/components/portal/PortalBentoMain";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Segmented, { type SegmentedItem } from "@/components/portal/Segmented";
import Sheet from "@/components/portal/Sheet";
import Skeleton from "@/components/portal/Skeleton";
import SmallStateRail from "@/components/portal/SmallStateRail";
import SnapSheet from "@/components/portal/SnapSheet";
import StateDetail, { LicenseGlyph, STATUS_CHIP } from "@/components/portal/StateDetail";
import { matchesFilter, type StateMapFilter } from "@/components/portal/state-map-filter";
import { ROW_ACCENT, STATE_MAP_FILL, UNAVAILABLE_FILL } from "@/components/portal/state-map-geometry";
import {
  STATE_AVAILABILITY_META,
  STATE_AVAILABILITY_STATUSES,
  type StateAvailability,
  type StateAvailabilityStatus,
} from "@/lib/portal-state-availability";
import type { UsStateCode } from "@/lib/us-states";

const StateMapSvg = lazy(() => import("@/components/portal/StateMapSvg"));

/** 620px is the shell's one breakpoint: at or below it the finder is a snap
    sheet over a page that does not scroll. */
const COMPACT_QUERY = "(max-width: 620px)";
/** The peek snap before its content has been measured: grabber, search and
    the filter row. */
const PEEK_FALLBACK = 152;

type Snap = "peek" | "detail" | "full";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, [query]);
  return matches;
}

/** The result count with each changed digit rolling in its own window, up
    for a rise and down for a fall. textContent is always the final value:
    the outgoing digit is a pseudo-element with empty alt text, so assistive
    tech and the tests read the number once. Instant under reduced motion.
    After the barvian Number Flow (21st.dev). */
function RollingNumber({ value }: { value: number }) {
  const previous = useRef(value);
  const rootRef = useRef<HTMLSpanElement>(null);
  const digits = String(value).split("");
  const before = String(previous.current).padStart(digits.length, " ").slice(-digits.length).split("");

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = value;
    const root = rootRef.current;
    if (!root || from === value) return;
    const still = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    const direction = value > from ? 1 : -1;
    root.querySelectorAll<HTMLElement>(".smap-digit-col[data-changed]").forEach((column) => {
      column.dataset.direction = direction > 0 ? "up" : "down";
      if (typeof column.animate !== "function") return;
      column.animate(
        [{ transform: `translateY(${direction * 100}%)` }, { transform: "translateY(0)" }],
        { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
  }, [value]);

  return (
    <span ref={rootRef} className="smap-digits">
      {digits.map((digit, index) => {
        const old = before[index];
        const changed = old !== digit;
        return (
          <span key={digits.length - index} className="smap-digit">
            <span
              className="smap-digit-col"
              data-changed={changed ? "" : undefined}
              data-prev={changed && old !== " " ? old : ""}
            >
              {digit}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** The status glyphs the Chip uses, alone, to lead a filter label. */
function FilterLabel({ glyph, word, count }: { glyph?: string; word: string; count?: number }) {
  return (
    <span className="smap-filter-label">
      {glyph && <span className={`smap-glyph is-${glyph}`} aria-hidden="true" />}
      {word}
      {count !== undefined && <span className="smap-filter-count">{count}</span>}
    </span>
  );
}

type Agent = { name: string; email?: string; initials: string; photoUrl?: string | null };

export type StateMapViewProps = {
  agent: Agent;
  /** All 51, placeholders while loading or when live data failed. */
  states: readonly StateAvailability[];
  licensed: ReadonlySet<UsStateCode>;
  licenseNumbers: Readonly<Record<string, string>>;
  counts: Record<StateAvailabilityStatus, number>;
  loading: boolean;
  /** Live availability failed: neutral map, "Unavailable" rows, the notice. */
  unavailable: boolean;
  profileLoading: boolean;
  onRetry: () => void;
  selected: UsStateCode | null;
  onSelect: (code: UsStateCode | null) => void;
  filter: StateMapFilter | null;
  onFilterChange: (filter: StateMapFilter | null) => void;
  /** The selection came in on the URL: open its card and fly to it on load,
      as a pick would. A selection the page made for the agent only outlines. */
  openOnLoad: boolean;
  /** Fixture hooks for the harness, which cannot type or click. The page
      never passes them. */
  initialSearch?: string;
  initialSnap?: Snap;
};

/** The state map page, presentational: plain props in, so the harness can
    render every state from fixtures. PortalStateMap holds the hooks.

    620px and below the page does not scroll: header, the sub-page bar, the
    map card, then a snap sheet docked above the bottom nav (peek: search and
    filters; detail: the answer card; full: the list). 621 to 960px the map
    card sits on top and the finder follows in normal flow. From 961px the
    finder is a sticky 360px panel beside the map, first in the DOM. One
    finder renders, in the sheet or in the panel, never both. */
export default function StateMapView({
  agent,
  states,
  licensed,
  licenseNumbers,
  counts,
  loading,
  unavailable,
  profileLoading,
  onRetry,
  selected,
  onSelect,
  filter,
  onFilterChange,
  openOnLoad,
  initialSearch = "",
  initialSnap,
}: StateMapViewProps) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const [search, setSearch] = useState(initialSearch);
  const [snap, setSnap] = useState<Snap>(
    () => initialSnap ?? (openOnLoad && selected ? "detail" : "peek"),
  );
  const [focus, setFocus] = useState<{ code: UsStateCode; n: number } | null>(
    () => (openOnLoad && selected ? { code: selected, n: 1 } : null),
  );
  const [legendOpen, setLegendOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // A pick made with Enter or Space on a row: focus goes to the card
  // heading, and the card's close brings it back to that row.
  const keyboardPick = useRef(false);
  const returnRow = useRef<UsStateCode | null>(null);
  // Focus waits for the commit that renders its target: the card heading
  // after a pick, the row after a close.
  const pendingFocus = useRef<"heading" | UsStateCode | null>(null);

  const stateByCode = useMemo(
    () => new Map(states.map((state) => [state.stateCode, state])),
    [states],
  );
  const selectedState = selected ? stateByCode.get(selected) ?? null : null;

  const term = search.trim().toLowerCase();
  const matches = useMemo(
    () => states.filter((state) => {
      const kept = matchesFilter(filter, state.status, licensed.has(state.stateCode));
      return kept && (term === ""
        || state.stateName.toLowerCase().includes(term)
        || state.stateCode.toLowerCase().startsWith(term));
    }),
    [states, filter, licensed, term],
  );

  /* ── Picking ─────────────────────────────────────────────────────────── */

  const pick = useCallback((code: UsStateCode, keyboard = false) => {
    onSelect(code);
    setFocus((current) => ({ code, n: (current?.n ?? 0) + 1 }));
    if (compact) setSnap("detail");
    returnRow.current = keyboard ? code : null;
    pendingFocus.current = keyboard ? "heading" : null;
  }, [compact, onSelect]);

  const clear = useCallback(() => {
    onSelect(null);
    setSnap("peek");
  }, [onSelect]);

  const closeCard = () => {
    const row = returnRow.current;
    returnRow.current = null;
    onSelect(null);
    // A keyboard pick came from the list, so close goes back to the list.
    setSnap(row ? "full" : "peek");
    pendingFocus.current = row;
  };

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const element = target === "heading"
      ? headingRef.current
      : rootRef.current?.querySelector<HTMLElement>(`[data-row="${target}"] .portal-row`);
    if (!element) return;
    pendingFocus.current = null;
    element.focus();
  });

  // A selection cleared from outside (the URL, a tap on open map) takes the
  // sheet off its detail snap: there is no card left to show.
  useEffect(() => {
    if (!selectedState && snap === "detail") setSnap("peek");
  }, [selectedState, snap]);

  // "/" focuses the search when nothing else is taking typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (compact) setSnap("full");
      document.getElementById("state-map-search")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compact]);

  /* ── Phone sheet geometry ────────────────────────────────────────────── */

  const [metrics, setMetrics] = useState({ top: 134, full: 560, peek: PEEK_FALLBACK, detail: 360, stageBottom: 0, sheetBase: 0 });
  useLayoutEffect(() => {
    if (!compact) return;
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const bar = root.querySelector(".portal-subhead")?.getBoundingClientRect();
      const nav = root.querySelector(".portal-bottom-nav")?.getBoundingClientRect();
      const stage = cardRef.current?.querySelector(".smap-stage")?.getBoundingClientRect();
      const viewport = window.innerHeight;
      const top = Math.round(bar?.bottom ?? 134);
      const sheetBase = Math.round(nav && nav.height > 0 ? nav.top : viewport - 56);
      const head = headRef.current;
      const detail = detailRef.current;
      setMetrics((current) => {
        const peek = head ? Math.round(head.offsetHeight + 44) : current.peek;
        const full = Math.max(sheetBase - top, peek + 1);
        const detailHeight = detail
          ? Math.min(Math.round(detail.offsetHeight + 44), Math.round(viewport * 0.5))
          : current.detail;
        const next = {
          top,
          full,
          peek,
          detail: Math.min(Math.max(detailHeight, peek + 1), full - 1),
          stageBottom: Math.round(stage?.bottom ?? current.stageBottom),
          sheetBase,
        };
        return Object.entries(next).every(([key, value]) => current[key as keyof typeof current] === value)
          ? current
          : next;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    [headRef.current, detailRef.current, cardRef.current].forEach((element) => element && observer?.observe(element));
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [compact, snap, selectedState, loading]);

  const snapNames: Snap[] = selectedState ? ["peek", "detail", "full"] : ["peek", "full"];
  const snapIndex = Math.max(0, snapNames.indexOf(snap));
  const snapHeights = snapNames.map((name) => metrics[name]);
  // How much of the map stage the sheet covers at the snap it is heading to,
  // so a fly-to centres the state in what is left.
  const occluded = compact
    ? Math.max(0, metrics.stageBottom - (metrics.sheetBase - metrics[snap]))
    : 0;

  /* ── Pieces ──────────────────────────────────────────────────────────── */

  const statusWord = (state: StateAvailability) => (unavailable ? "Unavailable" : state.status);

  // No counts until there is something to count: a zero while loading would
  // read as a fact.
  const counted = (value: number) => (loading ? undefined : value);
  const filterItems: SegmentedItem[] = [
    { value: "all", label: <FilterLabel word="All" count={counted(states.length)} /> },
    ...(unavailable ? [] : STATE_AVAILABILITY_STATUSES.map((status) => ({
      value: status,
      label: <FilterLabel glyph={STATUS_CHIP[status]} word={status} count={counted(counts[status])} />,
    }))),
    {
      value: "Licensed",
      label: <FilterLabel glyph="licensed" word="Licensed" count={profileLoading ? undefined : licensed.size} />,
    },
  ];

  const notice = unavailable && (
    <div className="smap-notice" role="status">
      <MapPinned size={20} aria-hidden="true" />
      <div className="smap-notice-copy">
        <strong>Live state availability is temporarily unavailable.</strong>
        <p>No company status should be inferred from these colors.</p>
      </div>
      <button type="button" className="smap-notice-retry" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" />
        Try again
      </button>
    </div>
  );

  const head = (
    <div ref={headRef} className="smap-finder-head" data-sheet-handle="">
      <div className="smap-search">
        <Search className="smap-search-icon" size={18} strokeWidth={2} aria-hidden="true" />
        <Field
          label="Search states"
          id="state-map-search"
          type="search"
          name="state-search"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search or tap a state"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => compact && setSnap("full")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const first = matches[0];
              if (first) {
                event.currentTarget.blur();
                pick(first.stateCode);
              }
            } else if (event.key === "Escape") {
              setSearch("");
              event.currentTarget.blur();
            }
          }}
        />
        {/* Always mounted so it can cross-fade in and out; out of the tab
            order and hidden from assistive tech while there is nothing to
            clear. */}
        <button
          type="button"
          className="smap-search-clear"
          aria-label="Clear search"
          aria-hidden={search ? undefined : true}
          tabIndex={search ? undefined : -1}
          data-shown={search ? "true" : undefined}
          onClick={() => {
            setSearch("");
            document.getElementById("state-map-search")?.focus();
          }}
        >
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="smap-filters">
        <Segmented
          items={filterItems}
          value={filter ?? "all"}
          onChange={(value) => onFilterChange(value === "all" ? null : value as StateMapFilter)}
          label="Filter states"
          mode="radiogroup"
          pill
        />
      </div>
    </div>
  );

  const noLicenses = filter === "Licensed" && licensed.size === 0 && !profileLoading;

  const list = loading ? (
    <div className="smap-skeleton" aria-busy="true">
      <Skeleton variant="row" />
      <Skeleton variant="row" width="86%" />
      <Skeleton variant="row" width="92%" />
      <p className="portal-sr" role="status">Loading state availability…</p>
    </div>
  ) : noLicenses ? (
    <EmptyState
      title="No licensed states"
      body="No state licenses are currently recorded on your profile."
      action={<Link className="smap-empty-link" to="/portal/profile?tab=licensing">Add licenses</Link>}
    />
  ) : matches.length === 0 ? (
    <EmptyState title="No states match" body="Clear the search or the status filter." />
  ) : (
    <ul
      className="smap-list"
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") keyboardPick.current = true;
      }}
    >
      {matches.map((state) => {
        const isLicensed = licensed.has(state.stateCode);
        return (
          <li
            key={state.stateCode}
            data-row={state.stateCode}
            className="smap-row"
            style={{ "--row-accent": unavailable ? UNAVAILABLE_FILL : ROW_ACCENT[state.status] } as CSSProperties}
          >
            <ListRow
              label={state.stateName}
              icon={<span className="smap-code" translate="no">{state.stateCode}</span>}
              current={selected === state.stateCode}
              onClick={() => {
                const keyboard = keyboardPick.current;
                keyboardPick.current = false;
                pick(state.stateCode, keyboard);
              }}
              trailing={
                <>
                  <Chip variant={unavailable ? "neutral" : STATUS_CHIP[state.status]}>
                    {statusWord(state)}
                  </Chip>
                  {isLicensed && <Chip variant="licensed">Licensed</Chip>}
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );

  const count = !loading && (
    <p className="smap-count" aria-live="polite">
      <RollingNumber value={matches.length} /> {matches.length === 1 ? "result" : "results"}
    </p>
  );

  const detail = (withClose: boolean) => selectedState && (
    <StateDetail
      state={selectedState}
      licensed={licensed.has(selectedState.stateCode)}
      licenseNumber={licenseNumbers[selectedState.stateCode]}
      unavailable={unavailable}
      onClose={withClose ? closeCard : undefined}
      headingRef={headingRef}
    />
  );

  const mapLabel = loading
    ? "PNCL availability map, loading."
    : unavailable
      ? "PNCL availability map: live availability is unavailable. Use the state list to pick a state."
      : `PNCL availability map: ${counts.Active} active, ${counts.Pending} pending, ${counts.Inactive} inactive. Use the state list to pick a state.`;

  let finder: ReactNode;
  if (compact) {
    finder = snap === "detail" && selectedState ? (
      <div ref={detailRef} className="smap-sheet-detail">{detail(true)}</div>
    ) : (
      <>
        {head}
        <div className="smap-finder-body" data-sheet-scroll="">
          {count}
          {list}
        </div>
      </>
    );
  } else {
    finder = (
      <aside className="smap-panel" aria-label="Find a state">
        {notice}
        {head}
        <div className="smap-finder-body">
          {selectedState && <div className="smap-panel-detail">{detail(false)}</div>}
          {count}
          {list}
        </div>
      </aside>
    );
  }

  const rootStyle = compact
    ? ({ "--smap-sheet-top": `${metrics.top}px`, "--smap-peek": `${metrics.peek}px` } as CSSProperties)
    : undefined;

  return (
    <div ref={rootRef} className="home2-page" style={rootStyle}>
      <PortalBentoMain>
        <PortalHeader
          name={agent.name}
          email={agent.email}
          initials={agent.initials}
          photoUrl={agent.photoUrl}
          subpage
        />

        <PortalPrimaryNav />

        <div className="portal-bento-page smap-page">
          <PortalSubpageHeader
            title="State map"
            aside={
              <button
                type="button"
                className="smap-info"
                aria-label="About this map"
                onClick={() => setLegendOpen(true)}
              >
                <Info size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            }
          />

          <div className="smap-layout">
            {!compact && finder}

            {/* On a phone the sheet covers the rail from the detail snap up and
                the whole card at full; covered controls leave the tab order so
                focus never lands under the sheet (WCAG 2.4.11). */}
            <div
              ref={cardRef}
              className="smap-card"
              {...(compact && snap === "full" ? { inert: "" } : {})}
            >
              {compact && notice}
              <Suspense fallback={<div className="smap-viz" data-loading="true"><div className="smap-stage" /></div>}>
                <StateMapSvg
                  states={states}
                  licensed={licensed}
                  selected={selected}
                  filter={filter}
                  unavailable={unavailable}
                  loading={loading}
                  label={mapLabel}
                  focus={focus}
                  occluded={occluded}
                  onPick={(code) => pick(code)}
                  onClear={clear}
                />
              </Suspense>
              {loading ? (
                // Holds the rail's height so the map does not jump when it lands.
                <div className="smap-rail is-placeholder" aria-hidden="true" />
              ) : (
                <SmallStateRail
                  covered={compact && snap !== "peek"}
                  stateByCode={stateByCode}
                  licensed={licensed}
                  selected={selected}
                  unavailable={unavailable}
                  onPick={(code) => pick(code)}
                />
              )}
            </div>
          </div>
        </div>
      </PortalBentoMain>

      {/* Outside <main>, beside the bottom nav, for the containing-block
          reason the nav has: a fixed panel inside the stage would take the
          page as its containing block. */}
      {compact && (
        <SnapSheet
          label="Find a state"
          snaps={snapHeights}
          index={snapIndex}
          onIndexChange={(index) => setSnap(snapNames[index])}
          expanded={snap === "full"}
          grabberLabel={snap === "full" ? "Show less" : "Show all states"}
          onGrabber={() => setSnap(snap === "full" ? "peek" : "full")}
        >
          {finder}
        </SnapSheet>
      )}

      <Sheet open={legendOpen} onClose={() => setLegendOpen(false)} title="About this map" size="half">
        <div className="smap-legend">
          <p>
            Explore PNCL’s current operating availability. Your licensed states are
            marked with a badge and remain separate from the company status color.
          </p>
          <ul>
            {STATE_AVAILABILITY_STATUSES.map((status) => (
              <li key={status}>
                <span
                  className={`smap-swatch is-large${status === "Pending" ? " is-hatched" : ""}`}
                  style={{ backgroundColor: STATE_MAP_FILL[status] }}
                  aria-hidden="true"
                />
                <Chip variant={STATUS_CHIP[status]}>{status}</Chip>
                <span>{STATE_AVAILABILITY_META[status].description}</span>
              </li>
            ))}
            <li>
              <span className="smap-legend-badge" aria-hidden="true">
                <LicenseGlyph licensed />
              </span>
              <Chip variant="licensed">Licensed</Chip>
              <span>A license number is on file in your profile for this state.</span>
            </li>
          </ul>
        </div>
      </Sheet>

      <BottomNav />
    </div>
  );
}
