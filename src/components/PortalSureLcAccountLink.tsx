import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { sureLcCarrierNames, type SureLcAccountLink } from "@/lib/surelc-accounts";
import { usePortalCarriers } from "@/hooks/usePortalCarriers";
import PortalWorkflowDialog from "@/components/PortalWorkflowDialog";

function SureLcCarrierDialog({ account, onClose }: { account: SureLcAccountLink; onClose: () => void }) {
  // Mount only when opened so every entry point gets a fresh published Carrier Sheet.
  const { carriers, loading, error, reload } = usePortalCarriers();
  const names = sureLcCarrierNames(account.todoId, carriers);
  const ready = !loading && !error && names.length > 0;

  return <PortalWorkflowDialog title={`Before opening ${account.label}`} warning onClose={onClose}>
    <p className="portal-workflow-warning"><strong>WARNING:</strong> You must create a separate SureLC account for #1, #2, and #3. In each account, only request the carriers listed under that SureLC.</p>
    <p><strong>{account.label} — {account.branch}</strong></p>
    {loading ? <p role="status">Loading current carriers…</p> : error ? <div role="alert">
      <p>Unable to load the current carrier list. Please retry before opening SureLC.</p>
      <button type="button" onClick={() => void reload()}>Retry carrier list</button>
    </div> : names.length === 0 ? <p role="status">No carriers are currently listed for this account. Please check with your upline before requesting a contract.</p> : <>
      <p>Only request these carriers in this account:</p>
      <ul>{names.map((carrier) => <li key={carrier}>{carrier}</li>)}</ul>
    </>}
    <p>CICA, Ethos and United Home Life links are sent to your PNCL email automatically. Do not request them in SureLC.</p>
    <footer>
      <button type="button" onClick={onClose}>Cancel</button>
      {ready && <a className="portal-workflow-primary" href={account.href} target="_blank" rel="noopener noreferrer" onClick={onClose}>Continue to {account.label}<ArrowUpRight size={16} aria-hidden="true" /></a>}
    </footer>
  </PortalWorkflowDialog>;
}

export default function PortalSureLcAccountLink({ account, className = "pcl-step-link", disabled = false }: {
  account: SureLcAccountLink;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
      {account.actionLabel}<ArrowUpRight size={16} aria-hidden="true" />
    </button>
    {open && <SureLcCarrierDialog account={account} onClose={() => setOpen(false)} />}
  </>;
}
