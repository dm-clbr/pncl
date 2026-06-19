import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { submitOnboarding, isSupabaseConfigured } from "@/lib/onboarding-api";
import { toast } from "sonner";
import { trackPageView } from "@/lib/analytics";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

interface OnboardingData {
  legalName: string;
  phoneNumber: string;
  personalEmail: string;
  dateOfBirth: string;
  ssn: string;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string;
  hasEoInsurance: string;
}

type StepKey = keyof OnboardingData;

interface Step {
  key: StepKey;
  question: string;
  subtitle: string;
  type: "text" | "tel" | "select" | "yesno";
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

const STEPS: Step[] = [
  {
    key: "legalName",
    question: "Legal first & last name",
    subtitle: "The Department of Insurance will use your legal name.",
    type: "text",
    placeholder: "Jane Smith",
    required: true,
  },
  {
    key: "phoneNumber",
    question: "Phone number",
    subtitle: "Please use dashes: 111-222-3333",
    type: "tel",
    placeholder: "111-222-3333",
    required: true,
  },
  {
    key: "personalEmail",
    question: "Personal email",
    subtitle: "Your personal email (Gmail, iCloud, etc.) — used for Google sign-in recovery, not your @thepncl.com address.",
    type: "text",
    placeholder: "you@gmail.com",
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

function isValidPersonalEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.toLowerCase().endsWith("@thepncl.com");
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

function formatReviewValue(key: StepKey, value: string): string {
  if (!value.trim()) {
    if (key === "npn") return "Not provided";
    return "—";
  }
  if (key === "ssn") return maskSsn(value);
  return value;
}

const EMPTY_DATA: OnboardingData = {
  legalName: "",
  phoneNumber: "",
  personalEmail: "",
  dateOfBirth: "",
  ssn: "",
  stateOfResidence: "",
  uplineNetwork: "",
  hasLicense: "",
  npn: "",
  hasEoInsurance: "",
};

export default function AgentOnboarding() {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(EMPTY_DATA);
  const [transitioning, setTransitioning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);

  const totalSteps = STEPS.length + 1;
  const isReviewStep = started && currentStep === STEPS.length;
  const step = isReviewStep ? null : STEPS[currentStep];
  const progress = started ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const currentValue = step ? data[step.key] : "";

  const validationError = useMemo(() => {
    if (!step || step.type === "yesno" || step.type === "select") return null;
    if (step.required && !currentValue.trim()) return "This field is required.";
    if (step.key === "phoneNumber" && currentValue && !isValidPhone(currentValue)) {
      return "Please use the format 111-222-3333.";
    }
    if (step.key === "personalEmail" && currentValue && !isValidPersonalEmail(currentValue)) {
      return "Enter a valid personal email (not @thepncl.com).";
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
        : step.required
          ? !!currentValue.trim() && !validationError
          : !validationError;

  const advance = () => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep((s) => s + 1);
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

  const performSubmit = async (formData: OnboardingData) => {
    if (!isSupabaseConfigured()) {
      toast.error("Onboarding is not configured. Please contact PNCL support.");
      return;
    }

    setLoading(true);
    try {
      const result = await submitOnboarding(formData);
      navigate(
        `/onboarding/success/${result.onboardingId}?token=${encodeURIComponent(result.handoffToken)}`,
        { replace: true },
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
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
    let value = raw;
    if (step.key === "phoneNumber") value = formatPhone(raw);
    if (step.key === "ssn") value = formatSsn(raw);
    if (step.key === "dateOfBirth") value = formatDateInput(raw);
    setData((prev) => ({ ...prev, [step.key]: value }));
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
    if (e.key === "Enter" && step.type !== "yesno" && step.type !== "select") {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    document.title = "PNCL New Agent Onboarding";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Complete your PNCL agent onboarding. Provide your licensing information to initiate the contracting process.",
      );
    }
    trackPageView("agent-onboarding");
  }, []);

  if (!started) {
    // intro only
  } else if (!isReviewStep && !step) {
    return null;
  }

  return (
    <OnboardingLayout progress={started ? progress : undefined} wide={isReviewStep}>
      {!started && (
        <div className="onboarding-step">
          <span className="eyebrow">New Agent</span>
          <h2 className="h2">PNCL Agent Onboarding</h2>
          <p className="lead">
            This form initiates the PNCL onboarding process. Please fill out completely with accurate information.
          </p>
          <button type="button" className="btn btn-accent btn-lg" onClick={() => setStarted(true)}>
            Get Started <span className="arr">→</span>
          </button>
        </div>
      )}

      {started && isReviewStep && (
        <div className={`onboarding-step ${transitioning ? "out" : ""}`}>
          <span className="eyebrow">Review</span>
          <h2 className="h3">Check your answers</h2>
          <p className="lead">
            Review everything below. Tap Edit to change an answer before submitting.
          </p>

          <ul className="onboarding-review-list">
            {STEPS.map((reviewStep, index) => (
              <li key={reviewStep.key} className="onboarding-review-row">
                <div className="onboarding-review-content">
                  <span className="onboarding-review-label">{reviewStep.question}</span>
                  <span className="onboarding-review-value">
                    {formatReviewValue(reviewStep.key, data[reviewStep.key])}
                  </span>
                </div>
                <button
                  type="button"
                  className="onboarding-review-edit"
                  onClick={() => goToStep(index, true)}
                >
                  Edit
                </button>
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
              {loading ? "Submitting…" : <>Submit Application <span className="arr">→</span></>}
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

      {started && !isReviewStep && step && (
        <div className={`onboarding-step ${transitioning ? "out" : ""}`}>
          <span className="eyebrow">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <h2 className="h3">{step.question}</h2>
          {step.subtitle && <p className="lead">{step.subtitle}</p>}

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

          {(step.type === "text" || step.type === "tel") && (
            <div className="onboarding-actions">
              <div className="onboarding-field" style={{ width: "100%" }}>
                <label htmlFor="step-input" className="sr-only">{step.question}</label>
                <input
                  id="step-input"
                  key={step.key}
                  type={step.key === "ssn" ? "password" : step.key === "personalEmail" ? "email" : "text"}
                  inputMode={
                    step.key === "dateOfBirth" || step.key === "phoneNumber" || step.key === "ssn"
                      ? "numeric"
                      : step.key === "personalEmail"
                        ? "email"
                        : undefined
                  }
                  placeholder={step.placeholder}
                  value={currentValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  autoComplete={
                    step.key === "legalName"
                      ? "name"
                      : step.key === "phoneNumber"
                        ? "tel"
                        : step.key === "personalEmail"
                          ? "email"
                          : "off"
                  }
                />
                {validationError && <p className="onboarding-error">{validationError}</p>}
              </div>
              <button
                type="button"
                className="btn btn-accent"
                onClick={handleSubmit}
                disabled={!canAdvance || loading}
                style={{ opacity: canAdvance && !loading ? 1 : 0.4 }}
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
                  setCurrentStep((s) => s - 1);
                }
              }}
            >
              ← {returnToReview ? "Back to review" : "Back"}
            </button>
          )}
        </div>
      )}
    </OnboardingLayout>
  );
}
