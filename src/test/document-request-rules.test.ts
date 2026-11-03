import { describe, expect, it } from "vitest";
import { EMPTY_DOCUMENT_FILTERS, documentFilters, validateDocumentSignature } from "../../supabase/functions/_shared/documentRequestRules";
import { completePortalTodo, isTodoCompleted, type PortalTodo } from "@/lib/portal-todos";
describe("document request boundaries", () => {
  it("validates dates and audiences without falling back to all agents", () => {
    expect(documentFilters({ ...EMPTY_DOCUMENT_FILTERS, designation: "ibo", state: "UT" })).toMatchObject({ designation: "ibo", state: "UT" });
    expect(() => documentFilters({ ...EMPTY_DOCUMENT_FILTERS, designation: "typo" })).toThrow();
    expect(() => documentFilters({ ...EMPTY_DOCUMENT_FILTERS, joinedAfter: "2026-02-30" })).toThrow();
    expect(() => documentFilters({ ...EMPTY_DOCUMENT_FILTERS, joinedAfter: "2026-11-03", joinedBefore: "2026-11-02" })).toThrow();
  });
  it("requires a full name and explicit consent", () => {
    expect(validateDocumentSignature("  María  O’Connor  ", true)).toBe("María O’Connor");
    expect(() => validateDocumentSignature("A B", true)).toThrow("full legal");
    expect(() => validateDocumentSignature("YES", true)).toThrow("full legal");
    expect(() => validateDocumentSignature("Test Agent", false)).toThrow("accept");
  });
  it("cannot complete an unsigned request through metadata or a manual check-off", async () => {
    const todo = { id: "document_request_example", completionType: "auto", completed: false } as PortalTodo;
    const user = { user_metadata: { completed_portal_todos: { [todo.id]: true } } };
    expect(isTodoCompleted(user as never, todo)).toBe(false);
    expect(isTodoCompleted(user as never, { ...todo, completed: true })).toBe(true);
    await expect(completePortalTodo(todo.id, [todo])).rejects.toThrow("Review and sign");
  });
});
