import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Copy, Link2 } from "lucide-react";
import { formatCompLevel } from "@/lib/comp-level";
import {
  formatReferralInviteStatus,
  isReferralInviteCopyable,
  type ReferralInviteSummary,
} from "@/lib/portal-referrals";
import { usePortalReferrals } from "@/hooks/usePortalReferrals";
import { toast } from "sonner";

function formatInviteDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function copyInviteLink(link: string): Promise<void> {
  await navigator.clipboard.writeText(link);
  toast.success("Referral link copied to clipboard.");
}

interface PortalReferralPanelProps {
  embedded?: boolean;
}

export default function PortalReferralPanel({ embedded = false }: PortalReferralPanelProps) {
  const {
    compLevel,
    compOptions,
    invites,
    loading,
    creating,
    createInvite,
  } = usePortalReferrals();

  const [open, setOpen] = useState(false);
  const [recipientLabel, setRecipientLabel] = useState("");
  const [selectedCompLevel, setSelectedCompLevel] = useState<number | "">("");

  const defaultCompLevel = compOptions[0] ?? "";
  const effectiveCompLevel = selectedCompLevel === "" ? defaultCompLevel : selectedCompLevel;

  const pendingCount = useMemo(
    () => invites.filter((invite) => isReferralInviteCopyable(invite)).length,
    [invites],
  );

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    if (effectiveCompLevel === "" || typeof effectiveCompLevel !== "number") {
      toast.error("Select a comp level.");
      return;
    }

    const nickname = recipientLabel.trim();
    if (!nickname) {
      toast.error("Add a nickname for this recruit.");
      return;
    }

    try {
      const invite = await createInvite({
        compLevel: effectiveCompLevel,
        recipientLabel: nickname,
      });
      setRecipientLabel("");
      setSelectedCompLevel("");
      await copyInviteLink(invite.link);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create referral link.");
    }
  };

  const renderInviteRow = (invite: ReferralInviteSummary) => {
    const copyable = isReferralInviteCopyable(invite);
    const label = invite.recipientLabel?.trim() || "Referral link";

    return (
      <div key={invite.id} className="portal-referral-item">
        <div className="portal-referral-item-copy">
          <strong>{label}</strong>
          <span>
            Comp {invite.compLevel} · {formatReferralInviteStatus(invite.status)}
            {invite.status === "pending" ? ` · Expires ${formatInviteDate(invite.expiresAt)}` : ""}
            {invite.consumedAt ? ` · Used ${formatInviteDate(invite.consumedAt)}` : ""}
          </span>
          {copyable && (
            <code className="portal-referral-url">{invite.link}</code>
          )}
        </div>
        {copyable && (
          <button
            type="button"
            className="portal-referral-copy-btn"
            onClick={() => void copyInviteLink(invite.link).catch(() => {
              toast.error("Unable to copy link.");
            })}
            aria-label={`Copy referral link for ${label}`}
          >
            <Copy size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  const panelContent = (
    <div className="portal-referral-panel">
      {loading ? (
        <p className="portal-panel-note">Loading referral links…</p>
      ) : compLevel == null ? (
        <p className="portal-panel-note">
          Your comp level has not been set yet. Contact PNCL support before creating referral links.
        </p>
      ) : compOptions.length === 0 ? (
        <p className="portal-panel-note">
          Your comp level is {formatCompLevel(compLevel)}. You cannot assign a lower comp level, so new
          referral links are unavailable.
        </p>
      ) : (
        <>
          <p className="portal-panel-note">
            Create a unique link for each recruit. Each link can only be used once and assigns the comp
            level you choose. Your comp level: {formatCompLevel(compLevel)}.
          </p>

          <form className="portal-referral-form" onSubmit={(event) => void handleCreate(event)}>
            <label className="portal-field">
              <span>Recruit nickname</span>
              <input
                type="text"
                value={recipientLabel}
                onChange={(event) => setRecipientLabel(event.target.value)}
                placeholder="e.g. Joe B."
                maxLength={120}
                required
                autoComplete="off"
              />
              <span className="portal-field-hint">
                For your records only — not their legal name, so spelling doesn&apos;t need to be exact.
              </span>
            </label>

            <label className="portal-field">
              <span>Comp level</span>
              <select
                value={effectiveCompLevel}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedCompLevel(value ? Number.parseInt(value, 10) : "");
                }}
                required
              >
                {compOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="portal-panel-btn" disabled={creating}>
              {creating ? "Creating…" : "Create & copy link"}
            </button>
          </form>
        </>
      )}

      {invites.length > 0 && (
        <div className="portal-referral-list">
          <h3 className="portal-referral-list-title">Recent links</h3>
          {invites.map(renderInviteRow)}
        </div>
      )}

      {!embedded && (
        <p className="portal-panel-note">
          <Link to="/portal/profile?tab=team">
            Open team dashboard
          </Link>{" "}
          to manage all invite links and track recruit onboarding progress.
        </p>
      )}
    </div>
  );

  if (embedded) {
    return (
      <section className="portal-team-section">
        <div className="portal-team-section-head">
          <h2>Referral links</h2>
          {pendingCount > 0 && (
            <span className="portal-team-section-count">{pendingCount} active</span>
          )}
        </div>
        {panelContent}
      </section>
    );
  }

  return (
    <div className={`portal-tile-group portal-referral-section${open ? " open" : ""}`}>
      <button
        type="button"
        className={`portal-tile${open ? " open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="portal-banner-icon" aria-hidden="true">
          <Link2 size={22} />
        </span>
        <span className="portal-tile-label">
          <span className="portal-tile-title">Referral links</span>
          {pendingCount > 0 && <span className="portal-tile-count">({pendingCount} active)</span>}
        </span>
      </button>

      {open && <div className="portal-tile-panel">{panelContent}</div>}
    </div>
  );
}
