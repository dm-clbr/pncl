import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Handshake, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteSetterCloserPolicy,
  formatAgentNumber,
  listAgents,
  listCarriers,
  listSetterCloserPolicies,
  upsertSetterCloserPolicy,
  type AdminCarrierSummary,
  type AdminSetterCloserPolicy,
  type AgentSummary,
  type LeadPurchaser,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

interface PolicyDraft {
  id?: string;
  policyNumber: string;
  carrier: string;
  clientName: string;
  leadPurchaser: LeadPurchaser;
  setterUserId: string;
  setterNpn: string;
  setterName: string;
  closerUserId: string;
  closerNpn: string;
  closerName: string;
  policyDate: string;
  notes: string;
}

const EMPTY_DRAFT: PolicyDraft = {
  policyNumber: "",
  carrier: "",
  clientName: "",
  leadPurchaser: "setter",
  setterUserId: "",
  setterNpn: "",
  setterName: "",
  closerUserId: "",
  closerNpn: "",
  closerName: "",
  policyDate: "",
  notes: "",
};

function agentOptionLabel(agent: AgentSummary): string {
  const npn = resolveAgentNpn(agent);
  const identifier = npn
    ? `NPN ${npn}`
    : formatAgentNumber(agent.agentNumber) ?? agent.email;
  return `${agent.name} (${identifier})`;
}

function resolveAgentNpn(agent: AgentSummary | undefined): string {
  if (!agent) return "";
  return agent.npn?.trim() || agent.onboarding?.npn?.trim() || "";
}

function findAgent(agents: AgentSummary[], userId: string): AgentSummary | undefined {
  if (!userId) return undefined;
  return agents.find((agent) => agent.id === userId);
}

function syncFormAgents(form: PolicyDraft, agents: AgentSummary[]): PolicyDraft {
  const ids = resolveAgentIdsFromNpns(form, agents);
  const setterAgent = findAgent(agents, ids.setterUserId);
  const closerAgent = findAgent(agents, ids.closerUserId);

  return {
    ...form,
    ...ids,
    setterNpn: resolveAgentNpn(setterAgent) || form.setterNpn,
    setterName: setterAgent?.name || form.setterName,
    closerNpn: resolveAgentNpn(closerAgent) || form.closerNpn,
    closerName: closerAgent?.name || form.closerName,
  };
}

function sortAgents(agents: AgentSummary[]): AgentSummary[] {
  return [...agents].sort((left, right) => left.name.localeCompare(right.name));
}

function applyAgentSelection(
  form: PolicyDraft,
  role: "setter" | "closer",
  userId: string,
  agents: AgentSummary[],
): PolicyDraft {
  if (!userId) {
    if (role === "setter") {
      return { ...form, setterUserId: "", setterNpn: "", setterName: "" };
    }
    return { ...form, closerUserId: "", closerNpn: "", closerName: "" };
  }

  const agent = agents.find((row) => row.id === userId);
  if (!agent) return form;

  if (role === "setter") {
    return syncFormAgents(
      { ...form, setterUserId: agent.id },
      agents,
    );
  }

  return syncFormAgents(
    { ...form, closerUserId: agent.id },
    agents,
  );
}

function resolveAgentIdsFromNpns(
  form: PolicyDraft,
  agents: AgentSummary[],
): Pick<PolicyDraft, "setterUserId" | "closerUserId"> {
  const setterMatch = form.setterNpn
    ? agents.find((agent) => agent.npn?.trim() === form.setterNpn.trim())
    : undefined;
  const closerMatch = form.closerNpn
    ? agents.find((agent) => agent.npn?.trim() === form.closerNpn.trim())
    : undefined;

  return {
    setterUserId: form.setterUserId || setterMatch?.id || "",
    closerUserId: form.closerUserId || closerMatch?.id || "",
  };
}

function splitLabelForPurchaser(leadPurchaser: LeadPurchaser): string {
  return leadPurchaser === "setter" ? "50/50 — setter bought lead" : "70/30 — closer bought lead";
}

function formatPolicyDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function agentCell(npn: string | null, name: string | null): string {
  if (!npn && !name) return "—";
  if (npn && name) return `${name} (${npn})`;
  return npn ?? name ?? "—";
}

function policyToDraft(policy: AdminSetterCloserPolicy): PolicyDraft {
  return {
    id: policy.id,
    policyNumber: policy.policyNumber,
    carrier: policy.carrier ?? "",
    clientName: policy.clientName ?? "",
    leadPurchaser: policy.leadPurchaser,
    setterUserId: policy.setterUserId ?? "",
    setterNpn: policy.setterNpn ?? "",
    setterName: policy.setterName ?? "",
    closerUserId: policy.closerUserId ?? "",
    closerNpn: policy.closerNpn,
    closerName: policy.closerName ?? "",
    policyDate: policy.policyDate ?? "",
    notes: policy.notes ?? "",
  };
}

