import { useCallback, useState } from "react";
import Chip from "@/components/portal/Chip";
import Pane from "@/components/portal/Pane";
import "@/styles/portal-integrations.css";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { usePortalLeadSpplySnapshot } from "@/hooks/usePortalLeadSpplySnapshot";
import type { LeadSpplySnapshot } from "@/lib/portal-leadspply-snapshot";
import { useAuth } from "@/contexts/AuthContext";
import HubAccountSetup from "@/components/leadspply/HubAccountSetup";
import type { SetupStatus } from "@/lib/hub-account-setup";

const LEADSPPLY_DASHBOARD_URL = "https://leadspply.com/dashboard";

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="portal-leadspply-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function ActivityRow({ label, values }: { label: string; values: NonNullable<LeadSpplySnapshot["activity"]>["today"] }) {
  return (
    <div className="portal-leadspply-activity-row">
      <span>{label}</span>
      <span>{values.calls} calls</span>
      <span>{values.appointments} appts</span>
      <span>{values.presentations} pres.</span>
      <span>{values.policies} policies</span>
      <span>{values.points} pts</span>
    </div>
  );
}

export function formatLeadSpplySyncStatus(value: string): string {
  if (value === "synced") return "Linked";
  if (value === "upline_unlinked") return "Linked · upline needs review";
  return "Account sync pending";
}

function ConnectedSnapshot({ snapshot, verified }: { snapshot: LeadSpplySnapshot; verified: boolean }) {
  const { account, period, leads, appointments, production, activity, contact } = snapshot;
  if (!account || !period || !leads || !appointments || !production || !activity || !contact) return null;
  return (
    <>
      <div className="portal-leadspply-account">
        <div><span className="portal-leadspply-eyebrow">Connected account</span><strong>{account.name}</strong></div>
        <div className="portal-leadspply-account-badges">
          <Chip variant={account.syncStatus === "synced" ? "active" : "pending"}>{formatLeadSpplySyncStatus(account.syncStatus)}</Chip>
          {verified && <Chip variant="active">Verified</Chip>}
        </div>
      </div>
      <div className="portal-leadspply-grid" aria-label="LeadSpply lead metrics">
        <Metric label="To work" value={leads.toWork} />
        <Metric label="New leads" value={leads.new} />
        <Metric label="In progress" value={leads.inProgress} />
        <Metric label="Callbacks today" value={leads.callbacksToday} />
      </div>
      <div className="portal-leadspply-summary-grid">
        <section><span className="portal-leadspply-eyebrow">Appointments</span><strong>{appointments.upcoming} upcoming</strong>{appointments.nextAt && <small>Next {formatDateTime(appointments.nextAt, period.timezone)}</small>}</section>
        <section><span className="portal-leadspply-eyebrow">Month to date</span><strong>{production.paidPoliciesMtd} paid policies</strong><small>{formatCurrency(production.annualPremiumCentsMtd)} annual premium</small></section>
        <section><span className="portal-leadspply-eyebrow">Contact</span><strong>{contact.ratePct === null ? "—" : `${contact.ratePct}%`} rate</strong><small>{contact.speedMinutes === null ? "—" : `${contact.speedMinutes} min`} speed</small></section>
      </div>
      <section className="portal-leadspply-activity" aria-label="Recorded activity">
        <span className="portal-leadspply-eyebrow">Recorded activity</span>
        <ActivityRow label="Today" values={activity.today} />
        <ActivityRow label="This week" values={activity.week} />
      </section>
      <div className="portal-leadspply-timestamps">
        <span>Data as of {formatDateTime(snapshot.asOf, period.timezone)} · {period.timezone}</span>
        {account.lastSyncedAt && <span>Account last manually synced {formatDateTime(account.lastSyncedAt, period.timezone)}</span>}
      </div>
    </>
  );
}

export default function PortalLeadSpplySnapshot({ userId }: { userId: string | undefined }) {
  const { user, session } = useAuth();
  const { snapshot, loading, error, reload } = usePortalLeadSpplySnapshot(userId);
  const email = user?.email?.trim().toLowerCase() ?? "";
  const [verification, setVerification] = useState<{
    userId: string | undefined;
    email: string;
    verified: boolean;
  } | null>(null);
  const handleStatusChange = useCallback((status: SetupStatus | null) => {
    setVerification({
      userId,
      email,
      verified: status?.state === "connected" && status.email === email &&
        status.ownershipVerified === true,
    });
  }, [userId, email]);
  const setupEnabled = import.meta.env.VITE_PNCL_HUB_SETUP_ENABLED === "true" &&
    Boolean(userId && user?.id === userId && session?.user.id === userId &&
      user.email_confirmed_at && /^[^\s@]+@thepncl\.com$/.test(email));
  const verified = setupEnabled && verification?.userId === userId &&
    verification?.email === email && verification.verified;
  const disconnected = snapshot?.state === "not_linked" || snapshot?.state === "account_unavailable";
  const unavailableMessage = snapshot?.state === "account_unavailable"
    ? "Your LeadSpply account is unavailable. Contact PNCL support to review the connection."
    : "Connect your LeadSpply account to view your sales data here.";

  return (
    <div className="portal-leadspply-card">
      <Pane title="Your sales snapshot" aside={
        <div className="portal-leadspply-actions">
          <button type="button" className="portal-leadspply-refresh" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "portal-leadspply-spin" : ""} aria-hidden="true" />
            Refresh data
          </button>
          <a href={LEADSPPLY_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="portal-leadspply-open">
            Open LeadSpply <ExternalLink size={15} aria-hidden="true" />
          </a>
          <Link to="/portal/leadspply" className="portal-leadspply-refresh">{setupEnabled ? "Account setup" : "Connect / manage"}</Link>
        </div>
      }>
      <p className="portal-leadspply-eyebrow">LeadSpply · Read-only</p>
      {setupEnabled && <HubAccountSetup key={userId + ":" + email} email={email}
        token={session!.access_token} compact onChanged={() => void reload()}
        onStatusChange={handleStatusChange} />}
      {loading && !snapshot ? <p className="portal-leadspply-state" role="status">Loading your LeadSpply snapshot…</p> : null}
      {error ? <div className="portal-leadspply-state portal-leadspply-error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div> : null}
      {!setupEnabled && !loading && !error && disconnected ? <p className="portal-leadspply-state">{unavailableMessage}</p> : null}
      {!error && snapshot?.state === "connected" ? <ConnectedSnapshot snapshot={snapshot} verified={verified} /> : null}
      </Pane>
    </div>
  );
}
