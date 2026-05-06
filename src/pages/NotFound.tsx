import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import PNCLLogo from "@/components/PNCLLogo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = "Page Not Found | PNCL";
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="lp-page lp-dark" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ marginBottom: "2rem" }}>
        <PNCLLogo height={28} />
      </div>
      <h1 style={{ fontSize: "5rem", fontWeight: 700, color: "var(--bone)", marginBottom: "0.5rem", lineHeight: 1 }}>404</h1>
      <p style={{ fontSize: "1.25rem", color: "var(--graphite)", marginBottom: "2rem" }}>Oops! Page not found</p>
      <a href="/" className="pill-cta">Return to Home</a>
    </div>
  );
};

export default NotFound;
