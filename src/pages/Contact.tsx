import { useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Contact Us | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Get in touch with the PNCL team. Agent inquiries, client questions, and partnership opportunities. Offices in New Jersey and Indiana.");
    window.scrollTo(0, 0);
    trackPageView('contact');
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll(".fade-up");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.15 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const leadData = {
        name: fd.get("name") as string,
        email: fd.get("email") as string,
        phone: fd.get("phone") as string,
        subject: fd.get("subject") as string,
        message: fd.get("message") as string,
        source: "contact-page",
      };
      trackFormSubmission("contact-page", leadData);
      await submitLead(leadData);
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SiteNav />

      <section className="contact-hero">
        <div className="section-label fade-up">GET IN TOUCH</div>
        <h1 className="section-title fade-up">Let's <span className="accent">talk.</span></h1>
        <p className="contact-hero-sub fade-up">
          Whether you're an agent looking to join, a client with questions, or a partner exploring opportunities — we'd love to hear from you.
        </p>
      </section>

      <section className="contact-grid">
        {/* Left — Info */}
        <div className="contact-info fade-up">
          <div className="contact-info-block">
            <div className="contact-info-label">Email</div>
            <a href="mailto:connect@thepinnaclelifegroup.com" className="contact-info-value contact-link">
              connect@thepinnaclelifegroup.com
            </a>
          </div>
          <div className="contact-info-block">
            <div className="contact-info-label">Phone Hours</div>
            <span className="contact-info-value">9am – 5pm EST</span>
          </div>
          <div className="contact-info-block">
            <div className="contact-info-label">NJ Headquarters</div>
            <span className="contact-info-value">209 Philadelphia Ave, Egg Harbor City, NJ 08215</span>
          </div>
          <div className="contact-info-block">
            <div className="contact-info-label">IN Headquarters</div>
            <span className="contact-info-value">9245 Calumet Ave Suite 201, Munster, IN 46321</span>
          </div>
          <div className="contact-info-block">
            <div className="contact-info-label">Social</div>
            <div className="contact-socials">
              <a href="https://www.linkedin.com/company/thepinnaclelifegroup/" target="_blank" rel="noopener noreferrer" className="contact-link">LinkedIn</a>
              <a href="https://www.facebook.com/thepinnaclelifegroup" target="_blank" rel="noopener noreferrer" className="contact-link">Facebook</a>
              <a href="https://www.instagram.com/thepinnaclelifegroup/" target="_blank" rel="noopener noreferrer" className="contact-link">Instagram</a>
            </div>
          </div>
        </div>

        {/* Right — Form */}
        <div className="fade-up">
          {!submitted ? (
            <div className="contact-form-card">
              <form className="contact-form" onSubmit={handleSubmit}>
                <input type="text" name="name" placeholder="Full Name" required />
                <input type="email" name="email" placeholder="Email Address" required />
                <input type="tel" name="phone" placeholder="Phone Number (optional)" />
                <select name="subject" defaultValue="" required>
                  <option value="" disabled>Select a subject</option>
                  <option>I want to become an agent</option>
                  <option>I need insurance coverage</option>
                  <option>Partnership inquiry</option>
                  <option>General question</option>
                  <option>Other</option>
                </select>
                <textarea name="message" placeholder="Your message..." rows={5} required />
                <button type="submit" className="contact-submit" disabled={loading}>
                  {loading ? "SENDING…" : "SEND MESSAGE →"}
                </button>
              </form>
            </div>
          ) : (
            <div className="contact-form-card contact-success">
              <div className="contact-success-check">✓</div>
              <h3>Message Sent!</h3>
              <p>We'll get back to you within 1 business day.</p>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
