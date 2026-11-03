import { submitOnboardingContract, isSupabaseConfigured } from "@/lib/onboarding-api";
import { persistContractSession } from "@/lib/onboarding-contract";
import { toast } from "sonner";
import { type IcaSigningSubmitPayload } from "@/components/IcaSigningStep";
import UploadedIcaSigningStep from "@/components/UploadedIcaSigningStep";
import type { OnboardingFlowContent } from "@/lib/onboarding-content";
import LegacyOnboardingContractStep from "./OnboardingContractStep.legacy";

interface OnboardingContractStepProps {
  preview?: boolean;
  content: OnboardingFlowContent;
  referralInviteId?: string | null;
  onSigned: (input: {
    contractSignatureId: string;
    legalName: string;
    personalEmail: string;
  }) => void;
  onBack: () => void;
}

export default function OnboardingContractStep({
  preview = false,
  content,
  referralInviteId,
  onSigned,
  onBack,
}: OnboardingContractStepProps) {
  if (content.signingEnabled === false) return <LegacyOnboardingContractStep preview={preview} content={content} referralInviteId={referralInviteId} onSigned={onSigned} onBack={onBack} />;
  const handleSubmit = async (payload: IcaSigningSubmitPayload) => {
    if (!content.ica) throw new Error("Your agreement has not been configured.");
    if (preview) {
      const contractSignatureId = crypto.randomUUID();
      persistContractSession(
        contractSignatureId,
        payload.legalName,
        payload.personalEmail,
        true,
      );
      toast.success("Preview: agreement signed.");
      onSigned({
        contractSignatureId,
        legalName: payload.legalName,
        personalEmail: payload.personalEmail,
      });
      return;
    }

    if (!isSupabaseConfigured()) {
      toast.error("Onboarding is not configured. Please contact PNCL support.");
      throw new Error("Onboarding is not configured");
    }

    const result = await submitOnboardingContract({ ...payload, referralInviteId: referralInviteId ?? undefined, templateAssetId: content.ica?.id ?? null });

    persistContractSession(
      result.contractSignatureId,
      result.contract.legalName,
      result.contract.personalEmail,
    );
    toast.success("Agreement signed. Continue with your application.");
    onSigned({
      contractSignatureId: result.contractSignatureId,
      legalName: result.contract.legalName,
      personalEmail: result.contract.personalEmail,
    });
  };

  if (content.ica) return <UploadedIcaSigningStep key={content.ica.id} asset={content.ica} onSubmit={handleSubmit} onBack={onBack} />;
  return <div role="alert" className="onboarding-step"><h2>Agreement not ready</h2><p>PNCL needs to upload the ICA for your onboarding flow. Please contact PNCL support before continuing.</p>{onBack && <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>}</div>;
}
