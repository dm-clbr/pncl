/**
 * Dot-matrix illustration primitives for the portal bento grid.
 *
 * Every gauge, ring, sparkline, stepper, bar and silhouette on the dashboard is
 * generated here as a grid of circles from a boolean-ish mask. Nothing is an
 * imported raster: each dot is an <circle> in the DOM, so the geometry is
 * inspectable and scales without artefacts.
 */

/** Dot states. 0 off, 1 on, 2 accent, 3 success. */
export type DotCell = 0 | 1 | 2 | 3;
export type DotMask = DotCell[][];

const DOT_RADIUS = 1.6;
const DOT_PITCH = 4.5;

const CELL_CLASS: Record<DotCell, string> = {
  0: "pdot pdot-off",
  1: "pdot pdot-on",
  2: "pdot pdot-accent",
  3: "pdot pdot-ok",
};

export function DotGrid({
  mask,
  label,
  className = "",
  hideOff = false,
}: {
  mask: DotMask;
  /** Screen-reader text. Omit only when an adjacent element already says it. */
  label?: string;
  className?: string;
  /**
   * Skips unlit dots entirely. Charts drawn as bars or lines want only their
   * lit dots; a full grid of off-dots behind them reads as a screen, not data.
   */
  hideOff?: boolean;
}) {
  const rows = mask.length;
  const cols = rows > 0 ? mask[0].length : 0;
  if (rows === 0 || cols === 0) return null;

  const width = cols * DOT_PITCH;
  const height = rows * DOT_PITCH;
  const offset = DOT_PITCH / 2;

  return (
    <svg
      className={`pdot-grid ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {mask.map((row, y) =>
        row.map((cell, x) =>
          hideOff && cell === 0 ? null : (
            <circle
              key={`${y}-${x}`}
              className={CELL_CLASS[cell]}
              cx={x * DOT_PITCH + offset}
              cy={y * DOT_PITCH + offset}
              r={DOT_RADIUS}
            />
          ),
        ),
      )}
    </svg>
  );
}

function blank(rows: number, cols: number): DotMask {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0 as DotCell));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Radial gauge. Dots sit on a ring; the filled arc runs clockwise from 12
 * o'clock. Remaining dots take the accent so the shortfall is what reads.
 */
export function ringMask(percent: number, dots = 56, size = 33): DotMask {
  const mask = blank(size, size);
  const centre = (size - 1) / 2;
  const radius = centre - 1.2;
  const filled = Math.round(clamp01(percent / 100) * dots);

  for (let i = 0; i < dots; i += 1) {
    const angle = (i / dots) * Math.PI * 2 - Math.PI / 2;
    const y = Math.round(centre + Math.sin(angle) * radius);
    const x = Math.round(centre + Math.cos(angle) * radius);
    if (y < 0 || y >= size || x < 0 || x >= size) continue;
    mask[y][x] = i < filled ? 1 : 2;
  }

  return mask;
}

/**
 * Vertical bar chart. `values` are 0..1. The tallest bars take the accent when
 * `accentFrom` is set, matching the reference's request-volume tile.
 */
export function barMask(values: number[], rows = 16, accentFrom?: number): DotMask {
  const stride = 3;
  const cols = values.length * stride - (stride - 1);
  const mask = blank(rows, Math.max(cols, 1));

  values.forEach((value, index) => {
    const height = Math.max(1, Math.round(clamp01(value) * rows));
    const x = index * stride;
    for (let i = 0; i < height; i += 1) {
      const y = rows - 1 - i;
      mask[y][x] = accentFrom !== undefined && index >= accentFrom ? 2 : 1;
    }
  });

  return mask;
}

/** Symmetric audio-style waveform, deterministic for a given seed. */
export function waveMask(seed: number, cols = 62, rows = 13): DotMask {
  const mask = blank(rows, cols);
  const mid = (rows - 1) / 2;

  for (let x = 0; x < cols; x += 1) {
    const t = x / cols;
    const envelope = Math.sin(t * Math.PI);
    const detail =
      Math.sin((x + seed) * 0.9) * 0.5 + Math.sin((x + seed) * 0.31) * 0.5;
    const amplitude = Math.abs(detail) * envelope * mid;
    const reach = Math.max(0, Math.round(amplitude));
    for (let dy = -reach; dy <= reach; dy += 1) {
      const y = Math.round(mid + dy);
      if (y < 0 || y >= rows) continue;
      mask[y][x] = 1;
    }
  }

  return mask;
}

/** Line chart plotted as dots, with the final point marked in the accent. */
export function sparkMask(values: number[], rows = 16, cols = 60): DotMask {
  const mask = blank(rows, cols);
  if (values.length === 0) return mask;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  for (let x = 0; x < cols; x += 1) {
    const position = (x / (cols - 1)) * (values.length - 1);
    const left = Math.floor(position);
    const right = Math.min(values.length - 1, left + 1);
    const blend = position - left;
    const value = values[left] * (1 - blend) + values[right] * blend;
    const y = rows - 1 - Math.round(((value - min) / span) * (rows - 1));
    mask[Math.min(rows - 1, Math.max(0, y))][x] = x === cols - 1 ? 2 : 1;
  }

  return mask;
}

/** Horizontal capacity bar: `filled` of `total` segments lit. */
export function segmentMask(filled: number, total: number, rows = 7): DotMask {
  const count = Math.max(total, 1);
  const width = 3;
  const stride = width + 1;
  const mask = blank(rows, count * stride - 1);

  for (let index = 0; index < count; index += 1) {
    const tone: DotCell = index < filled ? 1 : 0;
    if (tone === 0) continue;
    for (let y = 0; y < rows; y += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        mask[y][index * stride + dx] = tone;
      }
    }
  }

  return mask;
}

/**
 * United States silhouette, lower 48. Each row is a list of [start, end] spans
 * so the Gulf coast and the Florida peninsula can be separate runs; a single
 * indent/width per row can only ever produce a taper.
 */
const US_COLS = 38;
const US_ROWS: Array<Array<[number, number]>> = [
  [[3, 31]],
  [[2, 33]],
  [[1, 34]],
  [[1, 34]],
  [[1, 34]],
  [[2, 34]],
  [[2, 33]],
  [[3, 33]],
  [[4, 32]],
  [[5, 31]],
  [[6, 30]],
  [[7, 29]],
  [[8, 27]],
  [[10, 25], [29, 31]],
  [[12, 23], [29, 32]],
  [[14, 21], [30, 32]],
  [[30, 32]],
  [[30, 31]],
];

export function usMask(scale = 2): DotMask {
  const base = US_ROWS.map((spans) => {
    const row = Array.from({ length: US_COLS }, () => 0 as DotCell);
    for (const [start, end] of spans) {
      for (let x = Math.max(0, start); x <= Math.min(end, US_COLS - 1); x += 1) {
        row[x] = 1;
      }
    }
    return row;
  });

  if (scale <= 1) return base;

  const out: DotMask = [];
  for (const row of base) {
    const wide: DotCell[] = [];
    for (const cell of row) {
      for (let i = 0; i < scale; i += 1) wide.push(cell);
    }
    for (let i = 0; i < scale; i += 1) out.push([...wide]);
  }
  return out;
}

/**
 * Horizontal stepper. Each step renders as a filled or hollow node joined by a
 * dotted rail. Completed nodes take the success colour, the first incomplete
 * node takes the accent.
 */
export function stepperMask(states: boolean[], rows = 13): DotMask {
  const nodeRadius = 6;
  const gap = 15;
  const cols = states.length * (Math.ceil(nodeRadius) * 2 + 1) + (states.length - 1) * gap;
  const mask = blank(rows, Math.max(cols, 1));
  const mid = Math.floor(rows / 2);
  const firstIncomplete = states.indexOf(false);

  let cursor = Math.ceil(nodeRadius);
  states.forEach((done, index) => {
    const tone: DotCell = done ? 3 : index === firstIncomplete ? 2 : 0;

    const reach = Math.ceil(nodeRadius);
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > nodeRadius + 0.35) continue;
        const onEdge = distance > nodeRadius - 1.1;
        // Completed nodes fill solid; pending nodes stay as outlines.
        if (!done && !onEdge) continue;
        const y = mid + dy;
        const x = cursor + dx;
        if (y < 0 || y >= rows || x < 0 || x >= mask[0].length) continue;
        mask[y][x] = tone === 0 ? 1 : tone;
      }
    }

    if (index < states.length - 1) {
      const railStart = cursor + reach + 2;
      const railEnd = railStart + gap - 3;
      for (let x = railStart; x <= railEnd; x += 2) {
        if (x >= mask[0].length) break;
        mask[mid][x] = done ? 3 : 1;
      }
      cursor += reach * 2 + 1 + gap;
    }
  });

  return mask;
}
