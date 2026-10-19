import { useState } from "react";
import PortalWorkflowDialog from "@/components/PortalWorkflowDialog";

export default function PortalNewProducerModal({ onClose, onConfirmed }: {
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return <PortalWorkflowDialog title="Submit for New Producer" onClose={onClose}>
    <p className="portal-workflow-warning"><strong>MANDATORY — You will not get any carrier contracts without completing this step.</strong></p>
    <p>This creates a New Producer ticket for the PNCL team to build your profile in PLG’s back-end system. You do not need approved contracts or writing numbers yet.</p>
    <label className="portal-workflow-confirm">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I have completed the steps above and submitted applications for the recommended carriers in my SureLC accounts.</span>
    </label>
    <footer>
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" className="portal-workflow-primary" disabled={!confirmed} onClick={onConfirmed}>Confirm and submit</button>
    </footer>
  </PortalWorkflowDialog>;
}
