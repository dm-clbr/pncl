import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalTodos } from "@/hooks/usePortalTodos";
import { usePortalCarriers } from "@/hooks/usePortalCarriers";
import { usePortalIca } from "@/hooks/usePortalIca";
import { usePortalW9 } from "@/hooks/usePortalW9";
import { usePortalDirectDeposit } from "@/hooks/usePortalDirectDeposit";
import { completePortalTodo, isTodoCompleted } from "@/lib/portal-todos";
import { refreshPortalUser } from "@/lib/portal-messages";
import { buildCarrierApplicationsDescription, CARRIER_APPLICATIONS_TODO_ID } from "@/lib/carrier-applications";

/** Owned by the tab route parent, so navigation retains progress and requests. */
export function usePortalOnboardingState() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(authUser);
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const { todos, loading, reload: reloadTodos } = usePortalTodos();
  const { carriers } = usePortalCarriers();
  const ica = usePortalIca();
  const w9 = usePortalW9();
  const directDeposit = usePortalDirectDeposit();

  useEffect(() => setUser(authUser), [authUser]);
  useEffect(() => {
    let active = true;
    void refreshPortalUser().then((fresh) => {
      if (active && fresh) setUser(fresh);
    }).catch(() => { /* Keep the cached session when refresh fails. */ });
    return () => { active = false; };
  }, []);

  const resolvedTodos = useMemo(() => {
    const description = buildCarrierApplicationsDescription(carriers);
    return todos.map((todo) => ({
      ...todo,
      description: todo.id === CARRIER_APPLICATIONS_TODO_ID && description ? description : todo.description,
      completed: isTodoCompleted(user, todo, {
        icaSubmitted: ica.submitted,
        w9Submitted: w9.submitted,
        directDepositSubmitted: directDeposit.submitted,
      }),
    }));
  }, [todos, carriers, user, ica.submitted, w9.submitted, directDeposit.submitted]);

  const completeTodo = async (todoId: string) => {
    setCompletingTodoId(todoId);
    try {
      await completePortalTodo(todoId, resolvedTodos);
      await reloadTodos();
      toast.success("To-do marked complete.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update to-do.");
    } finally {
      setCompletingTodoId(null);
    }
  };

  return { user, todos: resolvedTodos, loading, ica, w9, directDeposit, completingTodoId, completeTodo, reloadTodos };
}
