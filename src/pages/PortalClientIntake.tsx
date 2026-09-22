import { useEffect, useMemo, useRef, useState } from "react";
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

/** Above the mobile breakpoint a screen carries up to three questions; at 620px
    and below it stays one per screen. */
const DESKTOP_QUERY = "(min-width: 621px)";
const DESKTOP_GROUP = 3;

/** The gate that used to be the canAdvance memo, now per step so a screen with
    several questions can ask the same question of each one. Same rules. */
function stepIsAnswered(
  step: ClientIntakeStep,
  value: string,
  secondary: string,
  error: string | null,
): boolean {
  if (step.type === "dual") {
    return (!step.required || (!!value.trim() && !!secondary.trim())) && !error;
  }
  if (step.type === "yesno" || step.type === "select") return !!value;
  if (step.required) return !!value.trim() && !error;
  return !error;
}

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
  /* ponytail: one list of keys for the screen, cleared whenever the screen
     changes, instead of a touched flag per control. */
  const [touchedKeys, setTouchedKeys] = useState<string[]>([]);
  const [groupSize, setGroupSize] = useState(1);
  /* Group starts, so Back returns to the screen the agent actually saw. A
     branch answer can change how many questions the previous screen held. */
  const backStack = useRef<number[]>([]);

  /* ponytail: matchMedia, not a resize listener. Mobile is the default, so the
     first paint is one question per screen everywhere. */
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setGroupSize(mq.matches ? DESKTOP_GROUP : 1);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const activeSteps = useMemo(() => getActiveIntakeSteps(data), [data]);
  const totalSteps = activeSteps.length + 1;
  const isReviewStep = started && currentStep >= activeSteps.length;
  const progress = started ? ((currentStep + 1) / totalSteps) * 100 : 0;

  /** The questions on this screen. A yes/no or select answer can reveal or hide
      later questions, so it always ends the screen it sits on. */
  const groupSteps = useMemo(() => {
    if (isReviewStep) return [] as ClientIntakeStep[];
    const group: ClientIntakeStep[] = [];
    for (let i = currentStep; i < activeSteps.length && group.length < groupSize; i += 1) {
      const next = activeSteps[i];
      group.push(next);
      if (next.type === "yesno" || next.type === "select") break;
    }
    return group;
  }, [activeSteps, currentStep, groupSize, isReviewStep]);

  const groupState = useMemo(
    () =>
      groupSteps.map((groupStep) => {
        const value = getStepValue(groupStep, data);
        const secondary = getSecondaryStepValue(groupStep, data);
        const error = validateIntakeStep(groupStep, data);
        return {
          step: groupStep,
          value,
          secondary,
          error,
          answered: stepIsAnswered(groupStep, value, secondary, error),
        };
      }),
    [groupSteps, data],
  );

  const canAdvance = groupState.length > 0 && groupState.every((entry) => entry.answered);

  useEffect(() => {
    if (currentStep >= activeSteps.length && !isReviewStep && started) {
      setCurrentStep(Math.max(activeSteps.length - 1, 0));
    }
  }, [activeSteps.length, currentStep, isReviewStep, started]);

  /* A new screen starts pristine: nothing is an error until it is touched. */
  useEffect(() => {
    setTouchedKeys([]);
  }, [currentStep]);

  const advance = (by: number) => {
    backStack.current.push(currentStep);
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep((index) => Math.min(index + by, activeSteps.length));
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

  const goBack = () => {
    const previous = backStack.current.pop();
    setCurrentStep((index) => (previous ?? Math.max(index - 1, 0)));
  };

  const finishStep = () => {
    if (returnToReview) {
      setReturnToReview(false);
      goToStep(activeSteps.length);
      return;
    }
    advance(Math.max(groupSteps.length, 1));
  };

  const handleYesNo = (target: ClientIntakeStep, value: string) => {
    setData((prev) => setStepValue(target, value, prev));
    setTimeout(finishStep, 200);
  };

  const handleSelect = (target: ClientIntakeStep, value: string) => {
    setData((prev) => setStepValue(target, value, prev));
    setTimeout(finishStep, 200);
  };

  const touch = (target: ClientIntakeStep) => {
    const key = String(target.key);
    setTouchedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const handleInputChange = (target: ClientIntakeStep, raw: string) => {
    touch(target);
    setData((prev) => setStepValue(target, raw, prev));
  };

  const handleSecondaryInputChange = (target: ClientIntakeStep, raw: string) => {
    touch(target);
    setData((prev) => setSecondaryStepValue(target, raw, prev));
  };

  const handleSubmit = () => {
    if (!canAdvance) return;
    finishStep();
  };

  /* ponytail: index into the rendered controls beats a ref per field. Each
     question owns one .pintake-control, in screen order. */
  const focusFirstError = () => {
    const controls = document.querySelectorAll<HTMLElement>(".pintake-control");
    const firstBad = groupState.findIndex((entry) => !entry.answered);
    const scope = controls[firstBad >= 0 ? firstBad : 0];
    scope?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
  };

  /** The advance button stays clickable while the screen is invalid, so the
      "focus the first error on submit" rule has a path. Validation itself is
      unchanged: handleSubmit still refuses to move on an invalid screen. */
  const handleAdvanceClick = () => {
    if (!canAdvance) {
      setTouchedKeys(groupSteps.map((groupStep) => String(groupStep.key)));
      focusFirstError();
      return;
    }
    handleSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent, target: ClientIntakeStep) => {
    if (
      e.key === "Enter"
      && target.type !== "yesno"
      && target.type !== "select"
      && target.type !== "textarea"
      && target.type !== "dual"
    ) {
      e.preventDefault();
      if (!canAdvance) {
        setTouchedKeys(groupSteps.map((groupStep) => String(groupStep.key)));
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

  const stage = isReviewStep ? 3 : groupSteps[0]?.section === FORM_SECTION ? 2 : 1;

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
    : currentStep + groupSteps.length >= activeSteps.length
      ? "Review form"
      : "Continue";

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

          {started && !isReviewStep && groupState.length > 0 && (
            <div className={`ptools-stack pintake-screen${transitioning ? " out" : ""}`}>
              {groupState.map(({ step, value, secondary, error }, offset) => {
                /* A pristine required question is not an error yet: announce it
                   only once the agent has typed in it or tried to advance. */
                const showError = !!error && touchedKeys.includes(String(step.key));
                const errorId = `${ERROR_ID}-${offset}`;
                const errorProps = showError
                  ? { "aria-invalid": true as const, "aria-describedby": errorId }
                  : {};
                /* Dual steps hold two fields behind one message. Flag the empty
                   one, or both when the message is about the pair. */
                const dualErrorProps = (field: string) =>
                  showError && (!field.trim() || (!!value.trim() && !!secondary.trim()))
                    ? errorProps
                    : {};
                const stepError = showError && (
                  <p className="portal-field-error" id={errorId} role="alert">
                    {error}
                  </p>
                );
                const stepId = `intake-${offset}`;

                return (
                  <div key={`${String(step.key)}-${currentStep + offset}`}>
                    <p className="pintake-eyebrow">
                      {step.scriptQuestion
                        ? `Question ${step.scriptQuestion}`
                        : step.section ?? "Intake"}
                    </p>

                    <Pane
                      title={step.question}
                      aside={
                        <span className="pintake-count">
                          Step {currentStep + offset + 1} of {totalSteps}
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
                                className={`pintake-option${value === opt ? " selected" : ""}`}
                                aria-pressed={value === opt}
                                onClick={() => handleYesNo(step, opt)}
                                disabled={loading}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}

                        {step.type === "select" && (
                          <>
                            <label htmlFor={stepId} className="portal-sr">{step.question}</label>
                            <select
                              id={stepId}
                              className="portal-select"
                              value={value}
                              onChange={(e) => handleSelect(step, e.target.value)}
                              autoFocus={offset === 0}
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
                            <label htmlFor={`${stepId}-a`} className="portal-sr">Height</label>
                            <input
                              id={`${stepId}-a`}
                              className="portal-input"
                              type="text"
                              placeholder={step.placeholder ?? "Height"}
                              value={value}
                              onChange={(e) => handleInputChange(step, e.target.value)}
                              autoFocus={offset === 0}
                              autoComplete="off"
                              {...dualErrorProps(value)}
                            />
                            <label htmlFor={`${stepId}-b`} className="portal-sr">Weight</label>
                            <input
                              id={`${stepId}-b`}
                              className="portal-input"
                              type="text"
                              placeholder={step.secondaryPlaceholder ?? "Weight"}
                              value={secondary}
                              onChange={(e) => handleSecondaryInputChange(step, e.target.value)}
                              autoComplete="off"
                              {...dualErrorProps(secondary)}
                            />
                            {stepError}
                          </div>
                        )}

                        {(step.type === "text" || step.type === "tel") && (
                          <>
                            <label htmlFor={stepId} className="portal-sr">{step.question}</label>
                            <input
                              id={stepId}
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
                              value={value}
                              onChange={(e) => handleInputChange(step, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, step)}
                              autoFocus={offset === 0}
                              autoComplete="off"
                              {...errorProps}
                            />
                            {stepError}
                          </>
                        )}

                        {step.type === "textarea" && (
                          <>
                            <label htmlFor={stepId} className="portal-sr">{step.question}</label>
                            <textarea
                              id={stepId}
                              key={String(step.key)}
                              className="portal-textarea"
                              placeholder={step.placeholder}
                              value={value}
                              onChange={(e) => handleInputChange(step, e.target.value)}
                              autoFocus={offset === 0}
                              {...errorProps}
                            />
                            {stepError}
                          </>
                        )}
                      </div>
                    </Pane>
                  </div>
                );
              })}

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
                        goBack();
                      }
                    }}
                  >
                    {returnToReview ? "Back to review" : "Back"}
                  </button>
                )}
                <button
                  type="button"
                  className="ptools-cta pintake-next"
                  onClick={handleAdvanceClick}
                  aria-disabled={!canAdvance}
                  disabled={loading}
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
