import { useEffect } from "react";
import { Building2 } from "lucide-react";
import BottomNav from "@/components/portal/BottomNav";
import EmptyState from "@/components/portal/EmptyState";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalCarriers } from "@/hooks/usePortalCarriers";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";
import "@/styles/portal-tools.css";

interface CarrierSection {
  title: string;
  carriers: ReturnType<typeof usePortalCarriers>["carriers"];
}

function groupCarriersBySection(
  carriers: ReturnType<typeof usePortalCarriers>["carriers"],
): CarrierSection[] {
  const sections: CarrierSection[] = [];
  for (const carrier of carriers) {
    const title = carrier.section || "Other";
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.carriers.push(carrier);
    } else {
      sections.push({ title, carriers: [carrier] });
    }
  }
  return sections;
}

/** Company number and e-app label on one quiet line under the carrier name. */
function secondaryLine(companyNumber: string, eAppLabel: string): string | undefined {
  const parts = [companyNumber && `Company ${companyNumber}`, eAppLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export default function PortalCarrierSheet() {
  const { user } = useAuth();
  const { photoUrl, initials, displayName } = usePortalProfile(user);
  const { carriers, loading, error } = usePortalCarriers();

  useEffect(() => {
    document.title = "Carrier Sheet — PNCL Portal";
    trackPageView("portal_carrier_sheet");
    window.scrollTo(0, 0);
  }, []);

  // ponytail: the sheet carries blank spacer rows; a table filled them with a
  // non-breaking space, a 44px row would just read as broken. Drop them.
  const sections = groupCarriersBySection(
    carriers.filter((row) => row.carrier || row.companyNumber || row.eAppLabel || row.eAppUrl),
  );

  return (
    <div className="home2-page ptools-page">
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader
            name={displayName}
            email={user?.email}
            initials={initials}
            photoUrl={photoUrl}
          />

          <PortalSubpageHeader title="Carriers" />

          <p className="portal-panel-note">
            Read-only reference for PNCL carrier contacts and e-app links.
          </p>

          <div className="ptools-stack">
            {loading && (
              <Pane title="Carriers">
                <div className="ptools-rows" aria-busy="true" aria-label="Loading carriers">
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                </div>
              </Pane>
            )}

            {!loading && error && (
              <Pane>
                <p className="ptools-error">{error}</p>
              </Pane>
            )}

            {!loading && !error && sections.length === 0 && (
              <Pane>
                <EmptyState
                  icon={<Building2 aria-hidden="true" />}
                  title="No carriers yet"
                  body="Your carrier sheet appears here once PNCL publishes it."
                />
              </Pane>
            )}

            {!loading
              && !error
              && sections.map((section, index) => (
                <Pane
                  key={`${section.title}-${index}`}
                  title={section.title}
                  aside={`${section.carriers.length}`}
                >
                  <ul className="ptools-rows">
                    {section.carriers.map((row) => {
                      const label = row.carrier || row.eAppLabel || row.companyNumber || row.eAppUrl;
                      return (
                        <li key={row.id}>
                          <ListRow
                            label={label}
                            secondary={secondaryLine(
                              row.companyNumber,
                              row.eAppLabel === label ? "" : row.eAppLabel,
                            )}
                            href={row.eAppUrl ?? undefined}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </Pane>
              ))}
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
