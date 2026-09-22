type SkeletonProps = {
  /** text: one line. row: a 44px ListRow placeholder. tile: a pane-sized block. */
  variant?: "text" | "row" | "tile";
  /** Any CSS length or percentage, so a group can mirror a ragged final layout. */
  width?: string;
};

/** Loading placeholder. Styles under .portal-skeleton in
    src/styles/portal-primitives.css: 1.2s opacity pulse, still under
    prefers-reduced-motion. Compose several into the shape of the real content
    and put aria-busy on the container; the blocks themselves are hidden from
    assistive tech. */
export default function Skeleton({ variant = "text", width }: SkeletonProps) {
  return <span className={`portal-skeleton is-${variant}`} style={{ width }} aria-hidden="true" />;
}
