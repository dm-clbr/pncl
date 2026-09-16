import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ClipboardList,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import PortalOnboardingChecklist from "@/components/PortalOnboardingChecklist";
import { useAuth } from "@/contexts/AuthContext";
import { PORTAL_SECTIONS } from "@/lib/portal-links";
import { usePortalDashboardTabs } from "@/hooks/usePortalDashboardTabs";
import { isLinksDashboardSection, isDownloadsDashboardSection } from "@/lib/portal-dashboard-section-types";
import type { PortalDashboardSection } from "@/lib/portal-dashboard-tabs";
import PortalReferralPanel from "@/components/PortalReferralPanel";
import PortalDownlinePanel from "@/components/PortalDownlinePanel";
import { hasAdminConsoleAccess, isAdminAssist, isGenesisAdmin } from "@/lib/roles";
import {
  completePortalTodo,
  derivePortalPhase,
  isRequiredFormTodo,
  isTodoCompleted,
  PORTAL_PHASE_LABELS,
} from "@/lib/portal-todos";
import { usePortalTodos } from "@/hooks/usePortalTodos";
import { usePortalCarriers } from "@/hooks/usePortalCarriers";
import {
  buildCarrierApplicationsDescription,
  CARRIER_APPLICATIONS_TODO_ID,
} from "@/lib/carrier-applications";
import { usePortalW9 } from "@/hooks/usePortalW9";
import { usePortalDirectDeposit } from "@/hooks/usePortalDirectDeposit";
import { usePortalIca } from "@/hooks/usePortalIca";
import { usePortalGoogleCalendar } from "@/hooks/usePortalGoogleCalendar";
import {
  calendarEventSortValue,
  formatCalendarEventDate,
  formatCalendarEventTime,
} from "@/lib/portal-google-calendar";
import {
  refreshPortalUser,
  shouldShowDirectDepositResignNotice,
  shouldShowIcaResignNotice,
  shouldShowW9ResignNotice,
} from "@/lib/portal-messages";
import PortalIncentivesList from "@/components/PortalIncentivesList";
import PortalBrandAssetsList from "@/components/PortalBrandAssetsList";
import PortalDashboardFilesList from "@/components/PortalDashboardFilesList";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
import PortalBentoStage from "@/components/PortalBentoStage";
import PortalBentoTile, {
  PortalBentoExpandTile,
  type PortalBentoStat,
} from "@/components/PortalBentoTile";
import {
  DotGrid,
  barMask,
  ringMask,
  segmentMask,
  sparkMask,
  stepperMask,
  usMask,
  waveMask,
} from "@/components/PortalDotMatrix";
import { usePortalIncentives } from "@/hooks/usePortalIncentives";
import { usePortalBrandAssets } from "@/hooks/usePortalBrandAssets";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/portal-bento.css";

const PORTAL_SOCIAL_LINKS = [
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61588062292202",
    iconSrc: "/fb.svg",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/thepncl_/",
    iconSrc: "/insta.svg",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/the-pncl/?viewAsMember=true",
    iconSrc: "/linkedin.svg",
  },
] as const;

/** Section ids that get their own named tile; everything else appends. */
const SALES_TOOLS_ID = "sales-tools";
const RESOURCE_SECTION_IDS = ["training", "account", "pncl"];

const GRID_COLUMNS = 3;

function PortalSubLink({
  link,
}: {
  link: { title: string; href: string; external: boolean };
}) {
  const content = (
    <>
      <span>{link.title}</span>
      <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
    </>
  );

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="portal-sub-link"
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={link.href} className="portal-sub-link">
      {content}
    </Link>
  );
}

function sectionCount(
  section: PortalDashboardSection,
  incentivesLength: number,
  brandAssetsLength: number,
): number {
  if (isLinksDashboardSection(section)) return section.links.length;
  if (isDownloadsDashboardSection(section)) return section.files.length;
  if (section.sectionType === "incentives") return incentivesLength;
  return brandAssetsLength;
}

