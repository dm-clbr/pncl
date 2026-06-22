import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PinnacleFormPreview from "@/components/PinnacleFormPreview";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  EMPTY_CLIENT_INTAKE,
  getActiveIntakeSteps,
  getSecondaryStepValue,
  getStepValue,
  setSecondaryStepValue,
  setStepValue,
  submitPortalClient,
  validateIntakeStep,
  formatReviewValue,
  type ClientIntakeFormData,
} from "@/lib/client-intake";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/onboarding.css";
import "@/styles/client-intake.css";

export default function PortalClientIntake() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<ClientIntakeFormData>(EMPTY_CLIENT_INTAKE);
  const [transitioning, setTransitioning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);

  const activeSteps = useMemo(() => getActiveIntakeSteps(data), [data]);
  const totalSteps = activeSteps.length + 1;
  const isReviewStep = started && currentStep >= activeSteps.length;
  const step = isReviewStep ? null : activeSteps[currentStep] ?? null;
  const progress = started ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const currentValue = step ? getStepValue(step, data) : "";
  const secondaryValue = step ? getSecondaryStepValue(step, data) : "";

  useEffect(() => {
    if (currentStep >= activeSteps.length && !isReviewStep && started) {
      setCurrentStep(Math.max(activeSteps.length - 1, 0));
    }
  }, [activeSteps.length, currentStep, isReviewStep, started]);

  const validationError = useMemo(() => {
    if (!step) return null;
    return validateIntakeStep(step, data);
  }, [step, data]);

  const canAdvance = useMemo(() => {
    if (!step) return false;
    if (step.type === "dual") {
      return (
        (!step.required || (currentValue.trim() && secondaryValue.trim()))
        && !validationError
      );
    }
    if (step.type === "yesno" || step.type === "select") return !!currentValue;
    if (step.required) return !!currentValue.trim() && !validationError;
    return !validationError;
  }, [step, currentValue, secondaryValue, validationError]);

  const advance = () => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep((index) => Math.min(index + 1, activeSteps.length));
      setTransitioning(false);
    }, 350);
  };

  const goToStep = (index: number, fromReview = false) => {
    setReturnToReview(fromReview);
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep(Math.min(index, activeSteps.length));
      setTransitioning(false);
    }, 350);
  };

  const finishStep = () => {
    if (returnToReview) {
      setReturnToReview(false);
      goToStep(activeSteps.length);
      return;
    }
    advance();
  };

  const handleYesNo = (value: string) => {
    if (!step) return;
    setData((prev) => setStepValue(step, value, prev));
    setTimeout(finishStep, 200);
  };

  const handleSelect = (value: string) => {
    if (!step) return;
    setData((prev) => setStepValue(step, value, prev));
    setTimeout(finishStep, 200);
  };

  const handleInputChange = (raw: string) => {
    if (!step) return;
    setData((prev) => setStepValue(step, raw, prev));
  };

  const handleSecondaryInputChange = (raw: string) => {
    if (!step) return;
    setData((prev) => setSecondaryStepValue(step, raw, prev));
  };

  const handleSubmit = () => {
    if (!step || !canAdvance) return;
    if (currentStep < activeSteps.length - 1 || returnToReview) {
      finishStep();
      return;
    }
    advance();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter"
      && step
      && step.type !== "yesno"
      && step.type !== "select"
      && step.type !== "textarea"
      && step.type !== "dual"
    ) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const performSubmit = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const record = await submitPortalClient(user.id, data);
      toast.success(`${record.primary_first_name} ${record.primary_last_name} saved.`);
      navigate("/portal/clients", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save client.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Client Intake — PNCL Portal";
    trackPageView("portal_client_intake");
  }, []);

  return (
    <div className="home2-page onboarding-page">
      <div className="grain" aria-hidden="true" />

      <header className="nav scrolled">
        <div className="bar">
          <Link to="/portal" className="lockup" aria-label="PNCL portal">
            <PNCLLogo height={24} />
          </Link>
          <Link to="/portal/clients" className="btn btn-ghost">
            <ArrowLeft size={16} aria-hidden="true" />
            My clients
          </Link>
        </div>
      </header>

      {started && progress > 0 && (
        <div className="onboarding-progress" aria-hidden="true">
          <div className="onboarding-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <main className="onboarding-main">
        <div className={`onboarding-panel${isReviewStep ? " onboarding-panel-wide" : ""}`}>
          {!started && (
            <div className="onboarding-step">
              <span className="eyebrow">Financial inventory</span>
              <h2 className="h2">Client intake form</h2>
              <p className="lead">
                Walk through the Utah financial inventory script (questions 1–16) with your client.
                After the script, fill in the remaining Pinnacle form fields, then review the completed
                form before saving.
              </p>
              <button type="button" className="btn btn-accent btn-lg" onClick={() => setStarted(true)}>
                Start intake <span className="arr">→</span>
              </button>
            </div>
          )}

          {started && isReviewStep && (
            <div className={`onboarding-step ${transitioning ? "out" : ""}`}>
              <span className="eyebrow">Review</span>
              <h2 className="h3">Pinnacle form preview</h2>
              <p className="lead">
                Confirm everything looks correct on the form below. You can edit individual answers
                before submitting.
              </p>

              <PinnacleFormPreview data={data} />

              <details className="onboarding-review-details" style={{ marginTop: "1.5rem" }}>
                <summary>Edit individual answers</summary>
                <ul className="onboarding-review-list" style={{ marginTop: "1rem" }}>
                  {activeSteps.map((reviewStep, index) => (
                    <li key={`${String(reviewStep.key)}-${index}`} className="onboarding-review-row">
                      <div className="onboarding-review-content">
                        <span className="onboarding-review-label">{reviewStep.question}</span>
                        <span className="onboarding-review-value">
                          {formatReviewValue(reviewStep, data)}
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
              </details>

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => void performSubmit()}
                  disabled={loading}
                >
                  {loading ? "Saving…" : <>Save client <span className="arr">→</span></>}
                </button>
              </div>

              <button
                type="button"
                className="onboarding-back"
                onClick={() => goToStep(activeSteps.length - 1)}
              >
                ← Back
              </button>
            </div>
          )}

          {started && !isReviewStep && step && (
            <div className={`onboarding-step ${transitioning ? "out" : ""}`}>
              <span className="eyebrow">
                {step.scriptQuestion
                  ? `Question ${step.scriptQuestion}`
                  : step.section ?? "Intake"}
                {" · "}
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
                  <label htmlFor="intake-select" className="sr-only">{step.question}</label>
                  <select
                    id="intake-select"
                    value={currentValue}
                    onChange={(e) => handleSelect(e.target.value)}
                    autoFocus
                  >
                    <option value="" disabled>
                      Choose an option
                    </option>
                    {step.options!.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {step.type === "dual" && (
                <div className="onboarding-actions">
                  <div className="onboarding-field" style={{ width: "100%" }}>
                    <label htmlFor="intake-height" className="sr-only">Height</label>
                    <input
                      id="intake-height"
                      type="text"
                      placeholder={step.placeholder ?? "Height"}
                      value={currentValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                  <div className="onboarding-field" style={{ width: "100%" }}>
                    <label htmlFor="intake-weight" className="sr-only">Weight</label>
                    <input
                      id="intake-weight"
                      type="text"
                      placeholder={step.secondaryPlaceholder ?? "Weight"}
                      value={secondaryValue}
                      onChange={(e) => handleSecondaryInputChange(e.target.value)}
                      autoComplete="off"
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
                      : currentStep === activeSteps.length - 1
                        ? <>Review form <span className="arr">→</span></>
                        : <>Continue <span className="arr">→</span></>}
                  </button>
                </div>
              )}

              {(step.type === "text" || step.type === "tel") && (
                <div className="onboarding-actions">
                  <div className="onboarding-field" style={{ width: "100%" }}>
                    <label htmlFor="intake-input" className="sr-only">{step.question}</label>
                    <input
                      id="intake-input"
                      key={String(step.key)}
                      type={
                        step.key === "primarySsn" || step.key === "spouseSsn"
                          ? "password"
                          : "text"
                      }
                      inputMode={
                        step.type === "tel"
                          || step.key === "primaryDob"
                          || step.key === "spouseDob"
                          || step.key === "dateMet"
                          || step.key === "effDate"
                          ? "numeric"
                          : undefined
                      }
                      placeholder={step.placeholder}
                      value={currentValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      autoComplete="off"
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
                      : currentStep === activeSteps.length - 1
                        ? <>Review form <span className="arr">→</span></>
                        : <>Continue <span className="arr">→</span></>}
                  </button>
                </div>
              )}

              {step.type === "textarea" && (
                <div className="onboarding-actions">
                  <div className="onboarding-field" style={{ width: "100%" }}>
                    <label htmlFor="intake-textarea" className="sr-only">{step.question}</label>
                    <textarea
                      id="intake-textarea"
                      key={String(step.key)}
                      className="client-intake-textarea"
                      placeholder={step.placeholder}
                      value={currentValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      autoFocus
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
                      : currentStep === activeSteps.length - 1
                        ? <>Review form <span className="arr">→</span></>
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
                      goToStep(activeSteps.length);
                    } else {
                      setCurrentStep((index) => Math.max(index - 1, 0));
                    }
                  }}
                >
                  ← {returnToReview ? "Back to review" : "Back"}
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
