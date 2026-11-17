import { useState } from "react";
import { Link } from "react-router-dom";
import { type EditorData, setSigningActivation } from "@/lib/onboarding-editor";
import { toast } from "sonner";

export default function SigningActivationPanel({ rollout, token, reload }: { rollout: NonNullable<EditorData["signingRollout"]>; token: string; reload: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  async function update() {
    setBusy(true);
    try {
      await setSigningActivation(token, !rollout.enabled, rollout.revision);
      await reload(); setConfirmed(false);
      toast.success("Signing activation updated. Agents use the new setting when they reopen signing.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update signing activation."); }
    finally { setBusy(false); }
  }
  return <section className="signing-activation-panel" aria-label="Uploaded signing activation">
    <div><h2>{rollout.enabled ? "Uploaded signing is active" : "Prepare documents · signing is paused"}</h2>
      <p>{rollout.enabled ? "Agents use the published signing PDFs configured below." : "Upload PDFs and place fields below. Agents can sign after you activate the configured documents."}</p></div>
    {!rollout.enabled && rollout.missing.length > 0 && <p><strong>Before activation:</strong> {rollout.missing.join(", ")}</p>}
    {rollout.pendingLegacy > 0 && <p>{rollout.pendingLegacy} previously assigned compensation request{rollout.pendingLegacy === 1 ? "" : "s"} remain in history. To request a new signature, use a document configured in Onboarding Steps.</p>}
    <p>Preview as a new agent. Test forms start fresh and never change your documents on file.</p>
    <div className="signing-activation-actions">
      <Link to="/portal/admin/signing-preview/ica" target="_blank" rel="noopener noreferrer">Test ICA</Link>
      <Link to="/portal/admin/signing-preview/w9" target="_blank" rel="noopener noreferrer">Test W-9</Link>
      <Link to="/portal/admin/signing-preview/direct-deposit" target="_blank" rel="noopener noreferrer">Test direct deposit</Link>
      <Link to="/portal/admin/signing-preview/compensation" target="_blank" rel="noopener noreferrer">Test compensation</Link>
    </div>
    <label className="signing-activation-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{rollout.enabled ? "I want to pause new signatures. Existing signed documents remain available." : "I reviewed both flows and tested the configured PDFs. Activate uploaded signing for agents."}</label>
    <button type="button" disabled={busy || !confirmed || (!rollout.enabled && rollout.missing.length > 0)} onClick={() => void update()}>{busy ? "Updating…" : rollout.enabled ? "Pause signing" : "Activate uploaded signing"}</button>
  </section>;
}
