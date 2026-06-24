import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, UserRound } from "lucide-react";
import AdminOnboardingDetailsPanel from "@/components/admin/AdminOnboardingDetailsPanel";
import AdminUserDocumentsList from "@/components/admin/AdminUserDocumentsList";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdminUserProfile,
  type AdminUserProfileDetail,
} from "@/lib/admin-api";
import { formatRoleLabel } from "@/lib/roles";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

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

export default function AdminUserDetail() {
  const { userId = "" } = useParams();
  const { session } = useAuth();
  const [profile, setProfile] = useState<AdminUserProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <div className="admin-panel-head">
              <div>
                <h2>Onboarding information</h2>
                <p>Details collected during agent onboarding.</p>
              </div>
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
