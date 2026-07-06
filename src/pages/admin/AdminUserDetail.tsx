import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, UserRound } from "lucide-react";
import AdminOnboardingDetailsPanel from "@/components/admin/AdminOnboardingDetailsPanel";
import AdminUserDocumentsList from "@/components/admin/AdminUserDocumentsList";
import { useAuth } from "@/contexts/AuthContext";
import {
  backfillGoogleRecovery,
  getAdminUserProfile,
  reactivateGoogleUser,
  sendGmailVerificationEmail,
  setUserTodoCompletion,
  type AdminPortalTodoPhase,
  type AdminUserProfileDetail,
  type AdminUserTodoStatus,
  type GoogleWorkspaceStatus,
} from "@/lib/admin-api";
import { formatRoleLabel } from "@/lib/roles";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

const CHECKLIST_PHASES: { value: AdminPortalTodoPhase; label: string }[] = [
  { value: "on_board", label: "On-Board" },
  { value: "pre_license", label: "Pre-License" },
  { value: "licensing", label: "Licensing" },
  { value: "sales_ready", label: "Sales Ready" },
];

function todoCompletionNote(todo: AdminUserTodoStatus): string | null {
  if (todo.completionType === "auto" && todo.completed && !todo.manuallyCompleted) {
    return "Auto-completed from data";
  }
  if (todo.completionType === "admin") {
    return "Admin step";
  }
  return null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function profileField(label: string, value: string | null | undefined) {
  return (
    <div className="admin-genesis-details-item">
      <dt>{label}</dt>
      <dd>{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function formatGooglePhone(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value.trim();
}

function googleStatusLabel(status: GoogleWorkspaceStatus | "unknown" | null | undefined): string {
  switch (status) {
    case "active":
      return "Active";
    case "auto_suspended":
      return "Auto-suspended";
    case "suspended":
      return "Suspended";
    case "not_found":
      return "Not in Google";
    case "unknown":
      return "Unknown";
    default:
      return "—";
  }
}

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

function recoveryEmailMatches(
  googleRecoveryEmail: string | null | undefined,
  expectedPersonalEmail: string | null | undefined,
): boolean | null {
  const googleEmail = normalizeEmail(googleRecoveryEmail);
  const expectedEmail = normalizeEmail(expectedPersonalEmail);
  if (!expectedEmail) return null;
  if (!googleEmail) return false;
  return googleEmail === expectedEmail;
}

function recoveryPhoneMatches(
  googleRecoveryPhone: string | null | undefined,
  expectedPhone: string | null | undefined,
): boolean | null {
  const googleDigits = normalizePhoneDigits(googleRecoveryPhone);
  const expectedDigits = normalizePhoneDigits(expectedPhone);
  if (!expectedDigits || expectedDigits === "0000000000") return null;
  if (!googleDigits) return false;
  const normalizedGoogle = googleDigits.length === 11 && googleDigits.startsWith("1")
    ? googleDigits.slice(1)
    : googleDigits;
  const normalizedExpected = expectedDigits.length === 11 && expectedDigits.startsWith("1")
    ? expectedDigits.slice(1)
    : expectedDigits;
  return normalizedGoogle === normalizedExpected;
}

export default function AdminUserDetail() {
  const { userId = "" } = useParams();
  const { session } = useAuth();
  const [profile, setProfile] = useState<AdminUserProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingGmailVerification, setSendingGmailVerification] = useState(false);
  const [syncingGoogleRecovery, setSyncingGoogleRecovery] = useState(false);
  const [reactivatingGoogle, setReactivatingGoogle] = useState(false);
  const [togglingTodoSlug, setTogglingTodoSlug] = useState<string | null>(null);

  useEffect(() => {
    document.title = "User profile — PNCL Admin";
    trackPageView("admin_user_detail");
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getAdminUserProfile(token, userId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load user profile");
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, userId]);

  const handleRefreshDocuments = async () => {
    const token = session?.access_token;
    if (!token || !userId) return;

    try {
      const data = await getAdminUserProfile(token, userId);
      setProfile(data);
      toast.success("Documents refreshed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to refresh documents");
    }
  };

  const agent = profile?.agent;
  const hasGoogleWorkspaceAccount = Boolean(
    agent?.onboardingId
      && agent.onboarding?.workspaceEmail
      && agent.googleWorkspaceStatus !== "not_found",
  );
  const canSendGmailVerification = Boolean(
    hasGoogleWorkspaceAccount
      && agent?.personalEmail
      && agent.googleWorkspaceStatus === "auto_suspended",
  );
  const canSyncGoogleRecovery = hasGoogleWorkspaceAccount;
  const canReactivateGoogle = Boolean(
    hasGoogleWorkspaceAccount
      && (agent?.googleWorkspaceStatus === "auto_suspended" || agent?.googleWorkspaceStatus === "suspended"),
  );
  const googleWorkspace = profile?.googleWorkspace;
  const recoveryEmailIsExpected = recoveryEmailMatches(
    googleWorkspace?.recoveryEmail,
    agent?.personalEmail,
  );
  const recoveryPhoneIsExpected = recoveryPhoneMatches(
    googleWorkspace?.recoveryPhone ?? googleWorkspace?.mobilePhone,
    agent?.onboarding?.phoneNumber,
  );

  const handleSendGmailVerification = async () => {
    const token = session?.access_token;
    if (!token || !agent) return;

    const destination = agent.personalEmail ?? "the agent's personal email";
    const actionLabel = agent.gmailVerificationEmailSentAt ? "Resend" : "Send";
    if (!window.confirm(`${actionLabel} Gmail verification instructions to ${destination}?`)) return;

    setSendingGmailVerification(true);
    try {
      const result = await sendGmailVerificationEmail(token, {
        userId: agent.id,
        forceResend: Boolean(agent.gmailVerificationEmailSentAt),
      });
      toast.success(result.message);
      const refreshed = await getAdminUserProfile(token, agent.id);
      setProfile(refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send Gmail verification email");
    } finally {
      setSendingGmailVerification(false);
    }
  };

  const handleSyncGoogleRecovery = async () => {
    const token = session?.access_token;
    if (!token || !agent) return;

    const destination = agent.personalEmail ?? "the agent's personal email";
    if (!window.confirm(`Push Google recovery email and phone to ${agent.email} using ${destination}?`)) return;

    setSyncingGoogleRecovery(true);
    try {
      const result = await backfillGoogleRecovery(token, { userId: agent.id });
      toast.success(result.message);
      const refreshed = await getAdminUserProfile(token, agent.id);
      setProfile(refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sync Google recovery info");
    } finally {
      setSyncingGoogleRecovery(false);
    }
  };

  const handleToggleTodo = async (todo: AdminUserTodoStatus) => {
    const token = session?.access_token;
    if (!token || !agent) return;

    const next = !todo.completed;
    setTogglingTodoSlug(todo.slug);
    try {
      await setUserTodoCompletion(token, { userId: agent.id, slug: todo.slug, completed: next });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              todos: prev.todos.map((item) =>
                item.slug === todo.slug
                  ? { ...item, completed: next, manuallyCompleted: next }
                  : item,
              ),
            }
          : prev,
      );
      toast.success(next ? `"${todo.title}" marked complete.` : `"${todo.title}" marked incomplete.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update checklist item");
    } finally {
      setTogglingTodoSlug(null);
    }
  };

  const handleReactivateGoogle = async () => {
    const token = session?.access_token;
    if (!token || !agent) return;

    if (!window.confirm(`Reactivate ${agent.email} in Google Workspace?`)) return;

    setReactivatingGoogle(true);
    try {
      const result = await reactivateGoogleUser(token, { userId: agent.id });
      toast.success(result.message);
      const refreshed = await getAdminUserProfile(token, agent.id);
      setProfile(refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reactivate Google account");
    } finally {
      setReactivatingGoogle(false);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head admin-panel-head-row">
        <div className="admin-panel-head">
          <UserRound size={22} aria-hidden="true" />
          <div>
            <h1>{agent?.name ?? "User profile"}</h1>
            <p>Review onboarding details, portal profile info, and saved documents.</p>
          </div>
        </div>
        <Link to="/portal/admin/users" className="admin-back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to users
        </Link>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading user profile" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && profile && agent && (
        <div className="admin-user-profile-layout">
          <div className="admin-user-profile-summary">
            <div className="admin-user-profile-identity">
              {profile.portalProfile?.profilePhotoUrl ? (
                <img
                  src={profile.portalProfile.profilePhotoUrl}
                  alt=""
                  className="admin-user-profile-photo"
                />
              ) : (
                <span className="admin-user-profile-photo admin-user-profile-photo-fallback" aria-hidden="true">
                  {agent.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <h2>{agent.name}</h2>
                <p className="admin-inline-note">{agent.email}</p>
              </div>
            </div>

            <dl className="admin-genesis-details-grid admin-user-profile-meta">
              <div className="admin-genesis-details-item">
                <dt>Role</dt>
                <dd>{formatRoleLabel(agent.role)}</dd>
              </div>
              <div className="admin-genesis-details-item">
                <dt>Status</dt>
                <dd>{agent.status?.replace(/_/g, " ") ?? "—"}</dd>
              </div>
              <div className="admin-genesis-details-item">
                <dt>Comp level</dt>
                <dd>{agent.compLevel ?? "—"}</dd>
              </div>
              <div className="admin-genesis-details-item">
                <dt>Upline</dt>
                <dd>{agent.referrerName ?? agent.uplineNetwork ?? "—"}</dd>
              </div>
              <div className="admin-genesis-details-item">
                <dt>Account created</dt>
                <dd>{formatDateTime(agent.createdAt)}</dd>
              </div>
              <div className="admin-genesis-details-item">
                <dt>Onboarding completed</dt>
                <dd>{formatDateTime(agent.onboardingCompletedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="admin-user-profile-section">
            <div className="admin-panel-head admin-panel-head-row">
              <div>
                <h2>Google Workspace</h2>
                <p>Live recovery contact info stored on the agent&apos;s Google account.</p>
              </div>
              {canSyncGoogleRecovery && (
                <div className="admin-action-row">
                  {canReactivateGoogle && (
                    <button
                      type="button"
                      className="admin-primary-btn"
                      disabled={reactivatingGoogle}
                      onClick={() => void handleReactivateGoogle()}
                    >
                      {reactivatingGoogle ? "Reactivating…" : "Reactivate Google account"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-secondary-btn"
                    disabled={syncingGoogleRecovery}
                    onClick={() => void handleSyncGoogleRecovery()}
                  >
                    {syncingGoogleRecovery ? "Syncing…" : "Sync Google recovery"}
                  </button>
                </div>
              )}
            </div>

            {googleWorkspace ? (
              <>
                {googleWorkspace.loadError && (
                  <p className="admin-error">{googleWorkspace.loadError}</p>
                )}
                <dl className="admin-genesis-details-grid">
                  <div className="admin-genesis-details-item">
                    <dt>Google status</dt>
                    <dd>{googleStatusLabel(googleWorkspace.status)}</dd>
                  </div>
                  {profileField("Last Google sign-in", formatDateTime(googleWorkspace.lastLoginTime))}
                  <div className="admin-genesis-details-item">
                    <dt>Recovery email</dt>
                    <dd>
                      {googleWorkspace.recoveryEmail ?? "—"}
                      {recoveryEmailIsExpected === true && (
                        <span className="admin-inline-note"> Matches onboarding personal email</span>
                      )}
                      {recoveryEmailIsExpected === false && agent.personalEmail && (
                        <span className="admin-inline-note"> Expected {agent.personalEmail}</span>
                      )}
                    </dd>
                  </div>
                  <div className="admin-genesis-details-item">
                    <dt>Recovery phone</dt>
                    <dd>
                      {formatGooglePhone(googleWorkspace.recoveryPhone)}
                      {recoveryPhoneIsExpected === true && (
                        <span className="admin-inline-note"> Matches onboarding phone</span>
                      )}
                      {recoveryPhoneIsExpected === false && agent.onboarding?.phoneNumber && (
                        <span className="admin-inline-note">
                          {" "}
                          Expected {formatGooglePhone(agent.onboarding.phoneNumber)}
                        </span>
                      )}
                    </dd>
                  </div>
                  {profileField("Mobile phone", formatGooglePhone(googleWorkspace.mobilePhone))}
                  {googleWorkspace.suspensionReason && (
                    profileField("Suspension reason", googleWorkspace.suspensionReason)
                  )}
                  {profileField("Expected personal email", agent.personalEmail)}
                  {profileField("Expected phone", formatGooglePhone(agent.onboarding?.phoneNumber))}
                </dl>
              </>
            ) : (
              <p className="admin-empty">No Google Workspace email is linked to this user.</p>
            )}
          </div>

          <div className="admin-user-profile-section">
            <div className="admin-panel-head admin-panel-head-row">
              <div>
                <h2>Onboarding information</h2>
                <p>Details collected during agent onboarding.</p>
              </div>
              {canSendGmailVerification && (
                <button
                  type="button"
                  className="admin-primary-btn"
                  disabled={sendingGmailVerification}
                  onClick={() => void handleSendGmailVerification()}
                >
                  {sendingGmailVerification
                    ? "Sending…"
                    : agent.gmailVerificationEmailSentAt
                      ? "Resend Gmail verification"
                      : "Send Gmail verification"}
                </button>
              )}
            </div>
            {agent.onboarding ? (
              <AdminOnboardingDetailsPanel
                onboarding={agent.onboarding}
                referrerName={agent.referrerName}
              />
            ) : (
              <p className="admin-empty">No onboarding record is linked to this user.</p>
            )}
          </div>

          <div className="admin-user-profile-section">
            <div className="admin-panel-head">
              <div>
                <h2>Portal profile</h2>
                <p>Apparel sizes and profile details from the agent portal.</p>
              </div>
            </div>
            {profile.portalProfile ? (
              <dl className="admin-genesis-details-grid">
                {profileField("First name", profile.portalProfile.firstName)}
                {profileField("Last name", profile.portalProfile.lastName)}
                {profileField("Shirt size", profile.portalProfile.shirtSize)}
                {profileField("Polo shirt size", profile.portalProfile.poloShirtSize)}
                {profileField("Hoodie size", profile.portalProfile.hoodieSize)}
                {profileField("Waist size", profile.portalProfile.waistSize)}
                {profileField("Shoe size", profile.portalProfile.shoeSize)}
                {profileField("NPN", profile.portalProfile.npn)}
                {profileField("E&O policy number", profile.portalProfile.eoPolicyNumber)}
                {profileField(
                  "State licenses",
                  profile.portalProfile.stateLicenses.length > 0
                    ? profile.portalProfile.stateLicenses.join(", ")
                    : null,
                )}
                <div className="admin-genesis-details-item">
                  <dt>Driver&apos;s license</dt>
                  <dd>
                    {profile.portalProfile.driversLicenseUrl ? (
                      <a
                        href={profile.portalProfile.driversLicenseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-secondary-link"
                      >
                        View upload
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="admin-genesis-details-item">
                  <dt>Profile updated</dt>
                  <dd>{formatDateTime(profile.portalProfile.updatedAt)}</dd>
                </div>
              </dl>
            ) : (
              <p className="admin-empty">This user has not saved a portal profile yet.</p>
            )}
          </div>

          <div className="admin-user-profile-section">
            <div className="admin-panel-head">
              <div>
                <h2>Onboarding checklist</h2>
                <p>
                  Check off steps for this agent — including admin-completed steps like Sure LC
                  and carrier assignment requests. Auto-completed items resolve from saved data.
                </p>
              </div>
            </div>
            {profile.todos.length === 0 ? (
              <p className="admin-empty">No published checklist items.</p>
            ) : (
              <div className="admin-user-todo-phases">
                {CHECKLIST_PHASES.map((phase) => {
                  const items = profile.todos.filter((todo) => todo.phase === phase.value);
                  if (items.length === 0) return null;
                  const doneCount = items.filter((todo) => todo.completed).length;
                  return (
                    <div key={phase.value} className="admin-user-todo-phase">
                      <div className="admin-user-todo-phase-head">
                        <h3>{phase.label}</h3>
                        <span>{doneCount}/{items.length}</span>
                      </div>
                      <ul className="admin-user-todo-list">
                        {items.map((todo) => {
                          const note = todoCompletionNote(todo);
                          const lockedAutoComplete =
                            todo.completionType === "auto" && todo.completed && !todo.manuallyCompleted;
                          return (
                            <li key={todo.slug} className={todo.completed ? "done" : undefined}>
                              <button
                                type="button"
                                className="admin-user-todo-toggle"
                                disabled={togglingTodoSlug === todo.slug || lockedAutoComplete}
                                onClick={() => void handleToggleTodo(todo)}
                                aria-label={
                                  todo.completed
                                    ? `Mark "${todo.title}" incomplete`
                                    : `Mark "${todo.title}" complete`
                                }
                              >
                                {todo.completed ? (
                                  <CheckCircle2 size={17} aria-hidden="true" />
                                ) : (
                                  <Circle size={17} aria-hidden="true" />
                                )}
                              </button>
                              <div className="admin-user-todo-body">
                                <span className="admin-user-todo-title">{todo.title}</span>
                                {note && <span className="admin-user-todo-note">{note}</span>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="admin-user-profile-section">
            <div className="admin-panel-head admin-panel-head-row">
              <div>
                <h2>Saved documents</h2>
                <p>W-9, direct deposit, and other PDFs stored on this user&apos;s profile.</p>
              </div>
              <button type="button" className="admin-icon-btn" onClick={() => void handleRefreshDocuments()}>
                Refresh links
              </button>
            </div>

            {(profile.w9 || profile.directDeposit) && (
              <dl className="admin-genesis-details-grid admin-user-form-status">
                {profile.w9 && (
                  <div className="admin-genesis-details-item">
                    <dt>Form W-9</dt>
                    <dd>Signed {formatDate(profile.w9.signedAt)} by {profile.w9.signatureName}</dd>
                  </div>
                )}
                {profile.directDeposit && (
                  <div className="admin-genesis-details-item">
                    <dt>Direct deposit</dt>
                    <dd>
                      Signed {formatDate(profile.directDeposit.signedAt)} —{" "}
                      {profile.directDeposit.accountType === "checking" ? "Checking" : "Savings"} account
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <AdminUserDocumentsList documents={profile.documents} />
          </div>
        </div>
      )}
    </section>
  );
}
