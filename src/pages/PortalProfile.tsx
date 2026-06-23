import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import ProfilePhotoCropModal from "@/components/ProfilePhotoCropModal";
import PortalCarrierCredentials from "@/components/PortalCarrierCredentials";
import { useAuth } from "@/contexts/AuthContext";
import {
  CLOTHING_SIZES,
  fetchPortalProfile,
  getDefaultProfileValues,
  getProfileInitials,
  getProfilePhotoUrl,
  profileToFormValues,
  savePortalProfile,
  SHOE_SIZES,
  WAIST_SIZES,
  type PortalProfileFormValues,
} from "@/lib/portal-profile";
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
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PortalProfileFormValues>(EMPTY_FORM);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoCacheBuster, setPhotoCacheBuster] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const profile = await savePortalProfile(user, form, pendingPhotoFile, photoPath);
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
              {agentEmail && <p className="portal-meta">{agentEmail}</p>}
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

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