function SectionPanel({
  section,
  incentives,
  incentivesLoading,
  brandAssets,
  brandAssetsLoading,
}: {
  section: PortalDashboardSection;
  incentives: ReturnType<typeof usePortalIncentives>["incentives"];
  incentivesLoading: boolean;
  brandAssets: ReturnType<typeof usePortalBrandAssets>["assets"];
  brandAssetsLoading: boolean;
}) {
  if (isLinksDashboardSection(section)) {
    if (section.links.length === 0) {
      return <p className="portal-panel-note">No links published yet.</p>;
    }
    return (
      <>
        {section.links.map((link) => (
          <PortalSubLink key={link.id} link={link} />
        ))}
      </>
    );
  }

  if (isDownloadsDashboardSection(section)) {
    return section.files.length > 0 ? (
      <PortalDashboardFilesList items={section.files} />
    ) : (
      <p className="portal-panel-note">No files published yet.</p>
    );
  }

  if (section.sectionType === "incentives") {
    if (incentivesLoading) {
      return (
        <div className="portal-incentives-loading">
          <span className="onboarding-spinner" aria-hidden="true" />
          <span>Loading incentives...</span>
        </div>
      );
    }
    return incentives.length > 0 ? (
      <PortalIncentivesList items={incentives} />
    ) : (
      <p className="portal-panel-note">No incentives published yet.</p>
    );
  }

  if (brandAssetsLoading) {
    return (
      <div className="portal-incentives-loading">
        <span className="onboarding-spinner" aria-hidden="true" />
        <span>Loading brand assets...</span>
      </div>
    );
  }

  return brandAssets.length > 0 ? (
    <>
      <p className="portal-panel-note">
        Official PNCL logos, templates, and brand files.
      </p>
      <PortalBrandAssetsList items={brandAssets} />
      <Link to="/portal/brand-assets" className="portal-sub-link">
        <span>View all brand assets</span>
        <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
      </Link>
    </>
  ) : (
    <p className="portal-panel-note">No brand assets published yet.</p>
  );
}

