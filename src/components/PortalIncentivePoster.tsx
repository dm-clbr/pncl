import type { PortalIncentive } from "@/lib/portal-incentives";
import PortalIncentiveMedia from "@/components/PortalIncentiveMedia";

export default function PortalIncentivePoster({ item }: { item: PortalIncentive }) {
  const poster = (
    <figure className="portal-incentive-poster">
      <PortalIncentiveMedia item={item} autoplay={item.type === "video"} />
      <figcaption>{item.title}</figcaption>
    </figure>
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="portal-incentive-link"
      >
        {poster}
      </a>
    );
  }

  return poster;
}
