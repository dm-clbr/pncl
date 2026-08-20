import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminStateAvailability from "@/pages/admin/AdminStateAvailability";
import { US_STATES } from "@/lib/us-states";

const save = vi.fn();
const states = US_STATES.map((state) => ({
  stateCode: state.code,
  stateName: state.name,
  status: "Inactive" as const,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
}));

vi.mock("@/hooks/useAdminStateAvailability", () => ({
  useAdminStateAvailability: () => ({
    states,
    loading: false,
    error: null,
    reload: vi.fn(),
    save,
  }),
}));

vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

describe("admin state availability", () => {
  beforeEach(() => {
    save.mockReset();
    save.mockResolvedValue({ states: [], message: "1 state status updated." });
  });

  it("lets a full admin stage and batch-save state status changes", async () => {
    render(<MemoryRouter><AdminStateAvailability /></MemoryRouter>);

    const utahSelect = screen.getByRole("combobox", { name: "Utah company status" });
    fireEvent.change(utahSelect, { target: { value: "Active" } });

    const saveButton = screen.getByRole("button", { name: "Save changes (1)" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(save).toHaveBeenCalledWith([
      { stateCode: "UT", status: "Active" },
    ]));
  });
});
