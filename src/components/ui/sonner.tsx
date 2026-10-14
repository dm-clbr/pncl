import type { CSSProperties } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/* The portal's bar material, handed to Sonner through its own theme
   variables. The shadcn classes this replaced read --background, --foreground
   and --border, which nothing defines, so every toast rendered transparent.
   Dark always: the portal is dark, and the old theme followed the OS through a
   next-themes hook with no provider behind it. */
const PORTAL_TOAST_STYLE = {
  "--normal-bg": "rgb(28, 22, 17)",
  "--normal-border": "rgba(255, 255, 255, 0.15)",
  "--normal-text": "rgba(255, 255, 255, 0.95)",
  "--border-radius": "14px",
  fontFamily: '"Manrope", sans-serif',
} as CSSProperties;

/** Top centre at every width: the bottom of the screen belongs to the
    floating tab bar and the onboarding capsule, and the masthead's centre is
    empty. The safe-area inset keeps a phone toast clear of the status bar. */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    position="top-center"
    offset={16}
    mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    className="toaster group"
    style={PORTAL_TOAST_STYLE}
    {...props}
  />
);

export { Toaster, toast };
