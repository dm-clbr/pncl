import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingContent } from "@/hooks/useOnboardingContent";
import DirectDepositForm from "@/components/DirectDepositForm";
import CompAgreementForm from "@/components/CompAgreementForm";
import UploadedIcaSigningStep from "@/components/UploadedIcaSigningStep";
import W9SigningStep from "@/components/W9SigningStep";
import PortalBackground from "@/components/portal/PortalBackground";
import Pane from "@/components/portal/Pane";
import type { AgentDesignation } from "@/lib/agent-designation";
import "@/styles/home2.css";
import "@/styles/onboarding.css";
import "@/styles/portal-admin.css";
import "@/styles/admin-signing-preview.css";

const TITLES = {
  ica: "Independent Contractor Agreement",
  w9: "W-9",
  "direct-deposit": "Direct deposit",
  compensation: "Compensation agreement",
};
type PreviewKind = keyof typeof TITLES;

// This route never mounts agent record hooks. Forms receive only local callbacks;
// no signature, bank details, tax ID, PDF, or completion is persisted by a preview.
function ConfiguredSigningForm({ kind, designation, onComplete }: {
  kind: Exclude<PreviewKind, "direct-deposit">;
  designation: AgentDesignation;
  onComplete: () => Promise<void>;
}) {
  const { session } = useAuth();
  const { content, error, retry } = useOnboardingContent({ accessToken: session?.access_token, previewDesignation: designation });
  if (error) return <Pane><p role="alert">{error}</p><button type="button" className="admin-onboarding-preview-btn" onClick={retry}>Retry</button></Pane>;
  if (!content) return <p role="status">Loading configured form…</p>;
  const asset = kind === "ica" ? content.ica : kind === "w9" ? content.w9 : content.compAgreement;
  if (!asset) return <Pane><p role="alert">Upload and publish a {TITLES[kind]} for the {designation.toUpperCase()} flow in Onboarding Steps before previewing.</p></Pane>;
  if (kind === "ica") return <UploadedIcaSigningStep asset={asset} finishLabel="Test submit (preview)" onSubmit={onComplete} />;
  if (kind === "w9") return <W9SigningStep pdfUrl={asset.url} finishLabel="Test submit (preview)" onSubmit={onComplete} />;
  return <CompAgreementForm
    attachment={{ id: "preview", userId: "preview", title: TITLES.compensation, status: "pending", assignedAt: "", signatureName: null, signedAt: null, documentUrl: asset.url, templateAssetId: asset.id }}
    defaultName="" finishLabel="Test submit (preview)" onSubmit={onComplete}
  />;
}

export default function AdminSigningPreview() {
  const { kind: routeKind } = useParams();
  const [params, setParams] = useSearchParams();
  const [instance, setInstance] = useState(0);
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const designation = params.get("flow") === "ibo" ? "ibo" : "loa";
  useEffect(() => { document.title = "New-agent signing preview — PNCL Admin"; }, []);
  if (!routeKind || !Object.prototype.hasOwnProperty.call(TITLES, routeKind)) return <Navigate to="/portal/admin/onboarding-steps" replace />;
  const kind = routeKind as PreviewKind;
  const previewKey = `${kind}-${designation}-${instance}`;
  const complete = completedKey === previewKey;
  const restart = () => { setCompletedKey(null); setInstance(value => value + 1); };
  const onComplete = async () => { setCompletedKey(previewKey); window.scrollTo(0, 0); };

  return <div className="admin-onboarding-preview-shell admin-signing-preview">
    <PortalBackground />
    <div className="admin-onboarding-preview-bar">
      <div className="admin-onboarding-preview-bar-copy">
        <span className="admin-onboarding-preview-badge">Preview as a new agent</span>
        <p>Use test data. Nothing is saved or submitted. Your documents on file stay unchanged.</p>
      </div>
      <div className="admin-onboarding-preview-actions">
        {kind !== "direct-deposit" && <label>Preview flow <select aria-label="Preview flow" value={designation} onChange={event => { setParams({ flow: event.target.value }); restart(); }}><option value="loa">LOA</option><option value="ibo">IBO</option></select></label>}
        <button type="button" className="admin-onboarding-preview-btn" onClick={restart}><RotateCcw size={14} />Restart</button>
        <Link className="admin-onboarding-preview-btn" to="/portal/admin/onboarding-steps"><ArrowLeft size={14} />Back to steps</Link>
      </div>
    </div>
    <div className="home2-page onboarding-page">
      <main className={`admin-signing-preview-main ${kind === "direct-deposit" ? "admin-signing-preview-deposit" : ""}`}>
        <h1>{TITLES[kind]}</h1>
        {complete ? <Pane title="Preview complete">
          <p role="status">Validation passed. No PDF was created and no account records were changed.</p>
          {kind === "direct-deposit" && <p>When an agent submits the live form, a signed PDF is generated and saved to their profile.</p>}
          <button className="admin-onboarding-preview-btn" type="button" onClick={restart}>Restart preview</button>
        </Pane> : kind === "direct-deposit"
          ? <DirectDepositForm key={previewKey} finishLabel="Test submit (preview)" onSubmit={onComplete} />
          : <ConfiguredSigningForm key={previewKey} kind={kind} designation={designation} onComplete={onComplete} />}
      </main>
    </div>
  </div>;
}
