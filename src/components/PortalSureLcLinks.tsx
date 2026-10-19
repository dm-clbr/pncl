import PortalSureLcAccountLink from "@/components/PortalSureLcAccountLink";
import Pane from "@/components/portal/Pane";
import { resolveSureLcAccountLinks } from "@/lib/surelc-accounts";
import { isSureLcTutorialTodo, type PortalTodo } from "@/lib/portal-todos";

export default function PortalSureLcLinks({ todos = [] }: { todos?: PortalTodo[] }) {
  const accounts = resolveSureLcAccountLinks(todos);
  const tutorial = todos.find((todo) => isSureLcTutorialTodo(todo.id));
  const locked = !tutorial?.completed;

  return (
    <Pane title="SureLC accounts">
      <p className="portal-profile-lede">
        Reopen any of your three SureLC accounts to update your producer profile or submit
        carrier applications.
      </p>
      {locked && <p className="portal-profile-lede">Complete your SureLC walkthrough in the onboarding checklist to unlock these links.</p>}

      <ul className="portal-profile-rows">
        {accounts.map((account) => (
          <li key={account.todoId}>
            <PortalSureLcAccountLink account={account} className="portal-row" disabled={locked} />
          </li>
        ))}
      </ul>
    </Pane>
  );
}
