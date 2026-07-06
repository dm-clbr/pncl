import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import OnboardingContractStep from "@/components/OnboardingContractStep";
import { submitOnboarding, isSupabaseConfigured } from "@/lib/onboarding-api";
import {
  clearStoredContractSession,
  readStoredContractLegalName,
  readStoredContractSignatureId,
} from "@/lib/onboarding-contract";
import {
  getReferralInviteInfo,
  clearStoredReferralInviteId,
  persistReferralInviteId,
  readStoredReferralInviteId,
  REFERRAL_PARAM,
} from "@/lib/referral";
import { toast } from "sonner";
import { trackPageView } from "@/lib/analytics";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

type OnboardingPhase = "intro" | "contract" | "form" | "previewComplete";

interface AgentOnboardingProps {
  preview?: boolean;
  onPreviewRestart?: () => void;
  onPreviewExit?: () => void;
}

interface OnboardingData {
  legalName: string;
  phoneNumber: string;
  dateOfBirth: string;
  ssn: string;
  stateOfResidence: string;
  driversLicense: string;
  profilePhoto: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string;
  hasEoInsurance: string;
}

type StepKey = Exclude<keyof OnboardingData, "legalName">;

type FileStepKey = "driversLicense" | "profilePhoto";

interface Step {
  key: StepKey;
  question: string;
  subtitle: string;
  type: "text" | "tel" | "select" | "yesno" | "file";
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

const STEPS: Step[] = [
  {
    key: "phoneNumber",
    question: "Phone number",
    subtitle: "Please use dashes: 111-222-3333",
    type: "tel",
    placeholder: "111-222-3333",
    required: true,
  },
  {
    key: "dateOfBirth",
    question: "Date of birth",
    subtitle: "mm/dd/yyyy format",
    type: "tel",
    placeholder: "mm/dd/yyyy",
    required: true,
  },
  {
    key: "ssn",
    question: "Social Security Number",
    subtitle:
      "The Department of Insurance requires this to verify your identity for licensing. Please use dashes: 111-22-3333",
    type: "tel",
    placeholder: "111-22-3333",
    required: true,
  },
  {
    key: "stateOfResidence",
    question: "State of residence",
    subtitle:
      "This must be where you are living now, and where you will have your resident license.",
    type: "select",
    options: US_STATES,
    required: true,
  },
  {
    key: "driversLicense",
    question: "Driver's license",
    subtitle: "Upload a clear and legible image of your driver's license.",
    type: "file",
    required: true,
  },
  {
    key: "profilePhoto",
    question: "Profile picture",
    subtitle: "Add a photo for your PNCL profile. You can skip this and add one later.",
    type: "file",
    required: false,
  },
  {
    key: "uplineNetwork",
    question: "Upline network",
    subtitle: "Who's team are you on (leader name)?",
    type: "text",
    placeholder: "Team leader name",
    required: true,
  },
  {
    key: "hasLicense",
    question: "Do you already have your insurance license (NPN)?",
    subtitle: "",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "npn",
    question: "NPN",
    subtitle:
      "If you do have your NPN, please enter that number here. If you don't, leave it blank.",
    type: "text",
    placeholder: "National Producer Number",
    required: false,
  },
  {
    key: "hasEoInsurance",
    question: "Do you already have your E&O Insurance?",
    subtitle: "",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
];

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatSsn(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidPhone(phone: string): boolean {
  return /^\d{3}-\d{3}-\d{4}$/.test(phone);
}

function isValidSsn(ssn: string): boolean {
  return /^\d{3}-\d{2}-\d{4}$/.test(ssn);
}

function isValidDate(dob: string): boolean {
  const match = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function maskSsn(ssn: string): string {
  const match = ssn.match(/^\d{3}-\d{2}-(\d{4})$/);
  if (!match) return ssn || "—";
  return `•••-••-${match[1]}`;
}

function isFileStepKey(key: StepKey | "legalName"): key is FileStepKey {
  return key === "driversLicense" || key === "profilePhoto";
}

function formatReviewValue(key: StepKey | "legalName", value: string): string {
  if (isFileStepKey(key)) {
    return value ? "Uploaded" : "Not provided";
  }
  if (!value.trim()) {
    if (key === "npn") return "Not provided";
    return "—";
  }
  if (key === "ssn") return maskSsn(value);
  return value;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_IMAGE_DIMENSION = 1600;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

/** Downscales large photos so uploads stay well under the 5 MB limit. */
async function processImageFile(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, or WebP image.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode_failed"));
      img.src = objectUrl;
    });

    const scale = Math.min(
      1,
      MAX_UPLOAD_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("decode_failed");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
      throw new Error("Image must be 5 MB or smaller.");
    }
    return readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const EMPTY_DATA: OnboardingData = {
  legalName: "",
  phoneNumber: "",
  dateOfBirth: "",
  ssn: "",
  stateOfResidence: "",
  driversLicense: "",
  profilePhoto: "",
  uplineNetwork: "",
  hasLicense: "",
  npn: "",
  hasEoInsurance: "",
};

const UPLINE_STEP_INDEX = STEPS.findIndex((step) => step.key === "uplineNetwork");

function isUplineStep(index: number): boolean {
  return index === UPLINE_STEP_INDEX;
}

function getNextStepIndex(from: number, skipUpline: boolean): number {
  let next = from + 1;
  if (skipUpline && isUplineStep(next)) {
    next += 1;
  }
  return next;
}

function getPreviousStepIndex(from: number, skipUpline: boolean): number {
  let prev = from - 1;
  if (skipUpline && isUplineStep(prev)) {
    prev -= 1;
  }
  return prev;
}

function resolveInitialPhase(preview: boolean): OnboardingPhase {
  return readStoredContractSignatureId(preview) ? "form" : "intro";
}

export default function AgentOnboarding({
  preview = false,
  onPreviewRestart,
  onPreviewExit,
}: AgentOnboardingProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<OnboardingPhase>(() => resolveInitialPhase(preview));
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(() => ({
    ...EMPTY_DATA,
    legalName: readStoredContractLegalName(preview) ?? "",
  }));
  const [transitioning, setTransitioning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [referralInviteId, setReferralInviteId] = useState<string | null>(null);
  const [referralLocked, setReferralLocked] = useState(false);
  const [contractSignatureId, setContractSignatureId] = useState<string | null>(() =>
    readStoredContractSignatureId(preview),
  );
  const [previewSubmittedName, setPreviewSubmittedName] = useState("");
  const [processingFile, setProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSteps = STEPS.length + 1;
  const isReviewStep = phase === "form" && currentStep === STEPS.length;
  const step = isReviewStep ? null : STEPS[currentStep];
  const progress = phase === "contract"
    ? 8
    : phase === "form"
      ? 8 + ((currentStep + 1) / totalSteps) * 92
      : undefined;
  const currentValue = step ? data[step.key] : "";

  const validationError = useMemo(() => {
    if (!step || step.type === "yesno" || step.type === "select") return null;
    if (step.required && !currentValue.trim()) return "This field is required.";
    if (step.key === "phoneNumber" && currentValue && !isValidPhone(currentValue)) {
      return "Please use the format 111-222-3333.";
    }
    if (step.key === "ssn" && currentValue && !isValidSsn(currentValue)) {
      return "Please use the format 111-22-3333.";
    }
    if (step.key === "dateOfBirth" && currentValue && !isValidDate(currentValue)) {
      return "Please use mm/dd/yyyy format.";
    }
    return null;
  }, [step, currentValue]);

  const canAdvance =
    !step
      ? false
      : step.type === "yesno"
      ? !!currentValue
      : step.type === "select"
        ? !!currentValue
        : step.type === "file"
          ? (step.required ? !!currentValue : true) && !processingFile
          : step.required
            ? !!currentValue.trim() && !validationError
            : !validationError;

  const advance = () => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep((s) => getNextStepIndex(s, referralLocked));
      setTransitioning(false);
    }, 350);
  };

  const goToStep = (index: number, fromReview = false) => {
    setReturnToReview(fromReview);
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep(index);
      setTransitioning(false);
    }, 350);
  };

  const finishStep = () => {
    if (returnToReview) {
      setReturnToReview(false);
      goToStep(STEPS.length);
      return;
    }
    advance();
  };

  const resetContractAndReturn = () => {
    clearStoredContractSession(preview);
    setContractSignatureId(null);
    setData((prev) => ({ ...prev, legalName: "" }));
    setPhase("contract");
    setCurrentStep(0);
    setReturnToReview(false);
  };

  const performSubmit = async (formData: OnboardingData) => {
    if (!contractSignatureId) {
      toast.error("Please sign the Independent Contractor Agreement before submitting.");
      setPhase("contract");
      return;
    }

    if (preview) {
      setLoading(true);
      setTimeout(() => {
        setPreviewSubmittedName(formData.legalName);
        clearStoredContractSession(true);
        setPhase("previewComplete");
        setLoading(false);
        toast.success("Preview complete — no application was submitted.");
      }, 600);
      return;
    }

    if (!isSupabaseConfigured()) {
      toast.error("Onboarding is not configured. Please contact PNCL support.");
      return;
    }

    setLoading(true);
    try {
      const result = await submitOnboarding({
        ...formData,
        referralInviteId: referralInviteId ?? undefined,
        contractSignatureId,
      });
      clearStoredContractSession(false);
      navigate(
        `/onboarding/success/${result.onboardingId}?token=${encodeURIComponent(result.handoffToken)}`,
        { replace: true },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      if (
        message.includes("contract") ||
        message.includes("Agreement")
      ) {
        resetContractAndReturn();
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleYesNo = (value: string) => {
    setData((prev) => ({ ...prev, [step!.key]: value }));
    setTimeout(finishStep, 200);
  };

  const handleSelect = (value: string) => {
    setData((prev) => ({ ...prev, [step!.key]: value }));
    setTimeout(finishStep, 200);
  };

  const handleInputChange = (raw: string) => {
    if (!step) return;
    let value = raw;
    if (step.key === "phoneNumber") value = formatPhone(raw);
    if (step.key === "ssn") value = formatSsn(raw);
    if (step.key === "dateOfBirth") value = formatDateInput(raw);
    setData((prev) => ({ ...prev, [step.key]: value }));
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!step || step.type !== "file" || !file) return;

    setProcessingFile(true);
    try {
      const dataUrl = await processImageFile(file);
      setData((prev) => ({ ...prev, [step.key]: dataUrl }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to process the selected image.");
    } finally {
      setProcessingFile(false);
    }
  };

  const handleSubmit = async () => {
    if (!step || !canAdvance) return;

    if (currentStep < STEPS.length - 1 || returnToReview) {
      finishStep();
      return;
    }

    advance();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!step) return;
    if (e.key === "Enter" && step.type !== "yesno" && step.type !== "select") {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (phase === "form" && !contractSignatureId) {
      setPhase("contract");
    }
  }, [phase, contractSignatureId]);

  useEffect(() => {
    document.title = preview ? "Onboarding preview — PNCL Admin" : "PNCL New Agent Onboarding";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        preview
          ? "Preview the PNCL new agent onboarding experience."
          : "Complete your PNCL agent onboarding. Sign your contract and provide licensing information to initiate the contracting process.",
      );
    }
    trackPageView(preview ? "admin-onboarding-preview" : "agent-onboarding");
  }, [preview]);

  useEffect(() => {
    if (preview) return;

    const refFromUrl = searchParams.get(REFERRAL_PARAM)?.trim() ?? "";
    const refId = refFromUrl || readStoredReferralInviteId();
    if (!refId || !isSupabaseConfigured()) {
      return;
    }

    let cancelled = false;

    getReferralInviteInfo(refId)
      .then((referral) => {
        if (cancelled) return;
        persistReferralInviteId(referral.inviteId);
        setReferralInviteId(referral.inviteId);
        setReferralLocked(true);
        setData((prev) => ({ ...prev, uplineNetwork: referral.referrerName }));
      })
      .catch((err) => {
        if (cancelled) return;
        clearStoredReferralInviteId();
        if (refFromUrl) {
          toast.error(
            err instanceof Error ? err.message : "This referral link is invalid or expired.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, preview]);

  if (phase === "form" && !isReviewStep && !step) {
    return null;
  }

  const previewWorkspaceEmail = previewSubmittedName
    ? `${previewSubmittedName.trim().split(/\s+/)[0]?.toLowerCase() ?? "agent"}.${previewSubmittedName.trim().split(/\s+/).pop()?.toLowerCase() ?? "preview"}@thepncl.com`
    : "jane.smith@thepncl.com";

  return (
    <OnboardingLayout
      progress={phase === "previewComplete" ? 100 : progress}
      wide={phase === "contract" || isReviewStep || phase === "previewComplete"}
      signing={phase === "contract"}
    >
      {phase === "previewComplete" && (
        <div className="onboarding-step">
          <span className="eyebrow">Preview complete</span>
          <h2 className="h3">Application submitted</h2>
          <p className="lead">
            In the live flow, PNCL would create a @thepncl.com mailbox and show credential handoff
            on the next screen. No account was created in this preview.
          </p>
          <div className="onboarding-preview-success-card">
            <p><strong>Sample workspace email</strong></p>
            <p>{previewWorkspaceEmail}</p>
          </div>
          <div className="onboarding-actions onboarding-actions-stack">
            {onPreviewRestart && (
              <button type="button" className="btn btn-accent" onClick={onPreviewRestart}>
                Restart preview <span className="arr">→</span>
              </button>
            )}
            {onPreviewExit && (
              <button type="button" className="btn btn-ghost" onClick={onPreviewExit}>
                Back to admin
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "intro" && (
        <div className="onboarding-step">
          <span className="eyebrow">New Agent</span>
          <h2 className="h2">PNCL Agent Onboarding</h2>
          <p className="lead">
            You&apos;ll start by signing the PNCL Independent Contractor Agreement, then complete
            your application with accurate licensing information.
          </p>
          <button type="button" className="btn btn-accent btn-lg" onClick={() => setPhase("contract")}>
            Get Started <span className="arr">→</span>
          </button>
        </div>
      )}

      {phase === "contract" && (
        <OnboardingContractStep
          preview={preview}
          onSigned={({ contractSignatureId: signedId, legalName }) => {
            setContractSignatureId(signedId);
            setData((prev) => ({ ...prev, legalName }));
            setPhase("form");
            setCurrentStep(0);
          }}
          onBack={() => setPhase("intro")}
        />
      )}

      {phase === "form" && isReviewStep && (
        <div className={`onboarding-step ${transitioning ? "out" : ""}`}>
          <span className="eyebrow">Review</span>
          <h2 className="h3">Check your answers</h2>
          <p className="lead">
            Review everything below. Tap Edit to change an answer before submitting.
          </p>

          <ul className="onboarding-review-list">
            <li className="onboarding-review-row">
              <div className="onboarding-review-content">
                <span className="onboarding-review-label">Legal first &amp; last name</span>
                <span className="onboarding-review-value">{formatReviewValue("legalName", data.legalName)}</span>
              </div>
              <span className="onboarding-review-note">From signed contract</span>
            </li>
            {STEPS.map((reviewStep, index) => (
              <li key={reviewStep.key} className="onboarding-review-row">
                <div className="onboarding-review-content">
                  <span className="onboarding-review-label">{reviewStep.question}</span>
                  <span className="onboarding-review-value">
                    {formatReviewValue(reviewStep.key, data[reviewStep.key])}
                  </span>
                </div>
                {!(referralLocked && reviewStep.key === "uplineNetwork") && (
                  <button
                    type="button"
                    className="onboarding-review-edit"
                    onClick={() => goToStep(index, true)}
                  >
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="onboarding-actions">
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => performSubmit(data)}
              disabled={loading}
            >
              {loading
                ? "Submitting…"
                : preview
                  ? <>Submit preview application <span className="arr">→</span></>
                  : <>Submit Application <span className="arr">→</span></>}
            </button>
          </div>

          <button
            type="button"
            className="onboarding-back"
            onClick={() => goToStep(STEPS.length - 1)}
          >
            ← Back
          </button>
        </div>
      )}

      {phase === "form" && !isReviewStep && step && (
        <div className={`onboarding-step ${transitioning ? "out" : ""}`}>
          <span className="eyebrow">
            Step {currentStep + 2} of {totalSteps + 1}
          </span>
          <h2 className="h3">{step.question}</h2>
          {step.key === "uplineNetwork" && referralLocked ? (
            <p className="lead">You were referred by {data.uplineNetwork}. This is already set for your application.</p>
          ) : (
            step.subtitle && <p className="lead">{step.subtitle}</p>
          )}

          {step.type === "yesno" && (
            <div className="onboarding-options">
              {step.options!.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`onboarding-option ${currentValue === opt ? "selected" : ""}`}
                  onClick={() => handleYesNo(opt)}
                  disabled={loading}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {step.type === "select" && (
            <div className="onboarding-field">
              <label htmlFor="state-select">State</label>
              <select
                id="state-select"
                value={currentValue}
                onChange={(e) => handleSelect(e.target.value)}
                autoFocus
              >
                <option value="" disabled>
                  Choose your state
                </option>
                {step.options!.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step.type === "file" && (
            <div className="onboarding-actions onboarding-actions-stack">
              <div className="onboarding-file-field">
                {currentValue ? (
                  <img
                    src={currentValue}
                    alt={`${step.question} preview`}
                    className="onboarding-file-preview"
                  />
                ) : (
                  <p className="onboarding-file-placeholder">
                    {step.key === "driversLicense"
                      ? "Take a photo or choose an image of your driver's license."
                      : "Choose a photo of yourself."}
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="onboarding-file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void handleFileSelected(file);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processingFile || loading}
                >
                  {processingFile
                    ? "Processing…"
                    : currentValue
                      ? "Change image"
                      : "Choose image"}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-accent"
                onClick={handleSubmit}
                disabled={!canAdvance || loading}
                style={{ opacity: canAdvance && !loading ? 1 : 0.4 }}
              >
                {returnToReview
                  ? <>Save &amp; return <span className="arr">→</span></>
                  : !currentValue && !step.required
                    ? <>Skip for now <span className="arr">→</span></>
                    : <>Continue <span className="arr">→</span></>}
              </button>
            </div>
          )}

          {(step.type === "text" || step.type === "tel") && (
            <div className="onboarding-actions">
              <div className="onboarding-field" style={{ width: "100%" }}>
                <label htmlFor="step-input" className="sr-only">{step.question}</label>
                {step.key === "uplineNetwork" && referralLocked ? (
                  <p className="onboarding-locked-value">{data.uplineNetwork}</p>
                ) : (
                  <>
                    <input
                      id="step-input"
                      key={step.key}
                      type={step.key === "ssn" ? "password" : "text"}
                      inputMode={
                        step.key === "dateOfBirth" || step.key === "phoneNumber" || step.key === "ssn"
                          ? "numeric"
                          : undefined
                      }
                      placeholder={step.placeholder}
                      value={currentValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      autoComplete={step.key === "phoneNumber" ? "tel" : "off"}
                    />
                    {validationError && <p className="onboarding-error">{validationError}</p>}
                  </>
                )}
              </div>
              <button
                type="button"
                className="btn btn-accent"
                onClick={handleSubmit}
                disabled={(step.key === "uplineNetwork" && referralLocked ? false : !canAdvance) || loading}
                style={{ opacity: (step.key === "uplineNetwork" && referralLocked) || (canAdvance && !loading) ? 1 : 0.4 }}
              >
                {returnToReview
                  ? <>Save & return <span className="arr">→</span></>
                  : currentStep === STEPS.length - 1
                    ? <>Review <span className="arr">→</span></>
                    : <>Continue <span className="arr">→</span></>}
              </button>
            </div>
          )}

          {(currentStep > 0 || returnToReview) && (
            <button
              type="button"
              className="onboarding-back"
              onClick={() => {
                if (returnToReview) {
                  setReturnToReview(false);
                  goToStep(STEPS.length);
                } else {
                  setCurrentStep((s) => getPreviousStepIndex(s, referralLocked));
                }
              }}
            >
              ← {returnToReview ? "Back to review" : "Back"}
            </button>
          )}

          {currentStep === 0 && !returnToReview && (
            <button type="button" className="onboarding-back" onClick={resetContractAndReturn}>
              ← Back to contract
            </button>
          )}
        </div>
      )}
    </OnboardingLayout>
  );
}
