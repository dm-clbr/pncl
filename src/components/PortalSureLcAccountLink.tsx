import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { SureLcAccountLink } from "@/lib/surelc-accounts";
import PortalWorkflowDialog from "@/components/PortalWorkflowDialog";

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
    {open && <PortalWorkflowDialog title={`Before opening ${account.label}`} warning onClose={() => setOpen(false)}>
      <p className="portal-workflow-warning"><strong>WARNING:</strong> You must create a separate SureLC account for #1, #2, and #3. In each account, only request the carriers listed under that SureLC.</p>
      <p><strong>{account.label} — {account.branch}</strong><br />Only request these carriers in this account:</p>
      <ul>{account.carriers.map((carrier) => <li key={carrier}>{carrier}</li>)}</ul>
      <p>Ethos and United Home Life links are sent to your PNCL email automatically. Do not request them in SureLC.</p>
      <footer>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        <a className="portal-workflow-primary" href={account.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Continue to {account.label}<ArrowUpRight size={16} aria-hidden="true" /></a>
      </footer>
    </PortalWorkflowDialog>}
  </>;
}
