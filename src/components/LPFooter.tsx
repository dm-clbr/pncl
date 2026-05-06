import { Link } from "react-router-dom";
import PNCLLogo from "./PNCLLogo";

export default function LPFooter({ dark = false }: { dark?: boolean }) {
  return (
    <footer className={`lp-footer${dark ? " lp-footer-dark" : ""}`}>
      <PNCLLogo height={20} />
      <p>© 2026 PNCL. All rights reserved.</p>
      <Link
        to="/"
        style={{
          fontSize: "0.75rem",
          color: "var(--space)",
          textDecoration: "none",
          marginTop: "0.5rem",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--bone)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--space)")}
      >
        ← Back to PNCL
      </Link>
    </footer>
  );
}
