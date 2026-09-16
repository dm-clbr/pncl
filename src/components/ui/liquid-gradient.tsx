/**
 * Animated WebGL2 gradient, used as the portal's living backdrop.
 *
 * Vendored from a shadcn-style drop-in. No external dependencies. The original
 * "use client" directive is dropped: this is a Vite SPA, not Next.js, so every
 * component is already a client component.
 *
 * It pauses itself when offscreen, when the tab is hidden, and under
 * prefers-reduced-motion, so it costs nothing when it is not being seen.
 */
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

export type LiquidDitherMode = "off" | "smooth" | "grain" | 0 | 1 | 2;

export interface LiquidGradientParams {
  colors: string[];
  speed: number;
  scale: number;
  seed: number;
  turbAmp: number;
  turbFreq: number;
  turbIter: number;
  waveFreq: number;
  distBias: number;
  jellify: number | boolean;
  ditherMode: LiquidDitherMode;
  dither: number;
  exposure: number;
  contrast: number;
  saturation: number;
  loop: number;
}

export interface LiquidGradientCanvasProps
  extends Partial<LiquidGradientParams>,
    Omit<React.CanvasHTMLAttributes<HTMLCanvasElement>, "color" | "onError"> {
  paused?: boolean;
  maxDpr?: number;
  fps?: number;
  respectReducedMotion?: boolean;
  pauseWhenOffscreen?: boolean;
  pauseWhenHidden?: boolean;
  fallbackColor?: string;
  onReady?: (gl: WebGL2RenderingContext) => void;
  onError?: (error: Error) => void;
}

export const LIQUID_GRADIENT_DEFAULTS: LiquidGradientParams = {
  colors: ["#3b0f6f", "#8b2fc9", "#e84a8a", "#ffae5c"],
  speed: 0.6,
  scale: 0.5,
  seed: 8,
  turbAmp: 0.5,
  turbFreq: 0.6,
  turbIter: 8,
  waveFreq: 2.5,
  distBias: 0.1,
  jellify: 0,
  ditherMode: "smooth",
  dither: 0.06,
  exposure: 1.2,
  contrast: 1.15,
  saturation: 1.1,
  loop: 0,
};

export const LIQUID_GRADIENT_PRESETS = {
  sunset: {
    ...LIQUID_GRADIENT_DEFAULTS,
    colors: ["#3b0f6f", "#8b2fc9", "#e84a8a", "#ffae5c"],
  },
  subtleDark: {
    ...LIQUID_GRADIENT_DEFAULTS,
    colors: ["#050505", "#0f0f0f", "#0a0a0a", "#1a1a1a", "#141414"],
    speed: 1.0,
    scale: 0.4,
    seed: 3,
    ditherMode: "off" as LiquidDitherMode,
    exposure: 1.1,
    contrast: 1.1,
    saturation: 1.0,
    distBias: 0,
  },
  /** PNCL: the warm wall light the dashboard already uses, made to drift. */
  pncl: {
    ...LIQUID_GRADIENT_DEFAULTS,
    colors: ["#e2bfa2", "#c9a084", "#94795f", "#5a4c42", "#2b2420", "#16120f"],
    speed: 0.12,
    scale: 0.32,
    seed: 19,
    turbAmp: 0.34,
    turbFreq: 0.5,
    turbIter: 6,
    waveFreq: 1.4,
    distBias: 0.25,
    ditherMode: "grain" as LiquidDitherMode,
    dither: 0.05,
    exposure: 1.02,
    contrast: 1.04,
    saturation: 0.9,
  },
  vibrant: {
    ...LIQUID_GRADIENT_DEFAULTS,
    colors: ["#ff0055", "#0055ff", "#00ffaa", "#ffaa00", "#7700ff"],
    seed: 42,
    contrast: 1.2,
    saturation: 1.2,
  },
  aurora: {
    ...LIQUID_GRADIENT_DEFAULTS,
    colors: ["#051105", "#0a3311", "#055533", "#11aa44", "#0a1122"],
    speed: 0.4,
    scale: 0.6,
    seed: 12,
    turbAmp: 0.6,
    turbFreq: 0.8,
    turbIter: 10,
    waveFreq: 1.5,
    distBias: -0.2,
    ditherMode: "grain" as LiquidDitherMode,
    dither: 0.04,
    exposure: 1.3,
  },
  magma: {
    ...LIQUID_GRADIENT_DEFAULTS,
    colors: ["#110000", "#330500", "#661100", "#aa3300", "#ff6600"],
    speed: 0.8,
    scale: 0.3,
    seed: 7,
    waveFreq: 3.0,
    distBias: 0.3,
    contrast: 1.3,
    saturation: 1.3,
  },
} satisfies Record<string, LiquidGradientParams>;

