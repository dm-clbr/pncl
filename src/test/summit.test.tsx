import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Summit from "@/pages/Summit";
import SummitAsk from "@/pages/SummitAsk";
import SummitPresenter, { SummitGroupsTable } from "@/pages/SummitPresenter";
import { getSummitOriginals, getSummitSnapshot, submitSummitQuestion, validateSummitQuestion, type SummitGroup, type SummitSnapshot } from "@/lib/summit";

vi.mock("@/lib/summit", async (importOriginal) => ({ ...(await importOriginal<object>()), submitSummitQuestion: vi.fn(), getSummitSnapshot: vi.fn(), getSummitOriginals:vi.fn() }));
const originals = (id:string,count:number,start=0) => Array.from({length:count},(_,i)=>({id:`${id}-${i+start}`,question:`Original ${id} submission ${i+start}`,created_at:"2026-11-09T10:00:00Z"}));
const group = (id: string, count: number): SummitGroup => ({ id, count, created_at: "2026-11-09T10:00:00Z", representative: `Question group ${id}?` });
function mount(node: React.ReactNode) { return render(<MemoryRouter>{node}</MemoryRouter>); }
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("Summit audience experience", () => {
  it("points the stage QR at the exact production ask path", () => {
    mount(<Summit />);
    expect(screen.getByRole("link", { name: /Ask a question at/ })).toHaveAttribute("href", "https://thepncl.com/summit/ask");
    expect(screen.getByRole("img", { name: /QR code/ })).toHaveAttribute("src", "/summit-ask-qr.svg");
  });
  it("validates whitespace, short input and oversized questions", () => {
    expect(validateSummitQuestion("   ")).not.toBeNull();
    expect(validateSummitQuestion("why?")).not.toBeNull();
    expect(validateSummitQuestion("x".repeat(1001))).not.toBeNull();
    expect(validateSummitQuestion("How can I grow?")).toBeNull();
  });
  it("only confirms after storage succeeds and keeps an idempotency key on retry", async () => {
    vi.mocked(submitSummitQuestion).mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ id: "saved" });
    mount(<SummitAsk />);
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "  Where can I find more prospects?  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Question received.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toHaveValue("  Where can I find more prospects?  ");
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByText(/Your question is saved/);
    const calls = vi.mocked(submitSummitQuestion).mock.calls;
    expect(calls[0][0]).toEqual(calls[1][0]);
    expect(calls[0][0].question).toBe("  Where can I find more prospects?  ");
  });
  it("prevents duplicate clicks while a submission is in flight", async () => {
    vi.mocked(submitSummitQuestion).mockReturnValue(new Promise(() => {}));
    mount(<SummitAsk />);
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "How can I grow?" } });
    const button = screen.getByRole("button", { name: "Send question" });
    fireEvent.click(button); fireEvent.click(button);
    expect(submitSummitQuestion).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });
});

describe("Summit presenter", () => {
  it("renders every group, expands every original, and preserves expansion after ranks change", async () => {
    vi.mocked(getSummitOriginals).mockResolvedValueOnce({submissions:originals("four",2),has_more:false}).mockResolvedValueOnce({submissions:originals("four",4,2),has_more:false});
    const groups = [group("one", 5), group("two", 4), group("three", 3), group("four", 2), group("five", 1)];
    const view = render(<SummitGroupsTable groups={groups} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    const fourth = screen.getByRole("button", { name: "Question group four?" });
    fireEvent.click(fourth);
    expect(fourth).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Original four submission 0")).toBeVisible();
    expect(screen.getByText("Original four submission 1")).toBeVisible();
    const updated = group("four", 6);
    view.rerender(<SummitGroupsTable groups={[updated, ...groups.filter((g) => g.id !== "four")]} />);
    expect(screen.getByRole("button", { name: "Question group four?" })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Original four submission 5")).toBeVisible();
    expect(vi.mocked(getSummitOriginals).mock.calls[1][1]?.id).toBe("four-1");
    expect(within(screen.getAllByRole("row")[1]).getByText("6")).toBeInTheDocument();
  });
  it("refreshes the ranked list from shared storage without a manual reload", async () => {
    const snapshot: SummitSnapshot = { revision:"1",groups: [group("first", 1)], pending_count: 0, oldest_pending_at:null,total: 1, last_error: null, last_success_at: null, ai_configured: true };
    vi.mocked(getSummitSnapshot).mockResolvedValueOnce(snapshot).mockResolvedValue({ ...snapshot, groups: [group("second", 3), group("first", 1)], total: 4 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = mount(<QueryClientProvider client={client}><SummitPresenter /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Question group first?" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Question group second?" })).toBeInTheDocument(), { timeout: 5000 });
    expect(getSummitSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Question group second?");
    view.unmount(); client.clear();
  });
  it("keeps pending originals visible when AI is unavailable", async () => {
    vi.mocked(getSummitSnapshot).mockResolvedValue({ revision:"1",groups: [],pending_count:1,oldest_pending_at:"2026-11-09T10:00:00Z", total: 1, ai_configured: false, last_error: "ai_not_configured", last_success_at: null });
    vi.mocked(getSummitOriginals).mockResolvedValue({submissions:[{ id:"pending",question:"How do commissions work?",created_at:"2026-11-09T10:00:00Z" }],has_more:false});
    const client = new QueryClient();
    const view = mount(<QueryClientProvider client={client}><SummitPresenter /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button",{name:"View waiting questions"}));
    await screen.findByText("How do commissions work?");
    expect(screen.getByText(/AI grouping needs to be connected/)).toBeInTheDocument();
    view.unmount(); client.clear();
  });
  it("fetches every original across bounded pages only after expansion",async()=>{
    vi.mocked(getSummitOriginals).mockResolvedValueOnce({submissions:originals("large",200),has_more:true}).mockResolvedValueOnce({submissions:originals("large",50,200),has_more:false});
    render(<SummitGroupsTable groups={[group("large",250)]} />);
    expect(getSummitOriginals).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Question group large?"}));
    expect(await screen.findByText("Original large submission 249")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(250);
  });
});
