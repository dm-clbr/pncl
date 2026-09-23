import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  /** One line. If it needs two, the page is explaining too much here. */
  body?: string;
  /** Leading glyph above the title, rendered at 22px. */
  icon?: ReactNode;
  /** The way out: a link or a button, or a few of them when the state has
      more than one. They wrap centred under .portal-empty-action. */
  action?: ReactNode;
};

/** Nothing-to-show state. Styles under .portal-empty in
    src/styles/portal-primitives.css: centred, 36ch measure, one CTA. */
export default function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="portal-empty">
      {icon && (
        <span className="portal-empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="portal-empty-title">{title}</p>
      {body && <p className="portal-empty-body">{body}</p>}
      {action && <div className="portal-empty-action">{action}</div>}
    </div>
  );
}
