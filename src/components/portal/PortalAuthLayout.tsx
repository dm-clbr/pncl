import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";
import Pane from "@/components/portal/Pane";
import LiquidGradientCanvas, { LIQUID_GRADIENT_PRESETS } from "@/components/ui/liquid-gradient";
import "@/styles/home2.css";
import "@/styles/portal-auth.css";

/** The shell for the five screens an agent reaches without a session: login,
    set password, confirm email, activate and the onboarding handoff. One
    centred Pane on the dashboard's gradient. The logo and the help link sit
    inside the pane, because the bare backdrop holds no text at 4.5:1
    (docs/DESIGN.md, Contrast). Styles in src/styles/portal-auth.css. */
export default function PortalAuthLayout({ children }: { children: ReactNode }) {
  // Read once: the pointer type does not change while the page is open. Coarse
  // pointers get the same 20fps / 0.5 dpr budget as the dashboard, and the CSS
  // blur on the layer hides the upscale.
  const [coarsePointer] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  );

  return (
    <div className="home2-page portal-auth">
      <div className="grain" aria-hidden="true" />

      {/* Living backdrop. Pauses itself offscreen, on a hidden tab and under
          prefers-reduced-motion; fallbackColor keeps the ink page behind it
          when WebGL2 is unavailable. */}
      <div className="portal-auth-canvas" aria-hidden="true">
        <LiquidGradientCanvas
          {...LIQUID_GRADIENT_PRESETS.pncl}
          fps={coarsePointer ? 20 : 30}
          maxDpr={coarsePointer ? 0.5 : 1}
          fallbackColor="transparent"
        />
      </div>

      <main className="portal-auth-main">
        <Pane as="div">
          <Link to="/" className="pauth-logo" aria-label="PNCL home">
            <PNCLLogo height={20} />
          </Link>
          {children}
          <p className="pauth-help">
            <Link to="/contact">Need help?</Link>
          </p>
        </Pane>
      </main>
    </div>
  );
}
