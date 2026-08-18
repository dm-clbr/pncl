import { ArrowUpRight } from "lucide-react";
import {
  resolveSureLcAccountLinks,
  type SureLcAccountLink,
} from "@/lib/surelc-accounts";
import type { PortalTodo } from "@/lib/portal-todos";

function SureLcAccountCard({ account }: { account: SureLcAccountLink }) {
  return (
    <a
      href={account.href}
      target="_blank"
      rel="noopener noreferrer"
      className="portal-surelc-account-link"
    >
      <span>
        <strong>{account.label}</strong>
        <small>{account.branch}</small>
      </span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  );
}

export default function PortalSureLcLinks({ todos = [] }: { todos?: PortalTodo[] }) {
  const accounts = resolveSureLcAccountLinks(todos);

  return (
    <section className="carrier-sheet-panel portal-surelc-accounts-panel">
      <div className="carrier-sheet-panel-head">
        <div>
          <h1>SureLC accounts</h1>
          <p>
            Reopen any of your three SureLC accounts to update your producer profile or
            submit carrier applications.
          </p>
        </div>
      </div>

      <div className="portal-surelc-account-links">
        {accounts.map((account) => (
          <SureLcAccountCard key={account.todoId} account={account} />
        ))}
      </div>
    </section>
  );
}
