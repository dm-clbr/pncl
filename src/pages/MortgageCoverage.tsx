import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import LPFooter from "@/components/LPFooter";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

export default function MortgageCoverage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "$250,000 Mortgage. $0 Coverage. Fix It Now | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "1 in 4 homeowners have zero life insurance covering their mortgage. Get a free quote in 60 seconds. No medical exam, no obligation.");
    trackPageView('mortgage-coverage');
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const leadData = {
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        mortgage_amount: fd.get("mortgage_amount") as string,
        source: "mortgage-coverage-lp",
      };
      trackFormSubmission("mortgage-coverage-lp", leadData);
      await submitLead(leadData);
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-page lp-dark">
      {/* Sticky top bar */}
      <div className="lp-sticky-bar lp-sticky-dark">
        <span className="lp-sticky-text">⚡ Instant approval available — No medical exam</span>
        <a href="#quote-form" className="lp-sticky-cta-light">Get Free Quote →</a>
      </div>

      {/* Header */}
      <header className="lp-header lp-header-pushed">
        <span className="lp-tag">MORTGAGE PROTECTION</span>
        <div className="lp-logo"><Link to="/"><PNCLLogo height={28} /></Link></div>
      </header>

      {/* Hero — dramatic contrast */}
      <section className="lp-hero-split lp-hero-split-dark">
        <div className="lp-hero-left">
          <div className="lp-mortgage-amount">$250,000</div>
          <div className="lp-mortgage-label">YOUR MORTGAGE</div>
          <h1 className="lp-hero-title" style={{ textAlign: "center" }}>
            Your life insurance coverage?
          </h1>
          <div className="lp-zero">$0.</div>
          <p className="lp-hero-sub" style={{ textAlign: "center" }}>
            If you die tomorrow, can your family make the payment next month?
          </p>
          <div className="lp-urgency-badge lp-urgency-dark">
            <span className="lp-urgency-pulse" />
            <span>Coverage takes effect same day</span>
          </div>
        </div>
        <div className="lp-hero-right" id="quote-form">
          {!submitted ? (
            <div className="lp-inline-form-card lp-form-card-dark">
              <h3 className="lp-form-card-title">Get a Free Quote</h3>
              <p className="lp-form-card-sub">60 seconds. No obligation. No spam.</p>
              <form className="lp-form" onSubmit={handleSubmit}>
                <input type="text" name="name" placeholder="Full Name" required />
                <input type="tel" name="phone" placeholder="Phone Number" required />
                <input type="email" name="email" placeholder="Email Address" required />
                <select name="mortgage_amount" defaultValue="" required>
                  <option value="" disabled>Mortgage Amount</option>
                  <option>Under $100,000</option>
                  <option>$100,000 – $250,000</option>
                  <option>$250,000 – $500,000</option>
                  <option>$500,000+</option>
                </select>
                <button type="submit" className="lp-cta-outline lp-cta-full lp-cta-pulse" disabled={loading}>
                  {loading ? "SUBMITTING…" : "GET A FREE QUOTE →"}
                </button>
              </form>
              <div className="lp-form-trust lp-form-trust-dark">
                <span>🔒 Secure & confidential — we never sell your data</span>
              </div>
            </div>
          ) : (
            <div className="lp-inline-form-card lp-form-card-dark lp-success-card">
              <div className="lp-success-check">✓</div>
              <h3 className="lp-form-card-title">Quote Requested!</h3>
              <p className="lp-form-card-sub">A licensed agent will reach out within 5 minutes with your personalized options.</p>
            </div>
          )}
        </div>
      </section>

      {/* Shock stats */}
      <section className="lp-reality-section">
        <h2 className="lp-section-title-dark">The Hard Truth</h2>
        <div className="lp-reality-grid">
          <div className="lp-reality-card">
            <div className="lp-reality-stat">1 in 4</div>
            <p>homeowners have zero life insurance to cover their mortgage.</p>
          </div>
          <div className="lp-reality-card">
            <div className="lp-reality-stat">$1,784/mo</div>
            <p>Average U.S. mortgage payment. Can your family cover it alone?</p>
          </div>
          <div className="lp-reality-card">
            <div className="lp-reality-stat">62%</div>
            <p>of families couldn't cover expenses for more than 3 months without income.</p>
          </div>
        </div>
        <div className="lp-reality-cta">
          <a href="#quote-form" className="lp-cta-outline">DON'T BE A STATISTIC →</a>
        </div>
      </section>

      {/* Solution with urgency */}
      <section className="lp-solution-section">
        <h2 className="lp-section-title-dark">Close the Gap — Today</h2>
        <p className="lp-solution-body">
          Mortgage Protection Insurance pays off your home if something happens to you. Your family keeps the house, the neighborhood, and the life you built together.
        </p>
        <div className="lp-solution-points">
          <div className="lp-sol-point">
            <span className="lp-sol-icon">🏠</span>
            <div>
              <strong>Mortgage Paid Off</strong>
              <p>Your family keeps the home — zero burden, zero stress.</p>
            </div>
          </div>
          <div className="lp-sol-point">
            <span className="lp-sol-icon">⚡</span>
            <div>
              <strong>Approved in Minutes</strong>
              <p>No medical exam. No blood work. Just a few simple questions.</p>
            </div>
          </div>
          <div className="lp-sol-point">
            <span className="lp-sol-icon">💰</span>
            <div>
              <strong>From $19/month</strong>
              <p>Less than a streaming subscription. More important than any of them.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Mid-page CTA */}
      <section className="lp-mid-cta lp-mid-cta-dark">
        <h2>Your mortgage doesn't wait. Neither should you.</h2>
        <a href="#quote-form" className="lp-cta-outline lp-cta-large">GET A FREE QUOTE →</a>
      </section>

      {/* Social proof */}
      <section className="lp-social-proof lp-social-dark">
        <div className="lp-reviews">
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"The whole process took 5 minutes. I wish I did this years ago."</p>
            <strong>— Michael T., Chicago IL</strong>
          </div>
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"$23/month for peace of mind? That's the best money I've ever spent."</p>
            <strong>— Karen W., Denver CO</strong>
          </div>
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"After my husband passed, the policy paid off our mortgage. My kids didn't have to switch schools."</p>
            <strong>— Linda K., Phoenix AZ</strong>
          </div>
        </div>
        <p className="lp-testimonial-disclaimer">* Individual results may vary. Testimonials reflect personal experiences and are not guaranteed outcomes. Coverage and rates depend on individual circumstances.</p>
      </section>

      {/* Final CTA */}
      <section className="lp-final-cta lp-final-dark">
        <h2>$250,000 mortgage. $0 coverage. Fix it in 60 seconds.</h2>
        <a href="#quote-form" className="lp-cta-outline lp-cta-large">GET MY FREE QUOTE →</a>
        <span className="lp-final-sub">No credit card. No medical exam. No obligation.</span>
      </section>

      {/* Footer */}
      <LPFooter dark />

      {/* Floating mobile CTA */}
      <div className="lp-floating-cta lp-floating-dark">
        <a href="#quote-form" className="lp-cta-outline lp-cta-full">GET A FREE QUOTE →</a>
      </div>
    </div>
  );
}
