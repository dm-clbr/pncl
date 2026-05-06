import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import LPFooter from "@/components/LPFooter";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

export default function FinalExpense() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Final Expense Insurance — Affordable Coverage | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Final expense insurance starting at $20/month. Cover funeral costs, medical bills, and debts. No medical exam, fast approval. Get a free quote in 60 seconds.");
    window.scrollTo(0, 0);
    trackPageView('final-expense');
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
        age_range: fd.get("age_range") as string,
        source: "final-expense-lp",
      };
      trackFormSubmission("final-expense-lp", leadData);
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
      <div className="lp-sticky-bar lp-sticky-dark">
        <span className="lp-sticky-text">💛 Don't leave your family with the bill — Check your rate free</span>
        <a href="#quote-form" className="lp-sticky-cta-light">Check My Rate →</a>
      </div>

      <header className="lp-header lp-header-pushed">
        <span className="lp-tag">FINAL EXPENSE</span>
        <div className="lp-logo"><Link to="/"><PNCLLogo height={28} /></Link></div>
      </header>

      <section className="lp-hero-split lp-hero-split-dark">
        <div className="lp-hero-left">
          <h1 className="lp-hero-title lp-hero-title-large">
            The average funeral costs <span className="lp-accent-muted">$8,000+.</span> Is your family <span className="lp-accent-muted">ready?</span>
          </h1>
          <p className="lp-hero-sub">
            Final Expense Insurance covers funeral costs, medical bills, and outstanding debts — so your loved ones can grieve without financial stress.
          </p>
          <div className="lp-urgency-badge lp-urgency-dark">
            <span className="lp-urgency-pulse" />
            <span>Plans start at just $20/month</span>
          </div>
        </div>
        <div className="lp-hero-right" id="quote-form">
          {!submitted ? (
            <div className="lp-inline-form-card lp-form-card-dark">
              <h3 className="lp-form-card-title">See Your Rate — Free</h3>
              <p className="lp-form-card-sub">60 seconds. No exam. No obligation.</p>
              <form className="lp-form" onSubmit={handleSubmit}>
                <input type="text" name="name" placeholder="Full Name" required />
                <input type="tel" name="phone" placeholder="Phone Number" required />
                <input type="email" name="email" placeholder="Email Address" required />
                <select name="age_range" defaultValue="" required>
                  <option value="" disabled>Age Range</option>
                  <option>45–54</option>
                  <option>55–64</option>
                  <option>65–74</option>
                  <option>75–84</option>
                  <option>85+</option>
                </select>
                <button type="submit" className="lp-cta-bone lp-cta-full lp-cta-pulse" disabled={loading}>
                  {loading ? "SUBMITTING…" : "CHECK MY RATE →"}
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

      <section className="lp-stakes-section">
        <h2 className="lp-section-title-dark">What's Really at Stake</h2>
        <div className="lp-stakes-grid">
          <div className="lp-stake-card">
            <h3>❌ Without Coverage</h3>
            <ul>
              <li>Family pays $8,000–$15,000 out of pocket</li>
              <li>Funeral costs strain grieving loved ones</li>
              <li>Medical bills and debts fall to family</li>
              <li>GoFundMe becomes the backup plan</li>
            </ul>
          </div>
          <div className="lp-stake-card lp-stake-good">
            <h3>✓ With PNCL Coverage</h3>
            <ul>
              <li>Funeral and burial fully covered</li>
              <li>Family grieves without financial worry</li>
              <li>Outstanding debts handled</li>
              <li>Dignity and peace of mind — guaranteed</li>
            </ul>
          </div>
        </div>
        <div className="lp-reality-cta">
          <a href="#quote-form" className="lp-cta-bone">PROTECT YOUR FAMILY →</a>
        </div>
      </section>

      <section className="lp-social-proof lp-social-dark">
        <h2 className="lp-section-title-dark">What Families Are Saying</h2>
        <div className="lp-reviews">
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"My mother had a final expense policy and it made the worst week of our lives just a little easier."</p>
            <strong>— Angela R., Memphis TN</strong>
          </div>
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"I'm 67 and got approved in 10 minutes. No blood test, no hassle."</p>
            <strong>— Robert S., Tucson AZ</strong>
          </div>
          <div className="lp-review lp-review-dark">
            <div className="lp-stars">★★★★★</div>
            <p>"$24/month for $15,000 in coverage. Best decision I've made this year."</p>
            <strong>— Patricia L., Savannah GA</strong>
          </div>
        </div>
        <p className="lp-testimonial-disclaimer">* Individual results may vary. Testimonials reflect personal experiences and are not guaranteed outcomes. Coverage and rates depend on individual circumstances.</p>
      </section>

      <section className="lp-final-cta lp-final-dark">
        <h2>Your final act of love is making sure they're not left with the bill.</h2>
        <a href="#quote-form" className="lp-cta-bone lp-cta-large">CHECK YOUR RATE — FREE →</a>
        <div className="lp-guarantee">
          <span>✓ No credit card required</span>
          <span>✓ No medical exam</span>
          <span>✓ Cancel anytime</span>
        </div>
      </section>

      <LPFooter dark />

      <div className="lp-floating-cta lp-floating-dark">
        <a href="#quote-form" className="lp-cta-bone lp-cta-full">CHECK MY RATE →</a>
      </div>
    </div>
  );
}
