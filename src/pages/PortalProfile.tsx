import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Camera } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import ProfilePhotoCropModal from "@/components/ProfilePhotoCropModal";
import PortalCarrierCredentials from "@/components/PortalCarrierCredentials";
import PortalLicensingSection from "@/components/PortalLicensingSection";
import PortalProfileDocumentsSection from "@/components/PortalProfileDocumentsSection";
import { useAuth } from "@/contexts/AuthContext";
import {
  CLOTHING_SIZES,
  fetchPortalProfile,
  formatAgentNumber,
  getDefaultProfileValues,
  getProfileInitials,
  getProfilePhotoUrl,
  profileToFormValues,
  savePortalProfile,
  SHOE_SIZES,
  US_STATES,
  WAIST_SIZES,
  type PortalProfile,
  type PortalProfileFormValues,
} from "@/lib/portal-profile";
import { getDirectDepositPdfUrl } from "@/lib/portal-direct-deposit";
import { fetchPortalW9Document, getW9PdfUrl } from "@/lib/portal-w9";
import { fetchPortalIcaDocument } from "@/lib/portal-ica";
import { usePortalDirectDeposit } from "@/hooks/usePortalDirectDeposit";
import { usePortalW9 } from "@/hooks/usePortalW9";
import { usePortalIca } from "@/hooks/usePortalIca";
import { usePortalTodos } from "@/hooks/usePortalTodos";
import {
  derivePortalPhase,
  isTodoCompleted,
  PORTAL_PHASE_LABELS,
} from "@/lib/portal-todos";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

const EMPTY_FORM: PortalProfileFormValues = {
  firstName: "",
  lastName: "",
  shirtSize: "",
  poloShirtSize: "",
  hoodieSize: "",
  waistSize: "",
  shoeSize: "",
  addressLine1: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  county: "",
};

function SizeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select size</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PortalProfile() {
  const { user, session } = useAuth();
  const { w9, submitted: w9Submitted, loading: w9Loading } = usePortalW9();
  const { directDeposit, submitted: directDepositSubmitted, loading: directDepositLoading } = usePortalDirectDeposit();
  const { ica, submitted: icaSubmitted, loading: icaLoading } = usePortalIca();
  const { todos, loading: todosLoading } = usePortalTodos();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PortalProfileFormValues>(EMPTY_FORM);
  const [profileRow, setProfileRow] = useState<PortalProfile | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoCacheBuster, setPhotoCacheBuster] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [directDepositPdfUrl, setDirectDepositPdfUrl] = useState<string | null>(null);
  const [w9PdfUrl, setW9PdfUrl] = useState<string | null>(null);
  const [icaPdfUrl, setIcaPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!directDeposit?.pdfPath) {
      setDirectDepositPdfUrl(null);
      return;
    }

    let cancelled = false;

    void getDirectDepositPdfUrl(directDeposit.pdfPath)
      .then((url) => {
        if (!cancelled) setDirectDepositPdfUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDirectDepositPdfUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [directDeposit?.pdfPath]);

  useEffect(() => {
    const token = session?.access_token;
    if (!w9Submitted || !token) {
      setW9PdfUrl(null);
      return;
    }

    let cancelled = false;

    async function loadW9Pdf() {
      try {
        if (w9?.pdfPath) {
          const url = await getW9PdfUrl(w9.pdfPath);
          if (!cancelled) setW9PdfUrl(url);
          return;
        }

        const { downloadUrl } = await fetchPortalW9Document(token);
        if (!cancelled) setW9PdfUrl(downloadUrl);
      } catch {
        if (!cancelled) setW9PdfUrl(null);
      }
    }

    void loadW9Pdf();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, w9Submitted, w9?.pdfPath]);

  useEffect(() => {
    const token = session?.access_token;
    if (!icaSubmitted || !token) {
      setIcaPdfUrl(null);
      return;
    }

    let cancelled = false;

    async function loadIcaPdf() {
      try {
        const { downloadUrl } = await fetchPortalIcaDocument(token);
        if (!cancelled) setIcaPdfUrl(downloadUrl);
      } catch {
        if (!cancelled) setIcaPdfUrl(null);
      }
    }

    void loadIcaPdf();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, icaSubmitted]);

  const w9SignedDate = useMemo(() => {
    if (!w9?.signedAt) return null;
    return new Date(w9.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [w9?.signedAt]);

  const directDepositSignedDate = useMemo(() => {
    if (!directDeposit?.signedAt) return null;
    return new Date(directDeposit.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [directDeposit?.signedAt]);

  const icaSignedDate = useMemo(() => {
    if (!ica?.signedAt) return null;
    return new Date(ica.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [ica?.signedAt]);

  useEffect(() => {
    document.title = "My Profile — PNCL Portal";
    trackPageView("portal_profile");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void fetchPortalProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        if (profile) {
          setProfileRow(profile);
          setForm(profileToFormValues(profile));
          setPhotoPath(profile.profile_photo_path);
          setPhotoCacheBuster(profile.updated_at);
        } else {
          setForm(getDefaultProfileValues(user));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Unable to load profile.");
        setForm(getDefaultProfileValues(user));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
      if (cropImageSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(cropImageSrc);
      }
    };
  }, [photoPreviewUrl, cropImageSrc]);

  const clearCropImageSrc = () => {
    if (cropImageSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropImageSrc(null);
  };

  const setProcessedPhoto = (file: File, previewUrl: string) => {
    if (photoPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPendingPhotoFile(file);
    setPhotoPreviewUrl(previewUrl);
    clearCropImageSrc();
  };

  const savedPhotoUrl = useMemo(
    () => getProfilePhotoUrl(photoPath, photoCacheBuster),
    [photoPath, photoCacheBuster],
  );
  const displayPhotoUrl = photoPreviewUrl ?? savedPhotoUrl;
  const initials = getProfileInitials(form.firstName, form.lastName);
  const agentEmail = user?.email ?? "";
  const agentNumber = formatAgentNumber(profileRow?.agent_number);

  const updateField = <K extends keyof PortalProfileFormValues>(key: K, value: PortalProfileFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    clearCropImageSrc();
    setCropImageSrc(URL.createObjectURL(file));
  };

  const handleCropCancel = () => {
    clearCropImageSrc();
  };

  const handleCropConfirm = (file: File, previewUrl: string) => {
    setProcessedPhoto(file, previewUrl);
  };

  const resolvedTodos = useMemo(
    () =>
      todos.map((todo) => ({
        ...todo,
        completed: isTodoCompleted(user, todo, { icaSubmitted, w9Submitted, directDepositSubmitted }),
      })),
    [todos, user, icaSubmitted, w9Submitted, directDepositSubmitted],
  );
  const todoTotal = resolvedTodos.length;
  const todoDone = resolvedTodos.filter((todo) => todo.completed).length;
  const todoPercent = todoTotal === 0 ? 0 : Math.round((todoDone / todoTotal) * 100);
  const currentPhase = derivePortalPhase(resolvedTodos);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const profile = await savePortalProfile(user, form, pendingPhotoFile, photoPath);
      setProfileRow(profile);
      setPhotoPath(profile.profile_photo_path);
      setPhotoCacheBuster(profile.updated_at);
      setPendingPhotoFile(null);
      if (photoPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
      setPhotoPreviewUrl(null);
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSubmitting(false);
    }
  };

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
              <p className="portal-welcome">My profile</p>
              {agentEmail && (
                <p className="portal-meta">
                  {agentEmail}
                  {agentNumber ? ` · Agent ID ${agentNumber}` : ""}
                </p>
              )}
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          {!todosLoading && todoTotal > 0 && (
            <div className="portal-profile-progress" aria-label="Onboarding progress">
              <div className="portal-profile-progress-head">
                <span className={`portal-phase-badge phase-${currentPhase}`}>
                  {PORTAL_PHASE_LABELS[currentPhase]}
                </span>
                <span className="portal-profile-progress-count">
                  {todoDone} of {todoTotal} steps complete
                </span>
              </div>
              <div
                className="portal-profile-progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={todoPercent}
              >
                <span style={{ width: `${todoPercent}%` }} />
              </div>
            </div>
          )}

          <div className="carrier-sheet-panel portal-profile-panel">
            <div className="carrier-sheet-panel-head">
              <div>
                <h1>Profile details</h1>
                <p>
                  Keep your name, apparel sizes, and profile photo up to date for PNCL swag
                  and internal records.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading profile...</span>
              </div>
            ) : (
              <form className="admin-form portal-profile-form" onSubmit={(event) => void handleSubmit(event)}>
                <div className="portal-profile-photo-section">
                  <div className="portal-profile-photo-wrap">
                    {displayPhotoUrl ? (
                      <img
                        src={displayPhotoUrl}
                        alt=""
                        className="portal-profile-photo-image"
                      />
                    ) : (
                      <span className="portal-profile-photo-initials" aria-hidden="true">
                        {initials}
                      </span>
                    )}
                  </div>
                  <div className="portal-profile-photo-copy">
                    <strong>Profile photo</strong>
                    <p>Choose a photo, crop it, and we&apos;ll compress it to 300 KB before upload.</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="portal-profile-photo-input"
                      onChange={handlePhotoChange}
                    />
                    <button
                      type="button"
                      className="portal-panel-btn portal-profile-photo-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera size={16} aria-hidden="true" />
                      {displayPhotoUrl ? "Change photo" : "Upload photo"}
                    </button>
                  </div>
                </div>

                <div className="portal-profile-form-grid">
                  <label className="admin-field">
                    <span>First name</span>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(event) => updateField("firstName", event.target.value)}
                      required
                      autoComplete="given-name"
                    />
                  </label>

                  <label className="admin-field">
                    <span>Last name</span>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(event) => updateField("lastName", event.target.value)}
                      required
                      autoComplete="family-name"
                    />
                  </label>
                </div>

                <div className="portal-profile-form-grid">
                  <label className="admin-field">
                    <span>Street address</span>
                    <input
                      type="text"
                      value={form.addressLine1}
                      onChange={(event) => updateField("addressLine1", event.target.value)}
                      placeholder="123 Main St, Apt 4"
                      autoComplete="address-line1"
                    />
                  </label>

                  <label className="admin-field">
                    <span>City</span>
                    <input
                      type="text"
                      value={form.addressCity}
                      onChange={(event) => updateField("addressCity", event.target.value)}
                      placeholder="City"
                      autoComplete="address-level2"
                    />
                  </label>
                </div>

                <div className="portal-profile-form-grid">
                  <label className="admin-field">
                    <span>State</span>
                    <select
                      value={form.addressState}
                      onChange={(event) => updateField("addressState", event.target.value)}
                      autoComplete="address-level1"
                    >
                      <option value="">Select state</option>
                      {US_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-field">
                    <span>ZIP code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.addressZip}
                      onChange={(event) =>
                        updateField("addressZip", event.target.value.replace(/\D/g, "").slice(0, 5))
                      }
                      placeholder="12345"
                      autoComplete="postal-code"
                    />
                  </label>
                </div>

                <label className="admin-field">
                  <span>County</span>
                  <input
                    type="text"
                    value={form.county}
                    onChange={(event) => updateField("county", event.target.value)}
                    placeholder="County name"
                    autoComplete="off"
                  />
                </label>

                <div className="portal-profile-form-grid">
                  <SizeSelect
                    label="Shirt size"
                    value={form.shirtSize}
                    options={CLOTHING_SIZES}
                    onChange={(value) => updateField("shirtSize", value)}
                  />
                  <SizeSelect
                    label="Polo shirt size"
                    value={form.poloShirtSize}
                    options={CLOTHING_SIZES}
                    onChange={(value) => updateField("poloShirtSize", value)}
                  />
                </div>

                <div className="portal-profile-form-grid">
                  <SizeSelect
                    label="Hoodie size"
                    value={form.hoodieSize}
                    options={CLOTHING_SIZES}
                    onChange={(value) => updateField("hoodieSize", value)}
                  />
                  <SizeSelect
                    label="Waist size"
                    value={form.waistSize}
                    options={WAIST_SIZES}
                    onChange={(value) => updateField("waistSize", value)}
                  />
                </div>

                <SizeSelect
                  label="Shoe size"
                  value={form.shoeSize}
                  options={SHOE_SIZES}
                  onChange={(value) => updateField("shoeSize", value)}
                />

                <div className="admin-form-actions">
                  <button type="submit" className="admin-primary-btn" disabled={submitting}>
                    {submitting ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <PortalLicensingSection
            user={user}
            profile={profileRow}
            loading={loading}
            names={{ firstName: form.firstName, lastName: form.lastName }}
            onSaved={setProfileRow}
          />

          <div className="carrier-sheet-panel portal-profile-panel">
            <div className="carrier-sheet-panel-head">
              <div>
                <h2>Saved documents</h2>
                <p>Signed forms submitted through the portal are stored here for your records.</p>
              </div>
            </div>

            {(w9Loading || directDepositLoading || icaLoading) && !w9Submitted && !directDepositSubmitted && !icaSubmitted ? (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading documents...</span>
              </div>
            ) : w9Submitted || directDepositSubmitted || icaSubmitted ? (
              <div className="portal-profile-documents">
                {!icaSubmitted && (
                  <div className="portal-profile-document-item">
                    <div>
                      <strong>Independent Contractor Agreement</strong>
                      <p className="portal-panel-note">
                        Sign your ICA to save a copy to your profile.
                      </p>
                    </div>
                    <Link to="/portal/ica" className="portal-w9-aside-pdf">
                      Sign agreement
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                )}
                {icaSubmitted && ica && (
                  <div className="portal-profile-document-item">
                    <div>
                      <strong>Independent Contractor Agreement</strong>
                      <p className="portal-panel-note">
                        Signed{icaSignedDate ? ` on ${icaSignedDate}` : ""} for {ica.legalName}.
                      </p>
                    </div>
                    {icaPdfUrl ? (
                      <a
                        href={icaPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="portal-w9-aside-pdf"
                      >
                        Download PDF
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link to="/portal/ica" className="portal-w9-aside-pdf">
                        View agreement
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                )}
                {w9Submitted && w9 && (
                  <div className="portal-profile-document-item">
                    <div>
                      <strong>Form W-9</strong>
                      <p className="portal-panel-note">
                        Submitted{w9SignedDate ? ` on ${w9SignedDate}` : ""} for {w9.legalName}.
                      </p>
                    </div>
                    {w9PdfUrl ? (
                      <a
                        href={w9PdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="portal-w9-aside-pdf"
                      >
                        Download PDF
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link to="/portal/w9" className="portal-w9-aside-pdf">
                        View form
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                )}
                {directDepositSubmitted && directDeposit && (
                  <div className="portal-profile-document-item">
                    <div>
                      <strong>Direct deposit request</strong>
                      <p className="portal-panel-note">
                        Submitted{directDepositSignedDate ? ` on ${directDepositSignedDate}` : ""} for {directDeposit.legalName}.
                      </p>
                    </div>
                    {directDepositPdfUrl ? (
                      <a
                        href={directDepositPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="portal-w9-aside-pdf"
                      >
                        Download PDF
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link to="/portal/direct-deposit" className="portal-w9-aside-pdf">
                        View form
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="portal-panel-note">
                No documents yet. Sign your{" "}
                <Link to="/portal/ica">Independent Contractor Agreement</Link>, submit your{" "}
                <Link to="/portal/w9">W-9</Link>, or{" "}
                <Link to="/portal/direct-deposit">direct deposit form</Link> from the portal.
              </p>
            )}
          </div>

          <PortalProfileDocumentsSection user={user} />

          <PortalCarrierCredentials />
        </div>
      </main>

      {cropImageSrc && (
        <ProfilePhotoCropModal
          imageSrc={cropImageSrc}
          onClose={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
