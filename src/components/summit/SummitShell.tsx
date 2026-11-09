import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import "@/styles/summit.css";

export default function SummitShell({ children, title, mode = "ask" }: { children: ReactNode; title: string; mode?: "ask" | "stage" | "presenter" }) {
  useEffect(() => { document.title = `${title} — Pinnacle Summit`; }, [title]);
  return (
    <div className={`summit summit--${mode}`}>
      <header className="summit-header">
        <Link to="/summit" aria-label="Pinnacle Summit"><PNCLLogo height={30} /></Link>
        <span className="summit-eyebrow">Pinnacle Summit <span aria-hidden="true">/</span> Q&amp;A</span>
      </header>
      {children}
      <footer className="summit-footer"><span>Better questions. Bigger possibilities.</span><span>PNCL</span></footer>
    </div>
  );
}
