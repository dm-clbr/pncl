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
| Pane | `src/components/portal/Pane.tsx` | The glass card, non-interactive. Wraps a page section. `title` and `aside` render the optional header (20/600 title, quiet aside for a count or a Chip); `as` picks section (default), aside or div; `id` for a skip link. With a title the pane carries `aria-labelledby` and reads as a region. Padding is 16px to 620px and 20px above. Concentric corners apply to a child flush against the pane's inner edge, whose radius is the pane's outer radius minus that padding. They do not apply to interior elements: rows, row skeletons, hover and active backgrounds and focus outlines carry their own 8px radius, because the flush figure at 620px is 16px minus 16px = 0, which renders those rows as squares inside a rounded pane. The pane does not publish an inherited `--portal-radius-inner`, since a custom property reaches every descendant rather than only the flush ones. |
| ListRow | `src/components/portal/ListRow.tsx` | One 44px row for tile reveals, carrier sheets, script lists and client lists. `label`, optional `secondary` line (body text, so it sits on `--portal-text`, not the 0.60 UI rung) and an 18px `icon` slot. The destination picks the element: `href` on the site renders a router Link, an offsite `href` a new-tab anchor that says so to a screen reader, `download` a same-tab anchor, `onClick` a button, nothing a div. `trailing` defaults to a chevron or an outbound glyph; pass a node to replace it or `null` to drop it. |
| Chip | `src/components/portal/Chip.tsx` | Status tag for the map, tickets and documents. `variant` is active, pending, inactive, licensed, pdf or neutral. One near-black fill for all six, measured at 3.06:1 against the pane, so the border, the text and a leading glyph carry the difference and colour never carries meaning alone: a filled dot for active, a dotted left edge for pending, a ring for licensed, a dash for inactive. |
| EmptyState | `src/components/portal/EmptyState.tsx` | Shown when a list holds nothing. `title`, one `body` line, an optional 22px `icon` and one `action`. Centred on a 36ch measure. Two body lines means the page is explaining too much here. `titleAs` renders the title as an `h2` instead of the default `p`, for the case where the empty state carries its section's only heading: the calendar's connect state is the whole pane, so its title is the heading a screen reader needs. |
| Skeleton | `src/components/portal/Skeleton.tsx` | Loading placeholder, `variant` text / row (44px) / tile, `width` for a ragged shape. Compose several into the layout the real content will take and put `aria-busy` on the container; the blocks are hidden from assistive tech. 1.2s opacity pulse, still a block under `prefers-reduced-motion`. Under 10s loads only. |
| Field | `src/components/portal/Field.tsx` | One labelled control: label above at 13/600, control 44px tall at 16px so iOS Safari does not zoom on focus, 12px of horizontal padding, error under it. `label`, `id`, `hint`, `error` and `required`; with no `children` the remaining props spread onto an `<input>` (type, inputMode, autoComplete, value, onChange, placeholder), and with `children` those same props are forwarded to that control instead, so a native `<select>` or `<textarea>` keeps its own picker and still gets the handlers. Precedence on a child is Field's props, then the child's own, then the wiring (`id`, `aria-describedby`, `aria-invalid`, `required`), which always wins: the label's `htmlFor` is the Field `id`, so a control that brought its own id would leave the label pointing at nothing. The error carries `role="alert"`. `.portal-input`, `.portal-select` and `.portal-textarea` give the same look to markup that is not wrapped in a Field. Controls sit on their own near-black fill: white 0.95 reads 8.88:1 on it and the placeholder's 0.60 reads 4.66:1. Focusing the first error on submit is the form's job. |
| Segmented | `src/components/portal/Segmented.tsx` | Horizontal tabs for the profile, the ICA and W-9 section jumps and the map filters. Items are 44px tall and 8px apart on a recessed track that scrolls sideways on a phone with no scrollbar, fading whichever edge has content behind it and keeping the active item in view. Tab mode is a roving tablist: `role="tab"`, `aria-selected`, one tab in the tab order and Left, Right, Home and End. A `value` matching no item, which a stale `?tab=` in a bookmarked URL produces, leaves index 0 in the tab order; without that fallback every tab is -1 and no key reaches the group. `linkTo(value)` turns the items into router links that keep `?tab=` in the URL, dropping the tab roles for `aria-current="page"`. Active item white 0.95 on a white 0.12 pill, the rest white 0.60, which the darker track holds at 4.66:1. The weight does not change between states: rebolding would re-measure the labels and shift the track. |

In a tile reveal `portal-tile.css` drives `.portal-row` from the same rules as the `.ptile-link` it replaced, so the 44px floor, the full width and the 8px radius apply on a page but not in a card menu.

