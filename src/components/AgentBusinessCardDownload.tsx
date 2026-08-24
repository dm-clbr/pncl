import { useEffect, useState } from "react";
import { Download, FileText, LockKeyhole, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  canShareAgentBusinessCardPdfFile,
  canGenerateAgentBusinessCard,
  createAgentBusinessCardPdfFile,
  downloadAgentBusinessCardPdf,
  downloadAgentBusinessCardPdfFile,
  shareAgentBusinessCardPdfFile,
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
  npn?: string | null;
  profilePhotoPath?: string | null;
  profilePhotoUrl?: string | null;
  profileUpdatedAt?: string | null;
}

function isShareCancellation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export default function AgentBusinessCardDownload({
  userId,
  firstName,
  lastName,
  workEmail,
  workEmailVerified,
  phoneNumber,
  npn,
  profilePhotoPath,
  profilePhotoUrl,
  profileUpdatedAt,
}: AgentBusinessCardDownloadProps) {
  const [activeAction, setActiveAction] = useState<"download" | "share" | null>(null);
  const [previewPhotoFailed, setPreviewPhotoFailed] = useState(false);
  const normalizedNpn = npn?.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim() || null;
  const card: AgentBusinessCardData = {
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    workEmail: workEmail ?? "",
    workEmailVerified,
    phoneNumber: phoneNumber ?? "",
    npn: normalizedNpn,
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
    setActiveAction("download");
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
      setActiveAction(null);
    }
  };

  const handleShare = async () => {
    setActiveAction("share");
    try {
      const profilePhoto = await loadOwnProfilePhotoForBusinessCard({
        userId,
        profilePhotoPath,
        profileUpdatedAt,
      });
      const pdfFile = await createAgentBusinessCardPdfFile({ ...card, profilePhoto });

      if (!canShareAgentBusinessCardPdfFile(pdfFile)) {
        downloadAgentBusinessCardPdfFile(pdfFile);
        toast.info("File sharing is not supported here. The PDF was downloaded so you can attach it manually.");
        return;
      }

      try {
        await shareAgentBusinessCardPdfFile(pdfFile);
        toast.success("PDF business card shared.");
      } catch (error) {
        if (isShareCancellation(error)) return;

        downloadAgentBusinessCardPdfFile(pdfFile);
        toast.error("The share sheet could not be opened. The PDF was downloaded so you can attach it manually.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the PDF business card.");
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <section className="portal-profile-business-card" aria-labelledby="digital-business-card-title">
      <div className="portal-profile-business-card-head">
        <div>
          <strong id="digital-business-card-title">PDF business card</strong>
          <p id="digital-business-card-description">
            A print-ready 3.5 x 2 inch card with your saved profile photo, name, PNCL affiliation,
            verified work email, profile phone, and NPN when available. A branded placeholder
            appears when your photo is unavailable; home address and onboarding data stay private.
            Share PDF sends only the PDF file, never this portal page.
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
                {normalizedNpn && (
                  <div>
                    <dt>NPN</dt>
                    <dd>{normalizedNpn}</dd>
                  </div>
                )}
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
              Add a valid phone number below and save your profile to unlock PDF sharing and download.
            </p>
          )}
          <button
            type="button"
            className="portal-panel-btn portal-profile-business-card-btn"
            aria-label={`Share PDF business card for ${agentName}`}
            aria-describedby="digital-business-card-description digital-business-card-share-fallback"
            disabled={!canDownload || activeAction !== null}
            onClick={() => void handleShare()}
          >
            <Share2 size={16} aria-hidden="true" />
            {activeAction === "share" ? "Creating PDF..." : "Share PDF"}
          </button>
          <button
            type="button"
            className="portal-panel-btn portal-profile-business-card-btn"
            aria-label={`Download PDF business card for ${agentName}`}
            aria-describedby="digital-business-card-description"
            disabled={!canDownload || activeAction !== null}
            onClick={() => void handleDownload()}
          >
            <Download size={16} aria-hidden="true" />
            {activeAction === "download" ? "Creating PDF..." : "Download PDF"}
          </button>
          <p id="digital-business-card-share-fallback" className="portal-profile-business-card-fallback">
            If this device cannot share files directly, the PDF will download so you can attach it manually.
          </p>
        </div>
      </div>
    </section>
  );
}
