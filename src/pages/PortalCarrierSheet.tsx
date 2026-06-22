import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalCarriers } from "@/hooks/usePortalCarriers";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";

const COLUMNS = [
  { key: "carrier", label: "Carrier" },
  { key: "companyNumber", label: "Company #" },
  { key: "eAppLabel", label: "E-App Link" },
] as const;

export default function PortalCarrierSheet() {
  const { user } = useAuth();
  const { carriers, loading, error } = usePortalCarriers();

  useEffect(() => {
    document.title = "Carrier Sheet — PNCL Portal";
    trackPageView("portal_carrier_sheet");
    window.scrollTo(0, 0);
  }, []);

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <header className="carrier-sheet-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="carrier-sheet-header-copy">
              <p className="portal-welcome">Agent carrier sheet</p>
              <p className="portal-meta">{displayName}</p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          <div className="carrier-sheet-panel">
            <div className="carrier-sheet-panel-head">
              <div>
                <h1>Carriers</h1>
                <p>Read-only reference for PNCL carrier contacts and e-app links.</p>
              </div>
            </div>

            {loading && (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading carriers...</span>
              </div>
            )}

            {!loading && error && <p className="admin-error">{error}</p>}

            {!loading && !error && (
              <div className="carrier-sheet-table-wrap">
                <table className="carrier-sheet-table">
                  <thead>
                    <tr>
                      {COLUMNS.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {carriers.map((row) => (
                      <tr key={row.id}>
                        <td>{row.carrier || "\u00a0"}</td>
                        <td>{row.companyNumber || "\u00a0"}</td>
                        <td>
                          {row.eAppUrl ? (
                            <a
                              href={row.eAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="carrier-sheet-link"
                            >
                              <span>{row.eAppLabel || row.eAppUrl}</span>
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </a>
                          ) : (
                            row.eAppLabel || "\u00a0"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
