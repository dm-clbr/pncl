import type { PortalIncentive } from "@/lib/portal-incentives";

export default function PortalIncentivePoster({ item }: { item: PortalIncentive }) {
  const media =
    item.type === "video" ? (
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={item.poster}
        aria-label={item.title}
      >
        <source src={item.src} type="video/mp4" />
      </video>
    ) : (
      <img src={item.src} alt={item.title} loading="lazy" />
    );

  const poster = (
    <figure className="portal-incentive-poster">
      {media}
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
