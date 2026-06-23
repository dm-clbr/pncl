import { ArrowDownToLine, FileText } from "lucide-react";
import { assetTypeLabel } from "@/lib/portal-brand-assets";
import type { PortalDashboardFile } from "@/lib/portal-dashboard-tabs";

export default function PortalDashboardFilesList({ items }: { items: PortalDashboardFile[] }) {
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
            <span className="portal-brand-asset-row-file" aria-hidden="true">
              <FileText size={20} strokeWidth={1.75} />
            </span>
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
