import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminHierarchy from "@/pages/admin/AdminHierarchy";

const mocks = vi.hoisted(() => ({
  getHierarchy: vi.fn(),
  useAdminAgents: vi.fn(),
  lastSearchProps: null as null | Record<string, unknown>,
}));

const ROOT = {
  id: "root", name: "Root Agent", email: "root@thepncl.com", role: "agent", status: null,
  compLevel: 100, compLevelEffectiveAt: null, profilePhotoPath: null, profileUpdatedAt: null, children: [],
};
const PARTNER_TREE = [{
  id: "partner:member-a:member-b", name: "Member A & Member B", email: "", role: "agent", status: null,
  compLevel: null, compLevelEffectiveAt: null, profilePhotoPath: null, profileUpdatedAt: null,
  isPartnerGroup: true, memberIds: ["member-a", "member-b"], members: [], children: [],
}];
const ASSIST_TREE = [{ id: "safe", name: "Safe Agent", npn: "901", referrerName: null, referrerNpn: null, children: [] }];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin", app_metadata: { role: "admin" } }, session: { access_token: "token" } }),
}));
vi.mock("@/hooks/useAdminAgents", () => ({ useAdminAgents: (args: unknown) => mocks.useAdminAgents(args) }));
vi.mock("@/lib/admin-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/admin-api")>(), getHierarchy: mocks.getHierarchy, downloadAgentsCsv: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/components/admin/HierarchyCanvas", () => ({
  HierarchyCanvas: (props: { selectedNodeId: string | null; focusRequest: { userId: string } | null }) => <div data-testid="canvas">{props.selectedNodeId}|{props.focusRequest?.userId}</div>,
}));
vi.mock("@/components/admin/HierarchyTree", () => ({ HierarchyTree: () => <div>Tree</div> }));
vi.mock("@/components/admin/HierarchyPartnerEditModal", () => ({ HierarchyPartnerEditModal: () => <div>Partner edit modal</div> }));
vi.mock("@/components/admin/HierarchySearch", () => ({
  HierarchySearch: (props: { options: Array<{ id: string; name: string; email?: string; npn?: string | null }>; assistView: boolean; onLocate: (option: { id: string; name: string }) => void }) => {
    mocks.lastSearchProps = props;
    return <div data-testid="search" data-assist={String(props.assistView)}>
      {props.options.map((option) => <button key={option.id} onClick={() => props.onLocate(option)}>locate-{option.id}</button>)}
    </div>;
  },
}));

function setupAgents() {
  mocks.useAdminAgents.mockReturnValue({
    loading: false, reload: vi.fn(),
    agents: [
      { id: "root", name: "Root Agent", email: "root@thepncl.com", npn: "100", agentNumber: 9 },
      { id: "member-a", name: "Member A", email: "member.a@thepncl.com", npn: "101", agentNumber: 10 },
      { id: "outside", name: "Outside Agent", email: "outside@thepncl.com", npn: "202", agentNumber: 11 },
      { id: "old-private", name: "Old Private", email: "old.private@thepncl.com", npn: "303", agentNumber: 12 },
    ],
  });
}

describe("AdminHierarchy search wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastSearchProps = null;
  });

  it("locates a partner member through the actual group without opening its edit dialog", async () => {
    setupAgents();
    mocks.getHierarchy.mockResolvedValue({ tree: PARTNER_TREE, totalAgents: 2 });
    render(<AdminHierarchy />);
    await screen.findByRole("button", { name: "locate-member-a" });
    fireEvent.click(screen.getByRole("button", { name: "locate-member-a" }));
    await waitFor(() => expect(screen.getByTestId("canvas")).toHaveTextContent("partner:member-a:member-b|member-a"));
    expect(screen.queryByText("Partner edit modal")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("business-partner group");
  });

  it("resets to the full organization when a searched person lies outside the focused subtree", async () => {
    setupAgents();
    mocks.getHierarchy.mockImplementation((_token, rootUserId) => Promise.resolve(
      rootUserId === "root"
        ? { tree: [ROOT], totalAgents: 1 }
        : { tree: [{ ...ROOT, children: [{ ...ROOT, id: "outside", name: "Outside Agent" }] }], totalAgents: 4 },
    ));
    render(<AdminHierarchy />);
    await screen.findByRole("button", { name: "locate-outside" });
    fireEvent.change(screen.getByLabelText("Focus on agent"), { target: { value: "root" } });
    await waitFor(() => expect(mocks.getHierarchy).toHaveBeenLastCalledWith("token", "root", { viewAsAdminAssist: false }));
    fireEvent.click(screen.getByRole("button", { name: "locate-outside" }));
    await waitFor(() => expect(mocks.getHierarchy).toHaveBeenLastCalledWith("token", undefined, { viewAsAdminAssist: false }));
  });

  it("uses only restricted focus options in admin-assist preview, excluding old full-admin agents and email", async () => {
    setupAgents();
    mocks.getHierarchy.mockImplementation((_token, _rootUserId, options) => Promise.resolve(
      options?.viewAsAdminAssist
        ? { tree: ASSIST_TREE, focusOptions: [{ id: "safe", name: "Safe Agent", npn: "901" }], totalAgents: 1, readOnly: true }
        : { tree: [ROOT], totalAgents: 4 },
    ));
    render(<AdminHierarchy />);
    await screen.findByRole("button", { name: "View as admin assist" });
    fireEvent.click(screen.getByRole("button", { name: "View as admin assist" }));
    await screen.findByRole("button", { name: "locate-safe" });
    expect(screen.getByTestId("search")).toHaveAttribute("data-assist", "true");
    expect(screen.queryByRole("button", { name: "locate-old-private" })).not.toBeInTheDocument();
    expect(JSON.stringify(mocks.lastSearchProps)).not.toContain("old.private@thepncl.com");
    expect(JSON.stringify(mocks.lastSearchProps)).not.toContain("member.a@thepncl.com");
  });
});
