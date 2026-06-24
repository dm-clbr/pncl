import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalProfile } from "@/lib/portal-profile";
import { DIRECT_DEPOSIT_AUTHORIZATION } from "@/lib/direct-deposit-content";
import {
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

export default function PortalDirectDeposit() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { directDeposit, submitted, loading, setDirectDeposit } = usePortalDirectDeposit();
  const [form, setForm] = useState<PortalDirectDepositFormValues>(EMPTY_DIRECT_DEPOSIT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

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
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    const validationError = validatePortalDirectDepositForm(form);
    if (validationError) {
      toast.error(validationError);
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

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <header className="carrier-sheet-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="carrier-sheet-header-copy">
              <p className="portal-welcome">Direct Deposit Request</p>
              <p className="portal-meta">{displayName}</p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          <div className="portal-w9-layout">
            <div className="carrier-sheet-panel portal-w9-panel">
              <div className="carrier-sheet-panel-head">
                <div>
                  <h1>Direct Deposit Request Form</h1>
                  <p className="portal-w9-lead">
                    Submit your banking details so PNCL can deposit commission payments directly
                    to your account. A signed PDF is saved to your profile automatically.
                  </p>
                </div>
              </div>

              {loading && (
                <div className="portal-incentives-loading">
                  <span className="onboarding-spinner" aria-hidden="true" />
                  <span>Loading direct deposit form...</span>
                </div>
              )}

              {!loading && submitted && directDeposit && (
                <div className="portal-w9-submitted">
                  <p className="portal-panel-note">
                    Your direct deposit form was submitted{signedDate ? ` on ${signedDate}` : ""} for{" "}
                    <strong>{directDeposit.legalName}</strong>.
                  </p>
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-w9-aside-pdf"
                    >
                      Download signed PDF
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  )}
                  <p className="portal-panel-note">
                    Need to update your banking information? Contact PNCL support.
                  </p>
                </div>
              )}

              {!loading && !submitted && (
                <form className="admin-form portal-w9-form" onSubmit={(event) => void handleSubmit(event)}>
                  <label className="admin-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={form.legalName}
                      onChange={(event) => updateField("legalName", event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="admin-field">
                    <span>Address</span>
                    <input
                      type="text"
                      value={form.addressLine1}
                      onChange={(event) => updateField("addressLine1", event.target.value)}
                      autoComplete="street-address"
                      required
                    />
                  </label>

                  <label className="admin-field">
                    <span>City, state, and ZIP code</span>
                    <div className="portal-w9-address-row">
                      <input
                        type="text"
                        value={form.city}
                        onChange={(event) => updateField("city", event.target.value)}
                        autoComplete="address-level2"
                        placeholder="City"
                        required
                      />
                      <select
                        value={form.state}
                        onChange={(event) => updateField("state", event.target.value)}
                        autoComplete="address-level1"
                        required
                      >
                        <option value="">State</option>
                        {US_STATES.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={form.zip}
                        onChange={(event) => updateField("zip", event.target.value)}
                        autoComplete="postal-code"
                        placeholder="ZIP"
                        inputMode="numeric"
                        required
                      />
                    </div>
                  </label>

                  <fieldset className="portal-w9-fieldset">
                    <legend>Deposit account</legend>
                    <p className="portal-w9-field-note">
                      Please have my check automatically deposited into the following account:
                    </p>
                    <div className="portal-w9-tin-options">
                      <label className="admin-field admin-field-checkbox">
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
                      <label className="admin-field admin-field-checkbox">
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
                    <label className="admin-field">
                      <span>
                        {form.accountType === "checking"
                          ? "Checking account number"
                          : "Savings/MIA/Money market account number"}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.accountNumber}
                        onChange={(event) => updateField("accountNumber", formatAccountNumberInput(event.target.value))}
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="admin-field">
                      <span>Your bank&apos;s routing number</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.routingNumber}
                        onChange={(event) => updateField("routingNumber", formatRoutingNumberInput(event.target.value))}
                        placeholder="9 digits"
                        autoComplete="off"
                        required
                      />
                    </label>
                  </fieldset>

                  <fieldset className="portal-w9-fieldset">
                    <legend>Authorization</legend>
                    <p className="portal-w9-field-note">{DIRECT_DEPOSIT_AUTHORIZATION}</p>
                    <label className="admin-field">
                      <span>Signature</span>
                      <input
                        type="text"
                        value={form.signatureName}
                        onChange={(event) => updateField("signatureName", event.target.value)}
                        required
                      />
                    </label>
                    <label className="admin-field">
                      <span>Date</span>
                      <input type="text" value={todayLabel} readOnly aria-readonly="true" />
                    </label>
                    <label className="admin-field admin-field-checkbox portal-w9-certification">
                      <input
                        type="checkbox"
                        checked={form.authorizationAccepted}
                        onChange={(event) => updateField("authorizationAccepted", event.target.checked)}
                        required
                      />
                      <span>I authorize direct deposit as described above.</span>
                    </label>
                  </fieldset>

                  <p className="portal-w9-security-note">
                    Your account and routing numbers are encrypted and stored securely. Only a signed
                    PDF copy is saved to your profile.
                  </p>

                  <div className="admin-form-actions">
                    <button type="submit" className="admin-primary-btn" disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit direct deposit form"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <aside className="portal-w9-aside">
              <div className="portal-w9-aside-card">
                <h2>About this form</h2>
                <p>
                  This digital form replaces mailing a paper direct deposit request. Once you submit,
                  PNCL receives your banking details and a signed PDF is saved to your profile for
                  your records.
                </p>
                <p>
                  Questions? Email{" "}
                  <a href="mailto:ap@thepncl.com">ap@thepncl.com</a>.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
