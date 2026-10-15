import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import { resolveSureLcAccountLinks } from "@/lib/surelc-accounts";
import type { PortalTodo } from "@/lib/portal-todos";

export default function PortalSureLcLinks({ todos = [] }: { todos?: PortalTodo[] }) {
  const accounts = resolveSureLcAccountLinks(todos);

  return (
    <Pane title="SureLC accounts">
      <p className="portal-profile-lede">
        Reopen any of your three SureLC accounts to update your producer profile or submit
        carrier applications.
      </p>

      <ul className="portal-profile-rows">
        {accounts.map((account) => (
          <li key={account.todoId}>
            <ListRow href={account.href} label={account.label} secondary={account.branch} />
          </li>
        ))}
      </ul>
    </Pane>
  );
}
