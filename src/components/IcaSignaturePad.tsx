import { useCallback, useEffect, useRef, useState } from "react";

interface IcaSignaturePadProps {
  className?: string;
  initialImage?: string | null;
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

export default function IcaSignaturePad({ className, initialImage = null, onChange }: IcaSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const revision = useRef(0);
  const notify = useRef(onChange);
  useEffect(() => { notify.current = onChange; }, [onChange]);

  const setupCanvas = useCallback((preserve = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const previous = preserve && hasInkRef.current ? document.createElement("canvas") : null;
    if (previous) {
      previous.width = canvas.width; previous.height = canvas.height;
      previous.getContext("2d")?.drawImage(canvas, 0, 0);
    }
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
    if (previous) {
      const scale = Math.min(width / previous.width, height / previous.height);
      ctx.drawImage(previous, (width - previous.width * scale) / 2, (height - previous.height * scale) / 2, previous.width * scale, previous.height * scale);
    }
  }, []);

  useEffect(() => {
    setupCanvas();
    hasInkRef.current = false; setHasInk(false);
    const version = ++revision.current;
    let active = true;
    if (initialImage) {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!active || !canvas || revision.current !== version) return;
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
        canvas.getContext("2d")?.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
        hasInkRef.current = true; setHasInk(true);
      };
      image.onerror = () => { if (active && revision.current === version) notify.current?.(null); };
      image.src = initialImage;
    }
    const resize = () => { isDrawingRef.current = false; setupCanvas(true); };
    window.addEventListener("resize", resize);
    return () => { active = false; window.removeEventListener("resize", resize); };
  }, [initialImage, setupCanvas]);

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange?.(hasInkRef.current ? canvas.toDataURL("image/png") : null);
  }, [onChange]);

  const clear = useCallback(() => {
    revision.current++; isDrawingRef.current = false;
    setupCanvas();
    hasInkRef.current = false;
    setHasInk(false);
    onChange?.(null);
  }, [onChange, setupCanvas]);

  const startStroke = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    revision.current++;
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
    activePointer.current = null;
  }, []);

  return (
    <div className={`ica-signature-pad${className ? ` ${className}` : ""}`}>
      <canvas
        ref={canvasRef}
        className="ica-signature-pad-canvas"
        aria-label="Draw your full first and last name"
        onPointerDown={(event) => {
          if (activePointer.current !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          startStroke(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => { if (activePointer.current === event.pointerId) continueStroke(event.clientX, event.clientY); }}
        onPointerUp={event => { if (activePointer.current === event.pointerId) endStroke(); }}
        onPointerCancel={event => { if (activePointer.current === event.pointerId) endStroke(); }}
        onLostPointerCapture={endStroke}
      />
      <div className="ica-signature-pad-actions">
        <button type="button" className="ica-signature-pad-clear" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <span className="ica-signature-pad-hint">Write your full first and last name</span>
      </div>
    </div>
  );
}
