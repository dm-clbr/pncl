import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileCheck2 } from "lucide-react";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import BottomNav from "@/components/portal/BottomNav";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalProfile } from "@/lib/portal-profile";
import { DIRECT_DEPOSIT_AUTHORIZATION } from "@/lib/direct-deposit-content";
import {
  BANK_NAME_MAX_LENGTH,
  EMPTY_DIRECT_DEPOSIT_FORM,
  formatAccountNumberInput,
  formatRoutingNumberInput,
  getDefaultDirectDepositValues,
  getDirectDepositPdfUrl,
  submitPortalDirectDeposit,
  US_STATES,
  validatePortalDirectDepositForm,
  type PortalDirectDepositFormValues,
} from "@/lib/portal-direct-deposit";
import { refreshPortalUser } from "@/lib/portal-messages";
import { usePortalDirectDeposit } from "@/hooks/usePortalDirectDeposit";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/portal-forms.css";

/** validatePortalDirectDepositForm returns one message for the whole form and
    src/lib is read-only, so the message is mapped back to the control it came
    from. Prefixes, not whole strings: the two bank-name messages differ only in
    their tail. The order is the validator's own, so the first match is the
    first error. */
const ERROR_FIELDS: ReadonlyArray<[string, string]> = [
  ["Name", "dd-name"],
  ["Address", "dd-address"],
  ["City", "dd-city"],
  ["State", "dd-state"],
  ["Enter a valid ZIP", "dd-zip"],
  ["Bank name", "dd-bank"],
  ["Enter a valid account", "dd-account"],
  ["Enter a valid 9-digit", "dd-routing"],
  ["Signature", "dd-signature"],
  ["You must accept", "dd-authorization"],
];

