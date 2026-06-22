import { useContext, useEffect, useRef } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";

type LeaveChoice = "stay" | "leave";

export function useUnsavedChangesGuard(
  when: boolean,
  onAttemptLeave: () => Promise<LeaveChoice>,
) {
  const onAttemptLeaveRef = useRef(onAttemptLeave);
  onAttemptLeaveRef.current = onAttemptLeave;

  useEffect(() => {
    if (!when) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [when]);

  const { navigator } = useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    if (!when) return;

    const originalPush = navigator.push;
    const originalReplace = navigator.replace;

    const guard =
      (method: typeof originalPush) =>
      (...args: Parameters<typeof originalPush>) => {
        void onAttemptLeaveRef.current().then((choice) => {
          if (choice === "leave") method.apply(navigator, args);
        });
      };

    navigator.push = guard(originalPush);
    navigator.replace = guard(originalReplace);

    return () => {
      navigator.push = originalPush;
      navigator.replace = originalReplace;
    };
  }, [when, navigator]);
}
