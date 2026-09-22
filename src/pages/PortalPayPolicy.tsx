import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import { fetchPayPolicyEntries, type PayPolicyEntry } from "@/lib/portal-pay-policy";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";

function FaqItem({ entry }: { entry: PayPolicyEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="portal-faq-item">
      <button
        type="button"
        className="portal-faq-question"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{entry.title}</span>
        <ChevronDown size={16} aria-hidden="true" className={open ? "open" : undefined} />
      </button>
      {open && <p className="portal-faq-answer">{entry.body}</p>}
    </div>
  );
}

export default function PortalPayPolicy() {
  const [entries, setEntries] = useState<PayPolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Pay & Commissions — PNCL Portal";
    trackPageView("portal_pay_policy");
    window.scrollTo(0, 0);

    fetchPayPolicyEntries()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load content."))
      .finally(() => setLoading(false));
  }, []);

  const policies = useMemo(() => entries.filter((entry) => entry.category === "policy"), [entries]);
  const faqs = useMemo(() => entries.filter((entry) => entry.category === "faq"), [entries]);

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalSubpageHeader title="Pay & Commissions" />

          {loading ? (
            <div className="portal-incentives-loading">
              <span className="onboarding-spinner" aria-hidden="true" />
              <span>Loading...</span>
            </div>
          ) : error ? (
            <p className="admin-error">{error}</p>
          ) : entries.length === 0 ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <p className="portal-panel-note">
                Pay policies are being finalized. Check back soon, or open a support ticket if you
                have a question now.
              </p>
            </div>
          ) : (
            <>
              {policies.length > 0 && (
                <div className="carrier-sheet-panel portal-profile-panel">
                  <div className="carrier-sheet-panel-head">
                    <div>
                      <p>The rules PNCL pays by. Questions? Open a support ticket.</p>
                    </div>
                  </div>
                  <div className="portal-pay-policy-list">
                    {policies.map((entry) => (
                      <article key={entry.id} className="portal-pay-policy-entry">
                        <h2>{entry.title}</h2>
                        <p>{entry.body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {faqs.length > 0 && (
                <div className="carrier-sheet-panel portal-profile-panel">
                  <div className="carrier-sheet-panel-head">
                    <div>
                      <h2>Frequently asked questions</h2>
                    </div>
                  </div>
                  <div className="portal-faq-list">
                    {faqs.map((entry) => (
                      <FaqItem key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
