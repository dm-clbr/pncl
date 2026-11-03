import { Link } from "react-router-dom";
import type { AdminPortalTodoSummary } from "@/lib/admin-api";
export default function AdminOnboardingContent(_props: { accessToken?: string; todos: AdminPortalTodoSummary[]; onSaved: () => void }) {
  return <section className="admin-onboarding-content"><h2>Onboarding documents and videos</h2><p>Manage the uploaded documents and videos for each LOA and IBO step in one place.</p><Link to="/portal/admin/onboarding-steps" className="admin-secondary-link">Open Onboarding Steps</Link></section>;
}
