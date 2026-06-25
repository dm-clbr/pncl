import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import "@/styles/home2.css";
import "@/styles/onboarding.css";

interface OnboardingLayoutProps {
  children: React.ReactNode;
  progress?: number;
  wide?: boolean;
  signing?: boolean;
}

export default function OnboardingLayout({ children, progress, wide, signing }: OnboardingLayoutProps) {
  return (
    <div className="home2-page onboarding-page">
      <div className="grain" aria-hidden="true" />

      <header className="nav scrolled">
        <div className="bar">
          <Link to="/" className="lockup" aria-label="PNCL home">
            <PNCLLogo height={24} />
          </Link>
          <Link to="/contact" className="btn btn-ghost">Need help?</Link>
        </div>
      </header>

      {progress !== undefined && progress > 0 && (
        <div className="onboarding-progress" aria-hidden="true">
          <div className="onboarding-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <main className="onboarding-main">
        <div
          className={[
            "onboarding-panel",
            wide ? "onboarding-panel-wide" : "",
            signing ? "onboarding-panel-signing" : "",
          ].filter(Boolean).join(" ")}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