function PolicyModal({
  draft,
  accessToken,
  onClose,
  onSaved,
}: {
  draft: PolicyDraft;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [carriers, setCarriers] = useState<AdminCarrierSummary[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCarriersLoading(true);
    setAgentsLoading(true);

    void Promise.all([listCarriers(accessToken), listAgents(accessToken)])
      .then(([carrierRows, agentRows]) => {
        if (cancelled) return;
        setCarriers(carrierRows);
        setAgents(sortAgents(agentRows));
      })
      .catch(() => {
        if (!cancelled) {
          setCarriers([]);
          setAgents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCarriersLoading(false);
          setAgentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (agents.length === 0) return;
    setForm((current) => syncFormAgents(current, agents));
  }, [agents]);

  const selectedSetter = useMemo(
    () => findAgent(agents, form.setterUserId),
    [agents, form.setterUserId],
  );
  const selectedCloser = useMemo(
    () => findAgent(agents, form.closerUserId),
    [agents, form.closerUserId],
  );

  const setterNpnDisplay = resolveAgentNpn(selectedSetter) || form.setterNpn;
  const closerNpnDisplay = resolveAgentNpn(selectedCloser) || form.closerNpn;
  const setterNameDisplay = selectedSetter?.name || form.setterName;
  const closerNameDisplay = selectedCloser?.name || form.closerName;

  const carrierOptions = useMemo(() => {
    const names = carriers.map((row) => row.carrier);
    if (form.carrier && !names.includes(form.carrier)) {
      return [form.carrier, ...names];
    }
    return names;
  }, [carriers, form.carrier]);

  const handleSave = async () => {
    if (!form.policyNumber.trim()) {
      toast.error("Policy number is required.");
      return;
    }
    if (!form.closerUserId) {
      toast.error("Select a closer.");
      return;
    }
    if (!closerNpnDisplay.trim()) {
      toast.error("The selected closer does not have an NPN on file.");
      return;
    }

    setSaving(true);
    try {
      const result = await upsertSetterCloserPolicy(accessToken, {
        id: form.id,
        policyNumber: form.policyNumber.trim(),
        carrier: form.carrier.trim() || undefined,
        clientName: form.clientName.trim() || undefined,
        leadPurchaser: form.leadPurchaser,
        setterNpn: setterNpnDisplay.trim() || undefined,
        setterName: setterNameDisplay.trim() || undefined,
        closerNpn: closerNpnDisplay.trim(),
        closerName: closerNameDisplay.trim() || undefined,
        policyDate: form.policyDate.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success(result.message);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="admin-modal admin-ticket-modal"
        role="dialog"
        aria-labelledby="admin-setter-closer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h2 id="admin-setter-closer-title">{form.id ? "Edit policy split" : "Add policy split"}</h2>
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

        <p className="admin-panel-note">
          Choose setter and closer from PNCL agents. NPNs fill in automatically from their profile.
          Split is assigned from who bought the lead: setter = 50/50, closer = 70/30.
        </p>

        <div className="admin-ticket-modal-fields">
          <label className="admin-field">
            <span>Policy number</span>
            <input
              type="text"
              value={form.policyNumber}
              onChange={(event) => setForm({ ...form, policyNumber: event.target.value })}
              required
            />
          </label>
          <label className="admin-field">
            <span>Policy date</span>
            <input
              type="date"
              value={form.policyDate}
              onChange={(event) => setForm({ ...form, policyDate: event.target.value })}
            />
          </label>
        </div>

        <div className="admin-ticket-modal-fields">
          <label className="admin-field">
            <span>Carrier</span>
            <select
              value={form.carrier}
              disabled={carriersLoading}
              onChange={(event) => setForm({ ...form, carrier: event.target.value })}
            >
              <option value="">{carriersLoading ? "Loading carriers…" : "Select carrier"}</option>
              {carrierOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Client name</span>
            <input
              type="text"
              value={form.clientName}
              onChange={(event) => setForm({ ...form, clientName: event.target.value })}
            />
          </label>
        </div>

        <label className="admin-field">
          <span>Who bought the lead?</span>
          <select
            value={form.leadPurchaser}
            onChange={(event) =>
              setForm({ ...form, leadPurchaser: event.target.value as LeadPurchaser })
            }
          >
            <option value="setter">{splitLabelForPurchaser("setter")}</option>
            <option value="closer">{splitLabelForPurchaser("closer")}</option>
          </select>
        </label>

        <div className="admin-ticket-modal-fields">
          <label className="admin-field">
            <span>Setter</span>
            <select
              value={form.setterUserId}
              disabled={agentsLoading}
              onChange={(event) =>
                setForm((current) => applyAgentSelection(current, "setter", event.target.value, agents))
              }
            >
              <option value="">{agentsLoading ? "Loading agents…" : "Select setter (optional)"}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agentOptionLabel(agent)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Setter NPN</span>
            <input
              type="text"
              value={setterNpnDisplay}
              readOnly
              placeholder={form.setterUserId ? "No NPN on file for this agent" : "Auto-filled from agent"}
            />
          </label>
        </div>

        <div className="admin-ticket-modal-fields">
          <label className="admin-field">
            <span>Closer</span>
            <select
              value={form.closerUserId}
              disabled={agentsLoading}
              onChange={(event) =>
                setForm((current) => applyAgentSelection(current, "closer", event.target.value, agents))
              }
            >
              <option value="">{agentsLoading ? "Loading agents…" : "Select closer"}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id} disabled={!resolveAgentNpn(agent)}>
                  {agentOptionLabel(agent)}
                  {!resolveAgentNpn(agent) ? " — no NPN on file" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Closer NPN</span>
            <input
              type="text"
              value={closerNpnDisplay}
              readOnly
              placeholder={form.closerUserId ? "No NPN on file for this agent" : "Auto-filled from agent"}
              required
            />
          </label>
        </div>

        <label className="admin-field">
          <span>Notes</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </label>

        <div className="admin-form-actions">
          <button type="button" className="admin-secondary-btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="admin-primary-btn" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : form.id ? "Save changes" : "Add policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadCsv(policies: AdminSetterCloserPolicy[]) {
  const headers = [
    "Policy Number",
    "Policy Date",
    "Carrier",
    "Client",
    "Split",
    "Lead Purchaser",
    "Setter NPN",
    "Setter Name",
    "Closer NPN",
    "Closer Name",
    "Notes",
  ];
  const rows = policies.map((policy) => [
    policy.policyNumber,
    policy.policyDate ?? "",
    policy.carrier ?? "",
    policy.clientName ?? "",
    policy.splitLabel,
    policy.leadPurchaser,
    policy.setterNpn ?? "",
    policy.setterName ?? "",
    policy.closerNpn,
    policy.closerName ?? "",
    policy.notes ?? "",
  ]);

  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `setter-closer-policies-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminSetterCloser() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [policies, setPolicies] = useState<AdminSetterCloserPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const rows = await listSetterCloserPolicies(accessToken, {
        search: appliedSearch || undefined,
      });
      setPolicies(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load policies");
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, appliedSearch]);

  useEffect(() => {
    document.title = "Setter / Closer — PNCL Admin";
    trackPageView("admin_setter_closer");
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary = useMemo(() => {
    const split50 = policies.filter((policy) => policy.splitType === "50_50").length;
    const split70 = policies.filter((policy) => policy.splitType === "70_30").length;
    return { total: policies.length, split50, split70 };
  }, [policies]);

  const handleDelete = async (policy: AdminSetterCloserPolicy) => {
    if (!window.confirm(`Remove policy ${policy.policyNumber}?`)) return;
    setDeletingId(policy.id);
    try {
      const result = await deleteSetterCloserPolicy(accessToken, policy.id);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to remove policy");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Handshake size={22} aria-hidden="true" />
        <div>
          <h1>Setter / Closer tracker</h1>
          <p>
            Track commission splits by policy. 50/50 when the setter bought the lead; 70/30 when
            the closer bought the lead. Closer NPN is required on every record.
          </p>
        </div>
      </div>

      <div className="admin-panel-head-row">
        <form
          className="admin-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(searchInput.trim());
          }}
        >
          <label className="admin-field admin-field-inline">
            <span className="sr-only">Search policies</span>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              placeholder="Search policy #, NPN, client, carrier…"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <button type="submit" className="admin-secondary-btn">
            Search
          </button>
          {appliedSearch && (
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={() => {
                setSearchInput("");
                setAppliedSearch("");
              }}
            >
              Clear
            </button>
          )}
        </form>
        <div className="admin-toolbar-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            disabled={policies.length === 0}
            onClick={() => downloadCsv(policies)}
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
          >
            <Plus size={16} aria-hidden="true" />
            Add policy
          </button>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <strong>{summary.total}</strong>
          <span>Policies tracked</span>
        </div>
        <div className="admin-stat">
          <strong>{summary.split50}</strong>
          <span>50/50 splits</span>
        </div>
        <div className="admin-stat">
          <strong>{summary.split70}</strong>
          <span>70/30 splits</span>
        </div>
      </div>

      {loading ? (
        <p className="admin-panel-note">Loading policies…</p>
      ) : policies.length === 0 ? (
        <p className="admin-empty">
          {appliedSearch ? "No policies match your search." : "No policies tracked yet."}
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Date</th>
                <th>Split</th>
                <th>Setter</th>
                <th>Closer</th>
                <th>Client</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td>
                    <strong>{policy.policyNumber}</strong>
                    {policy.carrier && <p className="admin-table-sub">{policy.carrier}</p>}
                  </td>
                  <td>{formatPolicyDate(policy.policyDate)}</td>
                  <td>
                    <span className="admin-badge">{policy.splitLabel}</span>
                  </td>
                  <td>{agentCell(policy.setterNpn, policy.setterName)}</td>
                  <td>{agentCell(policy.closerNpn, policy.closerName)}</td>
                  <td>{policy.clientName ?? "—"}</td>
                  <td>
                    <div className="admin-table-actions">
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label={`Edit ${policy.policyNumber}`}
                        onClick={() => setDraft(policyToDraft(policy))}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label={`Delete ${policy.policyNumber}`}
                        disabled={deletingId === policy.id}
                        onClick={() => void handleDelete(policy)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <PolicyModal
          draft={draft}
          accessToken={accessToken}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
