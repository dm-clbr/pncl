import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Camera, FileText, LogOut, Shield } from "lucide-react";
import ProfilePhotoCropModal from "@/components/ProfilePhotoCropModal";
import BottomNav from "@/components/portal/BottomNav";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Segmented from "@/components/portal/Segmented";
import Skeleton from "@/components/portal/Skeleton";
import PortalCarrierCredentials from "@/components/PortalCarrierCredentials";
import PortalLicensingSection from "@/components/PortalLicensingSection";
import PortalProfileDocumentsSection from "@/components/PortalProfileDocumentsSection";
import PortalSureLcLinks from "@/components/PortalSureLcLinks";
import PortalTeamDashboard from "@/components/PortalTeamDashboard";
import AgentBusinessCardDownload from "@/components/AgentBusinessCardDownload";
import CompensationTierDisclosure from "@/components/CompensationTierDisclosure";
import { isEmailConfirmed, useAuth } from "@/contexts/AuthContext";
import { formatAgentPhoneInput } from "@/lib/agent-phone";
import {
  CLOTHING_SIZES,
  fetchPortalProfile,
  formatAgentNumber,
  getDefaultProfileValues,
  getProfileInitials,
  getProfilePhotoUrl,
  profileToFormValues,
  resolveCountyForZip,
  savePortalProfile,
  SHOE_SIZES,
  US_STATES,
  WAIST_SIZES,
  type PortalProfile,
  type PortalProfileFormValues,
} from "@/lib/portal-profile";
import { syncPortalRecoveryEmail } from "@/lib/portal-recovery-email";
import { hasAdminConsoleAccess, isAdminAssist, isGenesisAdmin } from "@/lib/roles";
import { getDirectDepositPdfUrl } from "@/lib/portal-direct-deposit";
import { fetchPortalW9Document, getW9PdfUrl } from "@/lib/portal-w9";
import { fetchPortalIcaDocument } from "@/lib/portal-ica";
import {
  fetchPortalCompAttachments,
  type PortalCompAttachment,
} from "@/lib/portal-comp-attachments";
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
import "@/styles/portal-bento.css";
import "@/styles/portal-profile.css";

type ProfileTab = "details" | "team" | "licensing" | "documents" | "carriers";

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "details", label: "Profile details" },
  { id: "team", label: "Team" },
  { id: "licensing", label: "Licensing" },
  { id: "documents", label: "Documents" },
  { id: "carriers", label: "Carrier logins" },
];

const TAB_ITEMS = PROFILE_TABS.map((tab) => ({
  value: tab.id,
  label: tab.label,
  id: `profile-tab-${tab.id}`,
  controls: `profile-panel-${tab.id}`,
}));

const PORTAL_SOCIAL_LINKS = [
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61588062292202",
    iconSrc: "/fb.svg",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/thepncl_/",
    iconSrc: "/insta.svg",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/the-pncl/?viewAsMember=true",
    iconSrc: "/linkedin.svg",
  },
] as const;

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
  phoneNumber: "",
  recoveryEmail: "",
};

function SizeSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} id={id}>
      <select
        className="portal-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select size</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function PortalProfile() {
  const { user, session, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const tabFromUrl = PROFILE_TABS.some((tab) => tab.id === initialTab)
    ? (initialTab as ProfileTab)
    : "details";
  const { w9, submitted: w9Submitted, loading: w9Loading } = usePortalW9();
  const { directDeposit, submitted: directDepositSubmitted, loading: directDepositLoading } = usePortalDirectDeposit();
  const { ica, submitted: icaSubmitted, loading: icaLoading } = usePortalIca();
  const { todos, loading: todosLoading } = usePortalTodos();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingRecoveryEmail, setSyncingRecoveryEmail] = useState(false);
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
  const [compAttachments, setCompAttachments] = useState<PortalCompAttachment[]>([]);
  const [compLoading, setCompLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>(tabFromUrl);

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

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setCompAttachments([]);
      setCompLoading(false);
      return;
    }

    let cancelled = false;
    setCompLoading(true);

    void fetchPortalCompAttachments(token)
      .then((rows) => {
        if (!cancelled) setCompAttachments(rows);
      })
      .catch(() => {
        if (!cancelled) setCompAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setCompLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

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

  const pendingCompAttachment = useMemo(
    () => compAttachments.find((attachment) => attachment.status === "pending") ?? null,
    [compAttachments],
  );

  const signedCompAttachment = useMemo(
    () => compAttachments.find((attachment) => attachment.status === "signed") ?? null,
    [compAttachments],
  );

  const compSignedDate = useMemo(() => {
    if (!signedCompAttachment?.signedAt) return null;
    return new Date(signedCompAttachment.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [signedCompAttachment?.signedAt]);

  const hasSavedDocuments =
    w9Submitted || directDepositSubmitted || icaSubmitted || compAttachments.length > 0;

  const documentsLoading =
    (w9Loading || directDepositLoading || icaLoading || compLoading) && !hasSavedDocuments;

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
  const displayName = [form.firstName, form.lastName].filter(Boolean).join(" ") || agentEmail;
  // ponytail: dirty is the form measured against the values it was seeded
  // from, through the same two helpers the load effect uses. No form library
  // and no second copy of the form in state.
  const savedValues = useMemo(
    () => (profileRow ? profileToFormValues(profileRow) : getDefaultProfileValues(user)),
    [profileRow, user],
  );
  // ponytail: compare through the same two transforms savePortalProfile
  // applies (trim on every string, lower-case on the recovery email), or a
  // save that normalises input leaves the bar stuck on "Unsaved changes".
  const normalizeForCompare = (key: keyof PortalProfileFormValues, value: string) =>
    key === "recoveryEmail" ? value.trim().toLowerCase() : value.trim();
  const dirty =
    pendingPhotoFile !== null ||
    (Object.keys(savedValues) as (keyof PortalProfileFormValues)[]).some(
      (key) => normalizeForCompare(key, form[key]) !== normalizeForCompare(key, savedValues[key]),
    );
  const showAdminLink = hasAdminConsoleAccess(user);
  const adminLink = isGenesisAdmin(user)
    ? "/portal/admin/genesis"
    : isAdminAssist(user)
      ? "/portal/admin/hierarchy"
      : "/portal/admin";
  const adminLinkLabel = isGenesisAdmin(user)
    ? "Genesis admin"
    : isAdminAssist(user)
      ? "Admin assist"
      : "Admin console";

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
  const [resolvedCounty, setResolvedCounty] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveCountyForZip(form.addressZip, profileRow?.county).then((county) => {
      if (!cancelled) setResolvedCounty(county);
    });
    return () => {
      cancelled = true;
    };
  }, [form.addressZip, profileRow?.county]);

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

      if (session?.access_token) {
        setSyncingRecoveryEmail(true);
        try {
          const recoveryResult = await syncPortalRecoveryEmail(session.access_token, form.recoveryEmail);
          const syncedProfile = await fetchPortalProfile(user.id);
          if (syncedProfile) setProfileRow(syncedProfile);
          if (recoveryResult.syncStatus === "synced") {
            toast.success("Your Google recovery email is up to date.");
          } else {
            toast.error(recoveryResult.error ?? "Your recovery email needs to be synced again.");
          }
        } catch (syncError) {
          const pendingProfile = await fetchPortalProfile(user.id).catch(() => null);
          if (pendingProfile) setProfileRow(pendingProfile);
          toast.error(syncError instanceof Error ? syncError.message : "Your recovery email needs to be synced again.");
        } finally {
          setSyncingRecoveryEmail(false);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryRetry = async () => {
    if (!session?.access_token || !user) return;
    setSyncingRecoveryEmail(true);
    try {
      const recoveryResult = await syncPortalRecoveryEmail(session.access_token, form.recoveryEmail);
      const syncedProfile = await fetchPortalProfile(user.id);
      if (syncedProfile) setProfileRow(syncedProfile);
      if (recoveryResult.syncStatus === "synced") {
        toast.success("Your Google recovery email is up to date.");
      } else {
        toast.error(recoveryResult.error ?? "Your recovery email needs to be synced again.");
      }
    } catch (syncError) {
      toast.error(syncError instanceof Error ? syncError.message : "Unable to sync your recovery email.");
    } finally {
      setSyncingRecoveryEmail(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sign out");
    }
  };

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash portal-profile-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader
            name={displayName}
            email={agentEmail}
            initials={initials}
            photoUrl={displayPhotoUrl}
            stage={!todosLoading && todoTotal > 0 ? PORTAL_PHASE_LABELS[currentPhase] : undefined}
          />

          <PortalSubpageHeader
            title="My profile"
            aside={agentNumber ? <Chip>Agent ID {agentNumber}</Chip> : undefined}
          />

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

          <Segmented
            items={TAB_ITEMS}
            value={activeTab}
            onChange={(value) => setActiveTab(value as ProfileTab)}
            label="Profile sections"
          />

          <div
            role="tabpanel"
            className="portal-profile-tabpanel portal-profile-details"
            id="profile-panel-details"
            aria-labelledby="profile-tab-details"
            hidden={activeTab !== "details"}
          >
            <p className="portal-profile-lede">
              Keep your name, home address, apparel sizes, and profile photo up to date. Your
              county is determined automatically from your ZIP code.
            </p>

            {loading ? (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading profile...</span>
              </div>
            ) : (
              <>
                <Pane title="Profile photo">
                  <div className="portal-profile-identity">
                    <div className="portal-profile-photo-frame">
                      {displayPhotoUrl ? (
                        <img src={displayPhotoUrl} alt="" />
                      ) : (
                        <span aria-hidden="true">{initials}</span>
                      )}
                    </div>
                    <div className="portal-profile-identity-copy">
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
                        className="portal-profile-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera size={16} aria-hidden="true" />
                        {displayPhotoUrl ? "Change photo" : "Upload photo"}
                      </button>
                    </div>
                  </div>

                  <div className="portal-profile-meta">
                    <div>
                      <span>Agent ID</span>
                      <strong>{agentNumber ?? "Pending assignment"}</strong>
                    </div>
                    <CompensationTierDisclosure tier={profileRow?.comp_level} />
                    {todoTotal > 0 && (
                      <div>
                        <span>Current progress</span>
                        <strong>{PORTAL_PHASE_LABELS[currentPhase]}</strong>
                      </div>
                    )}
                  </div>
                </Pane>

                <AgentBusinessCardDownload
                  userId={user?.id ?? ""}
                  firstName={profileRow?.first_name ?? form.firstName}
                  lastName={profileRow?.last_name ?? form.lastName}
                  workEmail={agentEmail}
                  workEmailVerified={isEmailConfirmed(user)}
                  phoneNumber={profileRow?.phone_number}
                  npn={profileRow?.npn}
                  profilePhotoPath={profileRow?.profile_photo_path}
                  profilePhotoUrl={savedPhotoUrl}
                  profileUpdatedAt={profileRow?.updated_at}
                />

                <form
                  className="portal-profile-form"
                  onSubmit={(event) => void handleSubmit(event)}
                >
                  <Pane title="Contact">
                    <Field
                      label="First name"
                      id="profile-first-name"
                      type="text"
                      value={form.firstName}
                      onChange={(event) => updateField("firstName", event.target.value)}
                      autoComplete="given-name"
                      required
                    />

                    <Field
                      label="Last name"
                      id="profile-last-name"
                      type="text"
                      value={form.lastName}
                      onChange={(event) => updateField("lastName", event.target.value)}
                      autoComplete="family-name"
                      required
                    />

                    <Field
                      label="Phone number"
                      id="profile-phone"
                      hint="Pre-filled from your onboarding record when available. Required to complete your profile and generate your PDF business card."
                      type="tel"
                      inputMode="tel"
                      value={form.phoneNumber}
                      onChange={(event) =>
                        updateField("phoneNumber", formatAgentPhoneInput(event.target.value))
                      }
                      placeholder="555-555-0100"
                      autoComplete="tel"
                      required
                      pattern="\d{3}-\d{3}-\d{4}"
                      title="Enter a 10-digit phone number"
                    />

                    <div className="portal-profile-readonly">
                      <span className="portal-field-label">Verified PNCL work email</span>
                      <p>{agentEmail || "Not available"}</p>
                    </div>

                    <Field
                      label="Personal recovery email"
                      id="profile-recovery-email"
                      hint="Required. This personal address helps you recover your PNCL Google account. Do not use your @thepncl.com email."
                      type="email"
                      value={form.recoveryEmail}
                      onChange={(event) => updateField("recoveryEmail", event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />

                    <div className="portal-profile-readonly">
                      <span className="portal-field-label">Google recovery status</span>
                      {profileRow?.recovery_email_sync_status === "synced" ? (
                        <Chip variant="active">Synced</Chip>
                      ) : profileRow?.recovery_email_sync_status === "error" ? (
                        <Chip variant="inactive">Needs attention</Chip>
                      ) : (
                        <Chip variant="pending">Sync pending</Chip>
                      )}
                      {profileRow?.recovery_email_sync_status === "error" && (
                        <button
                          type="button"
                          className="portal-profile-btn"
                          onClick={() => void handleRecoveryRetry()}
                          disabled={syncingRecoveryEmail}
                        >
                          {syncingRecoveryEmail ? "Syncing..." : "Retry Google sync"}
                        </button>
                      )}
                    </div>
                  </Pane>

                  <Pane title="Address">
                    <Field
                      label="Street address"
                      id="profile-address-line1"
                      type="text"
                      value={form.addressLine1}
                      onChange={(event) => updateField("addressLine1", event.target.value)}
                      placeholder="123 Main St, Apt 4"
                      autoComplete="address-line1"
                      required
                    />

                    <Field
                      label="City"
                      id="profile-address-city"
                      type="text"
                      value={form.addressCity}
                      onChange={(event) => updateField("addressCity", event.target.value)}
                      placeholder="City"
                      autoComplete="address-level2"
                      required
                    />

                    <Field label="State" id="profile-address-state" required>
                      <select
                        className="portal-select"
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
                    </Field>

                    <Field
                      label="ZIP code"
                      id="profile-address-zip"
                      type="text"
                      inputMode="numeric"
                      value={form.addressZip}
                      onChange={(event) =>
                        updateField("addressZip", event.target.value.replace(/\D/g, "").slice(0, 5))
                      }
                      placeholder="12345"
                      autoComplete="postal-code"
                      required
                      pattern="\d{5}"
                      title="Enter a 5-digit ZIP code"
                    />

                    <div className="portal-profile-readonly">
                      <span className="portal-field-label">County</span>
                      <Chip>
                        {resolvedCounty ??
                          (form.addressZip.length === 5
                            ? "County not found for this ZIP code"
                            : "Enter your ZIP code to see county")}
                      </Chip>
                    </div>
                  </Pane>

                  <Pane title="Apparel">
                    <div className="portal-profile-sizes">
                      <SizeSelect
                        id="profile-shirt-size"
                        label="Shirt size"
                        value={form.shirtSize}
                        options={CLOTHING_SIZES}
                        onChange={(value) => updateField("shirtSize", value)}
                      />
                      <SizeSelect
                        id="profile-polo-size"
                        label="Polo shirt size"
                        value={form.poloShirtSize}
                        options={CLOTHING_SIZES}
                        onChange={(value) => updateField("poloShirtSize", value)}
                      />
                      <SizeSelect
                        id="profile-hoodie-size"
                        label="Hoodie size"
                        value={form.hoodieSize}
                        options={CLOTHING_SIZES}
                        onChange={(value) => updateField("hoodieSize", value)}
                      />
                      <SizeSelect
                        id="profile-waist-size"
                        label="Waist size"
                        value={form.waistSize}
                        options={WAIST_SIZES}
                        onChange={(value) => updateField("waistSize", value)}
                      />
                      <SizeSelect
                        id="profile-shoe-size"
                        label="Shoe size"
                        value={form.shoeSize}
                        options={SHOE_SIZES}
                        onChange={(value) => updateField("shoeSize", value)}
                      />
                    </div>
                  </Pane>

                  <div className="portal-profile-savebar">
                    <p className="portal-profile-savebar-note">
                      {dirty ? "Unsaved changes" : "All changes saved"}
                    </p>
                    <button
                      type="submit"
                      className="portal-profile-save"
                      disabled={submitting || !dirty}
                    >
                      {submitting ? "Saving..." : "Save profile"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

          <div
            role="tabpanel"
            className="portal-profile-tabpanel"
            id="profile-panel-team"
            aria-labelledby="profile-tab-team"
            hidden={activeTab !== "team"}
          >
            <PortalTeamDashboard />
          </div>

          <div
            role="tabpanel"
            className="portal-profile-tabpanel"
            id="profile-panel-licensing"
            aria-labelledby="profile-tab-licensing"
            hidden={activeTab !== "licensing"}
          >
            <PortalLicensingSection
              user={user}
              profile={profileRow}
              loading={loading}
              names={{ firstName: form.firstName, lastName: form.lastName }}
              onSaved={setProfileRow}
            />
          </div>

          <div
            role="tabpanel"
            className="portal-profile-tabpanel"
            id="profile-panel-documents"
            aria-labelledby="profile-tab-documents"
            hidden={activeTab !== "documents"}
          >
            <div className="portal-profile-docs">
              <Pane title="Saved documents">
                <p className="portal-profile-lede">
                  The portal keeps a copy of each form you sign.
                </p>

                {documentsLoading ? (
                  <div className="portal-profile-rows" aria-busy="true">
                    <span className="portal-sr">Loading documents...</span>
                    <Skeleton variant="row" />
                    <Skeleton variant="row" />
                    <Skeleton variant="row" />
                  </div>
                ) : hasSavedDocuments ? (
                  <ul className="portal-profile-rows">
                    {!icaSubmitted && (
                      <li>
                        <ListRow
                          href="/portal/ica"
                          label="Independent Contractor Agreement"
                          secondary="Sign your ICA to save a copy to your profile."
                        />
                      </li>
                    )}
                    {icaSubmitted && ica && (
                      <li>
                        <ListRow
                          href={icaPdfUrl ?? "/portal/ica"}
                          label="Independent Contractor Agreement"
                          secondary={`Signed${icaSignedDate ? ` on ${icaSignedDate}` : ""} for ${ica.legalName}.`}
                          trailing={icaPdfUrl ? <Chip variant="pdf">PDF</Chip> : undefined}
                        />
                      </li>
                    )}
                    {w9Submitted && w9 && (
                      <li>
                        <ListRow
                          href={w9PdfUrl ?? "/portal/w9"}
                          label="Form W-9"
                          secondary={`Submitted${w9SignedDate ? ` on ${w9SignedDate}` : ""} for ${w9.legalName}.`}
                          trailing={w9PdfUrl ? <Chip variant="pdf">PDF</Chip> : undefined}
                        />
                      </li>
                    )}
                    {directDepositSubmitted && directDeposit && (
                      <li>
                        <ListRow
                          href={directDepositPdfUrl ?? "/portal/direct-deposit"}
                          label="Direct deposit request"
                          secondary={`Submitted${directDepositSignedDate ? ` on ${directDepositSignedDate}` : ""} for ${directDeposit.legalName}.`}
                          trailing={directDepositPdfUrl ? <Chip variant="pdf">PDF</Chip> : undefined}
                        />
                      </li>
                    )}
                    {pendingCompAttachment && (
                      <li>
                        <ListRow
                          href="/portal/comp-agreement"
                          label={pendingCompAttachment.title}
                          secondary={`Ready to sign. Assigned ${new Date(
                            pendingCompAttachment.assignedAt,
                          ).toLocaleDateString(undefined, {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}.`}
                        />
                      </li>
                    )}
                    {signedCompAttachment && (
                      <li>
                        <ListRow
                          href={signedCompAttachment.documentUrl ?? "/portal/comp-agreement"}
                          label={signedCompAttachment.title}
                          secondary={`Signed${compSignedDate ? ` on ${compSignedDate}` : ""}${
                            signedCompAttachment.signatureName
                              ? ` by ${signedCompAttachment.signatureName}`
                              : ""
                          }.`}
                          trailing={
                            signedCompAttachment.documentUrl ? (
                              <Chip variant="pdf">PDF</Chip>
                            ) : undefined
                          }
                        />
                      </li>
                    )}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<FileText size={22} aria-hidden="true" />}
                    title="No documents yet"
                    body="Forms you sign in the portal show up here, with any comp attachment PNCL assigns."
                    action={
                      <>
                        <Link className="portal-profile-btn" to="/portal/ica">
                          Sign your agreement
                        </Link>
                        <Link className="portal-profile-btn" to="/portal/w9">
                          Submit your W-9
                        </Link>
                        <Link className="portal-profile-btn" to="/portal/direct-deposit">
                          Direct deposit form
                        </Link>
                      </>
                    }
                  />
                )}
              </Pane>

              <PortalProfileDocumentsSection user={user} />
            </div>
          </div>

          <div
            role="tabpanel"
            className="portal-profile-tabpanel"
            id="profile-panel-carriers"
            aria-labelledby="profile-tab-carriers"
            hidden={activeTab !== "carriers"}
          >
            <div className="portal-profile-carriers">
              <PortalSureLcLinks todos={resolvedTodos} />
              <PortalCarrierCredentials />
            </div>
          </div>

          {/* The portal footer, same markup and classes as the dashboard's.
              Sign out lives here at every width, never in the tab bar: an
              agent hits that bar with a thumb by accident. */}
          <div className="portal-bento-footer portal-profile-foot">
            {showAdminLink && (
              <Link to={adminLink} className="portal-bento-footer-link">
                <Shield size={15} strokeWidth={2} aria-hidden="true" />
                <span>{adminLinkLabel}</span>
              </Link>
            )}

            <button
              type="button"
              className="portal-bento-footer-link"
              onClick={() => void handleSignOut()}
            >
              <LogOut size={15} strokeWidth={2} aria-hidden="true" />
              Sign out
            </button>

            <div className="portal-bento-socials">
              {PORTAL_SOCIAL_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-bento-social"
                  aria-label={link.label}
                >
                  <span
                    style={{
                      WebkitMaskImage: `url(${link.iconSrc})`,
                      maskImage: `url(${link.iconSrc})`,
                    }}
                    aria-hidden="true"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Outside <main>, a direct child of the page, which is what
          .home2-page:has(> .portal-bottom-nav) > main pads for. */}
      <BottomNav />

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
