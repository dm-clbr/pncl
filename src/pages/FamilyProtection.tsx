import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import LPFooter from "@/components/LPFooter";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

export default function FamilyProtection() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Keep Your Family in Their Home | Mortgage Protection | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Your kids shouldn't have to move because you're gone. Mortgage Protection Insurance keeps your family in their home. Check your rate free.");
    trackPageView('family-protection');
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
        source: "family-protection-lp",
      };
      trackFormSubmission("family-protection-lp", leadData);
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
        <span className="lp-sticky-text">🏠 Keep your family in their home — Check your rate free</span>
        <a href="#quote-form" className="lp-sticky-cta-light">Check My Rate →</a>
      </div>

      {/* Header */}
      <header className="lp-header lp-header-pushed">
        <span className="lp-tag">MORTGAGE PROTECTION</span>
        <div className="lp-logo"><Link to="/"><PNCLLogo height={28} /></Link></div>
      </header>

      {/* Hero — emotional + form */}
      <section className="lp-hero-split lp-hero-split-dark">
        <div className="lp-hero-left">
          <div className="lp-icon-pair">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span className="lp-icon-plus">+</span>
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <h1 className="lp-hero-title lp-hero-title-large">
            Your kids shouldn't have to <span className="lp-accent-muted">move</span> because you're <span className="lp-accent-muted">gone.</span>
          </h1>
          <p className="lp-hero-sub">
            Mortgage Protection Insurance keeps your family in their home. Same school. Same neighborhood. Same life.
          </p>
          <div className="lp-urgency-badge lp-urgency-dark">
            <span className="lp-urgency-pulse" />
            <span>Coverage starts the same day you're approved</span>
          </div>
        </div>
        <div className="lp-hero-right" id="quote-form">
          {!submitted ? (
            <div className="lp-inline-form-card lp-form-card-dark">
              <h3 className="lp-form-card-title">Check Your Rate — Free</h3>
              <p className="lp-form-card-sub">60 seconds. No exam. No obligation.</p>
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
                <button type="submit" className="lp-cta-bone lp-cta-full lp-cta-pulse" disabled={loading}>
                  {loading ? "SUBMITTING…" : "CHECK YOUR RATE — FREE →"}
                </button>
              </form>
              <div className="lp-form-trust lp-form-trust-dark">
                <span>🔒 100% confidential — your info is never sold</span>
              </div>
            </div>
          ) : (
            <div className="lp-inline-form-card lp-form-card-dark lp-success-card">
              <div className="lp-success-check">✓</div>
              <h3 className="lp-form-card-title">You're All Set!</h3>
              <p className="lp-form-card-sub">A licensed agent will call within 5 minutes to walk you through your options. No pressure.</p>
            </div>
          )}
        </div>
      </section>

      {/* What's at stake — emotional comparison */}
      <section className="lp-stakes-section">
        <h2 className="lp-section-title-dark">What's Really at Stake</h2>
        <div className="lp-stakes-grid">
          <div className="lp-stake-card">
            <h3>❌ Without Coverage</h3>
            <ul>
              <li>Family inherits mortgage debt</li>
              <li>Forced to sell the home</li>
              <li>Kids change schools mid-year</li>
              <li>Financial stress during the worst time</li>
            </ul>
          </div>
          <div className="lp-stake-card lp-stake-good">
            <h3>✓ With PNCL Coverage</h3>
            <ul>
              <li>Mortgage gets paid off completely</li>
              <li>Family stays in their home</li>
              <li>Kids stay in their school</li>
              <li>Peace of mind — no matter what</li>
            </ul>
          </div>
        </div>
        <div className="lp-reality-cta">
          <a href="#quote-form" className="lp-cta-bone">PROTECT YOUR FAMILY →</a>
        </div>
      </section>

      {/* Social proof */}
      <section className="lp-social-proof lp-social-dark">
        <h2 className="lp-section-title-dark">Real Families. Real Protection.</h2>
        <div className="lp-reviews">
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"After my husband passed, the policy paid off our mortgage. My kids didn't have to move. I'll never be able to express how much that meant."</p>
            <strong>— Linda K., Phoenix AZ</strong>
          </div>
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"I never thought I could afford coverage. PNCL made it easy — $21/month and my family is protected."</p>
            <strong>— Maria S., Houston TX</strong>
          </div>
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"Applied in 5 minutes, approved the same day. Best decision I've ever made for my kids."</p>
            <strong>— James R., Atlanta GA</strong>
          </div>
        </div>
        <p className="lp-testimonial-disclaimer">* Individual results may vary. Testimonials reflect personal experiences and are not guaranteed outcomes. Coverage and rates depend on individual circumstances.</p>
      </section>

      {/* Risk reversal + final CTA */}
      <section className="lp-final-cta lp-final-dark">
        <h2>Don't leave your family with a payment they can't make.</h2>
        <p>It takes 60 seconds to check your rate. No medical exam. No obligation. No risk.</p>
        <a href="#quote-form" className="lp-cta-bone lp-cta-large">CHECK YOUR RATE — FREE →</a>
        <div className="lp-guarantee">
          <span>✓ No credit card required</span>
          <span>✓ No medical exam</span>
          <span>✓ Cancel anytime</span>
        </div>
      </section>

      {/* Footer */}
      <LPFooter dark />

      {/* Floating mobile CTA */}
      <div className="lp-floating-cta lp-floating-dark">
        <a href="#quote-form" className="lp-cta-bone lp-cta-full">CHECK YOUR RATE — FREE →</a>
      </div>
    </div>
  );
}
