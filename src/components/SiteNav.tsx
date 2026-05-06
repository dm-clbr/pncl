import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import PNCLLogo from "./PNCLLogo";

interface SiteNavProps {
  onCtaClick?: () => void;
}

export default function SiteNav({ onCtaClick }: SiteNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    const onScroll = () => {
      if (navRef.current) {
        navRef.current.classList.toggle("scrolled", window.scrollY > 100);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleNavClick = (id: string) => {
    if (isHome) {
      scrollTo(id);
    } else {
      window.location.href = `/#${id}`;
    }
  };

  return (
    <>
      <nav ref={navRef} className="pncl-nav">
        <Link className="pncl-logo" to="/">
          <PNCLLogo height={28} />
        </Link>
        <ul className="nav-links">
          <li><a onClick={() => handleNavClick("about")}>About</a></li>
          <li><a onClick={() => handleNavClick("offer")}>What We Offer</a></li>
          <li><a onClick={() => handleNavClick("stats")}>Stats</a></li>
          <li><a onClick={() => handleNavClick("culture")}>Culture</a></li>
          <li><Link to="/about">Our Story</Link></li>
          <li><Link to="/contact">Contact</Link></li>
          <li>
            <button className="nav-cta" onClick={onCtaClick || (() => handleNavClick("cta"))}>
              Become an Agent
            </button>
          </li>
        </ul>
        <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
      </nav>

      <div className={`mobile-menu${menuOpen ? " open" : ""}`}>
        <div className="mobile-menu-header">
          <Link className="pncl-logo" to="/" onClick={() => setMenuOpen(false)}>
            <PNCLLogo height={28} />
          </Link>
          <button className="mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <ul className="mobile-menu-links">
          <li><a onClick={() => { setMenuOpen(false); handleNavClick("about"); }}>About</a></li>
          <li><a onClick={() => { setMenuOpen(false); handleNavClick("offer"); }}>What We Offer</a></li>
          <li><a onClick={() => { setMenuOpen(false); handleNavClick("stats"); }}>Stats</a></li>
          <li><a onClick={() => { setMenuOpen(false); handleNavClick("culture"); }}>Culture</a></li>
          <li><Link to="/about" onClick={() => setMenuOpen(false)}>Our Story</Link></li>
          <li><Link to="/contact" onClick={() => setMenuOpen(false)}>Contact</Link></li>
          <li>
            <button className="nav-cta" onClick={() => { setMenuOpen(false); (onCtaClick || (() => handleNavClick("cta")))(); }}>
              Become an Agent
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
