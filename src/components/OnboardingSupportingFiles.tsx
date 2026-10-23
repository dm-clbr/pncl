import { FileText } from "lucide-react";
import type { SupportingFile } from "../../supabase/functions/_shared/onboardingAttachments";

export default function OnboardingSupportingFiles({
  files,
  className,
}: {
  files: SupportingFile[];
  className: string;
}) {
  if (!files.length) return null;
  return (
    <div className="onboarding-supporting-links" aria-label="Supporting files">
      {files.map((file) => (
        <a
          key={file.assetId ?? file.url}
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          <FileText size={16} aria-hidden="true" />
          {file.filename}
        </a>
      ))}
    </div>
  );
}
