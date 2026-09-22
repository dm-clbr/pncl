import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/portal/BottomNav";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Stepper from "@/components/portal/Stepper";
import PinnacleFormPreview from "@/components/PinnacleFormPreview";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalProfile } from "@/hooks/usePortalProfile";
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
  type ClientIntakeStep,
} from "@/lib/client-intake";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/portal-tools.css";
import "@/styles/client-intake.css";

/** Three stages, not 100 steps: the script, the rest of the Pinnacle form, the
    review. Section names come from the step table in lib/client-intake. */
const STAGES = ["Script", "Form", "Review"] as const;
const FORM_SECTION = "Pinnacle form";
const ERROR_ID = "intake-error";

export default function PortalClientIntake() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { photoUrl, initials, displayName } = usePortalProfile(user);
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

  /* ponytail: one DOM query beats a ref per control. One question is on screen
     at a time, so the first aria-invalid element is the first error. */
  const focusFirstError = () => {
    document.querySelector<HTMLElement>('.pintake-control [aria-invalid="true"]')?.focus();
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
      if (!canAdvance) {
        focusFirstError();
        return;
      }
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

  const stage = isReviewStep ? 3 : step?.section === FORM_SECTION ? 2 : 1;

  /** Review answers in wizard order, grouped by the section they came from.
      The index is the one goToStep needs, so the group keeps it. */
  const reviewGroups = useMemo(() => {
    const groups: { title: string; items: { step: ClientIntakeStep; index: number }[] }[] = [];
    activeSteps.forEach((reviewStep, index) => {
      const title = reviewStep.section ?? "Intake";
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.items.push({ step: reviewStep, index });
      else groups.push({ title, items: [{ step: reviewStep, index }] });
    });
    return groups;
  }, [activeSteps]);

  const advanceLabel = returnToReview
    ? "Save and return"
    : currentStep === activeSteps.length - 1
      ? "Review form"
      : "Continue";

  const errorProps = validationError
    ? { "aria-invalid": true as const, "aria-describedby": ERROR_ID }
    : {};

  const stepError = validationError && (
    <p className="portal-field-error" id={ERROR_ID} role="alert">
      {validationError}
    </p>
  );

  return (
    <div className="home2-page ptools-page pintake-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark">
        <div className={`wrap pintake-wrap${isReviewStep ? " pintake-wrap-wide" : ""}`}>
          <PortalHeader
            name={displayName}
            email={user?.email}
            initials={initials}
            photoUrl={photoUrl}
          />

          <PortalSubpageHeader
            title="Client intake"
            backTo="/portal/clients"
            backLabel="My clients"
          />

          <Stepper steps={STAGES} current={stage} label="Intake stages" />

          {started && progress > 0 && (
            <div className="pintake-progress" aria-hidden="true">
              <div className="pintake-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          {!started && (
            <div className="ptools-stack">
              <Pane title="Client intake form">
                <p className="pintake-lede">
                  Walk through the Utah financial inventory script (questions 1 to 16) with your
                  client. After the script, fill in the remaining Pinnacle form fields, then review
                  the completed form before saving.
                </p>
                <button
                  type="button"
                  className="ptools-cta pintake-start"
                  onClick={() => setStarted(true)}
                >
                  Start intake
                </button>
              </Pane>
            </div>
          )}

          {started && isReviewStep && (
            <div className={`ptools-stack pintake-screen${transitioning ? " out" : ""}`}>
              <Pane title="Pinnacle form preview">
                <p className="pintake-lede">
                  Confirm everything looks correct on the form below. Edit any answer and you come
                  straight back here.
                </p>
                <PinnacleFormPreview data={data} />
              </Pane>

              <Pane
                title="Answers"
                aside={<span className="pintake-count">{activeSteps.length} questions</span>}
              >
                {reviewGroups.map((group) => (
                  <details key={group.title} className="pintake-answers">
                    <summary className="pintake-answers-summary">
                      <span>{group.title}</span>
                      <span className="pintake-count">{group.items.length}</span>
                    </summary>
                    <div className="ptools-rows">
                      {group.items.map(({ step: reviewStep, index }) => (
                        <ListRow
                          key={`${String(reviewStep.key)}-${index}`}
                          label={reviewStep.question}
                          secondary={formatReviewValue(reviewStep, data)}
                          onClick={() => goToStep(index, true)}
                          trailing={<span className="pintake-edit">Edit</span>}
                        />
                      ))}
                    </div>
                  </details>
                ))}
              </Pane>

              <div className="pintake-bar">
                <button
                  type="button"
                  className="ptools-cta pintake-back"
                  onClick={() => goToStep(activeSteps.length - 1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="ptools-cta pintake-next"
                  onClick={() => void performSubmit()}
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save client"}
                </button>
              </div>
            </div>
          )}

          {started && !isReviewStep && step && (
            <div className={`ptools-stack pintake-screen${transitioning ? " out" : ""}`}>
              <p className="pintake-eyebrow">
                {step.scriptQuestion
                  ? `Question ${step.scriptQuestion}`
                  : step.section ?? "Intake"}
              </p>

              <Pane
                title={step.question}
                aside={
                  <span className="pintake-count">
                    Step {currentStep + 1} of {totalSteps}
                  </span>
                }
              >
                {step.subtitle && <p className="pintake-lede">{step.subtitle}</p>}

                <div className="pintake-control">
                  {step.type === "yesno" && (
                    <div className="pintake-options">
                      {step.options!.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`pintake-option${currentValue === opt ? " selected" : ""}`}
                          aria-pressed={currentValue === opt}
                          onClick={() => handleYesNo(opt)}
                          disabled={loading}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {step.type === "select" && (
                    <>
                      <label htmlFor="intake-select" className="portal-sr">{step.question}</label>
                      <select
                        id="intake-select"
                        className="portal-select"
                        value={currentValue}
                        onChange={(e) => handleSelect(e.target.value)}
                        autoFocus
                        {...errorProps}
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
                      {stepError}
                    </>
                  )}

                  {step.type === "dual" && (
                    <div className="pintake-dual">
                      <label htmlFor="intake-height" className="portal-sr">Height</label>
                      <input
                        id="intake-height"
                        className="portal-input"
                        type="text"
                        placeholder={step.placeholder ?? "Height"}
                        value={currentValue}
                        onChange={(e) => handleInputChange(e.target.value)}
                        autoFocus
                        autoComplete="off"
                        {...errorProps}
                      />
                      <label htmlFor="intake-weight" className="portal-sr">Weight</label>
                      <input
                        id="intake-weight"
                        className="portal-input"
                        type="text"
                        placeholder={step.secondaryPlaceholder ?? "Weight"}
                        value={secondaryValue}
                        onChange={(e) => handleSecondaryInputChange(e.target.value)}
                        autoComplete="off"
                        {...errorProps}
                      />
                      {stepError}
                    </div>
                  )}

                  {(step.type === "text" || step.type === "tel") && (
                    <>
                      <label htmlFor="intake-input" className="portal-sr">{step.question}</label>
                      <input
                        id="intake-input"
                        key={String(step.key)}
                        className="portal-input"
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
                        {...errorProps}
                      />
                      {stepError}
                    </>
                  )}

                  {step.type === "textarea" && (
                    <>
                      <label htmlFor="intake-textarea" className="portal-sr">{step.question}</label>
                      <textarea
                        id="intake-textarea"
                        key={String(step.key)}
                        className="portal-textarea client-intake-textarea"
                        placeholder={step.placeholder}
                        value={currentValue}
                        onChange={(e) => handleInputChange(e.target.value)}
                        autoFocus
                        {...errorProps}
                      />
                      {stepError}
                    </>
                  )}
                </div>
              </Pane>

              <div className="pintake-bar">
                {(currentStep > 0 || returnToReview) && (
                  <button
                    type="button"
                    className="ptools-cta pintake-back"
                    onClick={() => {
                      if (returnToReview) {
                        setReturnToReview(false);
                        goToStep(activeSteps.length);
                      } else {
                        setCurrentStep((index) => Math.max(index - 1, 0));
                      }
                    }}
                  >
                    {returnToReview ? "Back to review" : "Back"}
                  </button>
                )}
                <button
                  type="button"
                  className="ptools-cta pintake-next"
                  onClick={handleSubmit}
                  disabled={!canAdvance || loading}
                >
                  {advanceLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
