import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Home2HeroCanvas from "@/components/Home2HeroCanvas";
import PNCLLogo from "@/components/PNCLLogo";
import { submitLead } from "@/lib/web3forms";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

const marqueeItems = [
  "Life Insurance",
  "Final Expense",
  "Mortgage Protection",
  "Health Insurance",
  "Retirement Planning",
  "Medicare Solutions",
  "People > Profit",
  "Agent Development",
];

const pillars = [
  {
    num: "001",
    pk: "Compensation",
    title: "Aggressive Compensation",
    desc: "Our agents earn what they deserve. PNCL runs one of the most competitive compensation structures in the industry — because your work should pay off.",
    vis: "arch" as const,
    label: "Compensation Plan",
  },
  {
    num: "002",
    pk: "Income Streams",
    title: "Three Types of Income",
    desc: "Build real wealth through direct sales commissions, override income from team production, and long-term renewals that pay you for years.",
    vis: "stone" as const,
    label: "Direct · Override · Renewal",
  },
  {
    num: "003",
    pk: "Leads",
    title: "Innovative Lead Program",
    desc: "Access real-time, exclusive leads from our proprietary system. No cold-calling — just qualified prospects who are ready to talk.",
    vis: "screen-lockup" as const,
    label: "Live Lead Feed",
  },
  {
    num: "004",
    pk: "Technology",
    title: "A Smarter CRM",
    desc: "Our AI-integrated CRM streamlines your workflow, automates follow-ups, and surfaces the insights you need to close more deals.",
    vis: "screen-crm" as const,
    label: "PNCL Platform",
  },
];

const stats = [
  { to: 3000, suffix: "+" },
  { to: 27, suffix: "" },
  { to: 75000, suffix: "+" },
  { to: 31, suffix: "" },
];
const statLabels = ["Agents", "Global Offices", "Policies Placed", "Carrier Partners"];

const offerCards = [
  { num: "01", title: "Top Carriers", desc: "We partner with A-rated, nationally recognized carriers so you can offer the best products to your clients." },
  { num: "02", title: "Free Agent Training", desc: "From day one you'll have access to comprehensive training programs built to accelerate your success." },
  { num: "03", title: "Cutting-Edge Tools", desc: "Our tech stack is built to make selling easier — from quoting to enrollment to client management." },
  { num: "04", title: "A Culture That Cares", desc: "We're not just building a company — we're building a community where agents feel valued and empowered." },
];

const carriers = [
  "Aetna", "Transamerica", "Mutual of Omaha", "Americo",
  "Foresters", "Great Western", "Liberty Bankers", "Baltimore Life",
  "GTL", "Kansas City Life", "Royal Neighbors", "CFG",
];

const thriveItems = [
  { num: "01 — The Culture", title: "Collaboration over competition", desc: "A team-first environment where every agent has a voice — and where helping each other win is the default.", vis: "arch" as const, label: "Team-First Culture" },
  { num: "02 — The Training", title: "World-class onboarding", desc: "Weekly masterclasses and one-on-one mentorship from top producers, starting on day one.", vis: "screen-masterclass" as const, label: "Weekly Training" },
  { num: "03 — The Lifestyle", title: "Flexibility, built in", desc: "Build a career that fits your life — not the other way around. Work on your terms, from anywhere.", vis: "portrait" as const, label: "Work On Your Terms" },
  { num: "04 — The Growth", title: "Clear paths to leadership", desc: "Whether you want to be a top agent or build your own team, we'll help you get there.", vis: "stone" as const, label: "Clear Paths Up" },
];

function PMarkSymbol() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="pmark" viewBox="0 0 464.57 534.43">
        <polygon
          points="116.18 0 .39 115.79 349.57 115.79 349.57 254.75 279.59 324.73 115.79 324.73 115.79 145.32 0 261.1 0 534.43 115.79 534.43 115.79 440.32 328.75 440.32 464.57 304.5 464.57 0 116.18 0"
          fill="currentColor"
        />
      </symbol>
    </svg>
  );
}

