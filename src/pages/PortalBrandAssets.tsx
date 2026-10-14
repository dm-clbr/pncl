import { useEffect } from "react";
import { ArrowDownToLine, Copy, FileText } from "lucide-react";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import Pane from "@/components/portal/Pane";
import EmptyState from "@/components/portal/EmptyState";
import Skeleton from "@/components/portal/Skeleton";
import { usePortalBrandAssets } from "@/hooks/usePortalBrandAssets";
import {
  assetTypeLabel,
  copyHexColor,
  isColorAsset,
  isImageAsset,
} from "@/lib/portal-brand-assets";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/portal-assets.css";

export default function PortalBrandAssets() {
  const { assets, loading, error } = usePortalBrandAssets();

  useEffect(() => {
    document.title = "Brand Assets — PNCL Portal";
    trackPageView("portal_brand_assets");
    window.scrollTo(0, 0);
  }, []);

  return (
    <PortalToolLayout title="Brand assets" className="passets-page">
      <p className="portal-panel-note">Logos, templates, brand colors, and other official assets for agent use.</p>
      <Pane title="PNCL brand kit">
        {loading && (
          <div className="ptools-rows" role="status" aria-busy="true" aria-label="Loading brand assets">
            <Skeleton variant="row" />
            <Skeleton variant="row" />
          </div>
        )}
        {!loading && error && <p className="ptools-error" role="alert">{error}</p>}
        {!loading && !error && assets.length === 0 && (
          <EmptyState title="No brand assets published yet" body="Official logos, colors, and templates will appear here when PNCL publishes them." />
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
                      className="brand-asset-copy-hex ptools-cta"
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
                      className="brand-asset-download ptools-cta"
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
      </Pane>
    </PortalToolLayout>
  );
}
