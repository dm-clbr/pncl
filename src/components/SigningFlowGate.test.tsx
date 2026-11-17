import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SigningFlowGate from "./SigningFlowGate";
const state = vi.hoisted(() => ({ result: { content: null as { signingEnabled: boolean } | null, error: null as string | null, retry: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "test" } }) }));
vi.mock("@/hooks/useOnboardingContent", () => ({ useOnboardingContent: () => state.result }));
beforeEach(() => { state.result = { content: null, error: null, retry: vi.fn() }; });
const show = () => render(<SigningFlowGate><p>Uploaded signing</p></SigningFlowGate>);
describe("signing page activation", () => {
  it("waits for the server before showing either signing form", () => { show(); expect(screen.getByRole("status")).toBeInTheDocument(); expect(screen.queryByText("Uploaded signing")).not.toBeInTheDocument(); });
  it("blocks signing instead of showing a bundled form when inactive", () => { state.result.content = { signingEnabled: false }; show(); expect(screen.getByRole("alert")).toHaveTextContent("signing is not active"); expect(screen.queryByText("Uploaded signing")).not.toBeInTheDocument(); });
  it("shows the uploaded form after activation", () => { state.result.content = { signingEnabled: true }; show(); expect(screen.getByText("Uploaded signing")).toBeInTheDocument(); });
  it("blocks guessing after a configuration error and offers retry", () => { state.result.error = "Unavailable"; show(); expect(screen.getByRole("alert")).toBeInTheDocument(); screen.getByRole("button", { name: "Retry" }).click(); expect(state.result.retry).toHaveBeenCalledOnce(); });
});
