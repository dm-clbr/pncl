import { useState, type FormEvent } from "react";
import { ArrowUpRight, ChevronRight, Copy, Eye, EyeOff } from "lucide-react";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import Sheet from "@/components/portal/Sheet";
import Skeleton from "@/components/portal/Skeleton";
import { usePortalCarrierCredentials } from "@/hooks/usePortalCarrierCredentials";
import {
  copyCredentialValue,
  hasCarrierCredentials,
  type CarrierCredentialItem,
  type UpsertCarrierCredentialInput,
} from "@/lib/portal-carrier-credentials";
import { toast } from "sonner";

const MASK = "••••••••";

async function handleCopy(value: string, label: string) {
  try {
    await copyCredentialValue(value, label);
    toast.success(`${label} copied to clipboard.`);
  } catch {
    toast.error(`Unable to copy ${label.toLowerCase()}.`);
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="portal-profile-iconbtn"
      onClick={() => void handleCopy(value, label)}
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      <Copy size={16} aria-hidden="true" />
    </button>
  );
}

function RevealButton({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className="portal-profile-iconbtn"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
    >
      {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
    </button>
  );
}

function CarrierName({ item }: { item: CarrierCredentialItem }) {
  const label = item.carrier || "Carrier";

  if (item.loginUrl) {
    return (
      <a
        href={item.loginUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="portal-carrier-link"
      >
        <span>{label}</span>
        <ArrowUpRight size={14} aria-hidden="true" />
        <span className="portal-sr">opens in a new tab</span>
      </a>
    );
  }

  return <span>{label}</span>;
}

/** One table cell's value: the text, an optional reveal toggle and copy. The
    mask is a fixed eight dots, so it never reports the real length, and it is
    hidden from assistive tech: the toggle's own label carries the state. */
function CredentialValue({
  value,
  label,
  masked = false,
}: {
  value: string;
  label: string;
  masked?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const hidden = masked && !shown;

  return (
    <div className="portal-carrier-value">
      <span className="portal-carrier-text" aria-hidden={hidden || undefined}>
        {hidden ? MASK : value}
      </span>
      {masked && (
        <RevealButton shown={shown} onToggle={() => setShown(!shown)} label={label} />
      )}
      <CopyButton value={value} label={label} />
    </div>
  );
}

function EmptyCell() {
  return <span className="portal-carrier-empty">Not added</span>;
}

function CarrierSheetBody({
  item,
  submitting,
  onCancel,
  onSave,
}: {
  item: CarrierCredentialItem;
  submitting: boolean;
  onCancel: () => void;
  onSave: (values: { username: string; password: string; writingNumber: string }) => Promise<void>;
}) {
  // ponytail: the password starts at the saved value rather than blank, so the
  // sheet is the one place to read, copy and change it. Resending the same
  // string upserts the same row, and clearing the field still sends undefined,
  // which is what "leave blank to keep the current password" means.
  const [username, setUsername] = useState(item.username ?? "");
  const [password, setPassword] = useState(item.password ?? "");
  const [writingNumber, setWritingNumber] = useState(item.writingNumber ?? "");
  const [shown, setShown] = useState(false);
  const isNew = !hasCarrierCredentials(item);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({ username, password, writingNumber });
  };

  return (
    <div className="portal-carrier-sheet">
      {item.loginUrl && (
        <ListRow
          href={item.loginUrl}
          label="Open the carrier portal"
          secondary="Sign in with the username and password below."
        />
      )}

      {item.applicationSubmitted && (
        <p className="portal-carrier-status">
          <Chip variant="active">Application submitted</Chip>
        </p>
      )}

      <form className="portal-profile-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="portal-carrier-field">
          <Field
            label="Username"
            id="carrier-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            required
          />
          {username && <CopyButton value={username} label="Username" />}
        </div>

        <div className="portal-carrier-field">
          <Field
            label="Password"
            id="carrier-password"
            type={shown ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            required={isNew}
            placeholder={isNew ? "Enter password" : "Leave blank to keep the current password"}
          />
          <RevealButton shown={shown} onToggle={() => setShown(!shown)} label="Password" />
          {password && <CopyButton value={password} label="Password" />}
        </div>

        <div className="portal-carrier-field">
          <Field
            label="Writing number"
            id="carrier-writing-number"
            type="text"
            value={writingNumber}
            onChange={(event) => setWritingNumber(event.target.value)}
            autoComplete="off"
            placeholder="From your carrier welcome letter"
          />
          {writingNumber && <CopyButton value={writingNumber} label="Writing number" />}
        </div>

        <div className="portal-carrier-actions">
          <button type="submit" className="portal-profile-btn" disabled={submitting}>
            {submitting ? "Saving..." : "Save credentials"}
          </button>
          <button type="button" className="portal-profile-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** Props rather than the hook, so the preview harness and the component test
    can render the same markup with fixed data and no Supabase session. */
export function CarrierCredentialsView({
  credentials,
  loading,
  error,
  save,
  initialOpenId,
}: {
  credentials: CarrierCredentialItem[];
  loading: boolean;
  error: string | null;
  save: (input: UpsertCarrierCredentialInput) => Promise<void>;
  /** Opens one carrier's sheet on mount. The browser tools cannot click, so
      this is how the harness screenshots the sheet. */
  initialOpenId?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const openItem = credentials.find((item) => item.carrierId === openId);

  const handleSave = async (
    item: CarrierCredentialItem,
    values: { username: string; password: string; writingNumber: string },
  ) => {
    setSubmitting(true);
    try {
      await save({
        carrierId: item.carrierId,
        username: values.username.trim(),
        password: values.password.trim() || undefined,
        writingNumber: values.writingNumber.trim(),
      });
      setOpenId(null);
      toast.success(`${item.carrier || "Carrier"} credentials saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Pane
      title="Carrier accounts"
      aside={!loading && !error && credentials.length > 0 ? <Chip>{credentials.length} carriers</Chip> : undefined}
    >
      <p className="portal-profile-lede">
        Save each carrier login and writing number here. A carrier name links to that carrier's
        portal when PNCL has the URL on file.
      </p>

      {loading && (
        <div className="portal-profile-rows" aria-busy="true">
          <span className="portal-sr">Loading carrier accounts...</span>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      )}

      {!loading && error && (
        <div className="portal-profile-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && credentials.length === 0 && (
        <EmptyState
          title="No carriers yet"
          body="You see your carriers here after PNCL submits your contracting."
        />
      )}

      {!loading && !error && credentials.length > 0 && (
        <>
          {/* The phone list. A five-column table does not survive 390px, so the
              row carries the name and the writing number and the sheet carries
              the credentials. */}
          <ul className="portal-profile-rows portal-carrier-list">
            {credentials.map((item) => (
              <li key={item.carrierId}>
                <ListRow
                  label={item.carrier || "Carrier"}
                  secondary={
                    item.writingNumber ? `Writing # ${item.writingNumber}` : "Not added"
                  }
                  onClick={() => setOpenId(item.carrierId)}
                  trailing={
                    <>
                      {item.applicationSubmitted && <Chip variant="active">Submitted</Chip>}
                      <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                    </>
                  }
                />
              </li>
            ))}
          </ul>

          <div className="portal-carrier-table-wrap">
            <table className="portal-carrier-table">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Writing #</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {credentials.map((item) => {
                  const saved = hasCarrierCredentials(item);
                  return (
                    <tr key={item.carrierId}>
                      <td>
                        <CarrierName item={item} />
                        {item.applicationSubmitted && (
                          <Chip variant="active">Submitted</Chip>
                        )}
                      </td>
                      <td>
                        {saved && item.username ? (
                          <CredentialValue value={item.username} label="Username" />
                        ) : (
                          <EmptyCell />
                        )}
                      </td>
                      <td>
                        {saved && item.password ? (
                          <CredentialValue value={item.password} label="Password" masked />
                        ) : (
                          <EmptyCell />
                        )}
                      </td>
                      <td>
                        {item.writingNumber ? (
                          <CredentialValue value={item.writingNumber} label="Writing number" />
                        ) : (
                          <EmptyCell />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="portal-profile-btn"
                          onClick={() => setOpenId(item.carrierId)}
                        >
                          {saved ? "Edit" : "Add"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Sheet
        open={openItem !== undefined}
        onClose={() => setOpenId(null)}
        title={openItem?.carrier || "Carrier"}
      >
        {openItem && (
          <CarrierSheetBody
            key={openItem.carrierId}
            item={openItem}
            submitting={submitting}
            onCancel={() => setOpenId(null)}
            onSave={(values) => handleSave(openItem, values)}
          />
        )}
      </Sheet>
    </Pane>
  );
}

export default function PortalCarrierCredentials() {
  const { credentials, loading, error, save } = usePortalCarrierCredentials();

  return (
    <CarrierCredentialsView
      credentials={credentials}
      loading={loading}
      error={error}
      save={save}
    />
  );
}
