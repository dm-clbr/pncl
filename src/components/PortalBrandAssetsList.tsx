import { ArrowDownToLine, Copy, FileText } from "lucide-react";
import {
  assetTypeLabel,
  copyHexColor,
  isColorAsset,
  isImageAsset,
  type PortalBrandAsset,
} from "@/lib/portal-brand-assets";
import { toast } from "sonner";

function ColorAssetRow({ item }: { item: PortalBrandAsset }) {
  const hex = item.hexColor ?? "";

  const handleCopy = async () => {
    if (!hex) return;
    try {
      await copyHexColor(hex);
      toast.success(`Copied ${hex}`);
    } catch {
      toast.error("Unable to copy color");
    }
  };

  return (
    <button
      type="button"
      className="portal-incentive-row portal-brand-asset-row portal-brand-asset-row-color"
      onClick={() => void handleCopy()}
    >
      <span className="portal-incentive-row-thumb">
        <span
          className="portal-brand-asset-color-swatch"
          style={{ backgroundColor: hex }}
          aria-hidden="true"
        />
      </span>
      <span className="portal-incentive-row-copy">
        <strong>{item.title}</strong>
        <span>{hex}</span>
      </span>
      <Copy size={18} className="portal-incentive-row-icon" aria-hidden="true" />
    </button>
  );
}

export default function PortalBrandAssetsList({ items }: { items: PortalBrandAsset[] }) {
  return (
    <div className="portal-brand-assets-list">
      {items.map((item) =>
        isColorAsset(item) ? (
          <ColorAssetRow key={item.id} item={item} />
        ) : (
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
              <span>{assetTypeLabel(item.contentType, item.assetType)}</span>
            </span>
            <ArrowDownToLine size={18} className="portal-incentive-row-icon" aria-hidden="true" />
          </a>
        ),
      )}
    </div>
  );
}
