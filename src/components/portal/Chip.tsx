import type { ReactNode } from "react";

export type ChipVariant = "active" | "pending" | "inactive" | "licensed" | "pdf" | "neutral";

type ChipProps = {
  children: ReactNode;
  variant?: ChipVariant;
};

/** Status tag. Styles under .portal-chip in src/styles/portal-primitives.css.
    One near-black fill for every variant (3.06:1 against the pane), so the
    border, the text colour and a leading glyph carry the difference and colour
    never carries the meaning on its own: active a filled dot, pending a dotted
    left edge, licensed a ring, inactive a dash. */
export default function Chip({ children, variant = "neutral" }: ChipProps) {
  return <span className={`portal-chip is-${variant}`}>{children}</span>;
}
