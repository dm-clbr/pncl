import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import AgentOnboarding from "@/pages/AgentOnboarding";
import { clearAllPreviewContractSessions } from "@/lib/onboarding-contract";
import { trackPageView } from "@/lib/analytics";

export default function AdminOnboardingPreview() {
  const navigate = useNavigate();
  const [instanceKey, setInstanceKey] = useState(0);

  useEffect(() => {
    document.title = "Onboarding preview — PNCL Admin";
    trackPageView("admin_onboarding_preview_page");
    return () => {
      clearAllPreviewContractSessions();
    };
  }, []);

  const handleRestart = () => {
    clearAllPreviewContractSessions();
    setInstanceKey((value) => value + 1);
  };

  return (
    <div className="admin-onboarding-preview-shell">
      <div className="admin-onboarding-preview-bar" role="status" aria-live="polite">
        <div className="admin-onboarding-preview-bar-copy">
          <span className="admin-onboarding-preview-badge">Admin preview</span>
          <p>Walk through the new-agent onboarding flow. Nothing is saved or submitted.</p>
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

      <AgentOnboarding
        key={instanceKey}
        preview
        onPreviewRestart={handleRestart}
        onPreviewExit={() => navigate("/portal/admin")}
      />
    </div>
  );
}
