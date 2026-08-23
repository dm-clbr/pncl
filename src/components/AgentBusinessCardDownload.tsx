import { useEffect, useState } from "react";
import { Download, FileText, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import {
  canGenerateAgentBusinessCard,
  downloadAgentBusinessCardPdf,
  type AgentBusinessCardData,
} from "@/lib/agent-business-card-pdf";
import { isValidAgentPhoneNumber } from "@/lib/agent-phone";
import {
  isOwnProfilePhotoPath,
  loadOwnProfilePhotoForBusinessCard,
} from "@/lib/agent-business-card-photo";

interface AgentBusinessCardDownloadProps {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  workEmail?: string | null;
  workEmailVerified: boolean;
  phoneNumber?: string | null;
  profilePhotoPath?: string | null;
  profilePhotoUrl?: string | null;
  profileUpdatedAt?: string | null;
}

export default function AgentBusinessCardDownload({
  userId,
  firstName,
  lastName,
  workEmail,
  workEmailVerified,
  phoneNumber,
  profilePhotoPath,
  profilePhotoUrl,
  profileUpdatedAt,
}: AgentBusinessCardDownloadProps) {
  const [generating, setGenerating] = useState(false);
  const [previewPhotoFailed, setPreviewPhotoFailed] = useState(false);
  const card: AgentBusinessCardData = {
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    workEmail: workEmail ?? "",
    workEmailVerified,
    phoneNumber: phoneNumber ?? "",
  };
  const agentName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || "Your name";
  const canDownload = canGenerateAgentBusinessCard(card);
  const hasValidPhone = isValidAgentPhoneNumber(phoneNumber);
  const hasOwnProfilePhoto = isOwnProfilePhotoPath(userId, profilePhotoPath);
  const showProfilePhoto = hasOwnProfilePhoto && Boolean(profilePhotoUrl) && !previewPhotoFailed;
  const initials = [firstName?.trim()[0], lastName?.trim()[0]].filter(Boolean).join("").toUpperCase() || "PN";

  useEffect(() => {
    setPreviewPhotoFailed(false);
  }, [profilePhotoUrl]);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const profilePhoto = await loadOwnProfilePhotoForBusinessCard({
        userId,
        profilePhotoPath,
        profileUpdatedAt,
      });
      await downloadAgentBusinessCardPdf({ ...card, profilePhoto });
      toast.success("PDF business card downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the PDF business card.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="portal-profile-business-card" aria-labelledby="digital-business-card-title">
      <div className="portal-profile-business-card-head">
        <div>
          <strong id="digital-business-card-title">PDF business card</strong>
          <p id="digital-business-card-description">
            A print-ready 3.5 x 2 inch card with your saved profile photo, name, PNCL affiliation,
            verified work email, and profile phone. A branded placeholder appears when your photo
            is unavailable; home address and onboarding data stay private.
          </p>
        </div>
        <FileText size={22} aria-hidden="true" />
      </div>

      <div className="portal-profile-business-card-layout">
        <div className="portal-business-card-preview" aria-label={`Business card preview for ${agentName}`}>
          <div className="portal-business-card-brand">
            <strong>PNCL</strong>
            <span>Agent network</span>
          </div>
          <div className="portal-business-card-main">
            <div className="portal-business-card-copy">
              <div className="portal-business-card-name">{agentName}</div>
              <div className="portal-business-card-affiliation">PNCL agent</div>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{workEmailVerified && workEmail ? workEmail : "Verified work email required"}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{hasValidPhone ? phoneNumber : "Phone required"}</dd>
                </div>
              </dl>
            </div>
            <div className="portal-business-card-portrait">
              {showProfilePhoto ? (
                <img
                  src={profilePhotoUrl ?? undefined}
                  alt={`Profile portrait of ${agentName}`}
                  onError={() => setPreviewPhotoFailed(true)}
                />
              ) : (
                <span aria-label={`Branded initials placeholder for ${agentName}`}>{initials}</span>
              )}
            </div>
          </div>
        </div>

        <div className="portal-profile-business-card-actions">
          {!canDownload && (
            <p className="portal-profile-business-card-required" role="status">
              <LockKeyhole size={15} aria-hidden="true" />
              Add a valid phone number below and save your profile to unlock the PDF download.
            </p>
          )}
          <button
            type="button"
            className="portal-panel-btn portal-profile-business-card-btn"
            aria-label={`Download PDF business card for ${agentName}`}
            aria-describedby="digital-business-card-description"
            disabled={!canDownload || generating}
            onClick={() => void handleDownload()}
          >
            <Download size={16} aria-hidden="true" />
            {generating ? "Creating PDF..." : "Download PDF"}
          </button>
        </div>
      </div>
    </section>
  );
}
