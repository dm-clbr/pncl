import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import LPFooter from "@/components/LPFooter";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

const faqs = [
  { q: "How much life insurance do I need?", a: "A common guideline is 10-12 times your annual income, but the right amount depends on your family's specific needs, debts, and goals. A licensed agent can help you determine the right coverage." },
  { q: "What's the difference between term and whole life?", a: "Term life covers you for a set period (10, 20, or 30 years) and is more affordable. Whole life covers you for your entire life and builds cash value over time." },
  { q: "Can I get life insurance without a medical exam?", a: "Yes. We offer several no-exam options that can get you covered quickly with just a few health questions." },
  { q: "How fast can I get covered?", a: "Many applicants are approved within 24-48 hours. Some no-exam policies offer same-day approval." },
];

export default function LifeInsurance() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Life Insurance — Free Quote from Top Carriers | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Get an affordable life insurance quote in 60 seconds. No medical exam options, A-rated carriers, approval in as fast as 24 hours. Term and whole life plans.");
    window.scrollTo(0, 0);
    trackPageView('life-insurance');
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
        coverage_amount: fd.get("coverage_amount") as string,
        source: "life-insurance-lp",
      };
      trackFormSubmission("life-insurance-lp", leadData);
      await submitLead(leadData);
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-page">
      {/* Sticky top bar */}
      <div className="lp-sticky-bar">
        <span className="lp-sticky-text">🛡️ See how affordable life insurance really is — Free quote in 60 seconds</span>
        <a href="#quote-form" className="lp-sticky-cta">Get My Quote →</a>
      </div>

      {/* Header */}
      <header className="lp-header lp-header-pushed">
        <span className="lp-tag">LIFE INSURANCE</span>
        <div className="lp-logo"><Link to="/"><PNCLLogo height={28} /></Link></div>
      </header>

      {/* Hero */}
      <section className="lp-hero-split">
        <div className="lp-hero-left">
          <h1 className="lp-hero-title">Your family's future shouldn't be a <span className="lp-accent">question mark.</span></h1>
          <ul className="lp-benefits">
            <li><span className="lp-check">✓</span> Coverage from $15/month</li>
            <li><span className="lp-check">✓</span> No medical exam options available</li>
            <li><span className="lp-check">✓</span> Approval in as fast as 24 hours</li>
            <li><span className="lp-check">✓</span> Term and whole life options</li>
          </ul>
          <div className="lp-urgency-badge">
            <span className="lp-urgency-pulse" />
            <span>Agents available now — get your quote in under 60 seconds</span>
          </div>
        </div>
        <div className="lp-hero-right" id="quote-form">
          {!submitted ? (
            <div className="lp-inline-form-card">
              <h3 className="lp-form-card-title">Get Your Free Quote</h3>
              <p className="lp-form-card-sub">60 seconds. No obligation.</p>
              <form className="lp-form" onSubmit={handleSubmit}>
                <input type="text" name="name" placeholder="Full Name" required />
                <input type="tel" name="phone" placeholder="Phone Number" required />
                <input type="email" name="email" placeholder="Email Address" required />
                <select name="coverage_amount" defaultValue="" required>
                  <option value="" disabled>Coverage Amount</option>
                  <option>$50,000 – $100,000</option>
                  <option>$100,000 – $250,000</option>
                  <option>$250,000 – $500,000</option>
                  <option>$500,000 – $1,000,000</option>
                  <option>$1,000,000+</option>
                </select>
                <button type="submit" className="lp-cta-dark lp-cta-full lp-cta-pulse" disabled={loading}>
                  {loading ? "SUBMITTING…" : "SEE MY OPTIONS →"}
                </button>
              </form>
              <div className="lp-form-trust">
                <span>🔒 Your info is secure & never shared</span>
              </div>
            </div>
          ) : (
            <div className="lp-inline-form-card lp-success-card">
              <div className="lp-success-check">✓</div>
              <h3 className="lp-form-card-title">You're All Set!</h3>
              <p className="lp-form-card-sub">A licensed agent will call within 5 minutes to walk you through your options. No pressure.</p>
            </div>
          )}
        </div>
      </section>

      {/* Trust bar */}
      <section className="lp-trust-bar">
        <div className="lp-trust-item"><strong>3,000+</strong> Licensed Agents</div>
        <div className="lp-trust-item"><strong>75,000+</strong> Policies Written</div>
        <div className="lp-trust-item"><strong>A-Rated</strong> Carriers</div>
      </section>

      {/* How it works */}
      <section className="lp-how-section">
        <h2 className="lp-section-title">How It Works</h2>
        <div className="lp-how-grid">
          <div className="lp-how-step">
            <div className="lp-how-num">1</div>
            <h3>Get a Free Quote</h3>
            <p>Answer a few quick questions about your health and coverage needs.</p>
          </div>
          <div className="lp-how-step">
            <div className="lp-how-num">2</div>
            <h3>Compare Plans</h3>
            <p>See side-by-side options from top-rated carriers.</p>
          </div>
          <div className="lp-how-step">
            <div className="lp-how-num">3</div>
            <h3>Get Covered</h3>
            <p>Choose your plan and start coverage right away.</p>
          </div>
        </div>
      </section>

      {/* Mid CTA */}
      <section className="lp-mid-cta">
        <h2>Your family is counting on you. Are you covered?</h2>
        <a href="#quote-form" className="lp-cta-dark lp-cta-large">GET MY FREE QUOTE →</a>
      </section>

      {/* Social proof */}
      <section className="lp-social-proof">
        <h2 className="lp-section-title">What Our Clients Are Saying</h2>
        <div className="lp-reviews">
          <div className="lp-review">
            <div className="lp-stars">★★★★★</div>
            <p>"The peace of mind alone is worth it. My family knows they'll be taken care of."</p>
            <strong>— David M., Charlotte NC</strong>
          </div>
          <div className="lp-review">
            <div className="lp-stars">★★★★★</div>
            <p>"I put it off for years. Turns out it was way more affordable than I expected."</p>
            <strong>— Rachel T., Austin TX</strong>
          </div>
          <div className="lp-review">
            <div className="lp-stars">★★★★★</div>
            <p>"My agent walked me through everything. No pressure, just clear answers."</p>
            <strong>— Marcus J., Tampa FL</strong>
          </div>
        </div>
        <p className="lp-testimonial-disclaimer">* Individual results may vary. Testimonials reflect personal experiences and are not guaranteed outcomes. Coverage and rates depend on individual circumstances.</p>
      </section>

      {/* FAQ */}
      <section className="lp-faq-section">
        <h2 className="lp-section-title">Common Questions</h2>
        <div className="lp-faqs">
          {faqs.map((faq, i) => (
            <details key={i} className="lp-faq">
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-final-cta">
        <h2>Don't leave your family's future to chance.</h2>
        <p>Check your rate — it takes 60 seconds and costs nothing.</p>
        <a href="#quote-form" className="lp-cta-dark lp-cta-large">GET MY FREE QUOTE →</a>
        <div className="lp-guarantee">
          <span>✓ No credit card</span>
          <span>✓ No obligation</span>
          <span>✓ Cancel anytime</span>
        </div>
      </section>

      <LPFooter />

      {/* Floating mobile CTA */}
      <div className="lp-floating-cta">
        <a href="#quote-form" className="lp-cta-dark lp-cta-full">GET MY FREE QUOTE →</a>
      </div>
    </div>
  );
}
