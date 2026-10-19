import { FileText } from "lucide-react";
import { SURELC_QUICK_REFERENCE_URL } from "@/lib/portal-todos";

export default function PortalSureLcReferenceLink({ className }: { className: string }) {
  return (
    <a href={SURELC_QUICK_REFERENCE_URL} target="_blank" rel="noopener noreferrer" className={className}>
      <FileText size={16} aria-hidden="true" />
      SureLC quick reference (PDF)
    </a>
  );
}
