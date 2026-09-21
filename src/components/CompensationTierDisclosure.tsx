import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface CompensationTierDisclosureProps {
  tier: number | null | undefined;
}

export default function CompensationTierDisclosure({
  tier,
}: CompensationTierDisclosureProps) {
  const [visible, setVisible] = useState(false);
  const hasTier = tier != null;

  return (
    <div>
      <span>Compensation tier</span>
      <div className="portal-profile-tier-disclosure">
        <strong aria-live="polite">
          {!hasTier ? "Not assigned" : visible ? `Tier ${tier}` : "Hidden"}
        </strong>
        {hasTier && (
          <button
            type="button"
            className="portal-profile-tier-toggle"
            onClick={() => setVisible((current) => !current)}
            aria-label={`${visible ? "Hide" : "Show"} compensation tier`}
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff size={15} aria-hidden="true" />
            ) : (
              <Eye size={15} aria-hidden="true" />
            )}
            <span>{visible ? "Hide" : "Show"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
