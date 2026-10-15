import OnboardingDock from "@/components/portal/OnboardingDock";
import PortalOnboardingChecklist from "@/components/PortalOnboardingChecklist";
import { usePortalOnboarding } from "@/contexts/PortalOnboardingContext";
import { hasAdminConsoleAccess } from "@/lib/roles";

export default function PortalOnboardingAction() {
  const onboarding = usePortalOnboarding();
  if (!onboarding) return null;
  return (
    <OnboardingDock header todos={onboarding.todos}>
      <PortalOnboardingChecklist
        todos={onboarding.todos}
        agentEmail={onboarding.user?.email ?? ""}
        completingTodoId={onboarding.completingTodoId}
        onComplete={(id, options) => void onboarding.completeTodo(id, options)}
        previewUnlocked={hasAdminConsoleAccess(onboarding.user)}
      />
    </OnboardingDock>
  );
}
