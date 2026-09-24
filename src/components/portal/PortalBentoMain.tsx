import { useState, type CSSProperties, type ReactNode } from "react";
import LiquidGradientCanvas from "@/components/ui/liquid-gradient";
import { usePortalGradientTuner } from "@/components/PortalGradientTuner";

/** The dashboard's page frame: grain, the tuned liquid gradient under the
    vignette, and the centred wrap. The dashboard, calendar and state map all
    render through it so the three read as one surface and cannot drift.
    Render it inside .home2-page; the bottom nav and any sheet stay outside it,
    since a fixed bar inside the stage would take the page as its containing
    block. `rail` renders inside <main> beside the wrap.

    The page imports portal-bento.css itself, after home2.css. Importing it
    here would load it ahead of home2.css (component imports come first) and
    flip every same-specificity tie between the two. */
export default function PortalBentoMain({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  // Read once: the pointer type does not change while the page is open. Coarse
  // pointers get the canvas at 20fps and half resolution; the CSS blur on
  // .portal-bento-canvas hides the upscale, so it reads the same for a
  // quarter of the pixels.
  const [coarsePointer] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  );

  // Hidden backdrop tuner. Cmd/Ctrl + Shift + G in dev.
  const { gradient, layerOpacity, blendMode, vignette, staticBase, panel } = usePortalGradientTuner();

  return (
    <>
      <div className="grain" aria-hidden="true" />

      <main
        className={`portal-bento${staticBase ? " has-static-base" : ""}`}
        style={{ "--vignette": vignette } as CSSProperties}
      >
        {/* Living backdrop. Pauses itself offscreen, on a hidden tab, and under
            prefers-reduced-motion; the flat base underneath is the fallback if
            WebGL2 is unavailable. */}
        <div
          className="portal-bento-canvas"
          style={{ opacity: layerOpacity, mixBlendMode: blendMode as never }}
          aria-hidden="true"
        >
          <LiquidGradientCanvas
            {...gradient}
            fps={coarsePointer ? 20 : 30}
            maxDpr={coarsePointer ? 0.5 : 1}
            fallbackColor="transparent"
          />
        </div>

        <div className="portal-bento-wrap">{children}</div>

        {rail}
      </main>

      {panel}
    </>
  );
}
