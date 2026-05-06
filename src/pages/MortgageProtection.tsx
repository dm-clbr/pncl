import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import LPFooter from "@/components/LPFooter";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

const benefits = [
  { text: "No medical exam for most" },
  { text: "Rates from $19/month" },
  { text: "Coverage starts immediately" },
  { text: "Approval in minutes" },
];

const faqs = [
  { q: "What is Mortgage Protection Insurance?", a: "Mortgage Protection Insurance is a life insurance policy designed to pay off your mortgage if you pass away, become disabled, or are diagnosed with a critical illness. It ensures your family can stay in their home." },
  { q: "Do I need a medical exam?", a: "Most of our plans require no medical exam. You can get approved with just a few simple health questions." },
  { q: "How fast can I get covered?", a: "Many applicants are approved within minutes and coverage can start the same day." },
  { q: "How much does it cost?", a: "Rates start as low as $19/month depending on your age, health, and coverage amount. Get a free quote to see your exact rate." },
];

export default function MortgageProtection() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Mortgage Protection Insurance — Free Quote | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Do you have a mortgage and no life insurance? Get approved in minutes with no medical exam. Rates from $19/mo.");
    trackPageView('mortgage-protection');
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
        source: "mortgage-protection-lp",
      };
      trackFormSubmission("mortgage-protection-lp", leadData);
      await submitLead(leadData);
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-page lp-light">
      {/* Sticky top bar */}
      <div className="lp-sticky-bar lp-sticky-light">
        <span className="lp-sticky-text">🔒 Free quote in 60 seconds — No obligation</span>
        <a href="#quote-form" className="lp-sticky-cta">Get My Quote →</a>
      </div>

      {/* Header */}
      <header className="lp-header lp-header-pushed">
        <span className="lp-tag">MORTGAGE PROTECTION</span>
        <div className="lp-logo"><Link to="/"><PNCLLogo height={28} /></Link></div>
      </header>

      {/* Hero — split layout with inline form */}
      <section className="lp-hero-split">
        <div className="lp-hero-left">
          <div className="lp-question-mark">?</div>
          <h1 className="lp-hero-title">
            Do you have a mortgage and <span className="lp-accent">no life insurance?</span>
          </h1>
          <ul className="lp-benefits">
            {benefits.map((b, i) => (
              <li key={i}>
                <span className="lp-check">✓</span>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
          <div className="lp-urgency-badge">
            <span className="lp-urgency-pulse" />
            <span>Agents available now — check your rate in under 60 seconds</span>
          </div>
        </div>
        <div className="lp-hero-right" id="quote-form">
          {!submitted ? (
            <div className="lp-inline-form-card">
              <h3 className="lp-form-card-title">See If You Qualify</h3>
              <p className="lp-form-card-sub">Takes less than 60 seconds. 100% free.</p>
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
                <button type="submit" className="lp-cta-dark lp-cta-full lp-cta-pulse" disabled={loading}>
                  {loading ? "SUBMITTING…" : "SEE IF YOU QUALIFY →"}
                </button>
              </form>
              <div className="lp-form-trust">
                <span>🔒 Your info is secure & never shared</span>
              </div>
            </div>
          ) : (
            <div className="lp-inline-form-card lp-success-card">
              <div className="lp-success-check">✓</div>
              <h3 className="lp-form-card-title">You're In!</h3>
              <p className="lp-form-card-sub">A licensed agent will call you within 5 minutes to review your options. No obligation.</p>
            </div>
          )}
        </div>
      </section>

      {/* Trust bar */}
      <section className="lp-trust-bar">
        <div className="lp-trust-item">
          <span className="lp-trust-num">3,000+</span>
          <span className="lp-trust-label">Licensed Agents</span>
        </div>
        <div className="lp-trust-item">
          <span className="lp-trust-num">75,000+</span>
          <span className="lp-trust-label">Policies Written</span>
        </div>
        <div className="lp-trust-item">
          <span className="lp-trust-num">A-Rated</span>
          <span className="lp-trust-label">Carriers</span>
        </div>
      </section>

      {/* How it works */}
      <section className="lp-steps-section">
        <h2 className="lp-section-title">How It Works</h2>
        <div className="lp-steps">
          <div className="lp-step">
            <div className="lp-step-num">01</div>
            <h3>Get a Free Quote</h3>
            <p>Answer a few quick questions about your mortgage and health.</p>
          </div>
          <div className="lp-step">
            <div className="lp-step-num">02</div>
            <h3>Choose Your Coverage</h3>
            <p>Compare affordable plans from top-rated carriers.</p>
          </div>
          <div className="lp-step">
            <div className="lp-step-num">03</div>
            <h3>Get Protected</h3>
            <p>Approval in minutes. Coverage starts immediately.</p>
          </div>
        </div>
      </section>

      {/* Mid-page CTA */}
      <section className="lp-mid-cta">
        <h2>Still paying a mortgage without protection?</h2>
        <p>Every day without coverage is a day your family is at risk.</p>
        <a href="#quote-form" className="lp-cta-dark">GET MY FREE QUOTE →</a>
      </section>

      {/* Social proof */}
      <section className="lp-social-proof">
        <h2 className="lp-section-title">What Families Are Saying</h2>
        <div className="lp-reviews">
          <div className="lp-review">
            <div className="lp-stars">★★★★★</div>
            <p>"I didn't think I could afford it. Turns out it was less than my Netflix subscription."</p>
            <strong>— Sarah M., Dallas TX</strong>
          </div>
          <div className="lp-review">
            <div className="lp-stars">★★★★★</div>
            <p>"Applied in 5 minutes, got approved the same day. My family is protected now."</p>
            <strong>— James R., Atlanta GA</strong>
          </div>
          <div className="lp-review">
            <div className="lp-stars">★★★★★</div>
            <p>"After my husband passed, the policy paid off our mortgage. I can't imagine what would have happened without it."</p>
            <strong>— Linda K., Phoenix AZ</strong>
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
        <h2>Don't wait until it's too late.</h2>
        <p>Your family deserves the security of knowing the mortgage is covered — no matter what.</p>
        <a href="#quote-form" className="lp-cta-dark lp-cta-large">SEE IF YOU QUALIFY — FREE →</a>
        <span className="lp-final-sub">No credit card. No medical exam. No obligation.</span>
      </section>

      {/* Footer */}
      <LPFooter />

      {/* Floating mobile CTA */}
      <div className="lp-floating-cta">
        <a href="#quote-form" className="lp-cta-dark lp-cta-full">SEE IF YOU QUALIFY →</a>
      </div>
    </div>
  );
}
