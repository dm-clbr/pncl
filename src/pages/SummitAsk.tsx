import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import SummitShell from "@/components/summit/SummitShell";
import { getSummitClientId, submitSummitQuestion, validateSummitQuestion } from "@/lib/summit";

export default function SummitAsk() {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const client = useRef<string>();
  const attempt = useRef<{ id: string; question: string }>();
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const validation = validateSummitQuestion(question);
    setError(validation);
    if (validation) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      client.current ??= getSummitClientId();
      // Keep the same id after a lost response so retrying doesn't add a vote.
      if (!attempt.current || attempt.current.question !== question) attempt.current = { id: crypto.randomUUID(), question };
      await submitSummitQuestion({ ...attempt.current, client_id: client.current });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your question couldn’t be sent. Please try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <SummitShell title={submitted ? "Question received" : "Ask a question"}>
      <main className="summit-ask">
        {submitted ? (
          <section className="summit-confirmation" aria-labelledby="success-title" role="status">
            <span className="summit-check"><Check size={32} /></span>
            <p className="summit-eyebrow">You’re part of the conversation</p>
            <h1 id="success-title">Question<br /><em>received.</em></h1>
            <p className="summit-lede">Your question is saved for the presenter. Thanks for adding your voice.</p>
            <blockquote>{question}</blockquote>
            <button className="summit-button" onClick={() => { setQuestion(""); setSubmitted(false); attempt.current = undefined; }}>Ask another question <ArrowUpRight size={20} /></button>
          </section>
        ) : (
          <>
            <p className="summit-eyebrow"><span className="summit-dot" /> Audience questions</p>
            <h1>What’s on<br /><em>your mind?</em></h1>
            <p className="summit-lede">Big ideas. Real challenges. Ask what matters to you.</p>
            <form onSubmit={submit} noValidate className="summit-form">
              <label htmlFor="summit-question">Your question</label>
              <textarea id="summit-question" name="question" value={question} onChange={(e) => { setQuestion(e.target.value); setError(null); }} placeholder="What would you like to ask?" rows={5} maxLength={1000} disabled={submitting} aria-invalid={Boolean(error)} aria-describedby={`question-help question-count${error ? " question-error" : ""}`} />
              <div className="summit-form-meta"><span id="question-help">Anonymous. No sign-in required.</span><span id="question-count">{question.length.toLocaleString()} / 1,000</span></div>
              {error && <p id="question-error" className="summit-error" role="alert">{error}</p>}
              <button className="summit-button" type="submit" disabled={submitting}>{submitting ? <>Sending your question <Loader2 className="summit-spinner" size={20} /></> : <>Send question <ArrowUpRight size={20} /></>}</button>
              <p className="summit-privacy">Your question will be shared with the presenter and grouped with similar questions using AI. Please leave out personal or sensitive details.</p>
            </form>
          </>
        )}
      </main>
    </SummitShell>
  );
}
