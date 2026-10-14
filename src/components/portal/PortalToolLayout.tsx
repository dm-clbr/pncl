import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import BottomNav from "@/components/portal/BottomNav";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import "@/styles/home2.css";
import "@/styles/portal-tools.css";

/** Shared chrome for secondary agent tools, including the mobile return path. */
export default function PortalToolLayout({ title, backTo, backLabel, className = "", children }: {
  title: string;
  backTo?: string;
  backLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { displayName, initials, photoUrl } = usePortalProfile(user);
  return (
    <div className={`home2-page ptools-page ${className}`}>
      <PortalBackground />
      <div className="grain" aria-hidden="true" />
      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader subpage name={displayName} email={user?.email} initials={initials} photoUrl={photoUrl} />
          <PortalSubpageHeader title={title} backTo={backTo} backLabel={backLabel} />
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
