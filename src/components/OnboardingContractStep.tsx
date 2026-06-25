import { submitOnboardingContract, isSupabaseConfigured } from "@/lib/onboarding-api";
import { persistContractSession } from "@/lib/onboarding-contract";
import { toast } from "sonner";
import IcaSigningStep, { type IcaSigningSubmitPayload } from "@/components/IcaSigningStep";

interface OnboardingContractStepProps {
  preview?: boolean;
  onSigned: (input: {
    contractSignatureId: string;
    legalName: string;
    personalEmail: string;
  }) => void;
  onBack: () => void;
}

export default function OnboardingContractStep({
  preview = false,
  onSigned,
  onBack,
}: OnboardingContractStepProps) {
  const handleSubmit = async (payload: IcaSigningSubmitPayload) => {
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

    const result = await submitOnboardingContract(payload);

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

  return (
    <IcaSigningStep
      eyebrow="Step 1"
      onSubmit={handleSubmit}
      onBack={onBack}
    />
  );
}
