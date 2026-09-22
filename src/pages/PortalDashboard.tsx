import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Award,
  ClipboardList,
  FileSignature,
  GraduationCap,
  Link2,
  LogOut,
  Palette,
  Shield,
  TrendingUp,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

/** 14px outline marks, one per tile, so a tile is identifiable at a glance. */
const ICON = { size: 18, strokeWidth: 1.75 } as const;

/** Picks a mark for a server-driven section by its id or title. */
function sectionIcon(id: string, title: string) {
  const key = `${id} ${title}`.toLowerCase();
  if (key.includes("script")) return <ClipboardList {...ICON} />;
  if (key.includes("track") || key.includes("sheet")) return <TrendingUp {...ICON} />;
  if (key.includes("brand")) return <Palette {...ICON} />;
  if (key.includes("incentive")) return <Award {...ICON} />;
  if (key.includes("train") || key.includes("resource")) return <GraduationCap {...ICON} />;
  if (key.includes("account")) return <UserRound {...ICON} />;
  if (key.includes("tool") || key.includes("sales")) return <Wrench {...ICON} />;
  return <Link2 {...ICON} />;
}
import PNCLLogo from "@/components/PNCLLogo";
import PortalOnboardingChecklist from "@/components/PortalOnboardingChecklist";
import { useAuth } from "@/contexts/AuthContext";
import { PORTAL_SECTIONS } from "@/lib/portal-links";
import { usePortalDashboardTabs } from "@/hooks/usePortalDashboardTabs";
import {
  isLinksDashboardSection,
  isDownloadsDashboardSection,
} from "@/lib/portal-dashboard-section-types";
import type { PortalDashboardSection } from "@/lib/portal-dashboard-tabs";
import PortalReferralPanel from "@/components/PortalReferralPanel";
import { isOutbound, useSlowLoading } from "@/components/portal-tile-helpers";
import { hasAdminConsoleAccess, isAdminAssist, isGenesisAdmin } from "@/lib/roles";
import {
  completePortalTodo,
  derivePortalPhase,
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
import PortalNoticeBanner from "@/components/PortalNoticeBanner";
import LiquidGradientCanvas from "@/components/ui/liquid-gradient";
import { usePortalGradientTuner } from "@/components/PortalGradientTuner";
import PortalTile from "@/components/PortalBentoTile";
import { usePortalIncentives } from "@/hooks/usePortalIncentives";
import { usePortalBrandAssets } from "@/hooks/usePortalBrandAssets";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { getRecoveryEmailDashboardNotice } from "@/lib/portal-profile";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/portal-bento.css";
import "@/styles/portal-tile.css";

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

const GRID_COLUMNS = 3;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "1 item", "7 items". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Tier 3 list for a section, with its existing empty and loading copy kept. */
function SectionReveal({
  section,
  incentives,
  incentivesLoading,
  brandAssets,
  brandAssetsLoading,
  brandAssetsSlow,
}: {
  section: PortalDashboardSection;
  incentives: ReturnType<typeof usePortalIncentives>["incentives"];
  incentivesLoading: boolean;
  brandAssets: ReturnType<typeof usePortalBrandAssets>["assets"];
  brandAssetsLoading: boolean;
  brandAssetsSlow: boolean;
}) {
  if (isLinksDashboardSection(section)) {
    if (section.links.length === 0) {
      return <p className="ptile-micro">No links published yet.</p>;
    }
    return (
      <ul className="ptile-reveal-list">
        {section.links.map((link) => {
          const outbound = isOutbound(link.href);
          return (
            <li key={link.id}>
              {link.external ? (
                <a
                  className={`ptile-link${outbound ? " is-external" : ""}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.title}
                  {outbound && <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />}
                  <span className="ptile-sr">opens in a new tab</span>
                </a>
              ) : (
                <Link className="ptile-link" to={link.href}>
                  {link.title}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  if (isDownloadsDashboardSection(section)) {
    return section.files.length > 0 ? (
      <PortalDashboardFilesList items={section.files} />
    ) : (
      <p className="ptile-micro">No files published yet.</p>
    );
  }

  if (section.sectionType === "incentives") {
    if (incentivesLoading) return <p className="ptile-micro">Loading incentives...</p>;
    return incentives.length > 0 ? (
      <PortalIncentivesList items={incentives} />
    ) : (
      <p className="ptile-micro">No incentives published yet.</p>
    );
  }

  if (brandAssetsLoading) {
    return (
      <p className="ptile-micro">
        {brandAssetsSlow
          ? "Brand assets are taking longer than usual to load. Refresh the page if this continues."
          : "Loading brand assets..."}
      </p>
    );
  }

  return brandAssets.length > 0 ? (
    <>
      <PortalBrandAssetsList items={brandAssets} />
      <Link className="ptile-link" to="/portal/brand-assets">
        View all brand assets
      </Link>
    </>
  ) : (
    <p className="ptile-micro">No brand assets published yet.</p>
  );
}

export default function PortalDashboard() {
  const { user: authUser, signOut } = useAuth();
  const [portalUser, setPortalUser] = useState(authUser);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  /** Only one card's menu is open at a time. */
  const [openTile, setOpenTile] = useState<string | null>(null);
  // Read once: the pointer type does not change while the page is open. Coarse
  // pointers get the backdrop canvas at 20fps and half resolution; the CSS blur
  // on .portal-bento-canvas hides the upscale, so it reads the same for a
  // quarter of the pixels.
  const [coarsePointer] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  );

  const { incentives, loading: incentivesLoading } = usePortalIncentives();
  const { assets: brandAssets, loading: brandAssetsLoading } = usePortalBrandAssets();
  const { sections: dashboardSections } = usePortalDashboardTabs();
  const { todos: portalTodos } = usePortalTodos();
  const { carriers: portalCarriers } = usePortalCarriers();
  const { submitted: icaSubmitted } = usePortalIca();
  const { submitted: w9Submitted } = usePortalW9();
  const { submitted: directDepositSubmitted } = usePortalDirectDeposit();
  const {
    profile,
    photoUrl,
    initials,
    displayName,
    loading: profileLoading,
  } = usePortalProfile(portalUser);
  // UI only: after 10 s of loading, the Brand assets reveal says so instead of
  // showing "Loading" forever. The hook is untouched; nothing falls back silently.
  const brandAssetsSlow = useSlowLoading(brandAssetsLoading);

  const resolvedTodos = useMemo(() => {
    const carrierApplicationsDescription =
      buildCarrierApplicationsDescription(portalCarriers);

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
  const showIcaResignNotice = shouldShowIcaResignNotice(portalUser) && !icaSubmitted;
  const showW9ResignNotice = shouldShowW9ResignNotice(portalUser) && !w9Submitted;
  const showDirectDepositResignNotice =
    shouldShowDirectDepositResignNotice(portalUser) && !directDepositSubmitted;
  const recoveryEmailNotice = getRecoveryEmailDashboardNotice(profile, profileLoading);
  const recoveryEmailNoticeContent = recoveryEmailNotice === "missing"
    ? {
        title: "Add your personal recovery email",
        description:
          "Add a personal email so you can recover your PNCL Google account and receive your electronic 1099.",
        action: "Add recovery email",
      }
    : recoveryEmailNotice === "error"
      ? {
          title: "Recovery email needs attention",
          description:
            "Your personal recovery email is saved, but Google Workspace could not be updated. Open your profile to retry the sync.",
          action: "Retry in profile",
        }
      : recoveryEmailNotice === "pending"
        ? {
          title: "Finish syncing your recovery email",
          description:
              "Your personal recovery email is saved, but Google Workspace has not confirmed it yet. Open your profile and save your information to finish the sync.",
            action: "Review and sync",
          }
        : null;

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

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  /** Opening one card's menu closes whichever was open. */
  const handleOpen = useCallback(
    (id: string) => (next: boolean) => {
      setOpenTile(next ? id : null);
      toggleSection(id);
    },
    [toggleSection],
  );

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

  const resignNotices = [
    showIcaResignNotice && {
      title: "Re-sign your Independent Contractor Agreement",
      body: "The ICA was updated, so your previous signature is no longer on file.",
      href: "/portal/ica",
      cta: "Re-sign agreement",
    },
    showW9ResignNotice && {
      title: "Fill out a new W-9",
      body: "Your previous W-9 was removed and needs to be completed again.",
      href: "/portal/w9",
      cta: "Complete W-9",
    },
    showDirectDepositResignNotice && {
      title: "Fill out a new direct deposit form",
      body: "Your previous direct deposit form was removed and needs completing again.",
      href: "/portal/direct-deposit",
      cta: "Complete direct deposit form",
    },
  ].filter(Boolean) as Array<{ title: string; body: string; href: string; cta: string }>;

  const tiles: ReactNode[] = [];
  const slot = () => {
    const position = tiles.length;
    return {
      index: position + 1,
      row: Math.floor(position / GRID_COLUMNS),
      order: position,
    };
  };
  const menuProps = (id: string) => ({
    open: openTile === id,
    onOpenChange: handleOpen(id),
  });

  const indexTile = (id: string, title: string, itemCount: number, reveal: ReactNode) => {
    const spot = slot();
    return (
      <PortalTile
        key={id}
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title={title}
        icon={sectionIcon(id, title)}
        headerCount={pad(itemCount)}
        ariaLabel={`${title}, ${count(itemCount, "item")}`}
        {...menuProps(id)}
        meta={count(itemCount, "item")}
        reveal={<div className="ptile-reveal-body">{reveal}</div>}
      />
    );
  };

  // 01 Referral links. No count; the panel owns the copy and the team dashboard link.
  {
    const spot = slot();
    tiles.push(
      <PortalTile
        key="referrals"
        index={spot.index}
        row={spot.row}
        order={spot.order}
        title="Referral links"
        icon={<Link2 {...ICON} />}
        {...menuProps("referrals")}
        reveal={
          <div className="ptile-reveal-body">
            <PortalReferralPanel embedded />
            <Link className="ptile-link" to="/portal/profile?tab=team">
              Open team dashboard
            </Link>
          </div>
        }
      />,
    );
  }

  // 02 onward: one card per dashboard section, in the order the server sends them.
  displaySections.forEach((section) => {
    const itemCount = isLinksDashboardSection(section)
      ? section.links.length
      : isDownloadsDashboardSection(section)
        ? section.files.length
        : section.sectionType === "incentives"
          ? incentives.length
          : brandAssets.length;
    tiles.push(
      indexTile(
        section.id,
        section.title,
        itemCount,
        <SectionReveal
          section={section}
          incentives={incentives}
          incentivesLoading={incentivesLoading}
          brandAssets={brandAssets}
          brandAssetsLoading={brandAssetsLoading}
          brandAssetsSlow={brandAssetsSlow}
        />,
      ),
    );
  });

  // Hidden backdrop tuner. Cmd/Ctrl + Shift + G in dev.
  const {
    gradient,
    layerOpacity,
    blendMode,
    vignette,
    staticBase,
    panel: tunerPanel,
  } = usePortalGradientTuner();

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main
        className={`portal-bento portal-dash portal-home-dash${staticBase ? " has-static-base" : ""}`}
        style={{ "--vignette": vignette } as CSSProperties}
      >
        {/* Living backdrop. Pauses itself offscreen, on a hidden tab, and under
            prefers-reduced-motion; the CSS gradient underneath is the fallback
            if WebGL2 is unavailable. */}
        <div
          className="portal-bento-canvas"
          style={{ opacity: layerOpacity, mixBlendMode: blendMode as never }}
          aria-hidden="true"
        >
          <LiquidGradientCanvas
            {...gradient}
            fps={coarsePointer ? 20 : 30}
            maxDpr={coarsePointer ? 0.5 : 1}
            fallbackColor="transparent"
          />
        </div>

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

          {resignNotices.map((notice) => (
            <PortalNoticeBanner
              key={notice.href}
              role="alert"
              icon={<FileSignature size={20} strokeWidth={2.25} />}
              title={notice.title}
              body={notice.body}
              href={notice.href}
              cta={notice.cta}
            />
          ))}

          {recoveryEmailNoticeContent && (
            <PortalNoticeBanner
              role={recoveryEmailNotice === "error" ? "alert" : "status"}
              icon={<Shield size={20} strokeWidth={2.25} />}
              title={recoveryEmailNoticeContent.title}
              body={recoveryEmailNoticeContent.description}
              href="/portal/profile?tab=details"
              cta={recoveryEmailNoticeContent.action}
              dismissKey={`portal-notice-dismissed:recovery-${recoveryEmailNotice}`}
            />
          )}

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

      {tunerPanel}
    </div>
  );
}
