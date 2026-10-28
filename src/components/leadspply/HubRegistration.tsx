import { useState } from "react";
import Field from "@/components/portal/Field";
import RegistrationTerms from "./RegistrationTerms";
import {
  emptyRegistration,
  type Registration,
  US_STATES,
} from "@/lib/hub-account-setup";
type Props = {
  email: string;
  busy: boolean;
  cooldown?: boolean;
  run: (body: Record<string, unknown>) => Promise<boolean>;
};
export default function HubRegistration({ email, busy, cooldown = false, run }: Props) {
  const [r, setR] = useState<Registration>({ ...emptyRegistration });
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState("");
  const [confirm, setConfirm] = useState("");
  const field = (
    key: keyof Registration,
    label: string,
    extra: Record<string, unknown> = {},
  ) => (
    <Field
      key={key}
      id={"signup-" + key}
      label={label}
      required
      value={String(r[key])}
      onChange={(e) => setR({ ...r, [key]: e.target.value })}
      {...extra}
    />
  );
  return (
    <form
      className="hub-setup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (confirm !== r.password || verified !== r.phone) return;
        await run({
          action: "register",
          expectedEmail: email,
          registration: r,
        });
        setR((current) => ({ ...current, password: "" }));
        setConfirm("");
      }}
    >
      <fieldset disabled={busy || cooldown} className="hub-setup-fields">
        <legend>Create your LeadSpply account</legend>
        <p>
          Your login email will be{" "}
          <strong>{email}</strong>. Account approval is still required.
        </p>
        <Field id="signup-kind" label="Account type">
          <select
            className="portal-input"
            value={r.kind}
            onChange={(e) =>
              setR({ ...r, kind: e.target.value as Registration["kind"] })}
          >
            <option value="rep">Licensed agent</option>
            <option value="setter">Unlicensed setter</option>
          </select>
        </Field>
        {r.kind === "setter" &&
          field("inviteCode", "Your approved agent’s invite code")}
        <div className="hub-setup-grid">
          {field("firstName", "First name", {
            autoComplete: "given-name",
            maxLength: 100,
          })}
          {field("lastName", "Last name", {
            autoComplete: "family-name",
            maxLength: 100,
          })}
        </div>
        <Field
          id="signup-phone"
          label="Mobile phone"
          hint="Use +1 followed by your 10-digit number. We’ll send a verification text when you select Send code."
          type="tel"
          autoComplete="tel"
          required
          pattern="\+1[0-9]{10}"
          value={r.phone}
          onChange={(e) => {
            setR({ ...r, phone: e.target.value });
            setSent(false);
            setVerified("");
            setCode("");
          }}
        />
        <button
          className="ptools-cta"
          type="button"
          disabled={!/^\+1\d{10}$/.test(r.phone)}
          onClick={async () => {
            if (await run({ action: "phone_start", phone: r.phone })) {
              setSent(true);
              setVerified("");
            }
          }}
        >
          Send verification code
        </button>
        {sent && verified !== r.phone && (
          <div className="hub-setup-grid">
            <Field
              id="signup-code"
              label="Phone verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="ptools-cta"
              type="button"
              disabled={!/^\d{4,8}$/.test(code)}
              onClick={async () => {
                if (
                  await run({ action: "phone_check", phone: r.phone, code })
                ) {
                  setVerified(r.phone);
                  setCode("");
                }
              }}
            >
              Verify phone
            </button>
          </div>
        )}
        {verified && verified === r.phone && (
          <p role="status">
            Phone verified. Complete registration within 10 minutes.
          </p>
        )}
        {r.kind === "rep" && (
          <>
            {field("npn", "NPN", {
              inputMode: "numeric",
              pattern: "[0-9]{1,12}",
              maxLength: 12,
            })}
            <fieldset className="hub-setup-fields">
              <legend>Licensed states</legend>
              <div className="hub-setup-states">
                {US_STATES.map((state) => (
                  <label key={state}>
                    <input
                      type="checkbox"
                      checked={r.states.includes(state)}
                      onChange={(e) =>
                        setR({
                          ...r,
                          states: e.target.checked
                            ? [...r.states, state]
                            : r.states.filter((s) => s !== state),
                        })}
                    />
                    {state}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="signup-business-type" label="Business registration">
              <select
                className="portal-input"
                value={r.businessType}
                onChange={(e) =>
                  setR({
                    ...r,
                    businessType: e.target
                      .value as Registration["businessType"],
                  })}
              >
                <option value="sole_proprietor">Sole proprietor</option>
                <option value="business">Registered business</option>
              </select>
            </Field>
            {r.businessType === "business" && (
              <div className="hub-setup-grid">
                {field("businessName", "Legal business name")}
                {field("ein", "EIN (9 digits)", {
                  pattern: "[0-9]{9}",
                  maxLength: 9,
                })}
              </div>
            )}
            {field("address", "Business street address", {
              autoComplete: "street-address",
            })}
            <div className="hub-setup-grid">
              {field("city", "City", { autoComplete: "address-level2" })}
              <Field id="signup-state" label="State" required>
                <select
                  className="portal-input"
                  required
                  value={r.state}
                  onChange={(e) => setR({ ...r, state: e.target.value })}
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              {field("postal", "ZIP code", {
                autoComplete: "postal-code",
                pattern: "[0-9]{5}(-[0-9]{4})?",
              })}
            </div>
          </>
        )}
        {field("password", "Choose a LeadSpply password", {
          type: "password",
          autoComplete: "new-password",
          minLength: 8,
          maxLength: 128,
          hint:
            "At least 8 characters, including an uppercase letter and a number.",
        })}
        <Field
          id="signup-confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && confirm !== r.password
            ? "Passwords do not match."
            : undefined}
        />
        <RegistrationTerms />
        <label>
          <input
            type="checkbox"
            required
            checked={r.terms}
            onChange={(e) => setR({ ...r, terms: e.target.checked })}
          />{" "}
          I agree to the LeadSpply Terms and Conditions.
        </label>
        <label>
          <input
            type="checkbox"
            required
            checked={r.agreement}
            onChange={(e) => setR({ ...r, agreement: e.target.checked })}
          />{" "}
          I agree to the LeadSpply Agent Agreement.
        </label>
        <label>
          <input
            type="checkbox"
            checked={r.smsService}
            onChange={(e) => setR({ ...r, smsService: e.target.checked })}
          />{" "}
          I agree to receive account and service texts from LeadSpply
          (optional).
        </label>
        <label>
          <input
            type="checkbox"
            checked={r.smsMarketing}
            onChange={(e) => setR({ ...r, smsMarketing: e.target.checked })}
          />{" "}
          I agree to receive marketing texts from LeadSpply (optional).
        </label>
        <p className="portal-panel-note">
          Message and data rates may apply. Reply STOP to opt out or HELP for
          help. Consent is not a condition of purchase.
        </p>
        <button
          className="ptools-cta is-primary"
          type="submit"
          disabled={verified !== r.phone || !r.terms || !r.agreement ||
            r.password !== confirm || !r.password ||
            r.kind === "rep" && !r.states.length}
        >
          {busy ? "Creating account…" : "Create account with my Hub email"}
        </button>
      </fieldset>
    </form>
  );
}
