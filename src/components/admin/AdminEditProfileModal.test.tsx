import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminEditProfileModal from "./AdminEditProfileModal";
import { updateUserProfileFields, type AdminUserPortalProfile } from "@/lib/admin-api";

vi.mock("@/lib/admin-api", () => ({ updateUserProfileFields: vi.fn() }));
vi.mock("@/lib/portal-profile", () => ({ resolveCountyForZip: vi.fn().mockResolvedValue(null), US_STATES: ["UT"] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Admin agent designation", () => {
  it("shows LOA for existing agents and sends IBO through the audited admin save", async () => {
    vi.mocked(updateUserProfileFields).mockResolvedValue({ message: "Profile updated." });
    const onSaved = vi.fn();
    render(<AdminEditProfileModal userId="agent-1" userName="Test Agent" profile={{ firstName: "Test", lastName: "Agent" } as AdminUserPortalProfile} accessToken="test-token" onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText("Agent designation")).toHaveValue("loa");
    fireEvent.change(screen.getByLabelText("Agent designation"), { target: { value: "ibo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(updateUserProfileFields).toHaveBeenCalledWith("test-token", expect.objectContaining({ userId: "agent-1", fields: expect.objectContaining({ agentDesignation: "ibo" }) }));
  });

  it("does not overwrite designation during an unrelated profile edit", async () => {
    vi.mocked(updateUserProfileFields).mockResolvedValue({ message: "Profile updated." });
    render(<AdminEditProfileModal userId="agent-1" userName="Test Agent" profile={{ firstName: "Test", lastName: "Agent", agentDesignation: "ibo" } as AdminUserPortalProfile} accessToken="test-token" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateUserProfileFields).toHaveBeenCalledOnce());
    expect(vi.mocked(updateUserProfileFields).mock.calls[0][1].fields).not.toHaveProperty("agentDesignation");
  });
});
