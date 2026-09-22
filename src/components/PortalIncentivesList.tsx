import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, X } from "lucide-react";
import PortalIncentiveMedia from "@/components/PortalIncentiveMedia";
import { portalRoot } from "@/components/portal-tile-helpers";
import type { PortalIncentive } from "@/lib/portal-incentives";

export function PortalIncentiveLightbox({
  item,
  onClose,
}: {
  item: PortalIncentive;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Out of whatever opened it: inside the bento menu, the menu's backdrop-filter
  // would make it the containing block for this fixed dialog and clip it.
  return createPortal(
    <div className="portal-incentive-lightbox" role="dialog" aria-modal="true" aria-label={item.title}>
      <button
        type="button"
        className="portal-incentive-lightbox-backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="portal-incentive-lightbox-panel">
        <button type="button" className="portal-incentive-lightbox-close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
          Close
        </button>
        <figure className="portal-incentive-poster portal-incentive-poster-full">
          <PortalIncentiveMedia item={item} autoplay={item.type === "video"} />
          <figcaption>{item.title}</figcaption>
        </figure>
        {item.href && (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="portal-incentive-lightbox-link"
          >
            Open link
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>,
    portalRoot(),
  );
}

export default function PortalIncentivesList({ items }: { items: PortalIncentive[] }) {
  const [activeItem, setActiveItem] = useState<PortalIncentive | null>(null);

  return (
    <>
      <div className="portal-incentives-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="portal-incentive-row"
            onClick={() => setActiveItem(item)}
          >
            <span className="portal-incentive-row-thumb">
              <PortalIncentiveMedia item={item} />
            </span>
            <span className="portal-incentive-row-copy">
              <strong>{item.title}</strong>
              <span>{item.type === "video" ? "Video" : "Poster"}</span>
            </span>
            <ArrowUpRight size={18} className="portal-incentive-row-icon" aria-hidden="true" />
          </button>
        ))}
      </div>

      {activeItem && (
        <PortalIncentiveLightbox item={activeItem} onClose={() => setActiveItem(null)} />
      )}
    </>
  );
}
