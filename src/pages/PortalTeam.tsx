import { useEffect } from "react";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import PortalHierarchyPanel from "@/components/PortalHierarchyPanel";
import "@/styles/portal-profile.css";

export default function PortalTeam() {
  useEffect(() => { document.title = "My Team — PNCL Hub"; }, []);
  return <PortalToolLayout title="My Team" className="portal-team-page"><PortalHierarchyPanel /></PortalToolLayout>;
}
