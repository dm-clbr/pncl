import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createUser } from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

export default function AdminAddUser() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { agents, loading: agentsLoading } = useAdminAgents();
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [referrerUserId, setReferrerUserId] = useState("");
  const [uplineNetwork, setUplineNetwork] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  useEffect(() => {
    document.title = "Add user — PNCL Admin";
    trackPageView("admin_add_user");
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    setSubmitting(true);
    try {
      const result = await createUser(token, {
        legalName: legalName.trim(),
        email: email.trim().toLowerCase(),
        referrerUserId: referrerUserId || undefined,
        uplineNetwork: referrerUserId ? undefined : uplineNetwork.trim() || undefined,
      });
      toast.success(result.message);
      navigate("/portal/admin/users");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <UserPlus size={22} aria-hidden="true" />
        <div>
          <h1>Add user manually</h1>
          <p>
            Provision portal access for an existing @thepncl.com mailbox. An activation email
            will be sent to the address you enter.
          </p>
        </div>
      </div>

      <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="admin-field">
          <span>Legal name</span>
          <input
            type="text"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            required
            autoComplete="name"
          />
        </label>

        <label className="admin-field">
          <span>PNCL email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="agent@thepncl.com"
            required
            autoComplete="off"
          />
        </label>

        <label className="admin-field">
          <span>Referrer (optional)</span>
          <select
            value={referrerUserId}
            onChange={(event) => setReferrerUserId(event.target.value)}
            disabled={agentsLoading}
          >
            <option value="">No referral link</option>
            {agentOptions.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.email})
              </option>
            ))}
          </select>
        </label>

        {!referrerUserId && (
          <label className="admin-field">
            <span>Upline network label</span>
            <input
              type="text"
              value={uplineNetwork}
              onChange={(event) => setUplineNetwork(event.target.value)}
              placeholder="Team leader or upline name"
            />
          </label>
        )}

        <div className="admin-form-actions">
          <button type="submit" className="admin-primary-btn" disabled={submitting}>
            {submitting ? "Creating…" : "Create user & send invite"}
          </button>
          <Link to="/portal/admin/users" className="admin-secondary-link">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
