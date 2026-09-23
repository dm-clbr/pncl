import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Copy, Link2 } from "lucide-react";
import Chip from "@/components/portal/Chip";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
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
      toast.error("Select a starting contract.");
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
    const status = `${invite.compLevel}% starting contract \u00b7 ${formatReferralInviteStatus(invite.status)}`
      + (invite.sharedFromPartner ? " \u00b7 Business partner link" : "")
      + (invite.status === "pending" ? ` \u00b7 Expires ${formatInviteDate(invite.expiresAt)}` : "")
      + (invite.consumedAt ? ` \u00b7 Used ${formatInviteDate(invite.consumedAt)}` : "");

    return (
      <li key={invite.id}>
        <ListRow
          label={label}
          secondary={status}
          trailing={copyable ? (
            <button
              type="button"
              className="portal-profile-copy"
              onClick={() => void copyInviteLink(invite.link).catch(() => {
                toast.error("Unable to copy link.");
              })}
              aria-label={`Copy referral link for ${label}`}
            >
              <Copy size={16} aria-hidden="true" />
            </button>
          ) : null}
        />
        {/* ponytail: the link stays on screen so a browser that blocks the
            clipboard still leaves the agent something to select. */}
        {copyable && <code className="portal-profile-invite-url">{invite.link}</code>}
      </li>
    );
  };

  const panelContent = (
    <div className="portal-referral-panel">
      {loading ? (
        <p className="portal-profile-lede">Loading referral links...</p>
      ) : compLevel == null ? (
        <p className="portal-profile-lede">
          Referral links are not available for your account yet. Contact PNCL support for help.
        </p>
      ) : compOptions.length === 0 ? (
        <p className="portal-profile-lede">
          New referral links are not available for your account. Contact PNCL support for help.
        </p>
      ) : (
        <>
          <p className="portal-profile-lede">
            Create a unique, single-use link for each recruit and choose their starting contract. If
            you have a linked business partner, you share the same referral link list.
          </p>

          <form className="portal-profile-form" onSubmit={(event) => void handleCreate(event)}>
            <Field
              label="Recruit nickname"
              id="referral-nickname"
              hint="For your records only, not their legal name, so spelling does not need to be exact."
              type="text"
              value={recipientLabel}
              onChange={(event) => setRecipientLabel(event.target.value)}
              placeholder="e.g. Joe B."
              maxLength={120}
              autoComplete="off"
              required
            />

            <Field label="Starting contract" id="referral-starting-contract" required>
              <select
                className="portal-select"
                value={effectiveCompLevel}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedCompLevel(value ? Number.parseInt(value, 10) : "");
                }}
              >
                {compOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}%
                  </option>
                ))}
              </select>
            </Field>

            <button type="submit" className="portal-profile-btn" disabled={creating}>
              {creating ? "Creating..." : "Create & copy link"}
            </button>
          </form>
        </>
      )}

      {invites.length > 0 && (
        <div className="portal-profile-invites">
          <h3 className="portal-profile-subhead">Recent links</h3>
          <ul className="portal-profile-rows">{invites.map(renderInviteRow)}</ul>
        </div>
      )}

      {!embedded && (
        <p className="portal-profile-lede">
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
      <Pane
        title="Referral links"
        aside={pendingCount > 0 ? <Chip variant="active">{pendingCount} active</Chip> : undefined}
      >
        {panelContent}
      </Pane>
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
