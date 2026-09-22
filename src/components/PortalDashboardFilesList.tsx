import ListRow from "@/components/portal/ListRow";
import { assetTypeLabel } from "@/lib/portal-brand-assets";
import type { PortalDashboardFile } from "@/lib/portal-dashboard-tabs";

/** Download rows in a card menu: the title, then a small file type chip. */
export default function PortalDashboardFilesList({ items }: { items: PortalDashboardFile[] }) {
  return (
    <ul className="ptile-reveal-list">
      {items.map((item) => (
        <li key={item.id}>
          <ListRow
            label={item.title}
            href={item.url}
            download={item.fileName}
            trailing={<span className="ptile-chip">{assetTypeLabel(item.contentType)}</span>}
          />
        </li>
      ))}
    </ul>
  );
}
