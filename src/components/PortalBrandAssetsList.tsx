import { ArrowDownToLine, FileText } from "lucide-react";
import {
  assetTypeLabel,
  isImageAsset,
  type PortalBrandAsset,
} from "@/lib/portal-brand-assets";

export default function PortalBrandAssetsList({ items }: { items: PortalBrandAsset[] }) {
  return (
    <div className="portal-brand-assets-list">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          download={item.fileName}
          className="portal-incentive-row portal-brand-asset-row"
        >
          <span className="portal-incentive-row-thumb">
            {isImageAsset(item.contentType) ? (
              <img src={item.url} alt="" />
            ) : (
              <span className="portal-brand-asset-row-file" aria-hidden="true">
                <FileText size={20} strokeWidth={1.75} />
              </span>
            )}
          </span>
          <span className="portal-incentive-row-copy">
            <strong>{item.title}</strong>
            <span>{assetTypeLabel(item.contentType)}</span>
          </span>
          <ArrowDownToLine size={18} className="portal-incentive-row-icon" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
