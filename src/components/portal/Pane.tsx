import { useId, type ReactNode } from "react";

type PaneProps = {
  children: ReactNode;
  /** Header title, 20/600. Without it and without `aside` no header renders. */
  title?: string;
  /** Right side of the header: a count, a Chip, a link. */
  aside?: ReactNode;
  /** section by default; aside for a rail, div when the pane carries no meaning. */
  as?: "section" | "aside" | "div";
  id?: string;
};

/** The glass card, non-interactive. Styles under .portal-pane in
    src/styles/portal-primitives.css: sheen over the dark fill, 1px border,
    inset bottom shadow, two tight outer shadows, radius 22 desktop / 16
    mobile. No backdrop-filter; the blur lives on the gradient source. Nested
    rounded children get --portal-radius-inner (outer minus padding). */
export default function Pane({ children, title, aside, as: Tag = "section", id }: PaneProps) {
  const titleId = useId();
  return (
    <Tag className="portal-pane" id={id} aria-labelledby={title ? titleId : undefined}>
      {(title || aside) && (
        <header className="portal-pane-head">
          {title && (
            <h2 id={titleId} className="portal-pane-title">
              {title}
            </h2>
          )}
          {aside && <div className="portal-pane-aside">{aside}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
