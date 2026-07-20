import { useEffect, useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  updateUserProfileFields,
  type AdminUserPortalProfile,
} from "@/lib/admin-api";
import { resolveCountyForZip, US_STATES } from "@/lib/portal-profile";
import { toast } from "sonner";

interface FormState {
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  npn: string;
  eoPolicyNumber: string;
  stateLicenses: string;
}

function toFormState(profile: AdminUserPortalProfile | null): FormState {
  return {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    addressLine1: profile?.addressLine1 ?? "",
    addressCity: profile?.addressCity ?? "",
    addressState: profile?.addressState ?? "",
    addressZip: profile?.addressZip ?? "",
    npn: profile?.npn ?? "",
    eoPolicyNumber: profile?.eoPolicyNumber ?? "",
    stateLicenses: (profile?.stateLicenses ?? []).join(", "),
  };
}

export default function AdminEditProfileModal({
  userId,
  userName,
  profile,
  accessToken,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  profile: AdminUserPortalProfile | null;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [saving, setSaving] = useState(false);
  const [resolvedCounty, setResolvedCounty] = useState<string | null>(profile?.county ?? null);

  useEffect(() => {
    let cancelled = false;
    void resolveCountyForZip(form.addressZip, profile?.county).then((county) => {
      if (!cancelled) setResolvedCounty(county);
    });
    return () => {
      cancelled = true;
    };
  }, [form.addressZip, profile?.county]);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("First and last name are required.");
      return;
    }

    const stateLicenses = form.stateLicenses
      .split(/[,\s]+/)
      .map((state) => state.trim().toUpperCase())
      .filter(Boolean);

    const invalidState = stateLicenses.find(
      (state) => !(US_STATES as readonly string[]).includes(state),
    );
    if (invalidState) {
      toast.error(`"${invalidState}" is not a valid state code.`);
      return;
    }

    setSaving(true);
    try {
      const result = await updateUserProfileFields(accessToken, {
        userId,
        fields: {
          firstName: form.firstName,
          lastName: form.lastName,
          addressLine1: form.addressLine1 || null,
          addressCity: form.addressCity || null,
          addressState: form.addressState || null,
          addressZip: form.addressZip || null,
          npn: form.npn || null,
          eoPolicyNumber: form.eoPolicyNumber || null,
          stateLicenses,
        },
      });
      toast.success(result.message);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={saving ? undefined : onClose}>
      <form
        className="admin-modal admin-edit-profile-modal"
        role="dialog"
        aria-labelledby="admin-edit-profile-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="admin-edit-profile-title">Edit profile</h2>
            <p>
              Correct {userName}&apos;s profile and licensing details. All changes are recorded in
              the audit log.
            </p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-edit-profile-grid">
          <label className="admin-field">
            <span>First name</span>
            <input
              type="text"
              value={form.firstName}
              required
              onChange={(event) => updateField("firstName", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Last name</span>
            <input
              type="text"
              value={form.lastName}
              required
              onChange={(event) => updateField("lastName", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Street address</span>
            <input
              type="text"
              value={form.addressLine1}
              onChange={(event) => updateField("addressLine1", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>City</span>
            <input
              type="text"
              value={form.addressCity}
              onChange={(event) => updateField("addressCity", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>State</span>
            <select
              value={form.addressState}
              onChange={(event) => updateField("addressState", event.target.value)}
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
            <span>ZIP</span>
            <input
              type="text"
              inputMode="numeric"
              value={form.addressZip}
              onChange={(event) => updateField("addressZip", event.target.value)}
            />
          </label>
          <div className="admin-field">
            <span>County</span>
            <p className="portal-profile-derived-value">
              {resolvedCounty ??
                (form.addressZip.trim().length === 5
                  ? "County not found for this ZIP code"
                  : "Set a ZIP code to see county")}
            </p>
          </div>
          <label className="admin-field">
            <span>NPN</span>
            <input
              type="text"
              value={form.npn}
              onChange={(event) => updateField("npn", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>E&amp;O policy number</span>
            <input
              type="text"
              value={form.eoPolicyNumber}
              onChange={(event) => updateField("eoPolicyNumber", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>State licenses (comma-separated)</span>
            <input
              type="text"
              value={form.stateLicenses}
              placeholder="e.g. UT, TX, FL"
              onChange={(event) => updateField("stateLicenses", event.target.value)}
            />
          </label>
        </div>

        <div className="admin-form-actions">
          <button type="button" className="admin-secondary-btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admin-primary-btn" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
