import { NavLink } from "react-router-dom";
import { FileSignature, Workflow } from "lucide-react";
import { editorUrl } from "@/lib/onboarding-editor";
export default function OnboardingAdminNav() {
  return <nav aria-label="Onboarding management" className="document-admin-nav">
    <NavLink end to={editorUrl("/portal/admin/onboarding-steps")} className={({ isActive }) => isActive ? "active" : ""}><Workflow size={17} />Onboarding steps</NavLink>
    <NavLink to={editorUrl("/portal/admin/onboarding-steps/documents")} className={({ isActive }) => isActive ? "active" : ""}><FileSignature size={17} />Documents & fields</NavLink>
  </nav>;
}
