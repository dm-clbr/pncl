import { cloneElement, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";

type FieldProps = {
  /** Sits above the control, 13/600. */
  label: string;
  /** Ties the label, the hint, the error and the control together. */
  id: string;
  /** One quiet line under the label. */
  hint?: string;
  /** Message under the control. Sets aria-invalid and announces itself. */
  error?: string;
  /** One control: a select, a textarea, anything. Without it Field renders an input. */
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "children">;

/** One labelled control. Styles under .portal-field in
    src/styles/portal-primitives.css: label above, control 44px tall at 16px so
    iOS Safari does not zoom on focus, error under it. Pass `children` to wrap a
    select or a textarea (they keep the native picker), or leave it out and the
    rest of the props spread onto an input: type, inputMode, autoComplete,
    value, onChange, placeholder. Focusing the first error on submit is the
    form's job; Field only marks it. */
export default function Field({ label, id, hint, error, required, children, ...input }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const wiring = {
    id,
    required,
    "aria-describedby": [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : undefined,
  };

  return (
    <div className={`portal-field${error ? " is-invalid" : ""}`}>
      <label className="portal-field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="portal-field-req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p className="portal-field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {/* ponytail: cloneElement fills the wiring the child did not set for
          itself, so a caller's own id or aria-describedby still wins. */}
      {children === undefined ? (
        <input className="portal-input" {...wiring} {...input} />
      ) : isValidElement(children) ? (
        cloneElement(children as ReactElement, { ...wiring, ...(children as ReactElement).props })
      ) : (
        children
      )}
      {error && (
        <p className="portal-field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
