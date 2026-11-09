import { useEffect, useRef, useState } from "react";
import { getSummitOriginals, type SummitSubmission } from "@/lib/summit";

// Load all originals on expansion in bounded pages. Further arrivals append
// from the last cursor instead of redownloading every original on each poll.
export default function SummitOriginals({groupId,count}:{groupId:string|null;count:number}) {
  const cached = useRef<SummitSubmission[]>([]);
  const [submissions,setSubmissions] = useState<SummitSubmission[]>([]);
  const [error,setError] = useState<string|null>(null);
  const [attempt,setAttempt] = useState(0);
  const [loading,setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null);
      try {
        while (active && cached.current.length < count) {
          const last = cached.current[cached.current.length-1];
          const page = await getSummitOriginals(groupId,last && {id:last.id,time:last.cursor_at ?? last.created_at});
          if (!active) return;
          const known = new Set(cached.current.map((q) => q.id));
          const fresh = page.submissions.filter((q) => !known.has(q.id));
          cached.current = [...cached.current,...fresh];
          setSubmissions(cached.current);
          if (!page.has_more || fresh.length === 0) break;
        }
      } catch { if (active) setError("Couldn’t load all originals. Your place is saved; try again."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => {active=false;};
  },[groupId,count,attempt]);
  return <div className="summit-originals"><p className="summit-eyebrow">All original submissions · {count}</p>
    <ol>{submissions.map((submission) => <li key={submission.id}><p>{submission.question}</p><time dateTime={submission.created_at}>{new Date(submission.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time></li>)}</ol>
    {loading && <p role="status">Loading originals… {submissions.length} of {count}</p>}
    {error && <p role="alert">{error} <button className="summit-text-button" onClick={() => setAttempt((x) => x+1)}>Retry</button></p>}
  </div>;
}
