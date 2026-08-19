import { X } from "lucide-react";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";
import type { AssistHierarchyMember, AssistHierarchyNode } from "@/lib/admin-api";

interface HierarchyAssistDetailModalProps {
  node: AssistHierarchyNode;
  onClose: () => void;
  onFocusAgent: (agentId: string) => void;
}

function getNodePeople(node: AssistHierarchyNode): AssistHierarchyMember[] {
  if (node.isPartnerGroup && node.members?.length) return node.members;

  return [{
    id: node.id,
    name: node.name,
    npn: node.npn,
    referrerName: node.referrerName,
    referrerNpn: node.referrerNpn,
  }];
}

function countPeople(node: AssistHierarchyNode): number {
  return getNodePeople(node).length;
}

function countTotalDownline(node: AssistHierarchyNode): number {
  return node.children.reduce(
    (total, child) => total + countPeople(child) + countTotalDownline(child),
    0,
  );
}

function formatUpline(person: AssistHierarchyMember): string {
  return person.referrerName ?? "—";
}

export function HierarchyAssistDetailModal({
  node,
  onClose,
  onFocusAgent,
}: HierarchyAssistDetailModalProps) {
  const people = getNodePeople(node);
  const directDownline = node.children.flatMap(getNodePeople);
  const totalDownline = countTotalDownline(node);

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal admin-hierarchy-assist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hierarchy-assist-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="hierarchy-assist-detail-title">
              {node.isPartnerGroup ? "Business partner details" : node.name}
            </h2>
            <p>Read-only hierarchy information</p>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-hierarchy-assist-people">
          {people.map((person) => (
            <section className="admin-hierarchy-assist-person" key={person.id}>
              <div className="admin-hierarchy-assist-identity">
                <AdminUserAvatar
                  name={person.name}
                  size="lg"
                />
                <div>
                  <h3>{person.name}</h3>
                </div>
              </div>

              <dl className="admin-hierarchy-assist-details">
                <div>
                  <dt>NPN number</dt>
                  <dd>{person.npn ?? "—"}</dd>
                </div>
                <div>
                  <dt>Upline</dt>
                  <dd>
                    {formatUpline(person)}
                    {person.referrerNpn && (
                      <span className="admin-user-subtext">NPN {person.referrerNpn}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          ))}
        </div>

        <dl className="admin-hierarchy-assist-details admin-hierarchy-assist-downline">
          <div>
            <dt>Direct downline</dt>
            <dd>{directDownline.length}</dd>
          </div>
          <div>
            <dt>Total downline</dt>
            <dd>{totalDownline}</dd>
          </div>
          {directDownline.length > 0 && (
            <div className="admin-hierarchy-assist-direct-list">
              <dt>Direct reports</dt>
              <dd>
                <ul>
                  {directDownline.map((person) => (
                    <li key={person.id}>
                      <strong>{person.name}</strong>
                      <span>NPN {person.npn ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>

        <div className="admin-modal-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={() => onFocusAgent(node.memberIds?.[0] ?? node.id)}
          >
            Focus on this {node.isPartnerGroup ? "group" : "person"}
          </button>
          <button type="button" className="admin-primary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