## Shell
The portal carries one header, one nav and one sub-page header. 620px is the only breakpoint: above it the nav is text links in the masthead, below it a fixed tab bar in the thumb zone.

| Surface | File | Above 620px | 620px and below |
|---|---|---|---|
| Header | `src/components/portal/PortalHeader.tsx` | Logo, "Employee Portal", stage badge, profile chip right (name, email, avatar) | 56px bar: logo left, avatar right. The h1 stays in the DOM for assistive tech, the stage moves to the progress strip under it, the name and the email to the profile page. Props only, no hooks. |
| Primary nav | `src/components/PortalPrimaryNav.tsx` | Dashboard, Calendar, State Map text links | Hidden. |
| Bottom nav | `src/components/portal/BottomNav.tsx` | Hidden. | `position: fixed` tab bar: Dashboard, Calendar, State Map, Profile. 56px plus `env(safe-area-inset-bottom)`, items 44px minimum with a 20px icon over an 11px label, active white 0.95 and `aria-current="page"`, rest white 0.52. |
| Sub-page header | `src/components/portal/PortalSubpageHeader.tsx` | Breadcrumb back link over the title, `aside` slot right | 44px sticky bar: back chevron, title, aside. The back label stays in the DOM, hidden visually. |
| Footer | the page | Admin console, sign out, socials | Same, above the bar. Never in the bottom nav. An agent hits that bar with a thumb by accident, and sign out costs them the session. |

`--portal-bar-fill` (`rgb(28, 22, 17)`, the pane fill colour made solid) backs all three shell surfaces. A fixed or sticky bar sits over scrolling content, so the translucent pane fill would let whatever scrolled under it set the contrast. On the solid fill white 0.95 reads 16.20:1 and the tab bar's white 0.52 label 5.58:1; under the sheen's maximum they are 13.36:1 and 5.08:1, so the quiet tab clears 4.5:1 across the whole bar. The 0.52 is declared on `.portal-bottom-nav`, the container, not on the item, for the reason in the last bullet below. Declared on the item it never reached the glyphs, so the figure described a colour nobody could see.

The masthead takes the same fill. It scrolls rather than sticks, but it sits over the gradient's brightest region: the wall light is anchored at 16% 4%, top left, under the logo and the title. Measured on the bare backdrop (pncl brightest stop `rgb(232, 205, 176)`) white reads 1.49:1 at 0.95, 1.41:1 at 0.80 and 1.30:1 at 0.60, all three below every threshold. On `--portal-bar-fill` under the sheen the same tiers read 13.36:1, 9.90:1 and 6.25:1. Padding is 12px 16px, matching the `.pbanner` that sits directly under it.

Where the two bars mount decides whether they hold position at all:
- Mount BottomNav outside `PortalBentoStage` and outside the page's `<main>`. `preserve-3d` is a containing block for `position: fixed`, and `.portal-bento > *` would pull the bar into the page's stacking context.
- A page carrying the bar ends above it: `padding-bottom: calc(56px + env(safe-area-inset-bottom) + 16px)` at 620px and below, applied through `.home2-page:has(> .portal-bottom-nav) > main`.
- `.home2-page` carries `overflow-x: hidden`, which computes `overflow-y` to `auto` and makes it a scrollport that never scrolls, so a sticky descendant never sticks. Switch the wrapper to `overflow-x: clip` for every `position: sticky` you put under it, which gives the same horizontal containment without the scroll container. Scope it with `:has()` to that element and to the widths where it sticks, so the marketing pages keep theirs. Shipped: `.home2-page:has(.portal-subhead)` at 620px and below (`portal-shell.css`), `.home2-page:has(.pcl-rail)` from 1100px (`portal-bento.css`) and `.home2-page:has(.pcal-day-head)` at every width (`portal-calendar.css`), whose agenda day headers stick on a phone and on a desktop alike. Add the rule in the same commit as the sticky.
- `.home2-page a { color: inherit; text-decoration: none }` is specificity 0-1-1, so it beats any bare single class on an `<a>`: a `.portal-*` link never gets its own declared colour, it takes the page's. That is `--ink` (near black) on the dashboard, which on a dark bar renders the link invisible, and `--bone` on a page still carrying `portal-dash`. Either declare the colour on the element's container and let `inherit` resolve to it, which is what `.portal-bottom-nav` does, or take the selector past 0-1-1, which is what `.portal-bottom-nav-item.active` does at 0-2-0. `.portal-header-logo`, `.portal-subhead-back` and `.portal-segment` in link mode still inherit; they land legible today, but their own `color` lines are not what renders.

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
