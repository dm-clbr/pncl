import { ArrowUpRight } from "lucide-react";
import SummitShell from "@/components/summit/SummitShell";
import { SUMMIT_ASK_URL } from "@/lib/summit";

export default function Summit() {
  return (
    <SummitShell title="Join the conversation" mode="stage">
      <main className="summit-stage">
        <div className="summit-stage-copy">
          <p className="summit-eyebrow"><span className="summit-dot" /> The floor is yours</p>
          <h1>Your questions.<br /><em>Our next<br className="summit-desktop-break" /> conversation.</em></h1>
          <p className="summit-lede">Scan the code. Ask your question.<br />Help shape what we talk about next.</p>
          <div className="summit-stage-note"><span>01</span> Open your camera <span>02</span> Scan &amp; submit</div>
        </div>
        <a className="summit-qr-card" href={SUMMIT_ASK_URL} aria-label="Ask a question at thepncl.com/summit/ask">
          <div className="summit-qr-label"><span>Join the conversation</span><ArrowUpRight size={22} /></div>
          <img className="summit-qr" src="/summit-ask-qr.svg" alt="QR code linking to https://thepncl.com/summit/ask" width="480" height="480" />
          <p>thepncl.com/summit/ask</p>
          <span className="summit-qr-caption">No sign-in. Just your question.</span>
        </a>
      </main>
    </SummitShell>
  );
}
