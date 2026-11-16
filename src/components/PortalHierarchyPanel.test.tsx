import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortalTeamStats } from '@/hooks/usePortalTeamStats';
import { teamStatsFixture } from '@/test/fixtures/portal-team-stats';
import PortalHierarchyPanel from "@/components/PortalHierarchyPanel";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
import { usePortalHierarchy } from "@/hooks/usePortalHierarchy";
import { portalHierarchyFixture } from "@/test/fixtures/portal-hierarchy";

vi.mock("@/hooks/usePortalHierarchy", () => ({ usePortalHierarchy: vi.fn() }));
vi.mock("@/hooks/usePortalTeamStats", () => ({ usePortalTeamStats: vi.fn() }));
const reload = vi.fn();
const reloadStats = vi.fn();
function renderPanel() { return render(<MemoryRouter><PortalHierarchyPanel /></MemoryRouter>); }
beforeEach(() => {
  vi.mocked(usePortalHierarchy).mockReturnValue({ data: portalHierarchyFixture(), loading: false, error: null, reload });
  vi.mocked(usePortalTeamStats).mockReturnValue({ data: teamStatsFixture(), loading: false, error: null, reload: reloadStats });
  reload.mockClear();
  reloadStats.mockClear();
});

describe("Hub team hierarchy", () => {
  it("links every rep to the page from dashboard navigation", () => {
    render(<MemoryRouter><PortalPrimaryNav /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "My Team" })).toHaveAttribute("href", "/portal/team");
  });
  it("shows comp levels and scoped Hub stats, with read-only member and partner details", () => {
    renderPanel();
    expect(screen.getByText("Tier 100%")).toBeInTheDocument();
    expect(screen.getByText("Total downline").nextElementSibling).toHaveTextContent("4");
    expect(screen.getByText("Direct reports").nextElementSibling).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: /Jamie Ellis & Sam Ellis/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("95%")).toBeInTheDocument();
    expect(within(dialog).getByText("90%")).toBeInTheDocument();
    expect(within(dialog).getByText("Pre-License")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /edit|save|delete/i })).not.toBeInTheDocument();
  });
  it("supports level limits, list, member focus, and returning to the full permitted team", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "2 levels" }));
    expect(screen.queryByRole("button", { name: /Casey Reed/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All levels" }));
    expect(screen.getByRole("button", { name: /Casey Reed/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "List", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /Jordan Rivera Tier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom to branch" }));
    expect(screen.queryByRole("button", { name: /Alex Morgan Tier/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Casey Reed Tier/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to my team" }));
    expect(screen.getByRole("button", { name: /Alex Morgan Tier/ })).toBeInTheDocument();
  });
  it("shows linked production totals, changes period and keeps individual partner metrics", () => {
    renderPanel();
    const totals = screen.getByLabelText('Production totals');
    expect(within(totals).getByText('$6,000')).toBeInTheDocument();
    expect(screen.getByText('Your team, including you · 4/5 accounts with stats')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Stats period'), { target: { value: 'week' } });
    expect(usePortalTeamStats).toHaveBeenLastCalledWith('week');
    fireEvent.click(screen.getByRole('button', { name: /Jamie Ellis & Sam Ellis/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('$3,000')).toBeInTheDocument();
    expect(within(dialog).getByText('$0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Close details'}));
    fireEvent.change(screen.getByLabelText('Focus on team member'), {target:{value:'direct'}});
    expect(within(screen.getByLabelText('Production totals')).getByText('$2,000')).toBeInTheDocument();
  });
  it("keeps the hierarchy usable when stats fail and distinguishes unlinked accounts", () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', {name:/Casey Reed/}));
    expect(screen.getByText('LeadSpply account not linked yet.')).toBeInTheDocument();
  });
  it("offers a stats retry without hiding comp or the hierarchy", () => {
    vi.mocked(usePortalTeamStats).mockReturnValue({data:null, loading:false, error:'unavailable', reload:reloadStats});
    renderPanel();
    expect(screen.getByText('Tier 100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Retry stats'}));
    expect(reloadStats).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Production totals')).not.toBeInTheDocument();
  });
  it("exits full-screen focus with Escape and refreshes explicitly", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Focus", exact: true }));
    expect(screen.getByRole("dialog", { name: "Team hierarchy focus view" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
    expect(reload).toHaveBeenCalledOnce();
  });
  it("distinguishes loading, failed requests and a rep with no downline", () => {
    vi.mocked(usePortalHierarchy).mockReturnValue({ data: null, loading: true, error: null, reload });
    const view = renderPanel();
    expect(screen.getByLabelText("Loading team hierarchy")).toBeInTheDocument();
    expect(usePortalTeamStats).toHaveBeenLastCalledWith("month");
    vi.mocked(usePortalHierarchy).mockReturnValue({ data: null, loading: false, error: "failed", reload });
    view.rerender(<MemoryRouter><PortalHierarchyPanel /></MemoryRouter>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledOnce();
    const solo = portalHierarchyFixture();
    solo.tree[0].children = []; solo.people = solo.people.slice(0, 1); solo.totalAgents = 1; solo.focusOptions = solo.focusOptions.filter((p) => p.id === "leader");
    vi.mocked(usePortalHierarchy).mockReturnValue({ data: solo, loading: false, error: null, reload });
    view.rerender(<MemoryRouter><PortalHierarchyPanel /></MemoryRouter>);
    expect(screen.getByText(/Your team starts with you/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alex Morgan Tier 120/ })).toBeInTheDocument();
  });
});
