import { Download } from "lucide-react";
import {
  canCreateAgentVCard,
  downloadAgentVCard,
  type AgentVCardData,
} from "@/lib/agent-vcard";

interface AgentBusinessCardDownloadProps {
  firstName?: string | null;
  lastName?: string | null;
  workEmail?: string | null;
}

export default function AgentBusinessCardDownload({
  firstName,
  lastName,
  workEmail,
}: AgentBusinessCardDownloadProps) {
  const card: AgentVCardData = {
    firstName,
    lastName,
    organization: "PNCL",
    workEmail,
  };
  const agentName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ")
    || workEmail?.trim()
    || "this agent";
  const canDownload = canCreateAgentVCard(card);

  return (
    <section className="portal-profile-business-card" aria-labelledby="digital-business-card-title">
      <div>
        <strong id="digital-business-card-title">Digital business card</strong>
        <p id="digital-business-card-description">
          Download a contact-ready .vcf with your saved name, PNCL, and work email. Your home
          address and private onboarding details are not included.
        </p>
      </div>
      <button
        type="button"
        className="portal-panel-btn portal-profile-business-card-btn"
        aria-label={`Download digital business card for ${agentName} as a vCard file`}
        aria-describedby="digital-business-card-description"
        disabled={!canDownload}
        onClick={() => downloadAgentVCard(card)}
      >
        <Download size={16} aria-hidden="true" />
        Download .vcf
      </button>
    </section>
  );
}
