import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import PNCLLogo from "@/components/PNCLLogo";
import PortalCalendarPreview from "@/components/PortalCalendarPreview";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalGoogleCalendar } from "@/hooks/usePortalGoogleCalendar";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "The connection request was invalid or already used. Please try again.",
  expired_state: "The connection request expired. Please try again.",
  missing_code: "Google did not return an authorization code.",
  permission_missing: "Read-only Calendar permission is required to show the preview.",
  token_exchange_failed: "Google could not finish the connection. Please try again.",
  sync_failed: "Calendar connected, but the first refresh did not finish. Try Refresh.",
};

export default function PortalCalendar() {
  const { user } = useAuth();
  const { photoUrl, initials, displayName } = usePortalProfile(user);
  const calendar = usePortalGoogleCalendar();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    document.title = "Calendar — PNCL Portal";
    trackPageView("portal_calendar");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const result = searchParams.get("calendar");
    if (!result) return;
    const reason = searchParams.get("reason") ?? "";
    if (result === "connected") {
      if (reason === "sync_failed") toast.warning(CALLBACK_ERROR_MESSAGES.sync_failed);
      else toast.success("Google Calendar connected.");
      void calendar.reload();
    } else if (result === "canceled") {
      toast.info("Google Calendar connection canceled.");
    } else {
      toast.error(CALLBACK_ERROR_MESSAGES[reason] ?? "Unable to connect Google Calendar.");
    }
    setSearchParams({}, { replace: true });
    // Callback query parameters should be handled once and then removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  const handleConnect = () => {
    void calendar.connect().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Unable to connect Google Calendar.");
    });
  };

  const handleSync = () => {
    void calendar.sync()
      .then(() => toast.success("Calendar refreshed."))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to refresh calendar.");
      });
  };

  const handleDisconnect = () => {
    void calendar.disconnect()
      .then((result) => {
        if (result.revoked) toast.success(result.message);
        else toast.warning(`${result.message} You can also remove access in your Google Account.`);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to disconnect calendar.");
      });
  };

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />
      <main className="portal-dash dark portal-calendar-page">
        <div className="wrap portal-calendar-wrap">
          <header className="portal-hero portal-calendar-hero">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={44} />
            </Link>
            <Link to="/portal/profile" className="portal-hero-profile" aria-label="View profile">
              <span className="portal-hero-profile-avatar" aria-hidden="true">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="portal-hero-profile-photo" />
                ) : (
                  <span className="portal-hero-profile-initials">{initials}</span>
                )}
              </span>
              <span className="portal-hero-profile-copy">
                <span className="portal-welcome">Welcome, {displayName}</span>
                {user?.email && <span className="portal-meta">{user.email}</span>}
              </span>
            </Link>
          </header>

          <PortalPrimaryNav />

          <section className="portal-calendar-intro" aria-labelledby="portal-calendar-title">
            <span className="portal-calendar-intro-icon" aria-hidden="true">
              <CalendarDays size={25} />
            </span>
            <div>
              <p className="portal-calendar-eyebrow">Your schedule</p>
              <h1 id="portal-calendar-title">Google Calendar</h1>
              <p>A concise view of what is next, available only to your signed-in portal account.</p>
            </div>
          </section>

          <PortalCalendarPreview
            data={calendar.data}
            loading={calendar.loading}
            error={calendar.error}
            connecting={calendar.connecting}
            syncing={calendar.syncing}
            disconnecting={calendar.disconnecting}
            onConnect={handleConnect}
            onSync={handleSync}
            onDisconnect={handleDisconnect}
            onRetry={() => void calendar.reload()}
          />
        </div>
      </main>
    </div>
  );
}