export type LiquidGradientPresetName = keyof typeof LIQUID_GRADIENT_PRESETS;

export interface LiquidGradientCanvasHandle {
  readonly canvas: HTMLCanvasElement | null;
  play: () => void;
  pause: () => void;
}

const VS_SOURCE = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_uv;
void main() {
    v_uv = a_texCoord;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FS_SOURCE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

#define NUM_COLORS 8
uniform vec4 u_colors[NUM_COLORS];
uniform int u_colors_length;

uniform float u_seed;
uniform float u_speed;
uniform float u_loop;
uniform float u_scale;
uniform float u_turbAmp;
uniform float u_turbFreq;
uniform float u_turbIter;
uniform float u_waveFreq;
uniform float u_distBias;
uniform float u_jellify;
uniform float u_ditherMode;
uniform float u_dither;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;

const float GOLDEN_ANGLE = 2.3999632;
const float TAU = 6.28318530;

uvec3 hash3(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 seedRandom(float seedVal) {
    uvec3 s = uvec3(
        floatBitsToUint(seedVal),
        floatBitsToUint(seedVal * 1.5 + 7.31),
        floatBitsToUint(seedVal * 2.7 + 13.37)
    );
    s = hash3(s);
    return vec3(s) / float(0xFFFFFFFFu);
}

vec3 toLinear(vec3 c) {
    return pow(c, vec3(2.2));
}

vec3 toSrgb(vec3 c) {
    return pow(clamp(c, 0.0, 1.0), vec3(0.4545));
}

vec3 linearToOklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

    l = pow(max(l, 0.0), 1.0/3.0);
    m = pow(max(m, 0.0), 1.0/3.0);
    s = pow(max(s, 0.0), 1.0/3.0);

    return vec3(
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    );
}

vec3 oklabToLinear(vec3 c) {
    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

    l = l * l * l;
    m = m * m * m;
    s = s * s * s;

    return vec3(
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

vec3 oklabToLch(vec3 lab) {
    return vec3(lab.x, length(lab.yz), atan(lab.z, lab.y));
}

vec3 lchToOklab(vec3 lch) {
    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
}

vec3 mixLch(vec3 lab0, vec3 lab1, float t) {
    vec3 lch0 = oklabToLch(lab0);
    vec3 lch1 = oklabToLch(lab1);

    if (lch0.y < 0.05) lch0.z = lch1.z;
    if (lch1.y < 0.05) lch1.z = lch0.z;

    float dh = lch1.z - lch0.z;
    if (dh > 3.14159265) dh -= 6.28318530;
    if (dh < -3.14159265) dh += 6.28318530;

    return lchToOklab(vec3(
        mix(lch0.x, lch1.x, t),
        mix(lch0.y, lch1.y, t),
        lch0.z + dh * t
    ));
}

vec3 getColor(int idx) {
    if (u_colors_length < 1) return vec3(0.0);
    int safeIdx = clamp(idx, 0, u_colors_length - 1);
    return u_colors[safeIdx].rgb;
}

vec3 paletteN(float t, int count) {
    if (count < 1) return vec3(0.0);
    if (count < 2) return toLinear(getColor(0));

    float segmentSize = 1.0 / float(count - 1);
    t = clamp(t, 0.0, 1.0);
    int idx = min(int(floor(t / segmentSize)), count - 2);
    float localT = clamp((t - float(idx) * segmentSize) / segmentSize, 0.0, 1.0);

    vec3 lab0 = linearToOklab(toLinear(getColor(idx)));
    vec3 lab1 = linearToOklab(toLinear(getColor(idx + 1)));

    return oklabToLinear(mixLch(lab0, lab1, localT));
}

float IGN(vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

float quickNoise(vec2 I) {
    return fract(sin(dot(I, vec2(12.9898, 78.233))) * 43758.5453);
}

// 0 = off, 1 = smooth (IGN), 2 = grain
float getDither(vec2 I, float mode) {
    if (mode < 0.5) return 0.5;
    if (mode < 1.5) return IGN(I);
    return quickNoise(I);
}

vec3 softGamutMap(vec3 linearRgb) {
    float maxC = max(linearRgb.r, max(linearRgb.g, linearRgb.b));
    float minC = min(linearRgb.r, min(linearRgb.g, linearRgb.b));

    if (minC >= 0.0 && maxC <= 1.0) return linearRgb;

    vec3 lab = linearToOklab(max(linearRgb, 0.0));
    float L = clamp(lab.x, 0.0, 1.0);
    float C = length(lab.yz);
    float h = atan(lab.z, lab.y);

    float maxChroma = 0.4 * (1.0 - pow(abs(2.0 * L - 1.0), 2.0));

    if (C > maxChroma * 0.7) {
        float knee = maxChroma * 0.7;
        C = knee + (maxChroma - knee) * tanh((C - knee) / (maxChroma - knee + 0.001));
    }

    return clamp(oklabToLinear(vec3(L, C * cos(h), C * sin(h))), 0.0, 1.0);
}

vec3 applyContrastSaturation(vec3 linearRgb, float contrast, float saturation) {
    vec3 lab = linearToOklab(linearRgb);
    float C = length(lab.yz);
    float h = atan(lab.z, lab.y);

    lab.x = clamp((lab.x - 0.5) * contrast + 0.5, 0.0, 1.0);
    C *= saturation;
    lab.y = C * cos(h);
    lab.z = C * sin(h);

    return oklabToLinear(lab);
}

void main() {
    vec2 fragCoord = v_uv * u_resolution;
    vec2 r = u_resolution;
    vec2 p = (fragCoord * 2.0 - r) / r.y;

    int colorCount = u_colors_length;

    if (colorCount < 1) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float t = u_time * 0.3;

    // Map time onto a circle so the animation wraps seamlessly when looping.
    float looping = step(0.5, u_loop);
    float phase = TAU * u_time / max(u_loop, 0.01);
    float radius = u_loop * u_speed * 0.3 / TAU;
    float tA = sin(phase) * radius;
    float tB = (1.0 - cos(phase)) * radius;

    vec3 seedOffset = seedRandom(u_seed);
    vec3 seedOffset2 = seedRandom(u_seed + 100.0);

    float seedAngle = u_seed * GOLDEN_ANGLE;
    vec2 seedPhase = (seedOffset2.xy - 0.5) * TAU;

    float cs = cos(seedAngle);
    float sn = sin(seedAngle);
    p = mat2(cs, -sn, sn, cs) * p;

    float dither = getDither(floor(fragCoord / u_pixelRatio), u_ditherMode);

    float totalVal = 0.0;
    float totalWeight = 0.0;
    int turbIter = int(u_turbIter);

    float freq = 1.0 / max(u_turbFreq, 0.01);

    for (float i = 0.0; i < 4.0; i++) {
        float eph = i / 4.0;

        vec2 q = p * u_scale;
        float sq = eph * eph;

        if (u_jellify > 0.5) {
            q.yx *= mix(1.0, 0.5, 1.0 - exp(-sq));
        }

        float a = seedPhase.x;
        float d = seedPhase.y;

        for (int j = 2; j < 13; j++) {
            if (j >= turbIter) break;
            float fj = float(j);
            float t1 = mix(t * u_speed, tA, looping);
            float t2 = mix(t * u_speed, tB, looping);
            q += u_turbAmp * sin(q.yx / freq * fj + t1 + vec2(a, d) + seedOffset.xy * fj) / fj;
            a += cos(fj + d * 1.2 + q.x * 2.0 - t1 + seedOffset2.z + t2 * 0.3 * looping);
            d += sin(fj * q.y + a + seedOffset.z + t1 + seedOffset2.y + t2 * 0.3 * looping);
        }

        float v = 0.5 + 0.5 * sin(length(q.yx + vec2(a, d) * 0.2) * u_waveFreq + i * i + seedOffset.x);
        float weight = smoothstep(0.0, 0.5, eph) * smoothstep(1.0, 0.5, eph);
        totalVal += v * weight;
        totalWeight += weight;
    }

    float val = totalVal / totalWeight;
    val = clamp((val - 0.3) / 0.4, 0.0, 1.0);
    val = pow(val, exp(-u_distBias));
    val = clamp(val + (dither - 0.5) * u_dither, 0.0, 1.0);

    vec3 col = paletteN(val, colorCount);
    col *= u_exposure;
    col = applyContrastSaturation(col, u_contrast, u_saturation);
    col = softGamutMap(col);
    col = toSrgb(col);

    fragColor = vec4(col, 1.0);
}
`;

const MAX_COLORS = 8;

function hexToRgba(hex: string): [number, number, number, number] {
  if (!hex || typeof hex !== "string") return [0, 0, 0, 1];
  let clean = hex.trim().replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6 && clean.length !== 8) {
    return [0, 0, 0, 1];
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const a = clean.length === 8 ? parseInt(clean.substring(6, 8), 16) / 255 : 1.0;
  return [
    Number.isNaN(r) ? 0 : r,
    Number.isNaN(g) ? 0 : g,
    Number.isNaN(b) ? 0 : b,
    Number.isNaN(a) ? 1 : a,
  ];
}

function ditherModeToNumber(mode: LiquidDitherMode): number {
  if (typeof mode === "number") return mode;
  if (mode === "smooth") return 1;
  if (mode === "grain") return 2;
  return 0;
}

function buildColorBuffer(colors: string[]): Float32Array {
  const out = new Float32Array(MAX_COLORS * 4);
  const last = colors.length > 0 ? colors[colors.length - 1] : "#000000";
  for (let i = 0; i < MAX_COLORS; i++) {
    const [r, g, b, a] = hexToRgba(i < colors.length ? colors[i] : last);
    out[i * 4 + 0] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

export const LiquidGradientCanvas = forwardRef<
  LiquidGradientCanvasHandle,
  LiquidGradientCanvasProps
>(function LiquidGradientCanvas(props, ref) {
  const {
    colors = LIQUID_GRADIENT_DEFAULTS.colors,
    speed = LIQUID_GRADIENT_DEFAULTS.speed,
    scale = LIQUID_GRADIENT_DEFAULTS.scale,
    seed = LIQUID_GRADIENT_DEFAULTS.seed,
    turbAmp = LIQUID_GRADIENT_DEFAULTS.turbAmp,
    turbFreq = LIQUID_GRADIENT_DEFAULTS.turbFreq,
    turbIter = LIQUID_GRADIENT_DEFAULTS.turbIter,
    waveFreq = LIQUID_GRADIENT_DEFAULTS.waveFreq,
    distBias = LIQUID_GRADIENT_DEFAULTS.distBias,
    jellify = LIQUID_GRADIENT_DEFAULTS.jellify,
    ditherMode = LIQUID_GRADIENT_DEFAULTS.ditherMode,
    dither = LIQUID_GRADIENT_DEFAULTS.dither,
    exposure = LIQUID_GRADIENT_DEFAULTS.exposure,
    contrast = LIQUID_GRADIENT_DEFAULTS.contrast,
    saturation = LIQUID_GRADIENT_DEFAULTS.saturation,
    loop = LIQUID_GRADIENT_DEFAULTS.loop,

    paused = false,
    maxDpr = 2,
    fps = 0,
    respectReducedMotion = true,
    pauseWhenOffscreen = true,
    pauseWhenHidden = true,
    fallbackColor,
    onReady,
    onError,

    className,
    style,
    ...rest
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  // Live params reach the render loop through a ref so it is built only once.
  const paramsRef = useRef({
    colors,
    speed,
    scale,
    seed,
    turbAmp,
    turbFreq,
    turbIter,
    waveFreq,
    distBias,
    jellify,
    ditherMode,
    dither,
    exposure,
    contrast,
    saturation,
    loop,
    maxDpr,
    fps,
  });
  paramsRef.current = {
    colors,
    speed,
    scale,
    seed,
    turbAmp,
    turbFreq,
    turbIter,
    waveFreq,
    distBias,
    jellify,
    ditherMode,
    dither,
    exposure,
    contrast,
    saturation,
    loop,
    maxDpr,
    fps,
  };

  const colorSignature = colors.join("|");
  const colorBuffer = useMemo(
    () => buildColorBuffer(colors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorSignature],
  );
  const colorBufferRef = useRef(colorBuffer);
  colorBufferRef.current = colorBuffer;
  const colorCount = Math.min(Math.max(colors.length, 1), MAX_COLORS);
  const colorCountRef = useRef(colorCount);
  colorCountRef.current = colorCount;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const controlsRef = useRef<{ play: () => void; pause: () => void }>({
    play: () => {},
    pause: () => {},
  });

  useImperativeHandle(
    ref,
    () => ({
      get canvas() {
        return canvasRef.current;
      },
      play: () => controlsRef.current.play(),
      pause: () => controlsRef.current.pause(),
    }),
    [],
  );

  useEffect(() => {
    if (paused) controlsRef.current.pause();
    else controlsRef.current.play();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: "default",
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      onErrorRef.current?.(new Error("WebGL2 is not supported in this browser."));
      return;
    }

    // Recreated from scratch on context restore.
    let program: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let posBuffer: WebGLBuffer | null = null;
    let texBuffer: WebGLBuffer | null = null;
    let uLocs: Record<string, WebGLUniformLocation | null> = {};
    let resourcesReady = false;

    let rafId = 0;
    let running = false;
    let lastTime = 0;
    let lastDraw = 0;
    let clockRef = 0;

    function compileShader(source: string, type: number): WebGLShader {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error("Could not create shader object.");
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        const log = gl!.getShaderInfoLog(shader);
        gl!.deleteShader(shader);
        throw new Error(`Shader compile error: ${log}`);
      }
      return shader;
    }

    function buildResources(): boolean {
      try {
        const vs = compileShader(VS_SOURCE, gl!.VERTEX_SHADER);
        const fs = compileShader(FS_SOURCE, gl!.FRAGMENT_SHADER);
        program = gl!.createProgram();
        if (!program) throw new Error("Could not create program.");
        gl!.attachShader(program, vs);
        gl!.attachShader(program, fs);
        gl!.linkProgram(program);
        gl!.deleteShader(vs);
        gl!.deleteShader(fs);
        if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
          throw new Error(`Shader linking failed: ${gl!.getProgramInfoLog(program)}`);
        }

        gl!.useProgram(program);

        vao = gl!.createVertexArray();
        gl!.bindVertexArray(vao);

        posBuffer = gl!.createBuffer();
        gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuffer);
        gl!.bufferData(
          gl!.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl!.STATIC_DRAW,
        );
        const posLoc = gl!.getAttribLocation(program, "a_position");
        gl!.enableVertexAttribArray(posLoc);
        gl!.vertexAttribPointer(posLoc, 2, gl!.FLOAT, false, 0, 0);

        texBuffer = gl!.createBuffer();
        gl!.bindBuffer(gl!.ARRAY_BUFFER, texBuffer);
        gl!.bufferData(
          gl!.ARRAY_BUFFER,
          new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
          gl!.STATIC_DRAW,
        );
        const texLoc = gl!.getAttribLocation(program, "a_texCoord");
        gl!.enableVertexAttribArray(texLoc);
        gl!.vertexAttribPointer(texLoc, 2, gl!.FLOAT, false, 0, 0);

        const names = [
          "u_colors",
          "u_colors_length",
          "u_seed",
          "u_speed",
          "u_loop",
          "u_scale",
          "u_turbAmp",
          "u_turbFreq",
          "u_turbIter",
          "u_waveFreq",
          "u_distBias",
          "u_jellify",
          "u_ditherMode",
          "u_dither",
          "u_exposure",
          "u_contrast",
          "u_saturation",
          "u_time",
          "u_resolution",
          "u_pixelRatio",
        ];
        uLocs = {};
        for (const n of names) uLocs[n] = gl!.getUniformLocation(program, n);

        resourcesReady = true;
        return true;
      } catch (e) {
        resourcesReady = false;
        onErrorRef.current?.(e instanceof Error ? e : new Error(String(e)));
        return false;
      }
    }

    if (!buildResources()) return;

    let bufferW = 0;
    let bufferH = 0;
    let pixelRatio = 1;

    function resize() {
      const dpr = Math.min(
        Math.max(paramsRef.current.maxDpr, 0.5),
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      );
      pixelRatio = dpr;
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (w !== bufferW || h !== bufferH) {
        bufferW = w;
        bufferH = h;
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
        return true;
      }
      return false;
    }
    resize();

    function drawFrame() {
      if (!resourcesReady || gl!.isContextLost()) return;
      const p = paramsRef.current;

      gl!.useProgram(program);
      gl!.bindVertexArray(vao);

      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);

      gl!.uniform4fv(uLocs.u_colors, colorBufferRef.current);
      gl!.uniform1i(uLocs.u_colors_length, colorCountRef.current);
      gl!.uniform1f(uLocs.u_seed, p.seed);
      gl!.uniform1f(uLocs.u_speed, p.speed);
      gl!.uniform1f(uLocs.u_loop, p.loop);
      gl!.uniform1f(uLocs.u_scale, p.scale);
      gl!.uniform1f(uLocs.u_turbAmp, p.turbAmp);
      gl!.uniform1f(uLocs.u_turbFreq, p.turbFreq);
      gl!.uniform1f(uLocs.u_turbIter, p.turbIter);
      gl!.uniform1f(uLocs.u_waveFreq, p.waveFreq);
      gl!.uniform1f(uLocs.u_distBias, p.distBias);
      gl!.uniform1f(uLocs.u_jellify, p.jellify ? 1 : 0);
      gl!.uniform1f(uLocs.u_ditherMode, ditherModeToNumber(p.ditherMode));
      gl!.uniform1f(uLocs.u_dither, p.dither);
      gl!.uniform1f(uLocs.u_exposure, p.exposure);
      gl!.uniform1f(uLocs.u_contrast, p.contrast);
      gl!.uniform1f(uLocs.u_saturation, p.saturation);
      gl!.uniform1f(uLocs.u_time, clockRef);
      gl!.uniform2f(uLocs.u_resolution, bufferW, bufferH);
      gl!.uniform1f(uLocs.u_pixelRatio, pixelRatio);

      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (resize()) drawFrame();
      });
      resizeObserver.observe(canvas);
    }

    const prefersReducedMotion =
      respectReducedMotion &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let visibleOnScreen = !pauseWhenOffscreen;
    let tabVisible = !(
      pauseWhenHidden &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    );

    function canRun(): boolean {
      return (
        !pausedRef.current &&
        !prefersReducedMotion &&
        visibleOnScreen &&
        tabVisible &&
        !gl!.isContextLost()
      );
    }

    function tick(now: number) {
      if (!running) return;
      rafId = requestAnimationFrame(tick);

      const fpsCap = paramsRef.current.fps;
      const minInterval = fpsCap > 0 ? 1000 / fpsCap : 0;
      if (minInterval > 0 && now - lastDraw < minInterval - 1) return;

      const delta = (now - lastTime) / 1000;
      lastTime = now;
      lastDraw = now;
      // Clamp so a returning background tab does not jump the clock.
      clockRef += Math.min(delta, 0.1) * paramsRef.current.speed;

      drawFrame();
    }

    function start() {
      if (running || !canRun()) return;
      running = true;
      lastTime = typeof performance !== "undefined" ? performance.now() : 0;
      lastDraw = 0;
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    controlsRef.current = {
      play: () => {
        pausedRef.current = false;
        start();
      },
      pause: () => {
        pausedRef.current = true;
        stop();
      },
    };

    let intersectionObserver: IntersectionObserver | null = null;
    if (pauseWhenOffscreen && typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          visibleOnScreen = entries.some((e) => e.isIntersecting);
          if (canRun()) start();
          else stop();
        },
        { threshold: 0 },
      );
      intersectionObserver.observe(canvas);
    } else {
      visibleOnScreen = true;
    }

    function handleVisibility() {
      tabVisible = document.visibilityState !== "hidden";
      if (canRun()) start();
      else stop();
    }
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    function handleContextLost(e: Event) {
      e.preventDefault();
      stop();
      resourcesReady = false;
    }
    function handleContextRestored() {
      if (buildResources()) {
        bufferW = 0;
        bufferH = 0;
        resize();
        if (canRun()) start();
        else drawFrame();
      }
    }
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    onReadyRef.current?.(gl);
    if (canRun()) {
      start();
    } else {
      // Draw once so a paused/offscreen/reduced-motion canvas is not blank.
      drawFrame();
    }

    return () => {
      stop();
      controlsRef.current = { play: () => {}, pause: () => {} };
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (pauseWhenHidden && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (posBuffer) gl.deleteBuffer(posBuffer);
      if (texBuffer) gl.deleteBuffer(texBuffer);
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    };
  }, [pauseWhenOffscreen, pauseWhenHidden, respectReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        touchAction: "none",
        backgroundColor: fallbackColor ?? colors[0] ?? "#000",
        ...style,
      }}
      {...rest}
    />
  );
});

export default LiquidGradientCanvas;
