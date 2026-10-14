import { useEffect, useState } from "react";
import { LayoutDashboard, ListChecks, Smartphone } from "lucide-react";
import Sheet from "@/components/portal/Sheet";
import "@/styles/portal-announcement.css";

const RELEASE = "new-look-2026-10";

function hasSeen(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** One announcement per account and release in this browser, after dismissal. */
export default function PortalNewLookAnnouncement({ userId, preview = false }: { userId?: string; preview?: boolean }) {
  const key = userId ? `pncl.portal-announcement.${RELEASE}.${userId}` : null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const dismissed = !key || dismissedKey === key || (!preview && hasSeen(key));

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!preview && key && event.key === key && event.newValue === "1") setDismissedKey(key);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, preview]);

  const dismiss = () => {
    if (!key || dismissedKey === key) return;
    try {
      if (!preview) window.localStorage.setItem(key, "1");
    } catch {
      // If storage is blocked, dismissal still lasts through tab navigation.
    }
    setDismissedKey(key);
  };

  return (
    <div className="portal-new-look">
      <Sheet open={!dismissed} onClose={dismiss} title="Meet your refreshed portal">
        <div className="portal-new-look-intro">
          <p className="portal-new-look-eyebrow">Portal update</p>
          <p>A cleaner layout, familiar tools, and your next step always within reach.</p>
        </div>
        <ul className="portal-new-look-features">
          <li>
            <LayoutDashboard size={22} aria-hidden="true" />
            <div><strong>A clearer dashboard</strong><p>Quick access to your everyday tools.</p></div>
          </li>
          <li>
            <ListChecks size={22} aria-hidden="true" />
            <div><strong>Your next step, up front</strong><p>Onboarding progress stays beside your profile across tabs.</p></div>
          </li>
          <li>
            <Smartphone size={22} aria-hidden="true" />
            <div><strong>Ready for every screen</strong><p>A consistent experience on desktop and mobile.</p></div>
          </li>
        </ul>
        <button className="portal-new-look-continue" type="button" onClick={dismiss}>Explore the portal</button>
      </Sheet>
    </div>
  );
}