export default function PortalDashboard() {
  const { user: authUser, signOut } = useAuth();
  const [portalUser, setPortalUser] = useState(authUser);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);

  const { incentives, loading: incentivesLoading } = usePortalIncentives();
  const { assets: brandAssets, loading: brandAssetsLoading } = usePortalBrandAssets();
  const { sections: dashboardSections } = usePortalDashboardTabs();
  const { todos: portalTodos } = usePortalTodos();
  const { carriers: portalCarriers } = usePortalCarriers();
  const { submitted: icaSubmitted } = usePortalIca();
  const { submitted: w9Submitted } = usePortalW9();
  const { submitted: directDepositSubmitted } = usePortalDirectDeposit();
  const { profile, photoUrl, initials, displayName } = usePortalProfile(portalUser);
  // Read-only here. Connect, sync and disconnect stay on /portal/calendar so a
  // destructive action never sits inside a hover-lifting tile.
  const calendar = usePortalGoogleCalendar();

  const resolvedTodos = useMemo(() => {
    const carrierApplicationsDescription = buildCarrierApplicationsDescription(portalCarriers);

    return portalTodos.map((todo) => ({
      ...todo,
      description:
        todo.id === CARRIER_APPLICATIONS_TODO_ID && carrierApplicationsDescription
          ? carrierApplicationsDescription
          : todo.description,
      completed: isTodoCompleted(portalUser, todo, {
        icaSubmitted,
        w9Submitted,
        directDepositSubmitted,
      }),
    }));
  }, [
    portalUser,
    portalTodos,
    portalCarriers,
    icaSubmitted,
    w9Submitted,
    directDepositSubmitted,
  ]);
  const pendingTodos = useMemo(
    () => resolvedTodos.filter((todo) => !todo.completed),
    [resolvedTodos],
  );
  const completedTodoCount = resolvedTodos.length - pendingTodos.length;
  const currentPhase = derivePortalPhase(resolvedTodos);
  const progressPercent = resolvedTodos.length === 0
    ? 0
    : Math.round((completedTodoCount / resolvedTodos.length) * 100);
  const pendingRequiredForms = pendingTodos.some((todo) => isRequiredFormTodo(todo.id));
  const showIcaResignNotice = shouldShowIcaResignNotice(portalUser) && !icaSubmitted;
  const showW9ResignNotice = shouldShowW9ResignNotice(portalUser) && !w9Submitted;
  const showDirectDepositResignNotice =
    shouldShowDirectDepositResignNotice(portalUser) && !directDepositSubmitted;

  const displaySections = useMemo((): PortalDashboardSection[] => {
    if (dashboardSections.length > 0) {
      return dashboardSections.filter((section) =>
        isLinksDashboardSection(section)
          ? section.links.length > 0
          : isDownloadsDashboardSection(section)
            ? section.files.length > 0
            : true,
      );
    }

    return [
      ...PORTAL_SECTIONS.map((section) => ({
        id: section.id,
        title: section.title,
        sectionType: "links" as const,
        links: section.links.map((link) => ({
          id: link.id,
          title: link.title,
          description: link.description,
          href: link.href,
          external: link.external,
        })),
        files: [],
      })),
      {
        id: "incentives",
        title: "Incentives",
        sectionType: "incentives" as const,
        links: [],
        files: [],
      },
      {
        id: "brand-assets",
        title: "Brand assets",
        sectionType: "brand_assets" as const,
        links: [],
        files: [],
      },
    ];
  }, [dashboardSections]);

  /** Sections claimed by a named tile, and whatever is left to append. */
  const sectionBuckets = useMemo(() => {
    const salesTools = displaySections.find((section) => section.id === SALES_TOOLS_ID);
    const incentivesSection = displaySections.find(
      (section) => section.sectionType === "incentives",
    );
    const brandSection = displaySections.find(
      (section) => section.sectionType === "brand_assets",
    );
    const resources = displaySections.filter(
      (section) =>
        RESOURCE_SECTION_IDS.includes(section.id) || isDownloadsDashboardSection(section),
    );

    const claimed = new Set<string>();
    [salesTools, incentivesSection, brandSection, ...resources].forEach((section) => {
      if (section) claimed.add(section.id);
    });
    const extras = displaySections.filter((section) => !claimed.has(section.id));

    return { salesTools, incentivesSection, brandSection, resources, extras };
  }, [displaySections]);

  const resourcesCount = useMemo(
    () =>
      sectionBuckets.resources.reduce(
        (total, section) =>
          total +
          (isLinksDashboardSection(section) ? section.links.length : 0) +
          (isDownloadsDashboardSection(section) ? section.files.length : 0),
        0,
      ),
    [sectionBuckets.resources],
  );

  /**
   * Carriers carry no status field, only `section`. The codebase already treats
   * "automatic" as the no-action group, so that is the split shown here rather
   * than inventing a status the backend does not return.
   */
  const carrierBreakdown = useMemo(() => {
    let automatic = 0;
    for (const carrier of portalCarriers) {
      if (carrier.section.trim().toLowerCase() === "automatic") automatic += 1;
    }
    return { automatic, action: portalCarriers.length - automatic };
  }, [portalCarriers]);

  const nextEvent = useMemo(() => {
    const events = calendar.data?.events ?? [];
    if (events.length === 0) return null;
    return [...events].sort(
      (a, b) => calendarEventSortValue(a) - calendarEventSortValue(b),
    )[0];
  }, [calendar.data]);

  useEffect(() => {
    setPortalUser(authUser);
  }, [authUser]);

  useEffect(() => {
    void refreshPortalUser()
      .then((user) => {
        if (user) setPortalUser(user);
      })
      .catch(() => {
        // Keep the cached session user if refresh fails.
      });
  }, []);

  useEffect(() => {
    document.title = "Employee Portal — PNCL";
    trackPageView("portal_dashboard");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!checklistOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChecklistOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [checklistOpen]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign out";
      toast.error(message);
    }
  };

  const handleCompleteTodo = async (todoId: string) => {
    setCompletingTodoId(todoId);
    try {
      await completePortalTodo(todoId, resolvedTodos);
      toast.success("To-do marked complete.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update to-do.");
    } finally {
      setCompletingTodoId(null);
    }
  };

  const agentEmail = portalUser?.email ?? "";
  const showAdminLink = hasAdminConsoleAccess(portalUser);
  const adminLink = isGenesisAdmin(portalUser)
    ? "/portal/admin/genesis"
    : isAdminAssist(portalUser)
      ? "/portal/admin/hierarchy"
      : "/portal/admin";
  const adminLinkLabel = isGenesisAdmin(portalUser)
    ? "Genesis admin"
    : isAdminAssist(portalUser)
      ? "Admin assist"
      : "Admin console";

  const phaseLabel = PORTAL_PHASE_LABELS[currentPhase];
  const requiredStates = [icaSubmitted, w9Submitted, directDepositSubmitted];
  const resignNotice = showIcaResignNotice
    ? {
        title: "Re-sign your Independent Contractor Agreement",
        body: "The ICA was updated, so your previous signature is no longer on file.",
        href: "/portal/ica",
        cta: "Re-sign agreement",
      }
    : showW9ResignNotice
      ? {
          title: "Fill out a new W-9",
          body: "Your previous W-9 was removed and needs to be completed again.",
          href: "/portal/w9",
          cta: "Complete W-9",
        }
      : showDirectDepositResignNotice
        ? {
            title: "Fill out a new direct deposit form",
            body: "Your previous direct deposit form was removed and needs to be completed again.",
            href: "/portal/direct-deposit",
            cta: "Complete direct deposit form",
          }
        : null;

  // Tiles are built as a list so numbering, row and stagger order stay correct
  // no matter how many sections the server returns.
  const tiles: ReactNode[] = [];
  const at = () => {
    const position = tiles.length;
    return { index: position + 1, row: Math.floor(position / GRID_COLUMNS), order: position };
  };

  const expandTile = (
    section: PortalDashboardSection,
    title: string,
    illustration: ReactNode,
    extraStats: PortalBentoStat[] = [],
  ) => {
    const count = sectionCount(section, incentives.length, brandAssets.length);
    const spot = at();
    return (
      <PortalBentoExpandTile
        key={section.id}
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title={title}
        expanded={Boolean(openSections[section.id])}
        onToggle={() => toggleSection(section.id)}
        panelLabel={title}
        stats={[{ label: "Items", value: String(count).padStart(2, "0") }, ...extraStats]}
        panel={
          <div className="portal-tile-panel">
            <SectionPanel
              section={section}
              incentives={incentives}
              incentivesLoading={incentivesLoading}
              brandAssets={brandAssets}
              brandAssetsLoading={brandAssetsLoading}
            />
          </div>
        }
      >
        {illustration}
      </PortalBentoExpandTile>
    );
  };

  // 01 Agent status
  {
    const spot = at();
    tiles.push(
      <PortalBentoTile
        key="agent-status"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Agent Status"
        to="/portal/profile"
        ariaLabel={`Agent status: ${phaseLabel}. View profile.`}
        stats={[
          {
            label: "Steps",
            value: `${completedTodoCount}/${resolvedTodos.length}`,
          },
          {
            label: "Tier",
            value: profile?.comp_level != null ? String(profile.comp_level) : "—",
          },
          {
            label: "Open",
            value: String(pendingTodos.length).padStart(2, "0"),
            accent: pendingTodos.length > 0,
          },
        ]}
      >
        <span className="portal-tile-display">{phaseLabel}</span>
        <DotGrid mask={waveMask(progressPercent)} className="pdot-inline" hideOff />
        <div className="portal-agent-identity">
          <span className="portal-bento-avatar" aria-hidden="true">
            {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
          </span>
          <span className="portal-agent-identity-copy">
            <span className="portal-agent-name">{displayName}</span>
            {agentEmail && <span className="portal-tile-note">{agentEmail}</span>}
          </span>
        </div>
      </PortalBentoTile>,
    );
  }

  // 02 Onboarding progress
  {
    const spot = at();
    tiles.push(
      <PortalBentoTile
        key="progress"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Onboarding Progress"
        onClick={() => setChecklistOpen(true)}
        ariaExpanded={checklistOpen}
        ariaLabel={`Onboarding progress ${progressPercent} percent. Open checklist.`}
        stats={[
          { label: "Done", value: String(completedTodoCount).padStart(2, "0") },
          {
            label: "Left",
            value: String(pendingTodos.length).padStart(2, "0"),
            accent: pendingTodos.length > 0,
          },
        ]}
      >
        <div className="portal-gauge-split">
          <div className="portal-gauge">
            <DotGrid
              mask={ringMask(progressPercent)}
              className="pdot-gauge" hideOff
              label={`Onboarding ${progressPercent} percent complete`}
            />
            <span className="portal-gauge-value">
              <span className="portal-gauge-number">{progressPercent}%</span>
              <span className="portal-gauge-unit">Complete</span>
            </span>
          </div>
          <div className="portal-legend">
            <span className="portal-legend-row">
              <span className="portal-legend-swatch" />
              Complete
            </span>
            <span className="portal-legend-row">
              <span className="portal-legend-swatch is-accent" />
              Remaining
            </span>
          </div>
        </div>
      </PortalBentoTile>,
    );
  }

  // 03 Required forms
  {
    const spot = at();
    const doneCount = requiredStates.filter(Boolean).length;
    tiles.push(
      <PortalBentoTile
        key="required-forms"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Required Forms"
        urgent={Boolean(resignNotice) || pendingRequiredForms}
        headerAside={
          resignNotice ? (
            <span className="portal-pill">
              <span className="portal-live-dot" />
              Action
            </span>
          ) : undefined
        }
        stats={[
          { label: "Signed", value: `${doneCount}/3` },
          {
            label: "Status",
            value: doneCount === 3 ? "OK" : "OPEN",
            accent: doneCount !== 3,
          },
        ]}
      >
        <DotGrid
          mask={stepperMask(requiredStates)}
          className="pdot-inline"
          hideOff
          label={`Required forms: ${doneCount} of 3 complete`}
        />
        <div className="portal-step-labels" aria-hidden="true">
          <span className={icaSubmitted ? "is-done" : ""}>ICA</span>
          <span className={w9Submitted ? "is-done" : ""}>W-9</span>
          <span className={directDepositSubmitted ? "is-done" : ""}>Deposit</span>
        </div>
        {resignNotice ? (
          <div className="portal-tile-alert" role="alert">
            <strong>{resignNotice.title}</strong>
            <p className="portal-tile-lede">{resignNotice.body}</p>
            <Link to={resignNotice.href} className="portal-tile-cta">
              {resignNotice.cta}
              <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="portal-required-links">
            {!icaSubmitted && (
              <Link to="/portal/ica" className="portal-tile-cta">
                Sign ICA
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
            {!w9Submitted && (
              <Link to="/portal/w9" className="portal-tile-cta">
                Submit W-9
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
            {!directDepositSubmitted && (
              <Link to="/portal/direct-deposit" className="portal-tile-cta">
                Set up deposit
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
            {doneCount === 3 && (
              <p className="portal-tile-note">All required forms are on file.</p>
            )}
          </div>
        )}
      </PortalBentoTile>,
    );
  }

  // 04 Carrier appointments
  {
    const spot = at();
    tiles.push(
      <PortalBentoTile
        key="carriers"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Carrier Appointments"
        to="/portal/carriers"
        ariaLabel={`${portalCarriers.length} carrier appointments. Open carrier sheet.`}
        stats={[
          { label: "Automatic", value: String(carrierBreakdown.automatic).padStart(2, "0") },
          {
            label: "Action",
            value: String(carrierBreakdown.action).padStart(2, "0"),
            accent: carrierBreakdown.action > 0,
          },
        ]}
      >
        <span className="portal-tile-display">
          {String(portalCarriers.length).padStart(2, "0")}
        </span>
        <p className="portal-tile-note">Carriers</p>
        {portalCarriers.length > 0 ? (
          <DotGrid
            mask={segmentMask(
              carrierBreakdown.automatic,
              Math.max(portalCarriers.length, 1),
            )}
            className="pdot-inline"
            label={`${carrierBreakdown.automatic} automatic of ${portalCarriers.length} carriers`}
          />
        ) : (
          <p className="portal-tile-lede">No carriers published yet.</p>
        )}
      </PortalBentoTile>,
    );
  }

  // 05 Sales tools
  if (sectionBuckets.salesTools) {
    tiles.push(
      expandTile(
        sectionBuckets.salesTools,
        "Sales Tools",
        <DotGrid mask={barMask([0.25, 0.4, 0.3, 0.55, 0.45, 0.7, 0.5, 0.85, 0.6, 0.45, 0.75, 0.55, 0.9, 0.65, 1, 0.8], 16, 12)} className="pdot-inline" hideOff />,
      ),
    );
  }

  // 06 Team progress
  {
    const spot = at();
    tiles.push(
      <PortalBentoExpandTile
        key="downline"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Team Progress"
        expanded={Boolean(openSections.downline)}
        onToggle={() => toggleSection("downline")}
        panelLabel="Team progress"
        panel={
          <div className="portal-tile-panel">
            <PortalDownlinePanel embedded />
          </div>
        }
      >
        <DotGrid mask={barMask([0.3, 0.55, 0.4, 0.8, 0.5, 0.35, 0.7, 0.45, 0.9, 0.6, 0.5, 0.75, 0.4, 0.85, 0.55, 0.65], 16)} className="pdot-inline" hideOff />
      </PortalBentoExpandTile>,
    );
  }

  // 07 Referral links
  {
    const spot = at();
    tiles.push(
      <PortalBentoExpandTile
        key="referrals"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Referral Links"
        expanded={Boolean(openSections.referrals)}
        onToggle={() => toggleSection("referrals")}
        panelLabel="Referral links"
        panel={
          <div className="portal-tile-panel">
            <PortalReferralPanel embedded />
          </div>
        }
      >
        <DotGrid mask={sparkMask([2, 3, 2.5, 5, 4, 6, 5.5, 8, 7, 9, 8.5, 11, 10, 13])} className="pdot-inline" hideOff />
        <p className="portal-tile-note">Invite an agent</p>
      </PortalBentoExpandTile>,
    );
  }

  // 08 Incentives
  if (sectionBuckets.incentivesSection) {
    tiles.push(
      expandTile(
        sectionBuckets.incentivesSection,
        "Incentives",
        <DotGrid mask={ringMask(Math.min(100, incentives.length * 25), 32, 19)} className="pdot-gauge" hideOff />,
      ),
    );
  }

  // 09 Brand assets
  if (sectionBuckets.brandSection) {
    tiles.push(
      expandTile(
        sectionBuckets.brandSection,
        "Brand Assets",
        <DotGrid mask={barMask([0.4, 0.65, 0.5, 0.9, 0.6, 0.45, 0.8, 0.55, 0.7, 0.5, 0.85, 0.6, 0.4, 0.75, 0.55, 0.9], 16)} className="pdot-inline" hideOff />,
      ),
    );
  }

  // 10 Calendar
  {
    const spot = at();
    const calendarBody = calendar.loading ? (
      <div className="portal-incentives-loading">
        <span className="onboarding-spinner" aria-hidden="true" />
        <span>Loading calendar...</span>
      </div>
    ) : calendar.error ? (
      <p className="portal-tile-lede">Calendar preview is unavailable.</p>
    ) : !calendar.data?.connection ? (
      <p className="portal-tile-lede">
        Google Calendar is not connected. Connect it to preview upcoming events.
      </p>
    ) : calendar.data.connection.status === "reauthorization_required" ? (
      <p className="portal-tile-lede">
        Calendar authorization expired. Reconnect to restore your preview.
      </p>
    ) : nextEvent ? (
      <>
        <span className="portal-tile-display portal-tile-display-sm">
          {nextEvent.title}
        </span>
        <p className="portal-tile-note">
          {formatCalendarEventDate(nextEvent)} · {formatCalendarEventTime(nextEvent)}
        </p>
      </>
    ) : (
      <p className="portal-tile-lede">No upcoming events in the next 14 days.</p>
    );

    tiles.push(
      <PortalBentoTile
        key="calendar"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Calendar"
        to="/portal/calendar"
        ariaLabel="Calendar preview. Open calendar."
        stats={[
          {
            label: "Events",
            value: String(calendar.data?.events?.length ?? 0).padStart(2, "0"),
          },
        ]}
      >
        {calendarBody}
      </PortalBentoTile>,
    );
  }

  // 11 Training and resources
  if (sectionBuckets.resources.length > 0) {
    const spot = at();
    tiles.push(
      <PortalBentoExpandTile
        key="resources"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Training and Resources"
        expanded={Boolean(openSections.resources)}
        onToggle={() => toggleSection("resources")}
        panelLabel="Training and resources"
        stats={[{ label: "Items", value: String(resourcesCount).padStart(2, "0") }]}
        panel={
          <div className="portal-tile-panel">
            {sectionBuckets.resources.map((section) => (
              <div className="portal-tile-subgroup" key={section.id}>
                <h3 className="portal-tile-subgroup-title">{section.title}</h3>
                <SectionPanel
                  section={section}
                  incentives={incentives}
                  incentivesLoading={incentivesLoading}
                  brandAssets={brandAssets}
                  brandAssetsLoading={brandAssetsLoading}
                />
              </div>
            ))}
          </div>
        }
      >
        <DotGrid mask={barMask([0.3, 0.5, 0.65, 0.45, 0.8, 0.55, 0.4, 0.7, 0.9, 0.5, 0.6, 0.85, 0.45, 0.75, 0.55, 0.7], 16)} className="pdot-inline" hideOff />
      </PortalBentoExpandTile>,
    );
  }

  // 12 State map
  {
    const spot = at();
    tiles.push(
      <PortalBentoTile
        key="state-map"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="State Map"
        to="/portal/state-map"
        ariaLabel="Open the state availability map."
        stats={[{ label: "View", value: "MAP" }]}
      >
        <DotGrid mask={usMask()} className="pdot-inline" label="United States" hideOff />
      </PortalBentoTile>,
    );
  }

  // Anything the server returns that no named tile claimed.
  sectionBuckets.extras.forEach((section) => {
    tiles.push(
      expandTile(
        section,
        section.title,
        <DotGrid mask={barMask([0.35, 0.6, 0.45, 0.75, 0.55, 0.4, 0.85, 0.5, 0.7, 0.6, 0.45, 0.8, 0.55, 0.65, 0.5, 0.9], 16)} className="pdot-inline" hideOff />,
      ),
    );
  });

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-bento portal-dash portal-home-dash">
        <div className="portal-bento-wrap">
          <header className="portal-bento-head">
            <div className="portal-bento-brand">
              <Link to="/" className="portal-bento-logo" aria-label="PNCL home">
                <PNCLLogo height={44} />
              </Link>
              <h1 className="portal-bento-title">Employee Portal</h1>
              <span className="portal-bento-status">{phaseLabel}</span>
            </div>

            <Link
              to="/portal/profile"
              className="portal-bento-profile"
              aria-label="View profile"
            >
              <span className="portal-bento-profile-copy">
                <span className="portal-bento-profile-name">{displayName}</span>
                {agentEmail && (
                  <span className="portal-bento-profile-mail">{agentEmail}</span>
                )}
              </span>
              <span className="portal-bento-avatar" aria-hidden="true">
                {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
              </span>
            </Link>
          </header>

          <PortalPrimaryNav />

          <PortalBentoStage>
            <div className="portal-bento-grid">{tiles}</div>
          </PortalBentoStage>

          <div className="portal-bento-footer">
            {showAdminLink && (
              <Link to={adminLink} className="portal-bento-footer-link">
                <Shield size={15} strokeWidth={2} aria-hidden="true" />
                <span>{adminLinkLabel}</span>
              </Link>
            )}

            <button
              type="button"
              className="portal-bento-footer-link"
              onClick={handleSignOut}
            >
              <LogOut size={15} strokeWidth={2} aria-hidden="true" />
              Sign out
            </button>

            <div className="portal-bento-socials">
              {PORTAL_SOCIAL_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-bento-social"
                  aria-label={link.label}
                >
                  <span
                    style={{
                      WebkitMaskImage: `url(${link.iconSrc})`,
                      maskImage: `url(${link.iconSrc})`,
                    }}
                    aria-hidden="true"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>

        {resolvedTodos.length > 0 && (
          <>
            <aside className="portal-checklist-rail" aria-label="Onboarding checklist">
              <PortalOnboardingChecklist
                todos={resolvedTodos}
                agentEmail={agentEmail}
                completingTodoId={completingTodoId}
                onComplete={(id) => void handleCompleteTodo(id)}
                previewUnlocked={showAdminLink}
              />
            </aside>

            {checklistOpen && (
              <div
                className="portal-checklist-overlay"
                onClick={() => setChecklistOpen(false)}
                aria-hidden="true"
              />
            )}
            <div
              className={`portal-checklist-drawer${checklistOpen ? " open" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Onboarding checklist"
              aria-hidden={!checklistOpen}
            >
              <button
                type="button"
                className="portal-checklist-drawer-close"
                onClick={() => setChecklistOpen(false)}
                aria-label="Close checklist"
                tabIndex={checklistOpen ? 0 : -1}
              >
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
              <PortalOnboardingChecklist
                todos={resolvedTodos}
                agentEmail={agentEmail}
                completingTodoId={completingTodoId}
                onComplete={(id) => void handleCompleteTodo(id)}
                previewUnlocked={showAdminLink}
              />
            </div>

            {!checklistOpen && (
              <button
                type="button"
                className={`portal-checklist-fab${pendingTodos.length > 0 ? " has-pending" : ""}`}
                onClick={() => setChecklistOpen(true)}
              >
                <ClipboardList size={18} strokeWidth={2.25} aria-hidden="true" />
                Checklist
                <span className="portal-checklist-fab-count">
                  {completedTodoCount}/{resolvedTodos.length}
                </span>
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
