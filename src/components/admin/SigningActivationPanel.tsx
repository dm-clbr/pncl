import { useState } from "react";
import { Link } from "react-router-dom";
import { type EditorData, setSigningActivation, setSigningPreview } from "@/lib/onboarding-editor";
import { toast } from "sonner";

export default function SigningActivationPanel({ rollout, token, reload }: { rollout: NonNullable<EditorData["signingRollout"]>; token: string; reload: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  async function update(preview: boolean) {
    setBusy(true);
    try {
      if (preview) await setSigningPreview(token, !rollout.previewSelf);
      else await setSigningActivation(token, !rollout.enabled, rollout.revision);
      await reload(); setConfirmed(false);
      toast.success(preview ? "Signing preview updated for your account. Reopen signing pages to use it." : "Signing activation updated. Agents use the new setting when they reopen signing.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update signing activation."); }
    finally { setBusy(false); }
  }
  return <section className="signing-activation-panel" aria-label="Uploaded signing activation">
    <div><h2>{rollout.enabled ? "Uploaded signing is active" : "Prepare documents · current signing stays active"}</h2>
      <p>{rollout.enabled ? "Agents use the published signing PDFs configured below." : "Upload PDFs and place fields below. Agents keep their existing signing process until you activate uploaded signing."}</p></div>
    {!rollout.enabled && rollout.missing.length > 0 && <p><strong>Before activation:</strong> {rollout.missing.join(", ")}</p>}
    {rollout.pendingLegacy > 0 && <p>{rollout.pendingLegacy} previously assigned compensation request{rollout.pendingLegacy === 1 ? "" : "s"} will remain available for signing.</p>}
    {!rollout.enabled && <div className="signing-activation-actions"><button type="button" disabled={busy} onClick={() => void update(true)}>{rollout.previewSelf ? "Stop preview for my account" : "Preview new signing on my account"}</button>{rollout.previewSelf && <><Link to="/portal/ica" target="_blank" rel="noopener noreferrer">Test ICA</Link><Link to="/portal/w9" target="_blank" rel="noopener noreferrer">Test W-9</Link><Link to="/portal/direct-deposit" target="_blank" rel="noopener noreferrer">Test direct deposit</Link><Link to="/portal/comp-agreement" target="_blank" rel="noopener noreferrer">Test compensation</Link></>}</div>}
    <label className="signing-activation-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{rollout.enabled ? "I want to return agents to the previous signing process." : "I reviewed both flows and tested the configured PDFs. Activate uploaded signing for agents."}</label>
    <button type="button" disabled={busy || !confirmed || (!rollout.enabled && rollout.missing.length > 0)} onClick={() => void update(false)}>{busy ? "Updating…" : rollout.enabled ? "Return to previous signing" : "Activate uploaded signing"}</button>
  </section>;
}
