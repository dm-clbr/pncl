import { useEffect, useId, useRef, useState } from "react";
import { Mail, MoreHorizontal, Pencil, RefreshCw, Shield, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import type { AgentSummary } from "@/lib/admin-api";
import type { PortalRole } from "@/lib/roles";

interface AdminUserRowActionsMenuProps {
  agent: AgentSummary;
  isSelf: boolean;
  savingEmail: boolean;
  isResending: boolean;
  isSendingGmailVerification: boolean;
  isSyncingRecovery: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onEditEmail: (agent: AgentSummary) => void;
  onResendActivation: (agent: AgentSummary) => void;
  onSendGmailVerification: (agent: AgentSummary) => void;
  onSyncGoogleRecovery: (agent: AgentSummary) => void;
  onRoleChange: (agent: AgentSummary, role: PortalRole) => void;
  onDelete: (agent: AgentSummary) => void;
}

export default function AdminUserRowActionsMenu({
  agent,
  isSelf,
  savingEmail,
  isResending,
  isSendingGmailVerification,
  isSyncingRecovery,
  isUpdating,
  isDeleting,
  onEditEmail,
  onResendActivation,
  onSendGmailVerification,
  onSyncGoogleRecovery,
  onRoleChange,
  onDelete,
}: AdminUserRowActionsMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const busy = savingEmail || isResending || isSendingGmailVerification || isSyncingRecovery || isUpdating || isDeleting;
  const canSendGmailVerification = Boolean(
    agent.onboardingId
      && agent.personalEmail
      && agent.onboarding?.workspaceEmail
      && agent.googleWorkspaceStatus === "auto_suspended",
  );
  const canSyncGoogleRecovery = Boolean(
    agent.onboardingId && agent.personalEmail && agent.onboarding?.workspaceEmail,
  );

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const minWidth = 220;
      const left = Math.max(12, Math.min(rect.right - minWidth, window.innerWidth - minWidth - 12));

      setMenuStyle({
        top: rect.bottom + 6,
        left,
        minWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  const roleItems: Array<{
    key: string;
    label: string;
    role: PortalRole;
    icon: typeof Shield;
  }> = [];

  if (!isSelf) {
    if (agent.role !== "admin") {
      roleItems.push({ key: "admin", label: "Make admin", role: "admin", icon: Shield });
    }
    if (agent.role !== "genesis_admin") {
      roleItems.push({
        key: "genesis_admin",
        label: "Make Genesis admin",
        role: "genesis_admin",
        icon: ShieldCheck,
      });
    }
    if (agent.role !== "agent") {
      roleItems.push({
        key: "agent",
        label: "Remove elevated access",
        role: "agent",
        icon: UserMinus,
      });
    }
  }

  return (
    <div ref={rootRef} className="admin-actions-menu">
      <button
        ref={triggerRef}
        type="button"
        className="admin-icon-btn admin-actions-menu-trigger"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        {isDeleting ? "Deleting…" : isUpdating ? "Updating…" : isSyncingRecovery ? "Syncing…" : isSendingGmailVerification ? "Sending…" : isResending ? "Sending…" : "Actions"}
      </button>

      {open && menuStyle && (
        <div
          id={menuId}
          className="admin-actions-menu-panel"
          role="menu"
          aria-label={`Actions for ${agent.name}`}
          style={{
            top: menuStyle.top,
            left: menuStyle.left,
            minWidth: menuStyle.minWidth,
          }}
        >
          <button
            type="button"
            className="admin-actions-menu-item"
            role="menuitem"
            disabled={savingEmail}
            onClick={() => runAction(() => onEditEmail(agent))}
          >
            <Pencil size={15} aria-hidden="true" />
            Edit email
          </button>

          {!agent.emailConfirmed && (
            <button
              type="button"
              className="admin-actions-menu-item"
              role="menuitem"
              disabled={isResending}
              onClick={() => runAction(() => onResendActivation(agent))}
            >
              <Mail size={15} aria-hidden="true" />
              {isResending ? "Sending welcome email…" : "Resend welcome email"}
            </button>
          )}

          {canSendGmailVerification && (
            <button
              type="button"
              className="admin-actions-menu-item"
              role="menuitem"
              disabled={isSendingGmailVerification}
              onClick={() => runAction(() => onSendGmailVerification(agent))}
            >
              <Mail size={15} aria-hidden="true" />
              {isSendingGmailVerification
                ? "Sending Gmail verification…"
                : agent.gmailVerificationEmailSentAt
                  ? "Resend Gmail verification"
                  : "Send Gmail verification"}
            </button>
          )}

          {canSyncGoogleRecovery && (
            <button
              type="button"
              className="admin-actions-menu-item"
              role="menuitem"
              disabled={isSyncingRecovery}
              onClick={() => runAction(() => onSyncGoogleRecovery(agent))}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {isSyncingRecovery ? "Syncing Google recovery…" : "Sync Google recovery"}
            </button>
          )}

          {roleItems.length > 0 && (
            <>
              <div className="admin-actions-menu-divider" role="separator" aria-hidden="true" />
              {roleItems.map(({ key, label, role, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className="admin-actions-menu-item"
                  role="menuitem"
                  disabled={isUpdating || isDeleting}
                  onClick={() => runAction(() => onRoleChange(agent, role))}
                >
                  <Icon size={15} aria-hidden="true" />
                  {isUpdating ? "Updating role…" : label}
                </button>
              ))}
            </>
          )}

          {!isSelf && (
            <>
              <div className="admin-actions-menu-divider" role="separator" aria-hidden="true" />
              <button
                type="button"
                className="admin-actions-menu-item admin-actions-menu-item-danger"
                role="menuitem"
                disabled={isDeleting}
                onClick={() => runAction(() => onDelete(agent))}
              >
                <Trash2 size={15} aria-hidden="true" />
                {isDeleting ? "Deleting…" : "Delete user"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
