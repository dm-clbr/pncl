import { NavLink } from "react-router-dom";
import { FileSignature, Workflow } from "lucide-react";
export default function OnboardingAdminNav() {
  return <nav aria-label="Onboarding management" className="document-admin-nav">
    <NavLink end to="/portal/admin/onboarding-steps" className={({ isActive }) => isActive ? "active" : ""}><Workflow size={17} />Onboarding steps</NavLink>
    <NavLink to="/portal/admin/onboarding-steps/documents" className={({ isActive }) => isActive ? "active" : ""}><FileSignature size={17} />Document requests</NavLink>
  </nav>;
}
