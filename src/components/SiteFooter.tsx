import { Link } from "react-router-dom";
import PNCLLogo from "./PNCLLogo";

export default function SiteFooter() {
  return (
    <footer className="pncl-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <Link to="/" className="pncl-logo">
            <PNCLLogo height={28} />
          </Link>
          <p className="footer-brand-desc">
            Empowering agents with the tools, training, and culture to build thriving careers in insurance.
          </p>
        </div>
        <div className="footer-col">
          <h4>Company</h4>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><a href="/#thrive">Culture</a></li>
            <li><a href="/#apply">Careers</a></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Products</h4>
          <ul>
            <li><Link to="/life-insurance">Life Insurance</Link></li>
            <li><Link to="/final-expense">Final Expense</Link></li>
            <li><Link to="/mortgage-protection">Mortgage Protection</Link></li>
            <li><Link to="/mortgage-protection">Health Insurance</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Agents</h4>
          <ul>
            <li><a href="/#apply">Become an Agent</a></li>
            <li><Link to="/portal">Agent Login</Link></li>
            <li><a href="https://www.thepinnaclelifegroup.com/events" target="_blank" rel="noopener noreferrer">Training</a></li>
            <li><a href="https://www.thepinnaclelifegroup.com" target="_blank" rel="noopener noreferrer">Resources</a></li>
          </ul>
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
