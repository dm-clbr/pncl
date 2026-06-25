import { useEffect } from "react";
import { Link } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { trackPageView } from "@/lib/analytics";

export default function OnboardingActivate() {
  useEffect(() => {
    document.title = "Enter Portal — PNCL";
    trackPageView("employee-onboarding-activate");
  }, []);

  return (
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-ready">Employee Portal</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Sign in to the portal</h2>
      <p className="lead">
        Portal access uses your @thepncl.com Google account. After you sign in to Gmail,
        use the button below to enter the Employee Portal.
      </p>
      <Link to="/portal/login" className="btn btn-accent" style={{ marginTop: "1rem" }}>
        Sign in with Google <span className="arr">→</span>
      </Link>
    </OnboardingLayout>
  );
}
