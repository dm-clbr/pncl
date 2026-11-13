import { suggestedIcaInitials } from "../../supabase/functions/_shared/icaSigningRules";
import "@/styles/ica-signing-guidance.css";

export default function IcaSigningGuidance({ legalName = "", includeInitials = true }: { legalName?: string; includeInitials?: boolean }) {
  const initials = suggestedIcaInitials(legalName);
  return <aside className="ica-signing-guidance" aria-label="ICA signing requirements">
    <h3>Before you sign</h3>
    <p><strong>Signature:</strong> Use your full first and last name, not initials or a line alone.</p>
    {includeInitials && <p><strong>Initials:</strong> Use your actual initials in every Debit-Check box. The letters A–E label the statements; they are not the initials to enter. Do not use “YES” or placeholder letters.</p>}
    {includeInitials && <p className="ica-signing-example">{initials ? `${legalName.trim()} → ${initials}` : "Example: Alex Morgan → AM"} in each initials box. Middle initials may be included.</p>}
  </aside>;
}
