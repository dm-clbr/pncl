import { useState, type FormEvent } from "react";
import { ArrowUpRight, Copy, Pencil, Plus } from "lucide-react";
import { usePortalCarrierCredentials } from "@/hooks/usePortalCarrierCredentials";
import {
  copyCredentialValue,
  hasCarrierCredentials,
  type CarrierCredentialItem,
} from "@/lib/portal-carrier-credentials";
import { toast } from "sonner";

type EditState = {
  carrierId: string;
};

async function handleCopy(value: string, label: string) {
  try {
    await copyCredentialValue(value, label);
    toast.success(`${label} copied to clipboard.`);
  } catch {
    toast.error(`Unable to copy ${label.toLowerCase()}.`);
  }
}

function CarrierName({ item }: { item: CarrierCredentialItem }) {
  const label = item.carrier || "Carrier";

  if (item.loginUrl) {
    return (
      <a
        href={item.loginUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="carrier-sheet-link portal-carrier-credential-link"
      >
        <span>{label}</span>
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    );
  }

  return <span>{label}</span>;
}

function CredentialValue({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="portal-carrier-credential-value">
      <span className="portal-carrier-credential-text">{value}</span>
      <button
        type="button"
        className="portal-carrier-credential-copy-btn"
        onClick={() => void handleCopy(value, label)}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        <Copy size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function CredentialForm({
  item,
  submitting,
  onCancel,
  onSave,
}: {
  item: CarrierCredentialItem;
  submitting: boolean;
  onCancel: () => void;
  onSave: (values: { username: string; password: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState(item.username ?? "");
  const [password, setPassword] = useState("");
  const isNew = !hasCarrierCredentials(item);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({ username, password });
  };

  return (
    <form className="portal-carrier-credential-form" onSubmit={(event) => void handleSubmit(event)}>
      <label className="admin-field">
        <span>Username</span>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className="admin-field">
        <span>{isNew ? "Password" : "New password"}</span>
        <input
          type="text"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required={isNew}
          placeholder={isNew ? "Enter password" : "Leave blank to keep current password"}
        />
      </label>
      <div className="portal-carrier-credential-form-actions">
        <button type="submit" className="portal-panel-btn" disabled={submitting}>
          {submitting ? "Saving..." : "Save credentials"}
        </button>
        <button type="button" className="admin-secondary-link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CredentialRow({
  item,
  editing,
  submitting,
  onEdit,
  onCancel,
  onSave,
}: {
  item: CarrierCredentialItem;
  editing: EditState | null;
  submitting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: { username: string; password: string }) => Promise<void>;
}) {
  const isEditing = editing?.carrierId === item.carrierId;
  const saved = hasCarrierCredentials(item);

  if (isEditing) {
    return (
      <tr>
        <td colSpan={4}>
          <div className="portal-carrier-credential-edit-wrap">
            <div className="portal-carrier-credential-edit-head">
              <strong>{item.carrier || "Carrier"}</strong>
              {item.loginUrl && (
                <a
                  href={item.loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="carrier-sheet-link"
                >
                  Open login
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            </div>
            <CredentialForm
              item={item}
              submitting={submitting}
              onCancel={onCancel}
              onSave={onSave}
            />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <CarrierName item={item} />
      </td>
      <td>
        {saved && item.username ? (
          <CredentialValue value={item.username} label="Username" />
        ) : (
          <span className="portal-carrier-credential-empty">Not added</span>
        )}
      </td>
      <td>
        {saved && item.password ? (
          <CredentialValue value={item.password} label="Password" />
        ) : (
          <span className="portal-carrier-credential-empty">Not added</span>
        )}
      </td>
      <td>
        <button
          type="button"
          className="portal-carrier-credential-action-btn"
          onClick={onEdit}
        >
          {saved ? (
            <>
              <Pencil size={14} aria-hidden="true" />
              Edit
            </>
          ) : (
            <>
              <Plus size={14} aria-hidden="true" />
              Add
            </>
          )}
        </button>
      </td>
    </tr>
  );
}

export default function PortalCarrierCredentials() {
  const { credentials, loading, error, save } = usePortalCarrierCredentials();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (
    item: CarrierCredentialItem,
    values: { username: string; password: string },
  ) => {
    setSubmitting(true);
    try {
      await save({
        carrierId: item.carrierId,
        username: values.username.trim(),
        password: values.password.trim() || undefined,
      });
      setEditing(null);
      toast.success(`${item.carrier || "Carrier"} credentials saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="carrier-sheet-panel portal-carrier-credentials-panel">
      <div className="carrier-sheet-panel-head">
        <div>
          <h1>Carrier accounts</h1>
          <p>
            Save your carrier login usernames and passwords here for quick access. Carrier names
            link to each portal when available.
          </p>
        </div>
      </div>

      {loading && (
        <div className="portal-incentives-loading">
          <span className="onboarding-spinner" aria-hidden="true" />
          <span>Loading carrier accounts...</span>
        </div>
      )}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="carrier-sheet-table-wrap portal-carrier-credentials-table-wrap">
          <table className="carrier-sheet-table portal-carrier-credentials-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Username</th>
                <th>Password</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {credentials.map((item) => (
                <CredentialRow
                  key={item.carrierId}
                  item={item}
                  editing={editing}
                  submitting={submitting}
                  onEdit={() => setEditing({ carrierId: item.carrierId })}
                  onCancel={() => setEditing(null)}
                  onSave={(values) => handleSave(item, values)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
