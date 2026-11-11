import { Link } from "react-router-dom";
import PortalWorkflowDialog from "@/components/PortalWorkflowDialog";
import type { SetupStatus } from "@/lib/hub-account-setup";
import { sharedSignInSetupHref, type SignInProduct } from "@/lib/shared-sign-in";

export default function SharedSignInSetupDialog({ product, email, status, onClose, onRefresh }: {
  product: SignInProduct; email: string; status: SetupStatus | null;
  onClose: () => void; onRefresh: () => void;
}) {
  // A null status here means Pay itself reported that the account is missing.
  const missingPay = !status || status.ready && product === "PNCL Pay" && !status.payEnabled;
  const mismatch = status?.state === "connected" && !status.emailMatches;
  const unlinked = status?.state === "not_linked";
  const invitation = status?.blockedReason === "invitation_pending";
  const confirmation = status?.blockedReason === "email_confirmation_required";
  const approval = status?.state === "connected" && !status.approved;
  return <PortalWorkflowDialog
    title={mismatch ? "Match your LeadSpply email" : `Set up shared sign-in to ${product}`}
    onClose={onClose}
  >
    <p>Shared sign-in to {product} needs a little more setup. Your Hub email is <strong>{email}</strong>.</p>
    {mismatch ? <>
      <p>Your LeadSpply email is <strong>{status.account?.email}</strong>. It needs to match your verified PNCL Hub email.</p>
      <ol>
        <li>Verify your current LeadSpply login to authorize the email change.</li>
        <li>Review and confirm the update to <strong>{email}</strong>. Your existing account, password and data stay together.</li>
        <li>{approval ? "Contact support for LeadSpply approval, then continue." : `Continue to ${product}. Matching verified emails will handle future shared sign-ins.`}</li>
      </ol>
    </> : unlinked ? <ol>
      <li>Link your existing LeadSpply account using its current login. Create an account only if you do not already have one.</li>
      <li>Use your verified Hub email, <strong>{email}</strong>. If your LeadSpply email is different, we’ll help you update it.</li>
      <li>Complete any required approval, then continue to {product}.</li>
    </ol> : invitation ? <ol>
      <li>Open your LeadSpply invitation email and follow the link to set your password.</li>
      <li>If the invitation is missing or expired, contact support for a fresh invitation.</li>
      <li>Return here and select <strong>Refresh connection</strong>.</li>
    </ol> : confirmation ? <ol>
      <li>Open LeadSpply login. If prompted, choose <strong>Resend confirmation email</strong>.</li>
      <li>Follow the confirmation link sent to your LeadSpply email.</li>
      <li>Return here and select <strong>Refresh connection</strong>.</li>
    </ol> : missingPay ? <ol>
      <li>Contact PNCL support to arrange Pay access. Bill creates Pay accounts separately.</li>
      <li>Make sure your Pay account uses <strong>{email}</strong>.</li>
      <li>Once access is enabled, return here and select <strong>Refresh connection</strong>.</li>
    </ol> : <ol>
      <li>{approval ? "Contact support for the required LeadSpply account approval." : "Contact support to review access to your linked LeadSpply account."}</li>
      <li>After access is confirmed, return here and select <strong>Refresh connection</strong>.</li>
    </ol>}
    <footer>
      <button type="button" onClick={onRefresh}>Refresh connection</button>
      {confirmation && <a href="https://leadspply.com/login" target="_blank" rel="noopener noreferrer">Open LeadSpply login</a>}
      {mismatch || unlinked
        ? <Link className="portal-workflow-primary" to={sharedSignInSetupHref(product, status)}>{mismatch ? "Update LeadSpply email" : "Start account setup"}</Link>
        : <Link className="portal-workflow-primary" to="/portal/support">Contact support</Link>}
    </footer>
  </PortalWorkflowDialog>;
}
