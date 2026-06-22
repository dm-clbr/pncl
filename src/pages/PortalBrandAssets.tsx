import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowLeft, Copy, FileText } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalBrandAssets } from "@/hooks/usePortalBrandAssets";
import {
  assetTypeLabel,
  copyHexColor,
  isColorAsset,
  isImageAsset,
} from "@/lib/portal-brand-assets";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

export default function PortalBrandAssets() {
  const { user } = useAuth();
  const { assets, loading, error } = usePortalBrandAssets();

  useEffect(() => {
    document.title = "Brand Assets — PNCL Portal";
    trackPageView("portal_brand_assets");
    window.scrollTo(0, 0);
  }, []);

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark brand-assets-dash">
        <div className="wrap brand-assets-wrap">
          <header className="brand-assets-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="brand-assets-header-copy">
              <p className="portal-welcome">Brand assets</p>
              <p className="portal-meta">{displayName}</p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          <div className="brand-assets-panel">
            <div className="brand-assets-panel-head">
              <div>
                <h1>PNCL brand kit</h1>
                <p>Logos, templates, brand colors, and other official assets for agent use.</p>
              </div>
            </div>

            {loading && (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading brand assets...</span>
              </div>
            )}

            {!loading && error && <p className="admin-error">{error}</p>}

            {!loading && !error && assets.length === 0 && (
              <p className="portal-panel-note">No brand assets published yet.</p>
            )}

            {!loading && !error && assets.length > 0 && (
              <div className="brand-assets-grid">
                {assets.map((asset) => (
                  <article key={asset.id} className="brand-asset-card">
                    <div className="brand-asset-preview">
                      {isColorAsset(asset) ? (
                        <span
                          className="brand-asset-color-swatch"
                          style={{ backgroundColor: asset.hexColor ?? "#000000" }}
                          aria-hidden="true"
                        />
                      ) : isImageAsset(asset.contentType) ? (
                        <img src={asset.url} alt="" className="brand-asset-image" />
                      ) : (
                        <span className="brand-asset-file-icon" aria-hidden="true">
                          <FileText size={32} strokeWidth={1.75} />
                        </span>
                      )}
                      <span className="brand-asset-type">
                        {assetTypeLabel(asset.contentType, asset.assetType)}
                      </span>
                    </div>
                    <div className="brand-asset-copy">
                      <h2>{asset.title}</h2>
                      {asset.description && <p>{asset.description}</p>}
                      {isColorAsset(asset) && asset.hexColor ? (
                        <button
                          type="button"
                          className="brand-asset-copy-hex"
                          onClick={() => {
                            void copyHexColor(asset.hexColor!)
                              .then(() => toast.success(`Copied ${asset.hexColor}`))
                              .catch(() => toast.error("Unable to copy color"));
                          }}
                        >
                          <Copy size={16} aria-hidden="true" />
                          {asset.hexColor}
                        </button>
                      ) : (
                        <a
                          href={asset.url}
                          download={asset.fileName}
                          className="brand-asset-download"
                        >
                          <ArrowDownToLine size={16} aria-hidden="true" />
                          Download
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
