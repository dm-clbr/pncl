import { X } from "lucide-react";
import type { AssistHierarchyNode } from "@/lib/admin-api";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";
import { countTotalDownline } from "@/lib/hierarchy-utils";

interface HierarchyAssistDetailModalProps {
  node: AssistHierarchyNode;
  onClose: () => void;
  onFocusAgent: (agentId: string) => void;
}

export function HierarchyAssistDetailModal({
  node,
  onClose,
  onFocusAgent,
}: HierarchyAssistDetailModalProps) {
  const directDownline = node.children.length;
  const totalDownline = countTotalDownline(node);
  const members = node.isPartnerGroup && node.members?.length
    ? node.members
    : [{
        id: node.id,
        email: node.email,
        npn: node.npn,
        profilePhotoPath: node.profilePhotoPath,
        profileUpdatedAt: node.profileUpdatedAt,
      }];

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal admin-hierarchy-assist-modal"
        role="dialog"
        aria-labelledby="hierarchy-assist-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h2 id="hierarchy-assist-detail-title">
            {node.isPartnerGroup ? "Business partners" : "Agent details"}
          </h2>
          <button type="button" className="admin-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-hierarchy-assist-identity">
          <div className="admin-hierarchy-tile-avatars">
            {members.map((member) => (
              <AdminUserAvatar
                key={member.id}
                email={member.email}
                profilePhotoPath={member.profilePhotoPath}
                profileUpdatedAt={member.profileUpdatedAt}
                size="lg"
              />
            ))}
          </div>
        </div>

        <dl className="admin-hierarchy-assist-details">
          {node.isPartnerGroup ? (
            members.map((member) => (
              <div key={member.id}>
                <dt>Partner</dt>
                <dd>
                  {member.email}
                  <span className="admin-user-subtext">NPN {member.npn ?? "—"}</span>
                </dd>
              </div>
            ))
          ) : (
            <>
              <div>
                <dt>Email</dt>
                <dd>{node.email}</dd>
              </div>
              <div>
                <dt>NPN</dt>
                <dd>{node.npn ?? "—"}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Upline email</dt>
            <dd>{node.referrerEmail ?? "—"}</dd>
          </div>
          <div>
            <dt>Upline NPN</dt>
            <dd>{node.referrerNpn ?? "—"}</dd>
          </div>
          <div>
            <dt>Direct downline</dt>
            <dd>{directDownline}</dd>
          </div>
          <div>
            <dt>Total downline</dt>
            <dd>{totalDownline}</dd>
          </div>
        </dl>

        <div className="admin-modal-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={() => onFocusAgent(node.memberIds?.[0] ?? node.id)}
          >
            Focus on this group
          </button>
          <button type="button" className="admin-primary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
