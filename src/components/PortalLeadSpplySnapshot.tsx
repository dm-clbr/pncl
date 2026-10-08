import { ExternalLink, RefreshCw } from "lucide-react";
import { usePortalLeadSpplySnapshot } from "@/hooks/usePortalLeadSpplySnapshot";
import type { LeadSpplySnapshot } from "@/lib/portal-leadspply-snapshot";

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

function ConnectedSnapshot({ snapshot }: { snapshot: LeadSpplySnapshot }) {
  const { account, period, leads, appointments, production, activity, contact } = snapshot;
  if (!account || !period || !leads || !appointments || !production || !activity || !contact) return null;
  return (
    <>
      <div className="portal-leadspply-account">
        <div><span className="portal-leadspply-eyebrow">Connected account</span><strong>{account.name}</strong></div>
        <span className="portal-leadspply-status">{formatLeadSpplySyncStatus(account.syncStatus)}</span>
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
  const { snapshot, loading, error, reload } = usePortalLeadSpplySnapshot(userId);
  const disconnected = snapshot?.state === "not_linked" || snapshot?.state === "account_unavailable";
  const unavailableMessage = snapshot?.state === "account_unavailable"
    ? "Your LeadSpply account is unavailable. Contact PNCL support to review the connection."
    : "Your PNCL profile is not linked to a LeadSpply account yet. Contact PNCL support if this looks wrong.";

  return (
    <section className="portal-leadspply-card" aria-labelledby="leadspply-snapshot-title">
      <header className="portal-leadspply-head">
        <div><span className="portal-leadspply-eyebrow">LeadSpply · Read-only</span><h2 id="leadspply-snapshot-title">Your sales snapshot</h2></div>
        <div className="portal-leadspply-actions">
          <button type="button" className="portal-leadspply-refresh" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "portal-leadspply-spin" : ""} aria-hidden="true" />
            Refresh data
          </button>
          <a href={LEADSPPLY_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="portal-leadspply-open">
            Open LeadSpply <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </header>
      {loading && !snapshot ? <p className="portal-leadspply-state" role="status">Loading your LeadSpply snapshot…</p> : null}
      {error ? <div className="portal-leadspply-state portal-leadspply-error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div> : null}
      {!loading && !error && disconnected ? <p className="portal-leadspply-state">{unavailableMessage}</p> : null}
      {!error && snapshot?.state === "connected" ? <ConnectedSnapshot snapshot={snapshot} /> : null}
    </section>
  );
}
