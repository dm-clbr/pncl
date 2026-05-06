import { useEffect } from "react";
import { trackPageView } from "@/lib/analytics";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

const values = [
  { title: "It's About Team", desc: "If you want to go fast, go alone; if you want to go far, go together. Teamwork and culture is the single greatest catalyst of growth." },
  { title: "It's About Security", desc: "At the heart of everything we do is our mission to leave every client in a more secure financial situation for the future." },
  { title: "It's About the Client", desc: "We put the client first by teaching every agent to effectively improve the situation of every person they meet." },
  { title: "It's About Innovation", desc: "We ensure you are up-to-date with the latest technology to propel your business to new heights." },
  { title: "It's About the Agent", desc: "Everything PNCL does is designed to make the agent experience more efficient and more profitable." },
  { title: "It's About Generations", desc: "We help you create financial peace-of-mind that spans generations and impacts countless lives." },
];

const leaders = [
  {
    name: "Joseph Basso",
    title: "Co-Founder & CEO",
    bio: "Joe co-founded Pinnacle Life Group and serves as CEO. Before Pinnacle, he co-founded and built multiple companies growing to 8-figure revenue. With nearly 15 years of entrepreneurial experience, Joe brings immense expertise in mentorship, operations, and growth strategy. His passion for excellence in business is driven by his love for his family and desire to develop other entrepreneurs.",
  },
  {
    name: "Gabriel Ericson",
    title: "Co-Founder & President",
    bio: "Gabe co-founded Pinnacle Life Group and has personally mentored hundreds of agents to become top producers and agency builders. He previously co-founded an insurance agency that grew to over a million per month in sales within one year. With a background in ministry spanning inner-city Chicago to West Africa, Gabe combines a passion for life-changing financial products with a deep commitment to helping agents achieve dreams they previously believed unattainable.",
  },
  {
    name: "Paul McClain",
    title: "President of Sales",
    bio: "Paul began his career in financial services at 19, ranking among the top 10 producers nationwide for 10 consecutive years. He built one of the largest agencies in the country, issuing more than $20M in premium monthly and training thousands of agents. His leadership is rooted in gratitude, faith, and a commitment to creating generational impact.",
  },
];

export default function About() {
  useEffect(() => {
    document.title = "About PNCL — Our Story, Values & Leadership";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "PNCL was founded on one belief: people come first. Meet our leadership team, learn our values, and discover why 3,000+ agents call PNCL home.");
    window.scrollTo(0, 0);
    trackPageView('about');
  }, []);

  // Fade-up observer
  useEffect(() => {
    const els = document.querySelectorAll(".fade-up");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.15 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <SiteNav />

      {/* HERO */}
      <section className="about-hero">
        <div className="section-label fade-up">001 — Our Story</div>
        <h1 className="section-title fade-up" style={{ maxWidth: "720px" }}>
          Built on one belief: <span className="accent">people come first.</span>
        </h1>
        <p className="about-hero-body fade-up">
          PNCL was founded to create the most empowering environment in insurance. When agents feel supported, valued, and equipped — they don't just sell policies, they change lives. We're not just building a company. We're building a movement.
        </p>
        <div className="about-badge fade-up">People &gt; Profit</div>
      </section>

      {/* VALUES */}
      <section className="about-values-section">
        <div className="about-values-grid">
          {values.map((v, i) => (
            <div key={i} className="about-card fade-up">
              <div className="about-card-num">{String(i + 1).padStart(3, "0")}</div>
              <div className="about-card-title">{v.title}</div>
              <div className="about-card-desc">{v.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* LEADERSHIP */}
      <section className="about-leadership-section">
        <div className="section-label fade-up">002 — Leadership</div>
        <h2 className="section-title fade-up">Meet the team behind <span className="accent">PNCL.</span></h2>
        <div className="about-leaders-grid">
          {leaders.map((l, i) => (
            <div key={i} className="about-leader-card fade-up">
              <div className="about-leader-avatar">{l.name.split(" ").map(n => n[0]).join("")}</div>
              <h3 className="about-leader-name">{l.name}</h3>
              <div className="about-leader-title">{l.title}</div>
              <p className="about-leader-bio">{l.bio}</p>
            </div>
          ))}
        </div>
      </section>

      {/* IMPACT */}
      <section className="about-impact-section">
        <div className="section-label fade-up">003 — Giving Back</div>
        <h2 className="section-title fade-up">Impact beyond <span className="accent">insurance.</span></h2>
        <p className="about-impact-body fade-up">
          We've partnered with Impact Others to build an orphanage in Guadalajara, Mexico. Our Pinnacle team is raising $50,000 to renovate the property and get it move-in ready for the children.
        </p>
        <div className="fade-up">
          <a
            href="https://impactothers.com/project-11-mexico/"
            target="_blank"
            rel="noopener noreferrer"
            className="pill-cta"
          >
            Learn More
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </a>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