function PillarVisual({ type, label }: { type: (typeof pillars)[number]["vis"]; label: string }) {
  if (type === "arch") {
    return (
      <div className="vis ph img-arch">
        <div className="bands" />
        <svg className="mark-wm" style={{ right: "6%", bottom: "8%", width: "34%" }}>
          <use href="#pmark" />
        </svg>
        <span className="label">{label}</span>
      </div>
    );
  }
  if (type === "stone") {
    return (
      <div className="vis ph img-stone">
        <div className="relief" />
        <span className="label">{label}</span>
      </div>
    );
  }
  if (type === "screen-lockup") {
    return (
      <div className="vis ph img-screen">
        <div className="glow">
          <span className="lockup">
            <PNCLLogo height={14} />
          </span>
        </div>
        <span className="label">{label}</span>
      </div>
    );
  }
  return (
    <div className="vis ph img-screen">
      <div className="glow">
        <span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--accent)" }}>AI · CRM</span>
      </div>
      <span className="label">{label}</span>
    </div>
  );
}

function ThriveVisual({ type, label }: { type: (typeof thriveItems)[number]["vis"]; label: string }) {
  if (type === "arch") {
    return (
      <div className="vis ph img-arch">
        <div className="bands" />
        <span className="label">{label}</span>
      </div>
    );
  }
  if (type === "stone") {
    return (
      <div className="vis ph img-stone">
        <div className="relief" />
        <span className="label">{label}</span>
      </div>
    );
  }
  if (type === "portrait") {
    return (
      <div className="vis ph img-portrait">
        <div className="sil" />
        <span className="label">{label}</span>
      </div>
    );
  }
  return (
    <div className="vis ph img-screen">
      <div className="glow">
        <span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--accent)" }}>Masterclass</span>
      </div>
      <span className="label">{label}</span>
    </div>
  );
}

function fmt(n: number) {
  return n >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n));
}

