import { useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { PortalTodo } from "@/lib/portal-todos";
import "@/styles/document-requests.css";
import Sheet from "@/components/portal/Sheet";

function LoginNotice({ storageKey, requests }: { storageKey: string; requests: PortalTodo[] }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "seen"; } catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, "seen"); } catch { /* Remains dismissed for this mount. */ }
  };
  return <div className="document-login-notice"><Sheet open={!dismissed} onClose={dismiss} title="Your signature is requested" size="half">
    <p>PNCL has {requests.length === 1 ? "a document" : `${requests.length} documents`} for you to review and sign.</p>
    <ul>{requests.map(request => <li key={request.id}>{request.title}</li>)}</ul>
    <p>Your signed copies will stay in Documents.</p>
    <Link className="document-login-action" to={requests.length === 1 ? requests[0].href : "/portal/documents"} onClick={dismiss}>Review & sign</Link>
    <button className="document-login-action secondary" onClick={dismiss}>Later</button>
  </Sheet></div>;
}

export default function PortalDocumentLoginNotice({ user, todos, loading }: { user: User | null; todos: PortalTodo[]; loading: boolean }) {
  const requests = todos.filter(todo => todo.id.startsWith("document_request_") && todo.notifyOnLogin && !todo.completed);
  if (!user || loading || !requests.length) return null;
  // A new login or newly released document gets a new action; route changes do not.
  const storageKey = `pncl-document-notice:${user.id}:${user.last_sign_in_at ?? "session"}:${requests.map(row => row.id).sort().join(",")}`;
  return <LoginNotice key={storageKey} storageKey={storageKey} requests={requests} />;
}
