import { useCallback, useEffect, useRef, useState } from "react";

interface IcaSignaturePadProps {
  className?: string;
  onChange?: (dataUrl: string | null) => void;
}

function getPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export default function IcaSignaturePad({ className, onChange }: IcaSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(Math.floor(rect.width), 320);
    const height = Math.max(Math.floor(rect.height), 140);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#1a2838";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange?.(hasInkRef.current ? canvas.toDataURL("image/png") : null);
  }, [onChange]);

  const clear = useCallback(() => {
    setupCanvas();
    hasInkRef.current = false;
    setHasInk(false);
    onChange?.(null);
  }, [onChange, setupCanvas]);

  const startStroke = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    isDrawingRef.current = true;
    const { x, y } = getPoint(canvas, clientX, clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const continueStroke = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const { x, y } = getPoint(canvas, clientX, clientY);
      ctx.lineTo(x, y);
      ctx.stroke();

      if (!hasInkRef.current) {
        hasInkRef.current = true;
        setHasInk(true);
      }
      emitChange();
    },
    [emitChange],
  );

  const endStroke = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  return (
    <div className={`ica-signature-pad${className ? ` ${className}` : ""}`}>
      <canvas
        ref={canvasRef}
        className="ica-signature-pad-canvas"
        aria-label="Draw your signature"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          startStroke(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => continueStroke(event.clientX, event.clientY)}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
      />
      <div className="ica-signature-pad-actions">
        <button type="button" className="ica-signature-pad-clear" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <span className="ica-signature-pad-hint">Sign with your mouse or finger</span>
      </div>
    </div>
  );
}
