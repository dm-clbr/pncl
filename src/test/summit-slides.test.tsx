import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SummitSlides from "@/components/summit/SummitSlides";
import SummitPresenter from "@/pages/SummitPresenter";
import { getSummitSnapshot, type SummitSnapshot } from "@/lib/summit";
vi.mock("@/lib/summit",async(importOriginal)=>({...await importOriginal<object>(),getSummitSnapshot:vi.fn()}));
const groups=Array.from({length:5},(_,i)=>({id:`g${i}`,representative:`Ranked question ${i+1}?`,count:10-i,created_at:"2026-11-09T10:00:00Z"}));
describe("Summit presentation mode",()=>{
  it("presents every ranked group with bounded navigation and keyboard support",()=>{
    const exit=vi.fn();render(<SummitSlides groups={groups} onExit={exit} onRefresh={vi.fn()} canRefresh />);
    expect(screen.getByRole("heading",{name:"Ranked question 1?"})).toBeVisible();
    expect(screen.getByRole("button",{name:"Previous"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    expect(screen.getByRole("heading",{name:"Ranked question 2?"})).toBeVisible();
    for(let i=0;i<5;i++)fireEvent.keyDown(window,{key:"ArrowRight"});
    expect(screen.getByRole("heading",{name:"Ranked question 5?"})).toBeVisible();
    expect(screen.getByRole("button",{name:"Next"})).toBeDisabled();
    fireEvent.keyDown(window,{key:"ArrowLeft"});expect(screen.getByRole("heading",{name:"Ranked question 4?"})).toBeVisible();
    fireEvent.keyDown(window,{key:"Escape"});expect(exit).toHaveBeenCalledOnce();
  });
  it("keeps a fixed snapshot while the live table changes, then returns to current rankings",async()=>{
    const snapshot:SummitSnapshot={revision:"1",groups,pending_count:0,oldest_pending_at:null,total:40,last_error:null,last_success_at:null,ai_configured:true};
    vi.mocked(getSummitSnapshot).mockResolvedValue(snapshot);
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const view=render(<MemoryRouter><QueryClientProvider client={client}><SummitPresenter/></QueryClientProvider></MemoryRouter>);
    const enter=await screen.findByRole("button",{name:"Present slides"});await waitFor(()=>expect(enter).toBeEnabled());
    fireEvent.click(enter);fireEvent.click(screen.getByRole("button",{name:"Next"}));
    client.setQueryData(["summit-presenter"],{...snapshot,revision:"2",groups:[groups[4],...groups.slice(0,4)]});
    expect(screen.getByRole("heading",{name:"Ranked question 2?"})).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Back to table"}));
    await waitFor(()=>expect(screen.getAllByRole("row")[1]).toHaveTextContent("Ranked question 5?"));
    view.unmount();client.clear();
  });
  it("does not present incomplete rankings while questions are still queued",async()=>{
    vi.mocked(getSummitSnapshot).mockResolvedValue({revision:"1",groups,pending_count:2000,oldest_pending_at:"2026-11-09T10:00:00Z",total:2040,last_error:null,last_success_at:null,ai_configured:true});
    const client=new QueryClient();const view=render(<MemoryRouter><QueryClientProvider client={client}><SummitPresenter/></QueryClientProvider></MemoryRouter>);
    await screen.findByText("Available when all saved questions are grouped.");
    expect(screen.getByRole("button",{name:"Present slides"})).toBeDisabled();
    view.unmount();client.clear();
  });
  it("has a safe empty state and explicit table return",()=>{
    const exit=vi.fn();render(<SummitSlides groups={[]} onExit={exit} onRefresh={vi.fn()} canRefresh={false}/>);
    expect(screen.getByText("No questions to present yet.")).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"Back to table"}));expect(exit).toHaveBeenCalledOnce();
  });
});
