import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import W9SigningStep from "@/components/W9SigningStep";
import type { SubmitPortalW9Payload } from "@/lib/portal-w9";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/onboarding.css";

type PreviewPhase = "form" | "complete";

export default function AdminW9Preview() {
  const navigate = useNavigate();
  const [instanceKey, setInstanceKey] = useState(0);
  const [phase, setPhase] = useState<PreviewPhase>("form");
  const [previewSummary, setPreviewSummary] = useState<SubmitPortalW9Payload | null>(null);

  useEffect(() => {
    document.title = "W-9 preview — PNCL Admin";
    trackPageView("admin_w9_preview_page");
  }, []);

  const handleRestart = () => {
    setPhase("form");
    setPreviewSummary(null);
    setInstanceKey((value) => value + 1);
  };

  const handleSubmit = async (payload: SubmitPortalW9Payload) => {
    setPreviewSummary(payload);
    setPhase("complete");
    toast.success("Preview: W-9 validated successfully. Nothing was saved.");
  };

  return (
    <div className="admin-onboarding-preview-shell">
      <div className="admin-onboarding-preview-bar" role="status" aria-live="polite">
        <div className="admin-onboarding-preview-bar-copy">
          <span className="admin-onboarding-preview-badge">Admin preview</span>
          <p>
            Test the fillable W-9 flow exactly as agents see it. Validation runs locally — nothing is
            saved or submitted.
          </p>
        </div>
        <div className="admin-onboarding-preview-actions">
          <button type="button" className="admin-onboarding-preview-btn" onClick={handleRestart}>
            <RotateCcw size={14} aria-hidden="true" />
            Restart
          </button>
          <Link to="/portal/admin" className="admin-onboarding-preview-btn">
            <ArrowLeft size={14} aria-hidden="true" />
            Back to admin
          </Link>
        </div>
      </div>

      {phase === "form" && (
        <div className="home2-page onboarding-page">
          <div className="grain" aria-hidden="true" />
          <main className="onboarding-main">
            <div className="onboarding-panel onboarding-panel-signing">
              <W9SigningStep
                key={instanceKey}
                className="portal-w9-signing"
                eyebrow="Preview"
                title="Test the W-9 form"
                lead="Fill in the highlighted fields and confirm the Part II certification. Use test data only — no PDF is generated and nothing is stored."
                finishLabel="Test submit (preview)"
                prefillLegalName="Preview Agent"
                onSubmit={handleSubmit}
              />
            </div>
          </main>
        </div>
      )}

      {phase === "complete" && previewSummary && (
        <div className="home2-page onboarding-page">
          <div className="grain" aria-hidden="true" />
          <main className="onboarding-main">
            <div className="onboarding-panel">
              <span className="eyebrow">Preview complete</span>
              <h2 className="h3">W-9 validation passed</h2>
              <p className="lead">
                The form extracted and validated the following values. In production, a signed PDF would
                be saved to the agent profile and their tax ID would be encrypted.
              </p>
              <div className="onboarding-preview-success-card">
                <p><strong>Name</strong></p>
                <p>{previewSummary.legalName}</p>
                <p><strong>Tax classification</strong></p>
                <p>{previewSummary.taxClassification}</p>
                <p><strong>Address</strong></p>
                <p>
                  {previewSummary.addressLine1}
                  <br />
                  {previewSummary.city}, {previewSummary.state} {previewSummary.zip}
                </p>
                <p><strong>TIN type</strong></p>
                <p>{previewSummary.tinType === "ssn" ? "SSN" : "EIN"} (redacted in preview)</p>
              </div>
              <div className="onboarding-actions">
                <button type="button" className="btn btn-accent" onClick={handleRestart}>
                  Restart preview <span className="arr">→</span>
                </button>
                <button
                  type="button"
                  className="onboarding-back"
                  onClick={() => navigate("/portal/admin")}
                >
                  ← Back to admin
                </button>
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
