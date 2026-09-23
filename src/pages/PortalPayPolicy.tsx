import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Wallet } from "lucide-react";
import BottomNav from "@/components/portal/BottomNav";
import EmptyState from "@/components/portal/EmptyState";
import Pane from "@/components/portal/Pane";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Skeleton from "@/components/portal/Skeleton";
import { fetchPayPolicyEntries, type PayPolicyEntry } from "@/lib/portal-pay-policy";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";
import "@/styles/portal-tools.css";

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
    <div className="home2-page ptools-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalSubpageHeader title="Pay & Commissions" />

          <p className="portal-panel-note">
            How you get paid: policies, examples, and answers.
          </p>

          <div className="ptools-stack">
            {loading && (
              <Pane>
                <div className="ptools-rows" aria-busy="true" aria-label="Loading pay policies">
                  <Skeleton variant="text" width="42%" />
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                </div>
              </Pane>
            )}

            {!loading && error && (
              <Pane>
                <p className="ptools-error">{error}</p>
              </Pane>
            )}

            {!loading && !error && entries.length === 0 && (
              <Pane>
                <EmptyState
                  icon={<Wallet aria-hidden="true" />}
                  title="Pay policies are being finalized"
                  body="Check back soon, or open a ticket if you have a question now."
                  action={
                    <Link to="/portal/support" className="ptools-cta">
                      Open a support ticket
                    </Link>
                  }
                />
              </Pane>
            )}

            {!loading && !error && policies.length > 0 && (
              <Pane title="Pay policies">
                <div className="ptools-policy">
                  {policies.map((entry) => (
                    <article key={entry.id}>
                      <h3 className="ptools-policy-title">{entry.title}</h3>
                      <p className="ptools-policy-body">{entry.body}</p>
                    </article>
                  ))}
                </div>
              </Pane>
            )}

            {!loading && !error && faqs.length > 0 && (
              <Pane title="Frequently asked questions">
                {/* ponytail: native <details>, so the disclosure needs no state,
                    no key handler and no aria-expanded of our own. */}
                {faqs.map((entry) => (
                  <details key={entry.id} className="ptools-faq">
                    <summary className="ptools-faq-q">
                      <span>{entry.title}</span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </summary>
                    <p className="ptools-faq-a">{entry.body}</p>
                  </details>
                ))}
              </Pane>
            )}
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
