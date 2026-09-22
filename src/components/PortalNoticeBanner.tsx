import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, X } from "lucide-react";

/** Dismissals live in sessionStorage on purpose: a permanent dismiss would hide
    an account-recovery problem. Storage can be blocked, so both calls swallow
    the failure and the dismiss then lasts for this page only. */
function isNoticeDismissed(key: string) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function rememberNoticeDismissed(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked; component state still hides the banner until the next load.
  }
}

type PortalNoticeBannerProps = {
  title: string;
  body: string;
  href: string;
  cta: string;
  /** alert for a problem that blocks something, status for the rest. */
  role: "alert" | "status";
  icon: ReactNode;
  /** With a key the banner gets a Dismiss button and stays hidden for the
      browser session under that key. Without one it cannot be dismissed. */
  dismissKey?: string;
};

/** Inline notice between the portal nav and the bento grid.
    Styles live under .pbanner in src/styles/portal-bento.css. */
export default function PortalNoticeBanner({
  title,
  body,
  href,
  cta,
  role,
  icon,
  dismissKey,
}: PortalNoticeBannerProps) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // ponytail: reads sessionStorage during render. Only the dismiss button below
  // writes the flag, and its state update re-renders this component.
  const dismissed =
    dismissKey !== undefined &&
    (dismissedKey === dismissKey || isNoticeDismissed(dismissKey));
  if (dismissed) return null;

  const dismiss = () => {
    if (!dismissKey) return;
    rememberNoticeDismissed(dismissKey);
    setDismissedKey(dismissKey);
  };

  return (
    <div className="pbanner" role={role}>
      <span className="pbanner-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="pbanner-copy">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <div className="pbanner-actions">
        <Link to={href} className="pbanner-link">
          {cta}
          <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
        </Link>
        {dismissKey && (
          <button
            type="button"
            className="pbanner-dismiss"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
