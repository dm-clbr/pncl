import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileCheck2, IdCard, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  getDriversLicenseUrl,
  getEoCertificateUrl,
  notifyLicensingComplete,
  profileToLicensingValues,
  saveLicensingProfile,
  US_STATES,
  type PortalLicensingFormValues,
  type PortalProfile,
} from "@/lib/portal-profile";
import { toast } from "sonner";

export default function PortalLicensingSection({
  user,
  profile,
  loading,
  names,
  onSaved,
}: {
  user: User | null;
  profile: PortalProfile | null;
  loading: boolean;
  names: { firstName: string; lastName: string };
  onSaved?: (profile: PortalProfile) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<PortalLicensingFormValues>({
    npn: "",
    eoPolicyNumber: "",
    stateLicenses: [],
  });
  const [stateToAdd, setStateToAdd] = useState("");
  const eoFileInputRef = useRef<HTMLInputElement>(null);
  const [licensePath, setLicensePath] = useState<string | null>(null);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [pendingLicenseFile, setPendingLicenseFile] = useState<File | null>(null);
  const [licensePreviewUrl, setLicensePreviewUrl] = useState<string | null>(null);
  const [eoCertificatePath, setEoCertificatePath] = useState<string | null>(null);
  const [eoCertificateUrl, setEoCertificateUrl] = useState<string | null>(null);
  const [pendingEoCertificateFile, setPendingEoCertificateFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(profileToLicensingValues(profile));
    setLicensePath(profile?.drivers_license_path ?? null);
    setEoCertificatePath(profile?.eo_certificate_path ?? null);
  }, [profile]);

  useEffect(() => {
    if (!eoCertificatePath) {
      setEoCertificateUrl(null);
      return;
    }

    let cancelled = false;
    void getEoCertificateUrl(eoCertificatePath)
      .then((url) => {
        if (!cancelled) setEoCertificateUrl(url);
      })
      .catch(() => {
        if (!cancelled) setEoCertificateUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [eoCertificatePath]);

  useEffect(() => {
    if (!licensePath) {
      setLicenseUrl(null);
      return;
    }

    let cancelled = false;
    void getDriversLicenseUrl(licensePath)
      .then((url) => {
        if (!cancelled) setLicenseUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLicenseUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [licensePath]);

  useEffect(() => {
    return () => {
      if (licensePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(licensePreviewUrl);
      }
    };
  }, [licensePreviewUrl]);

  const handleLicenseChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    if (licensePreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(licensePreviewUrl);
    }
    setPendingLicenseFile(file);
    setLicensePreviewUrl(URL.createObjectURL(file));
  };

  const handleEoCertificateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("Please choose a PDF, JPG, PNG, or WebP file.");
      return;
    }

    setPendingEoCertificateFile(file);
  };

  const addStateLicense = () => {
    if (!stateToAdd) return;
    setForm((prev) =>
      prev.stateLicenses.includes(stateToAdd)
        ? prev
        : { ...prev, stateLicenses: [...prev.stateLicenses, stateToAdd].sort() },
    );
    setStateToAdd("");
  };

  const removeStateLicense = (state: string) => {
    setForm((prev) => ({
      ...prev,
      stateLicenses: prev.stateLicenses.filter((item) => item !== state),
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const saved = await saveLicensingProfile(
        user,
        names,
        form,
        pendingLicenseFile,
        licensePath,
        pendingEoCertificateFile,
        eoCertificatePath,
      );
      setLicensePath(saved.drivers_license_path);
      setEoCertificatePath(saved.eo_certificate_path);
      setPendingEoCertificateFile(null);
      setPendingLicenseFile(null);
      if (licensePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(licensePreviewUrl);
      }
      setLicensePreviewUrl(null);
      onSaved?.(saved);
      toast.success("Licensing details saved.");
      if (saved.npn?.trim() && saved.eo_policy_number?.trim()) {
        void notifyLicensingComplete();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save licensing details.");
    } finally {
      setSubmitting(false);
    }
  };

  const displayLicenseUrl = licensePreviewUrl ?? licenseUrl;

  return (
    <div className="carrier-sheet-panel portal-profile-panel">
      <div className="carrier-sheet-panel-head">
        <div>
          <h2>Licensing</h2>
          <p>
            Record your NPN, E&amp;O policy number, and state licenses as you earn them —
            your onboarding checklist updates automatically. Upload a clear image of your
            driver&apos;s license if you haven&apos;t already.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="portal-incentives-loading">
          <span className="onboarding-spinner" aria-hidden="true" />
          <span>Loading licensing details...</span>
        </div>
      ) : (
        <form className="admin-form portal-profile-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="portal-profile-form-grid">
            <label className="admin-field">
              <span>NPN (National Producer Number)</span>
              <input
                type="text"
                value={form.npn}
                onChange={(event) => setForm((prev) => ({ ...prev, npn: event.target.value }))}
                placeholder="Your NPN"
                autoComplete="off"
              />
            </label>

            <label className="admin-field">
              <span>E&amp;O policy number</span>
              <input
                type="text"
                value={form.eoPolicyNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, eoPolicyNumber: event.target.value }))
                }
                placeholder="Errors & omissions policy number"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="portal-licensing-dl-section">
            <div className="portal-licensing-dl-preview-wrap">
              <span className="portal-licensing-dl-placeholder" aria-hidden="true">
                <FileCheck2 size={28} strokeWidth={1.5} />
              </span>
            </div>
            <div className="portal-profile-photo-copy">
              <strong>E&amp;O certificate</strong>
              <p>
                Upload your E&amp;O certificate of coverage (PDF or image, up to 5 MB) so PNCL can
                initiate contracting.
              </p>
              {pendingEoCertificateFile ? (
                <p className="portal-panel-note">Selected: {pendingEoCertificateFile.name}</p>
              ) : eoCertificateUrl ? (
                <p className="portal-panel-note">
                  <a href={eoCertificateUrl} target="_blank" rel="noopener noreferrer">
                    View current certificate
                  </a>
                </p>
              ) : null}
              <input
                ref={eoFileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="portal-profile-photo-input"
                onChange={handleEoCertificateChange}
              />
              <button
                type="button"
                className="portal-panel-btn portal-profile-photo-btn"
                onClick={() => eoFileInputRef.current?.click()}
              >
                {eoCertificatePath || pendingEoCertificateFile ? "Replace certificate" : "Upload certificate"}
              </button>
            </div>
          </div>

          <div className="admin-field">
            <span>State licenses</span>
            <div className="portal-licensing-state-row">
              <select
                value={stateToAdd}
                onChange={(event) => setStateToAdd(event.target.value)}
                aria-label="Choose a state to add"
              >
                <option value="">Choose a state</option>
                {US_STATES.filter((state) => !form.stateLicenses.includes(state)).map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="portal-panel-btn"
                onClick={addStateLicense}
                disabled={!stateToAdd}
              >
                Add state
              </button>
            </div>
            {form.stateLicenses.length > 0 ? (
              <div className="portal-licensing-state-chips">
                {form.stateLicenses.map((state) => (
                  <span key={state} className="portal-licensing-state-chip">
                    {state}
                    <button
                      type="button"
                      onClick={() => removeStateLicense(state)}
                      aria-label={`Remove ${state}`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="admin-field-hint">
                Add each state where you hold an insurance license, including your resident state.
              </span>
            )}
          </div>

          <div className="portal-licensing-dl-section">
            <div className="portal-licensing-dl-preview-wrap">
              {displayLicenseUrl ? (
                <img src={displayLicenseUrl} alt="Driver's license" className="portal-licensing-dl-preview" />
              ) : (
                <span className="portal-licensing-dl-placeholder" aria-hidden="true">
                  <IdCard size={28} strokeWidth={1.5} />
                </span>
              )}
            </div>
            <div className="portal-profile-photo-copy">
              <strong>Driver&apos;s license</strong>
              <p>Upload a clear and legible image (JPG, PNG, or WebP, up to 5 MB).</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="portal-profile-photo-input"
                onChange={handleLicenseChange}
              />
              <button
                type="button"
                className="portal-panel-btn portal-profile-photo-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                {displayLicenseUrl ? "Replace image" : "Upload image"}
              </button>
            </div>
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-primary-btn" disabled={submitting}>
              {submitting ? "Saving..." : "Save licensing details"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
