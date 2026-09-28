import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/pncl-logo-path";

export default function PNCLLogo({ height = 32 }: { height?: number }) {
  const aspect = LOGO_VIEWBOX.width / LOGO_VIEWBOX.height;
  const w = height * aspect;
  return (
    <svg viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} width={w} height={height} fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={LOGO_PATH} />
    </svg>
  );
}
