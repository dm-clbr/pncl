import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider";
import PortalNewLookAnnouncement from "@/components/portal/PortalNewLookAnnouncement";

export default function PortalTabLayout() {
  const { user } = useAuth();
  const { search } = useLocation();
  const preview = import.meta.env.DEV && new URLSearchParams(search).get("announcement") === "new-look";
  return (
    <PortalOnboardingProvider>
      <Outlet />
      <PortalNewLookAnnouncement userId={user?.id} preview={preview} />
    </PortalOnboardingProvider>
  );
}
