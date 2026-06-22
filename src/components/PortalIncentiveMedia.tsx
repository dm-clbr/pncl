import type { PortalIncentive } from "@/lib/portal-incentives";

export default function PortalIncentiveMedia({
  item,
  autoplay = false,
}: {
  item: PortalIncentive;
  autoplay?: boolean;
}) {
  if (item.type === "video") {
    return (
      <video
        autoPlay={autoplay}
        muted
        loop
        playsInline
        preload="metadata"
        poster={item.poster}
        aria-label={item.title}
      >
        <source src={item.src} type="video/mp4" />
      </video>
    );
  }

  return <img src={item.src} alt={item.title} loading="lazy" />;
}
