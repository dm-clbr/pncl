import { Link } from "react-router-dom";
import PNCLLogo from "./PNCLLogo";

export default function SiteFooter() {
  return (
    <footer className="pncl-footer">
      <div className="footer-top">
        <div>
          <div className="pncl-logo" style={{ marginBottom: "0.5rem" }}>
            <PNCLLogo height={24} />
          </div>
          <p className="footer-brand-desc">
            Empowering agents with the tools, training, and culture to build thriving careers in insurance.
          </p>
        </div>
        <div className="footer-col">
          <div className="footer-col-title">Company</div>
          <Link to="/about">About Us</Link>
          <a href="/#culture">Culture</a>
          <a href="/#cta">Careers</a>
          <Link to="/contact">Contact</Link>
        </div>
        <div className="footer-col">
          <div className="footer-col-title">Products</div>
          <Link to="/life-insurance">Life Insurance</Link>
          <Link to="/final-expense">Final Expense</Link>
          <Link to="/mortgage-protection">Mortgage Protection</Link>
          <Link to="/mortgage-protection">Health Insurance</Link>
        </div>
        <div className="footer-col">
          <div className="footer-col-title">Agents</div>
          <a href="/#cta">Become an Agent</a>
          <a href="https://score.insure" target="_blank" rel="noopener noreferrer">Agent Login</a>
          <a href="https://www.thepinnaclelifegroup.com/events" target="_blank" rel="noopener noreferrer">Training</a>
          <a href="https://www.thepinnaclelifegroup.com" target="_blank" rel="noopener noreferrer">Resources</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 PNCL. All rights reserved.</span>
        <div className="footer-bottom-links">
          <a href="https://www.thepinnaclelifegroup.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          <a href="https://www.thepinnaclelifegroup.com/term-and-conditions" target="_blank" rel="noopener noreferrer">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
}