export default function Index() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const statgridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "PNCL — The Best Place to Be a Better Agent";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Join 3,000+ agents at PNCL. Aggressive compensation, three income streams, exclusive leads, an AI-powered CRM, and free training. People > Profit."
      );
    }
    trackPageView("homepage");
  }, []);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const els = document.querySelectorAll(".home2-page .reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const grid = statgridRef.current;
    if (!grid) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.querySelectorAll<HTMLElement>(".n").forEach((node) => {
            const to = Number(node.dataset.to);
            const suf = node.dataset.suffix || "";
            if (reduceMotion) {
              node.innerHTML = fmt(to) + (suf ? `<span class="accent">${suf}</span>` : "");
              return;
            }
            const t0 = performance.now();
            const dur = 1600;
            const tick = (t: number) => {
              const p = Math.min((t - t0) / dur, 1);
              const eased = 1 - Math.pow(1 - p, 3);
              node.innerHTML = fmt(to * eased) + (suf ? `<span class="accent">${suf}</span>` : "");
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          sio.unobserve(e.target);
        });
      },
      { threshold: 0.4 }
    );
    sio.observe(grid);
    return () => sio.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const need = ["fn", "ph", "em"];
    let ok = true;
    need.forEach((id) => {
      const f = form.elements.namedItem(id) as HTMLInputElement | null;
      if (f && !f.value.trim()) {
        f.style.borderColor = "var(--accent)";
        ok = false;
      }
    });
    if (!ok) return;

    setLoading(true);
    const fd = new FormData(form);
    try {
      await submitLead({
        name: fd.get("fn") as string,
        phone: fd.get("ph") as string,
        email: fd.get("em") as string,
        heard_about_us: fd.get("src") as string,
        about_yourself: fd.get("msg") as string,
        source: "agent-application-homepage",
      });
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const marqueeContent = [...marqueeItems, ...marqueeItems].map((label, i) => (
    <span key={i}>{label}</span>
  ));

  return (
    <div className="home2-page">
      <PMarkSymbol />
      <div className="grain" aria-hidden="true" />

      <header className={`nav${navScrolled ? " scrolled" : ""}`} id="nav">
        <div className="bar">
          <a href="#top" className="lockup" aria-label="PNCL home">
            <PNCLLogo height={24} />
          </a>
          <nav className="navlinks">
            <a href="#offer">What We Offer</a>
            <a href="#why">Why PNCL</a>
            <a href="#carriers">Carriers</a>
            <a href="#thrive">Culture</a>
            <a href="#apply">Apply</a>
            <Link to="/portal/login">Agent Login</Link>
          </nav>
          <a href="#apply" className="btn btn-accent">Become an Agent <span className="arr">→</span></a>
          <button type="button" className="burger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <span /><span /><span />
          </button>
        </div>
      </header>

      <div className={`mobmenu${menuOpen ? " open" : ""}`}>
        <button type="button" className="mobclose" aria-label="Close menu" onClick={closeMenu}>×</button>
        <a href="#offer" onClick={closeMenu}>What We Offer</a>
        <a href="#why" onClick={closeMenu}>Why PNCL</a>
        <a href="#carriers" onClick={closeMenu}>Carriers</a>
        <a href="#thrive" onClick={closeMenu}>Culture</a>
        <a href="#apply" onClick={closeMenu}>Apply</a>
        <Link to="/portal/login" onClick={closeMenu}>Agent Login</Link>
        <a href="#apply" className="btn btn-accent" onClick={closeMenu}>Become an Agent →</a>
      </div>

      <section className="hero" id="top">
        <Home2HeroCanvas />
        <div className="wrap">
          <div className="hero-top">
            <div>
              <div className="hero-tag"><span className="dot" /> Empowering People, Securing Futures</div>
              <h1 className="h1">
                <span className="o"><span style={{ animationDelay: ".05s" }}>The best place</span></span><br />
                <span className="o"><span style={{ animationDelay: ".15s" }}>to be a <span className="accent">better</span></span></span><br />
                <span className="o"><span style={{ animationDelay: ".25s" }}>insurance agent.</span></span>
              </h1>
              <p className="hero-sub">
                Sell Life, Final Expense, Mortgage Protection, or Health Insurance — backed by the support, tools, and culture you deserve.
              </p>
              <div className="hero-cta">
                <a href="#apply" className="btn btn-accent btn-lg">Become an Agent <span className="arr">→</span></a>
                <a href="#offer" className="btn btn-ghost btn-lg">See what we offer</a>
              </div>
            </div>
          </div>
          <div className="hero-meta">
            <div><b>3,000+</b><small>Agents</small></div>
            <div><b>3</b><small>Income Streams</small></div>
            <div><b>75K+</b><small>Policies Placed</small></div>
            <div><b>Free</b><small>Agent Training</small></div>
          </div>
        </div>
        <div className="scrollcue">Scroll<span className="line" /></div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">{marqueeContent}</div>
      </div>

      <section className="care" id="why">
        <div className="wrap grid">
          <div className="care-copy reveal">
            <span className="eyebrow">Our Philosophy</span>
            <h2 className="h2">At PNCL,<br />we care about you.</h2>
            <p className="lead">
              We built PNCL on one belief: people come first. When agents feel supported, valued, and equipped, they don&apos;t just sell policies — they change lives. Our mission is to build the most empowering environment in insurance, where your growth is the priority.
            </p>
            <div className="pp-badge">People <span className="gt">&gt;</span> Profit</div>
          </div>
          <div className="care-visual reveal">
            <div className="ph img-portrait" style={{ position: "absolute", inset: 0 }}>
              <svg className="mark-wm" style={{ right: "-6%", bottom: "-4%", width: "60%" }}><use href="#pmark" /></svg>
              <div className="sil" />
              <span className="label">PNCL Agents — 2026</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pillars dark" id="offer">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">What We Offer</span>
            <h2 className="h2">Everything an agent needs<br />to actually win.</h2>
          </div>
          {pillars.map((p) => (
            <div key={p.num} className="prow reveal">
              <div className="num">{p.num}</div>
              <div>
                <div className="pk">{p.pk}</div>
                <h3 className="h3">{p.title}</h3>
                <p>{p.desc}</p>
              </div>
              <PillarVisual type={p.vis} label={p.label} />
            </div>
          ))}
        </div>
      </section>

      <section className="stats" id="stats">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">By The Numbers</span>
            <h2 className="h2">There&apos;s a reason<br />PNCL is growing fast.</h2>
          </div>
          <div className="statgrid reveal" ref={statgridRef}>
            {stats.map((s, i) => (
              <div key={statLabels[i]} className="cell">
                <div className="n" data-to={s.to} data-suffix={s.suffix}>0</div>
                <div className="l">{statLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="offer dark">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The PNCL Difference</span>
            <h2 className="h2">Not your average<br />insurance gig.</h2>
            <p className="lead" style={{ marginTop: 24, maxWidth: "50ch" }}>
              We give agents everything they need to build a thriving career — from top-tier carriers and free training to cutting-edge tech and a culture that actually cares.
            </p>
          </div>
          <div className="ocards reveal">
            {offerCards.map((c) => (
              <div key={c.num} className="ocard">
                <svg className="ic" style={{ width: 130 }}><use href="#pmark" /></svg>
                <div className="num">{c.num}</div>
                <h3 className="h3">{c.title}</h3>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="carriers" id="carriers">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Our Carriers</span>
            <h2 className="h2">Backed by names you can trust.</h2>
          </div>
          <div className="logogrid reveal">
            {carriers.map((name) => (
              <div key={name} className="lg">{name}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="thrive dark" id="thrive">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The Culture</span>
            <h2 className="h2">Agents don&apos;t just succeed<br />at PNCL — they thrive.</h2>
          </div>
          <div className="tgrid">
            {thriveItems.map((t) => (
              <div key={t.num} className="titem reveal">
                <ThriveVisual type={t.vis} label={t.label} />
                <div>
                  <div className="num">{t.num}</div>
                  <h3 className="h3">{t.title}</h3>
                  <p>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="stonebg" />
        <div className="wrap reveal">
          <span className="eyebrow">Join Us</span>
          <h2 className="h2">Ready to reach<br />new heights?</h2>
          <p>Join thousands of agents who chose PNCL to build a career they&apos;re proud of.</p>
          <a href="#apply" className="btn btn-bone btn-lg">Join Our Team Today <span className="arr">→</span></a>
        </div>
      </section>

      <section className="apply" id="apply">
        <div className="wrap grid">
          <div className="reveal">
            <span className="eyebrow">Start Your Career</span>
            <h2 className="h2">Start your career<br />at PNCL.</h2>
            <p className="lead">Fill out the form and a team leader will be in touch within 24 hours. No pressure — just a real conversation about your future.</p>
            <div className="hero-meta" style={{ borderColor: "rgba(240,237,228,.12)", marginTop: 40 }}>
              <div><b style={{ color: "var(--bone)" }}>24h</b><small>Response Time</small></div>
              <div><b style={{ color: "var(--bone)" }}>3,000+</b><small>Agents Strong</small></div>
            </div>
          </div>
          <div className="formwrap reveal">
            <form id="applyform" noValidate onSubmit={handleSubmit} style={{ display: submitted ? "none" : undefined }}>
              <div className="frow">
                <div className="field">
                  <label htmlFor="fn">Full Name</label>
                  <input id="fn" name="fn" type="text" placeholder="Jane Doe" required />
                </div>
                <div className="field">
                  <label htmlFor="ph">Phone Number</label>
                  <input id="ph" name="ph" type="tel" placeholder="(555) 000-0000" required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="em">Email Address</label>
                <input id="em" name="em" type="email" placeholder="jane@email.com" required />
              </div>
              <div className="field">
                <label htmlFor="src">How did you hear about us?</label>
                <select id="src" name="src" defaultValue="">
                  <option value="">Select one…</option>
                  <option>Social Media</option>
                  <option>A Current PNCL Agent</option>
                  <option>Web Search</option>
                  <option>Job Board</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="msg">Your goals</label>
                <textarea id="msg" name="msg" placeholder="Experience, goals, anything you'd like us to know…" />
              </div>
              <button type="submit" className="btn btn-accent btn-lg applybtn" disabled={loading}>
                {loading ? "Submitting…" : <>Submit Application <span className="arr">→</span></>}
              </button>
            </form>
            <div className={`success${submitted ? " show" : ""}`}>
              <div className="check">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F0EDE4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h3 className="h3">Application received.</h3>
              <p>A team leader will reach out within 24 hours. Welcome to PNCL.</p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand">
              <span className="lockup"><PNCLLogo height={28} /></span>
              <p>Empowering agents with the tools, training, and culture to build thriving careers in insurance.</p>
            </div>
            <div className="foot-col">
              <h4>Company</h4>
              <a href="#why">About Us</a>
              <a href="#thrive">Culture</a>
              <a href="#apply">Careers</a>
              <Link to="/contact">Contact</Link>
            </div>
            <div className="foot-col">
              <h4>Products</h4>
              <Link to="/life-insurance">Life Insurance</Link>
              <Link to="/final-expense">Final Expense</Link>
              <Link to="/mortgage-protection">Mortgage Protection</Link>
              <Link to="/mortgage-protection">Health Insurance</Link>
            </div>
            <div className="foot-col">
              <h4>Agents</h4>
              <a href="#apply">Become an Agent</a>
              <a href="/portal">Agent Login</a>
              <a href="https://www.thepinnaclelifegroup.com/events" target="_blank" rel="noopener noreferrer">Training</a>
              <a href="https://www.thepinnaclelifegroup.com" target="_blank" rel="noopener noreferrer">Resources</a>
            </div>
          </div>
          <div className="foot-bottom">
            <small>© 2026 PNCL. All rights reserved.</small>
            <div className="links">
              <a href="https://www.thepinnaclelifegroup.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
              <a href="https://www.thepinnaclelifegroup.com/term-and-conditions" target="_blank" rel="noopener noreferrer">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