export default function PortalDirectDeposit() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { directDeposit, submitted, loading, setDirectDeposit } = usePortalDirectDeposit();
  const [form, setForm] = useState<PortalDirectDepositFormValues>(EMPTY_DIRECT_DEPOSIT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<{ id: string; message: string } | null>(null);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
    [],
  );

  useEffect(() => {
    document.title = "Direct Deposit — PNCL Portal";
    trackPageView("portal_direct_deposit");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user || submitted) return;

    let cancelled = false;

    void fetchPortalProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        setForm(getDefaultDirectDepositValues(user, profile ? {
          firstName: profile.first_name,
          lastName: profile.last_name,
        } : null));
      })
      .catch(() => {
        if (cancelled) return;
        setForm(getDefaultDirectDepositValues(user));
      });

    return () => {
      cancelled = true;
    };
  }, [user, submitted]);

  useEffect(() => {
    if (!directDeposit?.pdfPath) {
      setPdfUrl(null);
      return;
    }

    let cancelled = false;

    void getDirectDepositPdfUrl(directDeposit.pdfPath)
      .then((url) => {
        if (!cancelled) setPdfUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [directDeposit?.pdfPath]);

  const signedDate = useMemo(() => {
    if (!directDeposit?.signedAt) return null;
    return new Date(directDeposit.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [directDeposit?.signedAt]);

  const updateField = <K extends keyof PortalDirectDepositFormValues>(
    key: K,
    value: PortalDirectDepositFormValues[K],
  ) => {
    setInvalid(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const errorFor = (id: string) => (invalid?.id === id ? invalid.message : undefined);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    const validationError = validatePortalDirectDepositForm(form);
    if (validationError) {
      toast.error(validationError);
      // Mobile rule: the message also sits next to its own field and takes
      // focus, so a long form never leaves the agent hunting for what failed.
      // Every control is `required`, so an empty field is caught by native
      // validation before this runs; what reaches here is a format error.
      const id = ERROR_FIELDS.find(([prefix]) => validationError.startsWith(prefix))?.[1];
      setInvalid(id ? { id, message: validationError } : null);
      if (id) document.getElementById(id)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitPortalDirectDeposit(token, form);
      setDirectDeposit(saved);
      await refreshPortalUser();
      toast.success("Direct deposit form submitted. A PDF copy was saved to your profile.");
      navigate("/portal", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to submit direct deposit form.");
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";
  // Presentation only: the masthead avatar falls back to initials, since the
  // page holds no photo and adding a profile hook here would be a data change.
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="home2-page">
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash pforms-page">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader name={displayName} email={user?.email} initials={initials} subpage />
          <PortalSubpageHeader
            title="Direct deposit"
            backTo="/portal"
            backLabel="Back to portal"
          />

          {/* One capped column: a 1320px wrap would stretch a five-character ZIP
              field across the whole screen. */}
          <div className="pforms-dd-col">
            {loading && (
              <Pane>
                <div className="pforms-loading" aria-busy="true">
                  <p className="portal-panel-note">Loading direct deposit form...</p>
                  <Skeleton variant="row" />
                  <Skeleton variant="tile" />
                </div>
              </Pane>
            )}

            {!loading && submitted && directDeposit && (
              <Pane title="Direct deposit on file">
                <p className="portal-panel-note">
                  Your direct deposit form was submitted{signedDate ? ` on ${signedDate}` : ""} for{" "}
                  <strong>{directDeposit.legalName}</strong>.
                </p>
                {pdfUrl && (
                  <ListRow
                    label="Download signed PDF"
                    icon={<FileCheck2 size={18} strokeWidth={1.75} aria-hidden="true" />}
                    href={pdfUrl}
                  />
                )}
                <p className="portal-panel-note">
                  Need to update your banking information? Contact PNCL support.
                </p>
              </Pane>
            )}

            {!loading && !submitted && (
              <form className="pforms-dd" onSubmit={(event) => void handleSubmit(event)}>
                <Pane title="Direct deposit request">
                  <p className="pforms-dd-lead">
                    Submit your banking details so PNCL can deposit commission payments directly
                    to your account. A signed PDF is saved to your profile automatically.
                  </p>

                  <div className="pforms-dd-stack">
                    <Field
                      label="Name"
                      id="dd-name"
                      type="text"
                      autoComplete="name"
                      value={form.legalName}
                      onChange={(event) => updateField("legalName", event.target.value)}
                      error={errorFor("dd-name")}
                      required
                    />

                    <Field
                      label="Address"
                      id="dd-address"
                      type="text"
                      autoComplete="street-address"
                      value={form.addressLine1}
                      onChange={(event) => updateField("addressLine1", event.target.value)}
                      error={errorFor("dd-address")}
                      required
                    />

                    <Field
                      label="City"
                      id="dd-city"
                      type="text"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={(event) => updateField("city", event.target.value)}
                      error={errorFor("dd-city")}
                      required
                    />

                    <Field label="State" id="dd-state" error={errorFor("dd-state")} required>
                      <select
                        className="portal-select"
                        autoComplete="address-level1"
                        value={form.state}
                        onChange={(event) => updateField("state", event.target.value)}
                      >
                        <option value="">Select a state</option>
                        {US_STATES.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="ZIP code"
                      id="dd-zip"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={form.zip}
                      onChange={(event) => updateField("zip", event.target.value)}
                      error={errorFor("dd-zip")}
                      required
                    />

                    <fieldset className="pforms-dd-group">
                      <legend>Deposit account</legend>
                      <p className="pforms-dd-note">
                        Please have my check automatically deposited into the following account:
                      </p>

                      <div className="pforms-acks">
                        <label className="pforms-ack">
                          <input
                            type="radio"
                            name="accountType"
                            checked={form.accountType === "checking"}
                            onChange={() => {
                              updateField("accountType", "checking");
                              updateField("accountNumber", "");
                            }}
                          />
                          <span>Checking account</span>
                        </label>
                        <label className="pforms-ack">
                          <input
                            type="radio"
                            name="accountType"
                            checked={form.accountType === "savings"}
                            onChange={() => {
                              updateField("accountType", "savings");
                              updateField("accountNumber", "");
                            }}
                          />
                          <span>Savings / MIA / Money market account</span>
                        </label>
                      </div>

                      <Field
                        label={
                          form.accountType === "checking"
                            ? "Checking account number"
                            : "Savings/MIA/Money market account number"
                        }
                        id="dd-account"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={form.accountNumber}
                        onChange={(event) => updateField("accountNumber", formatAccountNumberInput(event.target.value))}
                        error={errorFor("dd-account")}
                        required
                      />

                      <Field
                        label="Your bank's name"
                        id="dd-bank"
                        type="text"
                        autoComplete="off"
                        placeholder="e.g. Wells Fargo"
                        value={form.bankName}
                        onChange={(event) => updateField("bankName", event.target.value.slice(0, BANK_NAME_MAX_LENGTH))}
                        error={errorFor("dd-bank")}
                        required
                      />

                      <Field
                        label="Your bank's routing number"
                        id="dd-routing"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="9 digits"
                        value={form.routingNumber}
                        onChange={(event) => updateField("routingNumber", formatRoutingNumberInput(event.target.value))}
                        error={errorFor("dd-routing")}
                        required
                      />
                    </fieldset>

                    <fieldset className="pforms-dd-group">
                      <legend>Authorization</legend>
                      <p className="pforms-dd-note">{DIRECT_DEPOSIT_AUTHORIZATION}</p>

                      <Field
                        label="Signature"
                        id="dd-signature"
                        type="text"
                        value={form.signatureName}
                        onChange={(event) => updateField("signatureName", event.target.value)}
                        error={errorFor("dd-signature")}
                        required
                      />

                      <Field
                        label="Date"
                        id="dd-date"
                        type="text"
                        value={todayLabel}
                        readOnly
                        aria-readonly="true"
                      />

                      <div className="pforms-acks">
                        <label className="pforms-ack">
                          <input
                            id="dd-authorization"
                            type="checkbox"
                            checked={form.authorizationAccepted}
                            onChange={(event) => updateField("authorizationAccepted", event.target.checked)}
                            aria-invalid={invalid?.id === "dd-authorization" || undefined}
                            aria-describedby={
                              invalid?.id === "dd-authorization" ? "dd-authorization-error" : undefined
                            }
                            required
                          />
                          <span>I authorize direct deposit as described above.</span>
                        </label>
                      </div>
                      {invalid?.id === "dd-authorization" && (
                        <p className="portal-field-error" id="dd-authorization-error" role="alert">
                          {invalid.message}
                        </p>
                      )}
                    </fieldset>

                    <p className="pforms-dd-note">
                      Your account and routing numbers are encrypted and stored securely. Only a signed
                      PDF copy is saved to your profile.
                    </p>
                  </div>
                </Pane>

                {/* Sticky so the action stays in the thumb zone on a form this
                    long; outside the Pane so the pane's padding never clips it. */}
                <div className="pforms-submit-bar">
                  <button type="submit" className="pforms-submit" disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit direct deposit form"}
                  </button>
                </div>
              </form>
            )}

            <Pane as="aside" title="About this form">
              <p className="pforms-dd-lead">
                This digital form replaces mailing a paper direct deposit request. Once you submit,
                PNCL receives your banking details and a signed PDF is saved to your profile for
                your records.
              </p>
              <p className="pforms-dd-lead">
                Questions? Email <a href="mailto:ap@thepncl.com">ap@thepncl.com</a>.
              </p>
            </Pane>
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
