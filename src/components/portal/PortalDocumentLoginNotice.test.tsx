import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { PortalTodo } from "@/lib/portal-todos";
import PortalDocumentLoginNotice from "./PortalDocumentLoginNotice";
vi.mock("@/components/portal/Sheet", () => ({ default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null }));
const user = { id: "agent-1", last_sign_in_at: "2026-11-03T10:00:00Z" } as User;
const todo = { id: "document_request_one", title: "Own your book addendum", href: "/portal/documents?request=one", notifyOnLogin: true, completed: false } as PortalTodo;
const view = (todos = [todo], agent = user, loading = false) => <MemoryRouter><PortalDocumentLoginNotice user={agent} todos={todos} loading={loading} /></MemoryRouter>;
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
describe("document action at next login", () => {
  it("links to the released document and stays dismissed during the same login", () => {
    const page = render(view());
    expect(screen.getByRole("link", { name: "Review & sign" })).toHaveAttribute("href", todo.href);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    page.unmount(); render(view());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("returns for an unsigned document on the next login", () => {
    const page = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    page.rerender(view([todo], { ...user, last_sign_in_at: "2026-11-04T10:00:00Z" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("does not prompt for email-only requests, signed requests, or an incomplete load", () => {
    const page = render(view([{ ...todo, notifyOnLogin: false }]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    page.rerender(view([{ ...todo, completed: true }]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    page.rerender(view([todo], user, true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("prompts again when a new document is released during the session", () => {
    const page = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    page.rerender(view([todo, { ...todo, id: "document_request_two" }]));
    expect(screen.getByRole("link", { name: "Review & sign" })).toHaveAttribute("href", "/portal/documents");
  });
});
