/**
 * Hidden tuner for the dashboard's WebGL backdrop.
 *
 * Opens on Cmd/Ctrl + Shift + G. Off in production unless localStorage
 * `pncl:tuner` is "1", so agents never see it. Values persist to localStorage
 * and "Copy preset" emits the block to paste back into liquid-gradient.tsx.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  LIQUID_GRADIENT_PRESETS,
  type LiquidDitherMode,
  type LiquidGradientParams,
} from "@/components/ui/liquid-gradient";

export interface TunerState extends LiquidGradientParams {
  /** Opacity of the canvas layer, not a shader uniform. */
  layerOpacity: number;
  /** Blend mode of the canvas layer. soft-light barely touches darks. */
  blendMode: string;
}

const STORAGE_KEY = "pncl:gradient-tuner";
const ENABLE_KEY = "pncl:tuner";

export const TUNER_DEFAULTS: TunerState = {
  ...LIQUID_GRADIENT_PRESETS.pncl,
  layerOpacity: 0.55,
  blendMode: "soft-light",
};

type Field = {
  key: keyof TunerState;
  label: string;
  min: number;
  max: number;
  step: number;
};

const FIELDS: Field[] = [
  { key: "layerOpacity", label: "Layer opacity", min: 0, max: 1, step: 0.01 },
  { key: "speed", label: "Speed", min: 0, max: 1.5, step: 0.01 },
  { key: "scale", label: "Scale", min: 0.05, max: 1.5, step: 0.01 },
  { key: "seed", label: "Seed", min: 0, max: 64, step: 1 },
  { key: "turbAmp", label: "Turbulence amp", min: 0, max: 1.5, step: 0.01 },
  { key: "turbFreq", label: "Turbulence freq", min: 0.05, max: 2, step: 0.01 },
  { key: "turbIter", label: "Turbulence iter", min: 2, max: 12, step: 1 },
  { key: "waveFreq", label: "Wave freq", min: 0.2, max: 6, step: 0.05 },
  { key: "distBias", label: "Distribution bias", min: -1, max: 1, step: 0.01 },
  { key: "dither", label: "Dither amount", min: 0, max: 1, step: 0.01 },
  { key: "ditherAnim", label: "Dither motion", min: 0, max: 2, step: 0.01 },
  { key: "ditherSize", label: "Dither size", min: 1, max: 16, step: 1 },
  { key: "ditherFlat", label: "Dither in darks", min: 0, max: 1, step: 0.01 },
  { key: "exposure", label: "Exposure", min: 0.5, max: 2, step: 0.01 },
  { key: "contrast", label: "Contrast", min: 0.5, max: 2, step: 0.01 },
  { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
];

const DITHER_MODES: LiquidDitherMode[] = ["off", "smooth", "grain"];

/** soft-light preserves darks; normal and overlay let grain through. */
const BLEND_MODES = ["soft-light", "normal", "overlay", "screen"];

const MAX_STOPS = 8;
const MIN_STOPS = 2;

/** Palettes to start from; colours stay editable afterwards. */
const PALETTES = Object.entries(LIQUID_GRADIENT_PRESETS).map(([name, preset]) => ({
  name,
  colors: preset.colors,
}));

function readStored(): TunerState {
  if (typeof window === "undefined") return TUNER_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return TUNER_DEFAULTS;
    return { ...TUNER_DEFAULTS, ...(JSON.parse(raw) as Partial<TunerState>) };
  } catch {
    return TUNER_DEFAULTS;
  }
}

function tunerAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem(ENABLE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Holds the tuner's values and renders the panel. Returns the live params. */
export function usePortalGradientTuner() {
  const [values, setValues] = useState<TunerState>(TUNER_DEFAULTS);
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!tunerAllowed()) return;
    setAllowed(true);
    setValues(readStored());
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setOpen((was) => !was);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  const set = useCallback((key: keyof TunerState, value: number | string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value } as TunerState;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Tuning is a convenience; a blocked store should not break the page.
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setValues(TUNER_DEFAULTS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const { layerOpacity, blendMode, ...gradient } = values;

  const panel = allowed && open ? (
    <TunerPanel
      values={values}
      onChange={set}
      onReset={reset}
      onClose={() => setOpen(false)}
    />
  ) : null;

  return { gradient, layerOpacity, blendMode, panel, allowed };
}

function TunerPanel({
  values,
  onChange,
  onReset,
  onClose,
}: {
  values: TunerState;
  onChange: (key: keyof TunerState, value: number | string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const preset = useMemo(() => {
    const { layerOpacity, blendMode, colors, ...rest } = values;
    const body = Object.entries(rest)
      .map(([k, v]) => `    ${k}: ${typeof v === "string" ? `"${v}"` : v},`)
      .join("\n");
    return [
      "  pncl: {",
      "    ...LIQUID_GRADIENT_DEFAULTS,",
      `    colors: ${JSON.stringify(colors)},`,
      body,
      "  },",
      "",
      `// .portal-bento-canvas { opacity: ${layerOpacity}; mix-blend-mode: ${blendMode}; }`,
    ].join("\n");
  }, [values]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preset);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="gtuner" role="dialog" aria-label="Gradient tuner">
      <div className="gtuner-head">
        <span className="gtuner-title">Backdrop</span>
        <button type="button" className="gtuner-x" onClick={onClose} aria-label="Close tuner">
          <X size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="gtuner-body">
        {FIELDS.map((f) => (
          <label className="gtuner-row" key={f.key}>
            <span className="gtuner-label">
              {f.label}
              <span className="gtuner-value">{Number(values[f.key]).toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={Number(values[f.key])}
              onChange={(e) => onChange(f.key, Number(e.target.value))}
            />
          </label>
        ))}

        <label className="gtuner-row">
          <span className="gtuner-label">Blend mode</span>
          <div className="gtuner-seg gtuner-seg-4">
            {BLEND_MODES.map((mode) => (
              <button
                type="button"
                key={mode}
                className={values.blendMode === mode ? "is-on" : ""}
                onClick={() => onChange("blendMode", mode)}
              >
                {mode === "soft-light" ? "soft" : mode}
              </button>
            ))}
          </div>
        </label>

        <label className="gtuner-row">
          <span className="gtuner-label">Dither mode</span>
          <div className="gtuner-seg">
            {DITHER_MODES.map((mode) => (
              <button
                type="button"
                key={String(mode)}
                className={values.ditherMode === mode ? "is-on" : ""}
                onClick={() => onChange("ditherMode", mode as string)}
              >
                {mode}
              </button>
            ))}
          </div>
        </label>

        <div className="gtuner-row">
          <span className="gtuner-label">Palette</span>
          <div className="gtuner-palettes">
            {PALETTES.map((p) => (
              <button
                type="button"
                key={p.name}
                title={p.name}
                onClick={() => onChange("colors", [...p.colors] as unknown as string)}
                style={{
                  background: `linear-gradient(90deg, ${p.colors.join(", ")})`,
                }}
                aria-label={`Use ${p.name} palette`}
              />
            ))}
          </div>
        </div>

        <div className="gtuner-row">
          <span className="gtuner-label">
            Stops
            <span className="gtuner-value">{values.colors.length}</span>
          </span>
          <div className="gtuner-colors">
            {values.colors.map((c, i) => (
              <span className="gtuner-stop" key={i}>
                <input
                  type="color"
                  value={c}
                  aria-label={`Colour ${i + 1}`}
                  onChange={(e) => {
                    const next = [...values.colors];
                    next[i] = e.target.value;
                    onChange("colors", next as unknown as string);
                  }}
                />
                {values.colors.length > MIN_STOPS && (
                  <button
                    type="button"
                    className="gtuner-stop-x"
                    aria-label={`Remove colour ${i + 1}`}
                    onClick={() =>
                      onChange(
                        "colors",
                        values.colors.filter((_, j) => j !== i) as unknown as string,
                      )
                    }
                  >
                    <X size={9} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
            {values.colors.length < MAX_STOPS && (
              <button
                type="button"
                className="gtuner-stop-add"
                aria-label="Add colour stop"
                onClick={() =>
                  onChange(
                    "colors",
                    [
                      ...values.colors,
                      values.colors[values.colors.length - 1] ?? "#000000",
                    ] as unknown as string,
                  )
                }
              >
                +
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="gtuner-foot">
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy preset"}
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </aside>
  );
}
