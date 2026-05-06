import { useEffect, useRef, useCallback, useState } from "react";
import { Heart, Umbrella, Home, Activity, TrendingUp, HeartPulse, Users, GraduationCap, Diamond } from "lucide-react";
import { AetnaLogo, AmericoLogo, BaltimoreLifeLogo, ForestersLogo, GreatWesternLogo, GTLLogo, KansasCityLifeLogo, LibertyBankersLogo, MutualOfOmahaLogo, TransamericaLogo, RoyalNeighborsLogo, CFGLogo } from "@/components/CarrierLogos";
import PNCLLogo from "@/components/PNCLLogo";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import AgentApplicationModal from "@/components/AgentApplicationModal";
import { trackPageView } from "@/lib/analytics";

const heroImages = [
  "/arches-pncl.webp"
];

const marqueeItems = [
  { label: "Life Insurance",      Icon: Heart },
  { label: "Final Expense",       Icon: Umbrella },
  { label: "Mortgage Protection", Icon: Home },
  { label: "Health Insurance",    Icon: Activity },
  { label: "Retirement Planning", Icon: TrendingUp },
  { label: "Medicare Solutions",  Icon: HeartPulse },
  { label: "People > Profit",     Icon: Users },
  { label: "Agent Development",   Icon: GraduationCap },
];

const aboutCards = [
  { num: "001", title: "Aggressive Compensation Plan", desc: "Our agents earn what they deserve. PNCL offers one of the most competitive compensation structures in the industry — because your work should pay off." },
  { num: "002", title: "Three Types of Income", desc: "Build wealth through direct sales commissions, override income from team production, and long-term renewal income that pays you for years." },
  { num: "003", title: "Innovative Lead Program", desc: "Access real-time, exclusive leads generated through our proprietary system. No cold-calling — just qualified prospects ready to talk." },
  { num: "004", title: "Better CRM Technology", desc: "Our AI-integrated CRM streamlines your workflow, automates follow-ups, and gives you the insights you need to close more deals." },
];

const stats = [
  { value: 3000, suffix: "+", label: "Agents" },
  { value: 27, suffix: "", label: "Global Offices" },
  { value: 75000, suffix: "+", label: "Policies" },
  { value: 31, suffix: "", label: "Partners" },
];

const whyItems = [
  { title: "Top Carriers", desc: "We partner with A-rated, nationally recognized carriers so you can offer the best products to your clients.", icon: "layers" },
  { title: "Free Agent Training", desc: "From day one, you'll have access to comprehensive training programs designed to accelerate your success.", icon: "users" },
  { title: "Cutting-Edge Tools", desc: "Our tech stack is built to make selling easier — from quoting to enrollment to client management.", icon: "lightning" },
  { title: "A Culture That Cares", desc: "We're not just building a company — we're building a community where agents feel valued, supported, and empowered.", icon: "heart" },
];

const carriers: { name: string; logo?: React.ReactNode }[] = [
  { name: "Aetna", logo: <AetnaLogo /> },
  { name: "Transamerica", logo: <TransamericaLogo /> },
  { name: "Mutual of Omaha", logo: <MutualOfOmahaLogo /> },
  { name: "Americo", logo: <AmericoLogo /> },
  { name: "Foresters", logo: <ForestersLogo /> },
  { name: "Great Western", logo: <GreatWesternLogo /> },
  { name: "Liberty Bankers", logo: <LibertyBankersLogo /> },
  { name: "Baltimore Life", logo: <BaltimoreLifeLogo /> },
  { name: "GTL", logo: <GTLLogo /> },
  { name: "Kansas City Life", logo: <KansasCityLifeLogo /> },
  { name: "Royal Neighbors", logo: <RoyalNeighborsLogo /> },
  { name: "CFG", logo: <CFGLogo /> },
];

const cultureCards = [
  { num: "01", title: "The Culture", desc: "A team-first environment where collaboration beats competition and every agent has a voice.", img: "/pncl1.webp" },
  { num: "02", title: "The Training", desc: "World-class onboarding, weekly masterclasses, and one-on-one mentorship from top producers.", img: "/pncl2.webp" },
  { num: "03", title: "The Lifestyle", desc: "Flexibility to work on your terms. Build a career that fits your life — not the other way around.", img: "/pncl3.webp" },
  { num: "04", title: "The Growth", desc: "Clear paths to leadership. Whether you want to be a top agent or build your own team, we'll get you there.", img: "/pncl4.webp" },
];

function WhyIcon({ type }: { type: string }) {
  switch (type) {
    case "layers":
      return <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
    case "users":
      return <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "lightning":
      return <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    case "heart":
      return <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
    default: return null;
  }
}

