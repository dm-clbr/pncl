import { useCallback, useEffect, useState } from "react";
import { listAgentDocumentRequests, type AgentDocumentRequest } from "@/lib/document-requests";

/** Keep signing tied to the assigned request and its exact source PDF. */
export function useIcaDocumentRequests(token?: string) {
  const [state, setState] = useState<{ token?: string; rows: AgentDocumentRequest[]; loading: boolean; error: string }>({ rows: [], loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(async () => { setRevision(value => value + 1); }, []);
  useEffect(() => {
    let cancelled = false;
    setState({ token, rows: [], loading: Boolean(token), error: "" });
    if (token) void listAgentDocumentRequests(token)
      .then(rows => { if (!cancelled) setState({ token, rows: rows.filter(row => row.stepSlug === "ica_setup"), loading: false, error: "" }); })
      .catch(error => { if (!cancelled) setState({ token, rows: [], loading: false, error: error instanceof Error ? error.message : "Unable to load your new agreement." }); });
    return () => { cancelled = true; };
  }, [token, revision]);
  // Never show another session's agreements while its replacement request loads.
  const current = state.token === token ? state : { rows: [], loading: Boolean(token), error: "" };
  return { rows: current.rows, loading: current.loading, error: current.error, reload };
}
