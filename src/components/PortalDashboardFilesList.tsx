import { assetTypeLabel } from "@/lib/portal-brand-assets";
import type { PortalDashboardFile } from "@/lib/portal-dashboard-tabs";

/** Download rows in a card menu: the title, then a small file type chip. */
export default function PortalDashboardFilesList({ items }: { items: PortalDashboardFile[] }) {
  return (
    <ul className="ptile-reveal-list">
      {items.map((item) => (
        <li key={item.id}>
          <a className="ptile-link" href={item.url} download={item.fileName}>
            {item.title}
            <span className="ptile-chip">{assetTypeLabel(item.contentType)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