function useAnimatedCounter(end: number, duration = 2000) {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !counted.current) {
        counted.current = true;
        let start: number | null = null;
        const step = (ts: number) => {
          if (!start) start = ts;
          const progress = Math.min((ts - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.floor(eased * end).toLocaleString();
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return ref;
}

function StatCard({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const ref = useAnimatedCounter(value);
  return (
    <div className="stat-card">
      <div className="stat-number">
        <span ref={ref}>0</span>
        {suffix && <span className="plus">{suffix}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Index() {
  const [modalOpen, setModalOpen] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % heroImages.length);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.title = "PNCL — The Best Place to Be a Better Insurance Agent";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Join 3,000+ agents at PNCL. Aggressive compensation, 3 types of income, innovative leads, AI-powered CRM, and free training. Life insurance, final expense, mortgage protection, and health insurance.");
    trackPageView('homepage');
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

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const marqueeContent = marqueeItems.map(({ label, Icon }, i) => (
    <span key={i} className="marquee-item">
      <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
      {label}
      <Diamond size={6} fill="currentColor" strokeWidth={0} aria-hidden="true" className="marquee-dot" />
    </span>
  ));

  return (
    <>
      <SiteNav onCtaClick={() => scrollTo("cta")} />

      {/* HERO */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-label fade-up">WELCOME</div>
          <h1 className="fade-up">The Best Place to Be a Better Agent.</h1>
          <span className="hero-subtitle fade-up">Empowering People, Securing Futures.</span>
          <p className="hero-body fade-up">
            At PNCL, sell Life Insurance, Final Expense, Mortgage Protection, or Health Insurance — with the support, tools, and culture you deserve.
          </p>
          <div className="fade-up">
            <button className="pill-cta" onClick={() => scrollTo("cta")}>
              Become an Agent
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </div>
          <div className="scroll-indicator">Scroll</div>
        </div>
        <div className="hero-image-wrap" aria-hidden="true">
          {heroImages.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              draggable="false"
              className={i === heroSlide ? "active" : ""}
            />
          ))}
          <div className="hero-slide-dots">
            {heroImages.map((_, i) => (
              <button
                key={i}
                className={`hero-slide-dot${i === heroSlide ? " active" : ""}`}
                onClick={() => setHeroSlide(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-section">
        <div className="marquee-track">
          {marqueeContent}{marqueeContent}
        </div>
      </div>

      {/* ABOUT */}
      <section id="about" className="about-section">
        <div className="about-left fade-up">
          <div className="section-label">001 — About Us</div>
          <h2 className="section-title">
            At PNCL, we care about <span className="accent">you.</span>
          </h2>
          <p className="about-body">
            We built PNCL on one belief: people come first. When agents feel supported, valued, and equipped — they don't just sell policies, they change lives. Our mission is to create the most empowering environment in insurance, where your growth is our priority.
          </p>
          <div className="about-badge">
            <span className="about-badge-dot" />
            People &gt; Profit
          </div>
        </div>
        <div className="about-cards">
          {aboutCards.map((card) => (
            <div key={card.num} className="about-card fade-up">
              <div className="about-card-num">{card.num}</div>
              <div className="about-card-title">{card.title}</div>
              <div className="about-card-desc">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section id="stats" className="stats-section">
        <div className="fade-up">
          <div className="section-label">002 — By the Numbers</div>
          <h2 className="section-title">
            There's a reason PNCL is <span className="accent">growing quickly.</span>
          </h2>
        </div>
        <div className="stats-grid fade-up">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* WHY PNCL */}
      <section id="offer" className="why-section">
        <div className="why-watermark">PNCL</div>
        <div className="fade-up">
          <div className="section-label">003 — Why PNCL</div>
          <h2 className="section-title">Not your average insurance gig.</h2>
          <p className="why-body">
            We give agents everything they need to build a thriving career — from top-tier carriers and free training to cutting-edge technology and a culture that actually cares.
          </p>
        </div>
        <div className="why-items">
          {whyItems.map((item) => (
            <div key={item.title} className="why-item fade-up">
              <div className="why-icon"><WhyIcon type={item.icon} /></div>
              <div>
                <div className="why-item-title">{item.title}</div>
                <div className="why-item-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CARRIERS */}
      <section className="carriers-section">
        <div className="fade-up">
          <div className="section-label" style={{ justifyContent: "center" }}>004 — Partners</div>
          <h2 className="section-title">Our Carriers</h2>
        </div>
        <div className="carriers-grid fade-up">
          {carriers.map(({ name, logo }) => (
            <div key={name} className={`carrier-pill${logo ? " carrier-pill--logo" : ""}`}>
              {logo ?? name}
            </div>
          ))}
        </div>
      </section>

      {/* CULTURE */}
      <section id="culture" className="culture-section">
        <div className="fade-up">
          <div className="section-label">005 — The Experience</div>
          <h2 className="section-title">
            Agents don't just succeed at PNCL — they <span className="accent">thrive.</span>
          </h2>
        </div>
        <div className="culture-grid fade-up">
          {cultureCards.map((card) => (
            <div key={card.num} className="culture-card">
              <div className="culture-card-img">
                <img src={card.img} alt={card.title} draggable="false" />
              </div>
              <div className="culture-card-body">
                <div className="culture-num">{card.num}</div>
                <div className="culture-card-title">{card.title}</div>
                <div className="culture-card-desc">{card.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="cta-section">
        <h2 className="cta-title fade-up">Ready to reach new heights?</h2>
        <p className="cta-subtitle fade-up">
          Join thousands of agents who chose PNCL to build a career they're proud of.
        </p>
        <div className="fade-up">
          <button className="pill-cta" onClick={() => setModalOpen(true)}>
            Join Our Team Today
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        </div>
      </section>

      <SiteFooter />

      <AgentApplicationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
