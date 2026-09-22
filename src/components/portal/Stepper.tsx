type StepperProps = {
  /** Step labels in order; five for the onboarding stages. */
  steps: readonly string[];
  /** 1-based number of the step in progress. Earlier steps read as done. */
  current: number;
  /** With a handler every step becomes a 44px button; without one the list is static. */
  onSelect?: (step: number) => void;
  label?: string;
};

/** Stage progress as an ordered list. Styles under .portal-stepper in
    src/styles/portal-primitives.css. */
export default function Stepper({ steps, current, onSelect, label = "Progress" }: StepperProps) {
  return (
    <ol className="portal-stepper" aria-label={label}>
      {steps.map((name, index) => {
        const step = index + 1;
        const state = step < current ? "done" : step === current ? "current" : "todo";
        const content = (
          <>
            <span className="portal-step-num" aria-hidden="true">
              {String(step).padStart(2, "0")}
            </span>
            <span className="portal-step-label">{name}</span>
            {state === "done" && <span className="portal-sr">, completed</span>}
          </>
        );
        return (
          <li
            key={name}
            className={`portal-step is-${state}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            {onSelect ? (
              <button type="button" className="portal-step-inner" onClick={() => onSelect(step)}>
                {content}
              </button>
            ) : (
              <span className="portal-step-inner">{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
