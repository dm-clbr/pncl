# PNCL portal design system

Source of truth: `src/styles/portal-tokens.css`. Everything below names a token; if a value here and the file disagree, the file wins.

## Tokens
| Group | Token | Value |
|---|---|---|
| Type | `--portal-font` | Manrope only |
| | `--portal-t-display / large / mid / body / micro / label` | 34 / 22 / 20 / 13 / 11 / 10 px |
| Text | `--portal-text-strong` | white 0.95: values, headings |
| | `--portal-text` | white 0.80: body, meta, titles (4.5:1 on the pane) |
| | `--portal-text-faint` | white 0.60: index numerals, uppercase labels, counts (3:1 on the pane) |
| | `--portal-rule` / `--portal-border` | white 0.08 / 0.15 |
| | `--portal-accent` (index.css) | urgent only |
| Surface | `--portal-pane-fill` | rgba(28, 22, 17, 0.68) |
| | `--portal-pane-sheen` | 152deg, white 0.075 to 0 |
| | `--portal-pane-shadow` | inset bottom line plus two tight outer shadows |
| | `--portal-radius` | 22px; 16px at 620px and below |
| | `--portal-inset` / `--portal-radius-inner` | 12px / radius minus inset |
| Spacing | `--portal-unit` / `--portal-gap` | 4px / 14px; 10px at 620px and below |
| Motion | `--portal-ease-out` / `--portal-duration` | cubic-bezier(0.22, 1, 0.36, 1) / 360ms; 0ms under reduced motion |
| Focus | `--portal-focus-ring` / `--portal-focus-offset` | 2px solid white 0.8 / 2px, on :focus-visible only |

## Glass recipe
One pane, used by tile, menu, banner and sheet:

```css
border: 1px solid var(--portal-border);
border-radius: var(--portal-radius);
background: var(--portal-pane-sheen), var(--portal-pane-fill);
box-shadow: var(--portal-pane-shadow);
```

The blur lives on the source (the gradient canvas), not on the panes. A single-instance surface such as the Sheet may carry its own `backdrop-filter`, kept under 20px.

## Type
Weight does hierarchy, not colour. Three text tiers, six sizes. Every count sets `font-variant-numeric: tabular-nums`. Inputs are 16px so iOS Safari does not zoom on focus.

## Contrast
Measured with the workspace's contrast.mjs: the shipped pncl preset's brightest stop, then the pane fill, then the sheen, then the text. At fill 0.68 the 0.80 tier holds 4.76:1 and the 0.60 tier 3.45:1. Blur never counts as separation; text always sits on a fill.

## Motion
300 to 420ms on `--portal-ease-out`. Tilt is off on coarse pointers and under `prefers-reduced-motion`; gradient drift and reveal wipes stop under `prefers-reduced-motion` (coarse pointers run the canvas at 20fps, 0.5 dpr). `--portal-duration` drops to 0ms under `prefers-reduced-motion`, so anything on the token needs no second rule.

## Focus
`:focus-visible` only: `outline: var(--portal-focus-ring); outline-offset: var(--portal-focus-offset)`. Never remove an outline without replacing it.

## Primitives
| Primitive | File | Notes |
|---|---|---|
| Sheet | `src/components/portal/Sheet.tsx` | Native `<dialog>` via showModal(). Bottom sheet to 620px (85vh, drag-handle affordance, safe-area padding), 420px right panel from 621px. Closes on Esc, backdrop and a 44px Close. Focus lands on the title. Mount outside PortalBentoStage. |
| Stepper | `src/components/portal/Stepper.tsx` | `<ol>` of 5 steps, done / current / todo, `aria-current="step"`, tabular numerals. Static by default; pass `onSelect` for 44px buttons. |
| Pane | `src/components/portal/Pane.tsx` | The glass card, non-interactive. Wraps a page section. `title` and `aside` render the optional header (20/600 title, quiet aside for a count or a Chip); `as` picks section (default), aside or div; `id` for a skip link. With a title the pane carries `aria-labelledby` and reads as a region. Padding is 16px to 620px and 20px above, and the pane redefines `--portal-radius-inner` to its own outer radius minus that padding, so nested rounded children stay concentric at both widths. |
| ListRow | `src/components/portal/ListRow.tsx` | One 44px row for tile reveals, carrier sheets, script lists and client lists. `label`, optional `secondary` line (body text, so it sits on `--portal-text`, not the 0.60 UI rung) and an 18px `icon` slot. The destination picks the element: `href` on the site renders a router Link, an offsite `href` a new-tab anchor that says so to a screen reader, `download` a same-tab anchor, `onClick` a button, nothing a div. `trailing` defaults to a chevron or an outbound glyph; pass a node to replace it or `null` to drop it. |
| Chip | `src/components/portal/Chip.tsx` | Status tag for the map, tickets and documents. `variant` is active, pending, inactive, licensed, pdf or neutral. One near-black fill for all six, measured at 3.06:1 against the pane, so the border, the text and a leading glyph carry the difference and colour never carries meaning alone: a filled dot for active, a dotted left edge for pending, a ring for licensed, a dash for inactive. |
| EmptyState | `src/components/portal/EmptyState.tsx` | Shown when a list holds nothing. `title`, one `body` line, an optional 22px `icon` and one `action`. Centred on a 36ch measure. Two body lines means the page is explaining too much here. |
| Skeleton | `src/components/portal/Skeleton.tsx` | Loading placeholder, `variant` text / row (44px) / tile, `width` for a ragged shape. Compose several into the layout the real content will take and put `aria-busy` on the container; the blocks are hidden from assistive tech. 1.2s opacity pulse, still a block under `prefers-reduced-motion`. Under 10s loads only. |

Segmented, Field and BottomNav follow in the shell branch.

In a tile reveal `portal-tile.css` drives `.portal-row` from the same rules as the `.ptile-link` it replaced, so the 44px floor, the full width and the concentric radius apply on a page but not in a card menu.

## Mobile rules
| Rule | Number |
|---|---|
| Tap targets | 44x44 CSS px minimum, 8px between adjacent targets |
| Inputs | font-size 16px, correct `autocomplete` and `inputmode` |
| Bottom nav | 3 to 5 tabs; `padding-bottom: env(safe-area-inset-bottom)` on it and on every sticky bar |
| Text on glass | 4.5:1 body, 3:1 large and UI text; back text with a fill |
| backdrop-filter | under 20px, never on multi-instance surfaces |
| Map | pinch needs +/- buttons; hover info reachable by tap; list view first in DOM order |
| Forms | single column, label above field, 2 to 4 inputs per wizard screen, error next to its field, focus the first error on submit |
| Progress | 3 to 7 visible steps; show the 5 stages, not all 31 steps |
| Skeletons | mirror the final layout, only for loads under 10s |
| Motion | `prefers-reduced-motion` kills tilt, gradient drift and reveal wipes |

## Anti-patterns
- Hover-only information. Anything a hover shows must be reachable by tap and keyboard.
- Accent as a field. `--portal-accent` is a spark for urgent states, never a background.
- backdrop-filter on multi-instance surfaces. One source blur beats N receiver blurs.
- Blur as separation. It never counts toward contrast; put a fill behind text.
- Colour as hierarchy. Change the weight or the size before the alpha.
- Dropping the focus ring.
