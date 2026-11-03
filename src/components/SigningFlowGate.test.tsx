import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SigningFlowGate from "./SigningFlowGate";
const state = vi.hoisted(() => ({ result: { content: null as { signingEnabled: boolean } | null, error: null as string | null, retry: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "test" } }) }));
vi.mock("@/hooks/useOnboardingContent", () => ({ useOnboardingContent: () => state.result }));
beforeEach(() => { state.result = { content: null, error: null, retry: vi.fn() }; });
const show = () => render(<SigningFlowGate legacy={<p>Existing signing</p>}><p>Uploaded signing</p></SigningFlowGate>);
describe("signing page activation", () => {
  it("waits for the server before showing either signing form", () => { show(); expect(screen.getByRole("status")).toBeInTheDocument(); expect(screen.queryByText("Uploaded signing")).not.toBeInTheDocument(); });
  it.each([false, true])("uses the server's active mode: %s", enabled => { state.result.content = { signingEnabled: enabled }; show(); expect(screen.getByText(enabled ? "Uploaded signing" : "Existing signing")).toBeInTheDocument(); expect(screen.queryByText(enabled ? "Existing signing" : "Uploaded signing")).not.toBeInTheDocument(); });
  it("blocks guessing after a configuration error and offers retry", () => { state.result.error = "Unavailable"; show(); expect(screen.getByRole("alert")).toBeInTheDocument(); screen.getByRole("button", { name: "Retry" }).click(); expect(state.result.retry).toHaveBeenCalledOnce(); });
});
