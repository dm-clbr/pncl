import { useState } from "react";
import LiquidGradientCanvas, { LIQUID_GRADIENT_PRESETS } from "@/components/ui/liquid-gradient";

/** The portal's shared backdrop: the dashboard's frame, behind every page that
    does not render through PortalBentoMain. Same base, same page-tall liquid
    gradient, same vignette, so no page reads differently from the dashboard.
    Mount it as the first child of the page wrapper. Styles under
    .portal-backdrop in src/styles/portal-shell.css, which also carries the
    rules that let the canvas through the page's own fill. PortalBentoMain and
    PortalAuthLayout keep their own canvas and must not mount this as well.

    The canvas pauses itself offscreen, on a hidden tab and under
    prefers-reduced-motion, where it draws one frame and holds. fallbackColor
    is transparent so the base shows when WebGL2 is unavailable. */
export default function PortalBackground() {
  // Read once: the pointer type does not change while the page is open. Coarse
  // pointers get 20fps at half resolution, the same budget the dashboard uses;
  // the CSS blur on the layer hides the upscale.
  const [coarsePointer] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  );

  return (
    <div className="portal-backdrop" aria-hidden="true">
      <div className="portal-backdrop-canvas">
        <LiquidGradientCanvas
          {...LIQUID_GRADIENT_PRESETS.pncl}
          fps={coarsePointer ? 20 : 30}
          maxDpr={coarsePointer ? 0.5 : 1}
          fallbackColor="transparent"
        />
      </div>
    </div>
  );
}
