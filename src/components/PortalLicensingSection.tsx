import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { FileCheck2, IdCard, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import Chip from "@/components/portal/Chip";
import Field from "@/components/portal/Field";
import Pane from "@/components/portal/Pane";
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
import { isReadyForContracting } from "@/lib/licensing-contracting";
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
  const [form, setForm] = useState<PortalLicensingFormValues>({
    npn: "",
    eoPolicyNumber: "",
    stateLicenseNumbers: {},
  });
  const [stateToAdd, setStateToAdd] = useState("");
  const [licenseNumberToAdd, setLicenseNumberToAdd] = useState("");
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
    const licenseNumber = licenseNumberToAdd.trim();
    if (!stateToAdd || !licenseNumber) {
      toast.error("Enter the license number for the selected state.");
      return;
    }
    setForm((prev) =>
      ({ ...prev, stateLicenseNumbers: { ...prev.stateLicenseNumbers, [stateToAdd]: licenseNumber } }),
    );
    setStateToAdd("");
    setLicenseNumberToAdd("");
  };

  const removeStateLicense = (state: string) => {
    setForm((prev) => ({
      ...prev,
      stateLicenseNumbers: Object.fromEntries(
        Object.entries(prev.stateLicenseNumbers).filter(([item]) => item !== state),
      ),
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
      if (isReadyForContracting({
        npn: saved.npn,
        eoCertificatePath: saved.eo_certificate_path,
      })) {
        void notifyLicensingComplete();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save licensing details.");
    } finally {
      setSubmitting(false);
    }
  };

  const displayLicenseUrl = licensePreviewUrl ?? licenseUrl;
  const stateLicenses = Object.entries(form.stateLicenseNumbers).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="portal-profile-licensing">
      <p className="portal-profile-lede">
        Record your NPN, E&amp;O policy number, and state licenses as you earn them. Each one
        clears a step on your onboarding checklist.
      </p>

      {loading ? (
        <div className="portal-incentives-loading">
          <span className="onboarding-spinner" aria-hidden="true" />
          <span>Loading licensing details...</span>
        </div>
      ) : (
        <form className="portal-profile-form" onSubmit={(event) => void handleSubmit(event)}>
          <Pane title="Licensing numbers">
            <Field
              label="NPN (National Producer Number)"
              id="licensing-npn"
              type="text"
              value={form.npn}
              onChange={(event) => setForm((prev) => ({ ...prev, npn: event.target.value }))}
              placeholder="Your NPN"
              autoComplete="off"
            />

            <Field
              label="E&O policy number"
              id="licensing-eo-policy"
              type="text"
              value={form.eoPolicyNumber}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, eoPolicyNumber: event.target.value }))
              }
              placeholder="Errors and omissions policy number"
              autoComplete="off"
            />
          </Pane>

          <Pane title="Uploads">
            <p className="portal-profile-lede">
              PNCL needs your E&amp;O certificate to start contracting, and a clear image of your
              driver&apos;s license for carrier paperwork.
            </p>

            {/* ponytail: the file input covers the zone at zero opacity, so the
                browser's own drop target and picker do the work and no drag
                handlers are needed. */}
            <label className="portal-dropzone">
              <span className="portal-dropzone-icon" aria-hidden="true">
                <FileCheck2 size={22} strokeWidth={1.5} />
              </span>
              <span className="portal-dropzone-copy">
                <strong>E&amp;O certificate</strong>
                <span>Drop a file here or tap to browse. PDF or image, up to 5 MB.</span>
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="portal-dropzone-input"
                onChange={handleEoCertificateChange}
              />
            </label>

            {pendingEoCertificateFile ? (
              <div className="portal-dropzone-files">
                <Chip variant="pdf">{pendingEoCertificateFile.name}</Chip>
              </div>
            ) : eoCertificateUrl ? (
              <div className="portal-dropzone-files">
                <Chip variant="licensed">Certificate on file</Chip>
                <a
                  className="portal-profile-btn"
                  href={eoCertificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View certificate
                </a>
              </div>
            ) : null}

            <label className="portal-dropzone">
              <span className="portal-dropzone-icon" aria-hidden="true">
                {displayLicenseUrl ? (
                  <img src={displayLicenseUrl} alt="" className="portal-dropzone-thumb" />
                ) : (
                  <IdCard size={22} strokeWidth={1.5} />
                )}
              </span>
              <span className="portal-dropzone-copy">
                <strong>Driver&apos;s license</strong>
                <span>Drop a file here or tap to browse. JPG, PNG or WebP, up to 5 MB.</span>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="portal-dropzone-input"
                onChange={handleLicenseChange}
              />
            </label>

            {pendingLicenseFile ? (
              <div className="portal-dropzone-files">
                <Chip variant="pdf">{pendingLicenseFile.name}</Chip>
              </div>
            ) : licenseUrl ? (
              <div className="portal-dropzone-files">
                <Chip variant="licensed">Image on file</Chip>
                <a
                  className="portal-profile-btn"
                  href={licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View image
                </a>
              </div>
            ) : null}
          </Pane>

          <Pane
            title="State licenses"
            aside={
              stateLicenses.length > 0 ? (
                <Chip variant="licensed">{stateLicenses.length} on file</Chip>
              ) : undefined
            }
          >
            <div className="portal-licensing-add">
              <Field label="State" id="licensing-state">
                <select
                  className="portal-select"
                  value={stateToAdd}
                  onChange={(event) => setStateToAdd(event.target.value)}
                >
                  <option value="">Choose a state</option>
                  {US_STATES.filter((state) => !form.stateLicenseNumbers[state]).map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="License number"
                id="licensing-state-number"
                type="text"
                value={licenseNumberToAdd}
                onChange={(event) => setLicenseNumberToAdd(event.target.value)}
                placeholder="License number"
                autoComplete="off"
              />

              <button
                type="button"
                className="portal-profile-btn"
                onClick={addStateLicense}
                disabled={!stateToAdd || !licenseNumberToAdd.trim()}
              >
                Add license
              </button>
            </div>

            {stateLicenses.length > 0 ? (
              <ul className="portal-licensing-list">
                {stateLicenses.map(([state, licenseNumber]) => (
                  <li key={state}>
                    <Chip variant="licensed">
                      {state} {licenseNumber}
                    </Chip>
                    <button
                      type="button"
                      className="portal-profile-iconbtn"
                      onClick={() => removeStateLicense(state)}
                      aria-label={`Remove ${state} license`}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="portal-profile-lede">
                Add each state you are licensed in, with its license number. Include your
                resident state.
              </p>
            )}
          </Pane>

          <button type="submit" className="portal-profile-btn" disabled={submitting}>
            {submitting ? "Saving..." : "Save licensing details"}
          </button>
        </form>
      )}
    </div>
  );
}
