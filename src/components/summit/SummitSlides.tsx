import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Expand, LayoutList, RefreshCw } from "lucide-react";
import type { SummitGroup } from "@/lib/summit";

export default function SummitSlides({groups,onExit,onRefresh,canRefresh}:{groups:SummitGroup[];onExit:()=>void;onRefresh:()=>void;canRefresh:boolean}) {
  const [index,setIndex]=useState(0);
  const frame=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{setIndex(0);heading.current?.focus();},[groups]);
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
      if(event.key==="ArrowRight"){event.preventDefault();setIndex(i=>Math.min(groups.length-1,i+1));}
      if(event.key==="ArrowLeft"){event.preventDefault();setIndex(i=>Math.max(0,i-1));}
      if(event.key==="Escape"){event.preventDefault();onExit();}
    };
    window.addEventListener("keydown",keydown);return()=>window.removeEventListener("keydown",keydown);
  },[groups.length,onExit]);
  const current=groups[index];
  if(!current)return <main className="summit-empty"><h1>No questions to present yet.</h1><button className="summit-text-button" onClick={onExit}>Back to table</button></main>;
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await frame.current?.requestFullscreen?.();}catch{/* Fullscreen remains optional; the presentation still works in the browser. */}}
  function exit(){if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});onExit();}
  return <main ref={frame} className="summit-slides" aria-label="Question presentation">
    <div className="summit-slide-toolbar"><button onClick={exit}><LayoutList size={17}/> Back to table</button><span>Final rankings · fixed slide order</span><div><button onClick={onRefresh} disabled={!canRefresh} aria-label="Refresh slide order"><RefreshCw size={17}/></button><button onClick={()=>void fullscreen()} aria-label="Toggle fullscreen"><Expand size={17}/></button></div></div>
    <section className={`summit-slide${current.representative.length>500?" is-long":current.representative.length>240?" is-medium":""}`} aria-labelledby="slide-question">
      <div className="summit-slide-meta"><span className="summit-eyebrow">Audience question <strong>{String(index+1).padStart(2,"0")}</strong></span><span className="summit-slide-count"><strong>{current.count.toLocaleString()}</strong> {current.count===1?"submission":"submissions"}</span></div>
      <h1 ref={heading} id="slide-question" tabIndex={-1}>{current.representative}</h1>
    </section>
    <nav className="summit-slide-nav" aria-label="Slide navigation"><button onClick={()=>setIndex(i=>Math.max(0,i-1))} disabled={index===0}><ArrowLeft size={20}/> Previous</button><span role="status">{index+1} <span aria-hidden="true">/</span><span className="sr-only">of</span> {groups.length}</span><button onClick={()=>setIndex(i=>Math.min(groups.length-1,i+1))} disabled={index===groups.length-1}>Next <ArrowRight size={20}/></button></nav>
    <p className="summit-slide-hint">← → to navigate · Esc to return to the table</p>
  </main>;
}
