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
  /** One control: a select, a textarea, anything. Without it Field renders an
      input. The remaining props are forwarded to it either way. */
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "children">;

/** One labelled control. Styles under .portal-field in
    src/styles/portal-primitives.css: label above, control 44px tall at 16px so
    iOS Safari does not zoom on focus, error under it. The rest of the props
    (type, inputMode, autoComplete, value, onChange, disabled, placeholder)
    reach the control either way: onto the input Field renders, or onto the
    `children` control that replaces it, so a select or a textarea keeps the
    native picker and still gets the handlers. Focusing the first error on
    submit is the form's job; Field only marks it. */
export default function Field({ label, id, hint, error, required, children, ...input }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  // Field owns the wiring: the label's htmlFor points at `id`, so a control
  // that brought its own id would leave the label pointing at nothing. Keys
  // with no value are left out rather than spread as undefined, so a child
  // keeps its own aria-describedby when this Field has no hint and no error.
  const wiring = {
    id,
    ...(required !== undefined && { required }),
    ...(describedBy && { "aria-describedby": describedBy }),
    ...(error && { "aria-invalid": true }),
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
      {/* ponytail: one cloneElement instead of a context. The props the child
          set for itself beat the ones passed to Field, and the wiring beats
          both, because the label and the error point at it by id. */}
      {children === undefined ? (
        <input className="portal-input" {...wiring} {...input} />
      ) : isValidElement(children) ? (
        cloneElement(children as ReactElement, {
          ...input,
          ...(children as ReactElement).props,
          ...wiring,
        })
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
