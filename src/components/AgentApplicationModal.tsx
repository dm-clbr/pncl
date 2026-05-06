import { useEffect, useState } from "react";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";

interface AgentModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AgentApplicationModal({ open, onClose }: AgentModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await submitLead({
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        heard_about_us: fd.get("heard_about_us") as string,
        about_yourself: fd.get("about_yourself") as string,
        source: "agent-application-homepage",
      });
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="agent-modal-backdrop" onClick={handleBackdropClick}>
      <div className="agent-modal">
        <button className="agent-modal-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        {!submitted ? (
          <>
            <h2 className="agent-modal-title">Start Your Career at PNCL</h2>
            <p className="agent-modal-subtitle">Fill out the form below and a team leader will be in touch within 24 hours.</p>
            <form className="agent-modal-form" onSubmit={handleSubmit}>
              <input type="text" name="name" placeholder="Full Name" required />
              <input type="tel" name="phone" placeholder="Phone Number" required />
              <input type="email" name="email" placeholder="Email Address" required />
              <select name="heard_about_us" defaultValue="" required>
                <option value="" disabled>How did you hear about us?</option>
                <option>Social Media</option>
                <option>Referral from an Agent</option>
                <option>Job Board</option>
                <option>Google Search</option>
                <option>Other</option>
              </select>
              <textarea name="about_yourself" placeholder="Experience, goals, anything you'd like us to know..." rows={3} />
              <button type="submit" className="agent-modal-submit" disabled={loading}>
                {loading ? "SUBMITTING…" : "SUBMIT APPLICATION →"}
              </button>
            </form>
          </>
        ) : (
          <div className="agent-modal-success">
            <div className="lp-success-check">✓</div>
            <h2 className="agent-modal-title">Application Received!</h2>
            <p className="agent-modal-subtitle">A team leader will reach out within 24 hours.</p>
          </div>
        )}
      </div>
    </div>
  );
}
