import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalProfile } from "@/lib/portal-profile";
import {
  EMPTY_W9_FORM,
  formatTinInput,
  getDefaultW9Values,
  submitPortalW9,
  US_STATES,
  validatePortalW9Form,
  type PortalW9FormValues,
  type W9TinType,
} from "@/lib/portal-w9";
import {
  IRS_W9_INSTRUCTIONS_URL,
  IRS_W9_PDF_URL,
  showsExemptionFields,
  showsForeignPartnersCheckbox,
  W9_CERTIFICATION_ITEMS,
  W9_FORM_REVISION,
  W9_INSTRUCTION_SECTIONS,
  W9_LLC_CLASSIFICATIONS,
  W9_REQUESTER,
  W9_TAX_CLASS_OPTIONS,
  type W9TaxClassOptionId,
} from "@/lib/w9-content";
import { refreshPortalUser } from "@/lib/portal-messages";
import { usePortalW9 } from "@/hooks/usePortalW9";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

function InstructionSection({
  title,
  body,
  defaultOpen = false,
}: {
  title: string;
  body: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`portal-w9-instruction${open ? " open" : ""}`}>
      <button
        type="button"
        className="portal-w9-instruction-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && <p>{body}</p>}
    </div>
  );
}

export default function PortalW9() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { w9, submitted, loading, setW9 } = usePortalW9();
  const [form, setForm] = useState<PortalW9FormValues>(EMPTY_W9_FORM);
  const [submitting, setSubmitting] = useState(false);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
    [],
  );

  useEffect(() => {
    document.title = "W-9 Form — PNCL Portal";
    trackPageView("portal_w9");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user || submitted) return;

    let cancelled = false;

    void fetchPortalProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        setForm(getDefaultW9Values(user, profile ? {
          firstName: profile.first_name,
          lastName: profile.last_name,
        } : null));
      })
      .catch(() => {
        if (cancelled) return;
        setForm(getDefaultW9Values(user));
      });

    return () => {
      cancelled = true;
    };
  }, [user, submitted]);

  const signedDate = useMemo(() => {
    if (!w9?.signedAt) return null;
    return new Date(w9.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [w9?.signedAt]);

  const showForeignPartners = showsForeignPartnersCheckbox(form.taxClass as W9TaxClassOptionId, form.llcClassification);
  const showExemptions = showsExemptionFields(form.taxClass as W9TaxClassOptionId);

  const updateField = <K extends keyof PortalW9FormValues>(key: K, value: PortalW9FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTaxClassChange = (taxClass: W9TaxClassOptionId) => {
    setForm((prev) => ({
      ...prev,
      taxClass,
      llcClassification: taxClass === "llc" ? prev.llcClassification : "",
      hasForeignPartners: taxClass === "partnership" || taxClass === "trust_estate" ? prev.hasForeignPartners : false,
      exemptPayeeCode: taxClass === "individual" ? "" : prev.exemptPayeeCode,
      fatcaExemptionCode: taxClass === "individual" ? "" : prev.fatcaExemptionCode,
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    const validationError = validatePortalW9Form(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitPortalW9(token, form);
      setW9(saved);
      await refreshPortalUser();
      toast.success("W-9 submitted. You're all set.");
      navigate("/portal", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to submit W-9.");
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
              <p className="portal-welcome">Form W-9 ({W9_FORM_REVISION})</p>
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
                  <h1>Request for Taxpayer Identification Number and Certification</h1>
                  <p className="portal-w9-lead">
                    Department of the Treasury — Internal Revenue Service. Give the completed form to
                    PNCL. <strong>Do not send to the IRS.</strong>
                  </p>
                </div>
              </div>

              <div className="portal-w9-official-links">
                <a href={IRS_W9_PDF_URL} target="_blank" rel="noopener noreferrer" className="portal-w9-official-link">
                  View official IRS PDF
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                <a href={IRS_W9_INSTRUCTIONS_URL} target="_blank" rel="noopener noreferrer" className="portal-w9-official-link">
                  Full IRS instructions
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>

              {loading && (
                <div className="portal-incentives-loading">
                  <span className="onboarding-spinner" aria-hidden="true" />
                  <span>Loading W-9...</span>
                </div>
              )}

              {!loading && submitted && w9 && (
                <div className="portal-w9-submitted">
                  <p className="portal-panel-note">
                    Your W-9 was submitted{signedDate ? ` on ${signedDate}` : ""} for{" "}
                    <strong>{w9.legalName}</strong>.
                  </p>
                  <p className="portal-panel-note">
                    Need to update your information? Contact PNCL support.
                  </p>
                </div>
              )}

              {!loading && !submitted && (
                <form className="admin-form portal-w9-form" onSubmit={(event) => void handleSubmit(event)}>
                  <label className="admin-field">
                    <span>1. Name of entity/individual</span>
                    <span className="portal-w9-field-note">
                      For a sole proprietor or disregarded entity, enter the owner&apos;s name on line 1.
                    </span>
                    <input
                      type="text"
                      value={form.legalName}
                      onChange={(event) => updateField("legalName", event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="admin-field">
                    <span>2. Business name/disregarded entity name, if different from above</span>
                    <input
                      type="text"
                      value={form.businessName}
                      onChange={(event) => updateField("businessName", event.target.value)}
                      autoComplete="organization"
                    />
                  </label>

                  <fieldset className="portal-w9-fieldset">
                    <legend>3a. Federal tax classification — check only one box</legend>
                    <div className="portal-w9-tax-class-grid">
                      {W9_TAX_CLASS_OPTIONS.map((option) => (
                        <label key={option.id} className="admin-field admin-field-checkbox portal-w9-tax-option">
                          <input
                            type="radio"
                            name="taxClass"
                            checked={form.taxClass === option.id}
                            onChange={() => handleTaxClassChange(option.id)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                    {form.taxClass === "llc" && (
                      <label className="admin-field portal-w9-llc-class">
                        <span>LLC tax classification (C, S, or P)</span>
                        <select
                          value={form.llcClassification}
                          onChange={(event) => updateField("llcClassification", event.target.value as PortalW9FormValues["llcClassification"])}
                          required
                        >
                          <option value="">Select classification</option>
                          {W9_LLC_CLASSIFICATIONS.map((code) => (
                            <option key={code} value={code}>
                              {code === "C" ? "C = C corporation" : code === "S" ? "S = S corporation" : "P = Partnership"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </fieldset>

                  {showForeignPartners && (
                    <label className="admin-field admin-field-checkbox portal-w9-certification">
                      <input
                        type="checkbox"
                        checked={form.hasForeignPartners}
                        onChange={(event) => updateField("hasForeignPartners", event.target.checked)}
                      />
                      <span>
                        3b. Check here if you have any foreign partners, owners, or beneficiaries
                        (see instructions).
                      </span>
                    </label>
                  )}

                  {showExemptions ? (
                    <fieldset className="portal-w9-fieldset">
                      <legend>4. Exemptions (codes apply only to certain entities, not individuals)</legend>
                      <label className="admin-field">
                        <span>Exempt payee code (if any)</span>
                        <input
                          type="text"
                          value={form.exemptPayeeCode}
                          onChange={(event) => updateField("exemptPayeeCode", event.target.value)}
                        />
                      </label>
                      <label className="admin-field">
                        <span>Exemption from FATCA reporting code (if any)</span>
                        <input
                          type="text"
                          value={form.fatcaExemptionCode}
                          onChange={(event) => updateField("fatcaExemptionCode", event.target.value)}
                        />
                      </label>
                    </fieldset>
                  ) : (
                    <p className="portal-w9-inline-note">
                      4. Exemptions — individuals and sole proprietors generally leave this section blank.
                    </p>
                  )}

                  <label className="admin-field">
                    <span>5. Address (number, street, and apt. or suite no.)</span>
                    <input
                      type="text"
                      value={form.addressLine1}
                      onChange={(event) => updateField("addressLine1", event.target.value)}
                      autoComplete="address-line1"
                      required
                    />
                  </label>

                  <label className="admin-field">
                    <span>6. City, state, and ZIP code</span>
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
                        required
                      />
                    </div>
                  </label>

                  <div className="portal-w9-requester-block">
                    <span className="portal-w9-requester-label">Requester&apos;s name and address</span>
                    <p>{W9_REQUESTER.name}</p>
                    <p>{W9_REQUESTER.addressLine1}</p>
                    <p>{W9_REQUESTER.cityStateZip}</p>
                  </div>

                  <label className="admin-field">
                    <span>7. List account number(s) here (optional)</span>
                    <input
                      type="text"
                      value={form.accountNumbers}
                      onChange={(event) => updateField("accountNumbers", event.target.value)}
                    />
                  </label>

                  <fieldset className="portal-w9-fieldset">
                    <legend>Part I — Taxpayer Identification Number (TIN)</legend>
                    <p className="portal-w9-field-note">
                      The TIN provided must match the name on line 1. For individuals, this is
                      generally your social security number (SSN).
                    </p>
                    <div className="portal-w9-tin-options">
                      <label className="admin-field admin-field-checkbox">
                        <input
                          type="radio"
                          name="tinType"
                          checked={form.tinType === "ssn"}
                          onChange={() => {
                            updateField("tinType", "ssn");
                            updateField("tin", "");
                          }}
                        />
                        <span>Social security number</span>
                      </label>
                      <label className="admin-field admin-field-checkbox">
                        <input
                          type="radio"
                          name="tinType"
                          checked={form.tinType === "ein"}
                          onChange={() => {
                            updateField("tinType", "ein");
                            updateField("tin", "");
                          }}
                        />
                        <span>Employer identification number</span>
                      </label>
                    </div>
                    <label className="admin-field">
                      <span>{form.tinType === "ssn" ? "Social security number" : "Employer identification number"}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.tin}
                        onChange={(event) => updateField("tin", formatTinInput(event.target.value, form.tinType as W9TinType))}
                        placeholder={form.tinType === "ssn" ? "111-22-3333" : "12-3456789"}
                        autoComplete="off"
                        required
                      />
                    </label>
                  </fieldset>

                  <fieldset className="portal-w9-fieldset">
                    <legend>Part II — Certification</legend>
                    <p className="portal-w9-field-note">Under penalties of perjury, I certify that:</p>
                    <ol className="portal-w9-cert-list">
                      {W9_CERTIFICATION_ITEMS.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                    <label className="admin-field">
                      <span>Sign Here — signature of U.S. person</span>
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
                        checked={form.certificationAccepted}
                        onChange={(event) => updateField("certificationAccepted", event.target.checked)}
                        required
                      />
                      <span>I certify that the information above is correct.</span>
                    </label>
                  </fieldset>

                  <p className="portal-w9-security-note">
                    Your tax ID is encrypted and stored securely. PNCL uses this information to
                    file required IRS information returns such as Form 1099-NEC.
                  </p>

                  <div className="admin-form-actions">
                    <button type="submit" className="admin-primary-btn" disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit W-9 to PNCL"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <aside className="portal-w9-aside">
              <div className="portal-w9-aside-card">
                <h2>About this form</h2>
                <p>
                  This portal version collects the same core fields as page 1 of the official{" "}
                  <a href={IRS_W9_PDF_URL} target="_blank" rel="noopener noreferrer">
                    IRS Form W-9
                  </a>
                  . The multi-page instructions in the PDF are summarized here — use the official
                  PDF for the complete legal text.
                </p>
                {W9_INSTRUCTION_SECTIONS.map((section, index) => (
                  <InstructionSection
                    key={section.id}
                    title={section.title}
                    body={section.body}
                    defaultOpen={index === 0}
                  />
                ))}
                <a
                  href={IRS_W9_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-w9-aside-pdf"
                >
                  Download official Form W-9 (PDF)
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
