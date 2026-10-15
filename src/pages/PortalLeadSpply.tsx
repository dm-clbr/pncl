import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnLeadSpplyIntegration } from "@/hooks/useOwnLeadSpplyIntegration";
import { integrationStatusLabel, manageLeadSpplyIntegration, type OwnIntegrationStatus } from "@/lib/portal-leadspply-integration";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import "@/styles/portal-integrations.css";
import PortalToolLayout from "@/components/portal/PortalToolLayout";

const VERIFY_URL = "https://leadspply.com/pncl/connect";
export default function PortalLeadSpply() {
  const { session, user } = useAuth(); const { status, loading, error, reload } = useOwnLeadSpplyIntegration();
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [submitError, setSubmitError] = useState<string | null>(null);
  const ownerRef = useRef<string | undefined>(user?.id); const requestRef = useRef(0);
  const formOwnerRef = useRef(user?.id);
  const formVisible = formOwnerRef.current === user?.id;
  ownerRef.current = user?.id;
  useEffect(() => { formOwnerRef.current = user?.id; requestRef.current += 1; setCode(""); setMessage(null); setSubmitError(null); setBusy(false); }, [user?.id]);
  useEffect(() => () => { ownerRef.current = undefined; requestRef.current += 1; }, []);
  const account = status?.account;
  const redeem = async (event: React.FormEvent) => { event.preventDefault(); const token = session?.access_token; const owner = user?.id; const nonce = ++requestRef.current; if (!token || !owner || owner !== session?.user?.id || !formVisible || !code.trim()) return; setBusy(true); setSubmitError(null); setMessage(null); try { await manageLeadSpplyIntegration<OwnIntegrationStatus & { pending?: boolean }>(token, { action: "redeem", code: code.trim() }); if (ownerRef.current !== owner || requestRef.current !== nonce) return; setCode(""); setMessage("Account connected. Your hierarchy and pay tier will be applied during the next manual admin sync."); await reload(); } catch (err) { if (ownerRef.current === owner && requestRef.current === nonce) setSubmitError(err instanceof Error ? err.message : "Unable to submit the connection code."); } finally { if (ownerRef.current === owner && requestRef.current === nonce) setBusy(false); } };
  const connected = status?.state === "connected";
  return (
    <PortalToolLayout title="Connect your account">
      <p className="portal-panel-note">PNCL automatically checks email, NPN, or exact full name every 15 minutes. Duplicate, conflicting, or unavailable accounts need admin review. A connection code remains available as a fallback; PNCL applies hierarchy and pay tiers during manual sync.</p>
      <div className="portal-leadspply-page">
        <div className="portal-leadspply-page-actions">
          <a className="ptools-cta" href={VERIFY_URL} target="_blank" rel="noopener noreferrer">
            Open LeadSpply verification <ExternalLink size={16} aria-hidden="true" />
          </a>
          <button type="button" className="ptools-cta" onClick={() => void reload()} disabled={loading || busy}>
            <RefreshCw size={16} aria-hidden="true" /> Refresh status
          </button>
        </div>
        {loading && <Pane><p role="status">Loading your connection status…</p></Pane>}
        {(error || (formVisible && submitError)) && <Pane><p role="alert" className="ptools-error">{(formVisible ? submitError : null) ?? error}</p></Pane>}
        {!loading && !error && status && (
          <Pane title={connected ? "Connected" : status.state === "account_unavailable" ? "Account unavailable" : "Not linked"}>
            <div className="portal-leadspply-account-details">
              {account ? <>
                <strong>{account.name}</strong><span>{account.email}</span>
                <p>{integrationStatusLabel(account.sync_status)} · {account.pay_tier === null ? "Tier pending" : `${account.pay_tier}% tier`}</p>
                <small>{account.synced_at ? `Last manually synced ${new Date(account.synced_at).toLocaleString()}` : "Awaiting manual admin sync."}</small>
              </> : <p>{status.state === "account_unavailable"
                ? <>Your connection needs PNCL support review. <Link to="/portal/support">Contact support</Link>.</>
                : "Automatic matching checks your email, NPN, or exact full name every 15 minutes. You can also use a connection code below."}</p>}
            </div>
          </Pane>
        )}
        {status?.state === "not_linked" && (
          <Pane title="Connect LeadSpply">
            <form className="portal-leadspply-redeem" onSubmit={(event) => void redeem(event)}>
              <Field label="Expiring connection code" id="leadspply-connection-code" maxLength={80}
                value={formVisible ? code : ""} onChange={(event) => setCode(event.target.value)}
                placeholder="Paste code from LeadSpply" autoComplete="off" />
              <button type="submit" className="ptools-cta is-primary"
                disabled={busy || !formVisible || !code.trim() || user?.id !== session?.user?.id}>
                <Link2 size={16} aria-hidden="true" /> {busy ? "Submitting…" : "Submit connection code"}
              </button>
              <p>Codes expire. This is a fallback when automatic matching cannot safely connect an account; hierarchy and pay tiers remain under PNCL admin review.</p>
            </form>
          </Pane>
        )}
        {connected && <Link to="/portal" className="ptools-cta">View your dashboard snapshot</Link>}
        {formVisible && message && <Pane><p role="status">{message}</p></Pane>}
      </div>
    </PortalToolLayout>
  );
}
