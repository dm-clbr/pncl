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
Measured with the workspace's contrast.mjs: the shipped pncl preset's brightest stop, then the pane fill, then the sheen, then the text. At fill 0.68 the 0.80 tier holds 4.76:1 and the 0.60 tier 3.45:1. Blur never counts as separation; text always sits on a fill. Those are the worst case, the gradient dashboard; any other surface is re-measured against that surface (R27). Every portal page now carries that same gradient (Shell, Backdrop), so those are the pane's figures on every page. The flat `--ink` reading, 13.42:1 at 0.95, 9.94:1 at 0.80 and 6.27:1 at 0.60, is what the pane falls back to on a browser without WebGL2, where the canvas paints nothing and the page's own base shows. Text that sits on no fill is the case to watch: sampled off a 1440x900 frame the backdrop renders no brighter than `rgb(89, 75, 61)`, which holds white 0.62 at 4.40:1 and white 0.80 at 6.09:1, but the preset's brightest stop is `rgb(232, 205, 176)` and a frame that drifts there would take both under 1.5:1. That is why the masthead and the bars take `--portal-bar-fill`, and why the seven runs that had no fill once the backdrop went in now take it too: the sub-page header itself above 620px (below that it is already a sticky bar with the same fill), the page lede under it, the profile details lede, the state map intro, the profile footer, and the two legacy headers on brand assets and the comp agreement. On `--portal-bar-fill` they read white 0.62 = 7.43:1, `--steel` = 9.78:1 and `--bone` = 15.30:1, and 6.57:1, 8.00:1 and 12.52:1 under the sheen's maximum. No text run on a portal page sits on the bare backdrop now; anything added later has to bring its own fill.

## Motion
300 to 420ms on `--portal-ease-out`. Tilt is off on coarse pointers and under `prefers-reduced-motion`; gradient drift and reveal wipes stop under `prefers-reduced-motion` (coarse pointers run the canvas at 20fps, 0.5 dpr). `--portal-duration` drops to 0ms under `prefers-reduced-motion`, so anything on the token needs no second rule.

## Focus
`:focus-visible` only: `outline: var(--portal-focus-ring); outline-offset: var(--portal-focus-offset)`. Never remove an outline without replacing it.

## Primitives
| Primitive | File | Notes |
|---|---|---|
| Sheet | `src/components/portal/Sheet.tsx` | Native `<dialog>` via showModal(). Bottom sheet to 620px (85vh, drag-handle affordance, safe-area padding), 420px right panel from 621px. Closes on Esc, backdrop and a 44px Close. Focus lands on the title. Mount outside PortalBentoStage. |
| Stepper | `src/components/portal/Stepper.tsx` | `<ol>` of 5 steps, done / current / todo, `aria-current="step"`, tabular numerals. Static by default; pass `onSelect` for 44px buttons. `done` takes the 1-based numbers that are complete, for a list whose steps can be finished out of order: training's seven modules each carry their own acknowledgment, so "everything before `current`" would claim completions the agent never made. Without it the old rule stands and every step before `current` reads as done. The label is the caller's to fit: training hides it at 620px and below and leans on the badges, because seven titles cannot read at 10px in a 40px column. |
| Sheet | `src/components/portal/Sheet.tsx` | Native `<dialog>` via showModal(). Bottom sheet to 620px (85vh, drag-handle affordance, safe-area padding), 420px right panel from 621px. Closes on Esc, backdrop, a 44px Close and a swipe down over the drag handle (past 56px; the live offset is skipped under `prefers-reduced-motion`). Focus lands on the title. Mount outside PortalBentoStage. `size="half"` holds the bottom sheet to 40dvh, leaving the surface it explains the other 60%; the default `full` keeps 85vh, and from 621px the side panel ignores both. |
| Stepper | `src/components/portal/Stepper.tsx` | `<ol>` of 5 steps, done / current / todo, `aria-current="step"`, tabular numerals. Static by default; pass `onSelect` for 44px buttons. |
| Pane | `src/components/portal/Pane.tsx` | The glass card, non-interactive. Wraps a page section. `title` and `aside` render the optional header (20/600 title, quiet aside for a count or a Chip); `as` picks section (default), aside or div; `id` for a skip link. With a title the pane carries `aria-labelledby` and reads as a region. Padding is 16px to 620px and 20px above. Concentric corners apply to a child flush against the pane's inner edge, whose radius is the pane's outer radius minus that padding. They do not apply to interior elements: rows, row skeletons, hover and active backgrounds and focus outlines carry their own 8px radius, because the flush figure at 620px is 16px minus 16px = 0, which renders those rows as squares inside a rounded pane. The pane does not publish an inherited `--portal-radius-inner`, since a custom property reaches every descendant rather than only the flush ones. |
| ListRow | `src/components/portal/ListRow.tsx` | One 44px row for tile reveals, carrier sheets, script lists and client lists. `label`, optional `secondary` line (body text, so it sits on `--portal-text`, not the 0.60 UI rung) and an 18px `icon` slot. The destination picks the element: `href` on the site renders a router Link, an offsite `href` a new-tab anchor that says so to a screen reader, `download` a same-tab anchor, `onClick` a button, nothing a div. `trailing` defaults to a chevron or an outbound glyph; pass a node to replace it or `null` to drop it. `current` puts `aria-current="true"` on whichever element the row renders, for the one row the rest of the view is showing. |
| Chip | `src/components/portal/Chip.tsx` | Status tag for the map, tickets and documents. `variant` is active, pending, inactive, licensed, pdf or neutral. One near-black fill for all six, measured at 3.06:1 against the pane, so the border, the text and a leading glyph carry the difference and colour never carries meaning alone: a filled dot for active, a dotted left edge for pending, a ring for licensed, a dash for inactive. |
| EmptyState | `src/components/portal/EmptyState.tsx` | Shown when a list holds nothing. `title`, one `body` line, an optional 22px `icon` and one `action`. Centred on a 36ch measure. Two body lines means the page is explaining too much here. `titleAs` renders the title as an `h2` instead of the default `p`, for the case where the empty state carries its section's only heading: the calendar's connect state is the whole pane, so its title is the heading a screen reader needs. |
| Skeleton | `src/components/portal/Skeleton.tsx` | Loading placeholder, `variant` text / row (44px) / tile, `width` for a ragged shape. Compose several into the layout the real content will take and put `aria-busy` on the container; the blocks are hidden from assistive tech. 1.2s opacity pulse, still a block under `prefers-reduced-motion`. Under 10s loads only. |
| Field | `src/components/portal/Field.tsx` | One labelled control: label above at 13/600, control 44px tall at 16px so iOS Safari does not zoom on focus, 12px of horizontal padding, error under it. `label`, `id`, `hint`, `error` and `required`; with no `children` the remaining props spread onto an `<input>` (type, inputMode, autoComplete, value, onChange, placeholder), and with `children` those same props are forwarded to that control instead, so a native `<select>` or `<textarea>` keeps its own picker and still gets the handlers. Precedence on a child is Field's props, then the child's own, then the wiring (`id`, `aria-describedby`, `aria-invalid`, `required`), which always wins: the label's `htmlFor` is the Field `id`, so a control that brought its own id would leave the label pointing at nothing. The error carries `role="alert"`. `.portal-input`, `.portal-select` and `.portal-textarea` give the same look to markup that is not wrapped in a Field. Controls sit on their own near-black fill: white 0.95 reads 8.88:1 on it and the placeholder's 0.60 reads 4.66:1. Focusing the first error on submit is the form's job. |
| Segmented | `src/components/portal/Segmented.tsx` | Horizontal tabs for the profile, the ICA and W-9 section jumps and the map filters. Items are 44px tall and 8px apart on a recessed track that scrolls sideways on a phone with no scrollbar, fading whichever edge has content behind it and keeping the active item in view. Tab mode is a roving tablist: `role="tab"`, `aria-selected`, one tab in the tab order and Left, Right, Home and End. A `value` matching no item, which a stale `?tab=` in a bookmarked URL produces, leaves index 0 in the tab order; without that fallback every tab is -1 and no key reaches the group. `linkTo(value)` turns the items into router links that keep `?tab=` in the URL, dropping the tab roles for `aria-current="page"`. Active item white 0.95 on a white 0.12 pill, the rest white 0.60, which the darker track holds at 4.66:1. The weight does not change between states: rebolding would re-measure the labels and shift the track. `mode="radiogroup"` (default `"tab"`) swaps the tab roles for `role="radiogroup"` and `role="radio"`/`aria-checked`, for a form choice like the Support ticket type that controls no panel and would otherwise be announced as "tab, selected"; the roving keys and the styling are unchanged. `labelledBy` names the group from a visible label instead of duplicating it in `aria-label`. |
| ListRow | `src/components/portal/ListRow.tsx` | One 44px row for tile reveals, carrier sheets, script lists and client lists. `label`, optional `secondary` line (body text, so it sits on `--portal-text`, not the 0.60 UI rung) and an 18px `icon` slot. The destination picks the element: `href` on the site renders a router Link, an offsite `href` a new-tab anchor that says so to a screen reader, `download` a same-tab anchor, `onClick` a button, nothing a div. `trailing` defaults to a chevron or an outbound glyph; pass a node to replace it or `null` to drop it. |
| Chip | `src/components/portal/Chip.tsx` | Status tag for the map, tickets, documents and a downline row's stage. `variant` is active, pending, inactive, licensed, pdf or neutral. One near-black fill for all six, measured at 3.06:1 against the pane, so the border, the text and a leading glyph carry the difference and colour never carries meaning alone: a filled dot for active, a dotted left edge for pending, a ring for licensed, a dash for inactive. |
| EmptyState | `src/components/portal/EmptyState.tsx` | Shown when a list holds nothing. `title`, one `body` line, an optional 22px `icon` and one `action`. Centred on a 36ch measure. Two body lines means the page is explaining too much here. |
| Skeleton | `src/components/portal/Skeleton.tsx` | Loading placeholder, `variant` text / row (44px) / tile, `width` for a ragged shape. Compose several into the layout the real content will take and put `aria-busy` on the container; the blocks are hidden from assistive tech. 1.2s opacity pulse, still a block under `prefers-reduced-motion`. Under 10s loads only. |
| Field | `src/components/portal/Field.tsx` | One labelled control: label above at 13/600, control 44px tall at 16px so iOS Safari does not zoom on focus, 12px of horizontal padding, error under it. `label`, `id`, `hint`, `error` and `required`; with no `children` the remaining props spread onto an `<input>` (type, inputMode, autoComplete, value, onChange, placeholder), and with `children` those same props are forwarded to that control instead, so a native `<select>` or `<textarea>` keeps its own picker and still gets the handlers. Precedence on a child is Field's props, then the child's own, then the wiring (`id`, `aria-describedby`, `aria-invalid`, `required`), which always wins: the label's `htmlFor` is the Field `id`, so a control that brought its own id would leave the label pointing at nothing. The error carries `role="alert"`. `.portal-input`, `.portal-select` and `.portal-textarea` give the same look to markup that is not wrapped in a Field. The profile's Details tab is the first real caller: it puts `value` and `onChange` on the child control and leaves `id`, `hint` and `required` to Field. `home2.css` carried a legacy `.portal-field` of its own, a `<label>` around bare controls, and its `.home2-page .portal-field input, select` rule at 0-2-1 beat both control classes, taking the text back to 14px and the select arrow away; those four rules were scoped to `label.portal-field` and then deleted, once the referral form (their last caller) moved to the primitive. Controls sit on their own near-black fill: white 0.95 reads 8.88:1 on it and the placeholder's 0.60 reads 4.66:1. Focusing the first error on submit is the form's job. |
| Segmented | `src/components/portal/Segmented.tsx` | Horizontal tabs for the profile, the ICA and W-9 section jumps and the map filters. Items are 44px tall and 8px apart on a recessed track that scrolls sideways on a phone with no scrollbar, fading whichever edge has content behind it and keeping the active item in view. Tab mode is a roving tablist: `role="tab"`, `aria-selected`, one tab in the tab order and Left, Right, Home and End. A `value` matching no item, which a stale `?tab=` in a bookmarked URL produces, leaves index 0 in the tab order; without that fallback every tab is -1 and no key reaches the group. `linkTo(value)` turns the items into router links that keep `?tab=` in the URL, dropping the tab roles for `aria-current="page"`. Active item white 0.95 on a white 0.12 pill, the rest white 0.60, which the darker track holds at 4.66:1. The weight does not change between states: rebolding would re-measure the labels and shift the track. |
| Segmented | `src/components/portal/Segmented.tsx` | Horizontal tabs for the profile, the ICA and W-9 section jumps and the map filters. Items are 44px tall and 8px apart on a recessed track that scrolls sideways on a phone with no scrollbar, fading whichever edge has content behind it and keeping the active item in view. Tab mode is a roving tablist: `role="tab"`, `aria-selected`, one tab in the tab order and Left, Right, Home and End. A `value` matching no item, which a stale `?tab=` in a bookmarked URL produces, leaves index 0 in the tab order; without that fallback every tab is -1 and no key reaches the group. `linkTo(value)` turns the items into router links that keep `?tab=` in the URL, dropping the tab roles for `aria-current="page"`. Active item white 0.95 on a white 0.12 pill, the rest white 0.60, which the darker track holds at 4.66:1. The weight does not change between states: rebolding would re-measure the labels and shift the track. `panelAria(items, value, fallbackLabel)` returns the ARIA a controlled panel should spread: `role="tabpanel"` labelled by the selected item's `id`, or `role="group"` with `fallbackLabel` when `value` matches no item and no tab is therefore selected. |

## Forms with a PDF canvas
The ICA and the W-9 are pdf.js canvases with AcroForm inputs overlaid on them. `src/styles/portal-forms.css` styles the chrome around that canvas and nothing inside it.

| Part | Class | Notes |
|---|---|---|
| Document frame | `.pforms-doc` | The pane recipe. `overflow: clip`, never `hidden`: hidden computes `overflow-y` to auto and makes the frame a scrollport that never scrolls, which stops the pager inside it from ever sticking. |
| Section jumps | `.pforms-jumps` | Segmented in tab mode over the document (Introduction / Signature / Debit-Check, Form / Instructions). The jump items carry `controls`, and the canvas host is their panel on a page a jump owns: 3 of the ICA's 14, 2 of the W-9's 6. On every other page no tab is selected, so `Segmented`'s `panelAria` gives the host `role="group"` and `aria-label="Page n of m"` rather than pointing `aria-labelledby` at a tab that renders `aria-selected="false"` (WCAG 4.1.2). |
| Pager | `.pforms-pager` | Prev, a 16px page-number input, "of n", then the action slot. Sticky at every width, and above the bottom nav at 620px and below: at page-width scale a letter page runs about 1290px tall on a desktop pane, so a pager pinned to the bottom of the frame would sit below the fold. It is a bar over scrolling content, so it takes the solid `--portal-bar-fill`, and `.home2-page:has(.pforms-pager)` switches to `overflow-x: clip` for the same scrollport reason. The pager is chrome for a loaded document and goes away with the loading and error states, but the action slot does not go with it: it moves to a bare `.pforms-pager-actions--bare` row under the frame, because it holds the signing step's Back control and the public onboarding funnel carries no sub-page header, so that button is the only way out of contract step 1. The row collapses on `:empty` for a consumer that passes no actions. |
| Page note | `.pforms-note` | One paragraph of guidance above the document, on the pane recipe so the published text figures apply on both surfaces the signing step renders on: `--portal-text` is white 0.80 over the pane's composited `rgb(105, 94, 82)`, 4.75:1. The ICA's recovery-email warning lives here and not in the sheet, because the email AcroForm field is on page 12 and the sheet does not unlock until page 14. |
| Signing | Sheet | The old right sidebar, minus that warning: acknowledgments and submit only. A "Sign" button in the pager opens it once the viewer reports the last page the agent needs: page 14 for the ICA, page 1 for the W-9, whose remaining five pages are IRS instructions and hold no fields. Both gates run off the same `onPageChange` callback and unlock once. The submit inside it closes the sheet before the unchanged handler runs: a modal `<dialog>` sits in the top layer and a toast cannot paint over it, so a validation message fired from an open sheet would be invisible. |

The sheet sits over its own `rgba(0, 0, 0, 0.55)` `::backdrop`, so its surface composites to `rgb(68, 60, 53)` against the bare pane's `rgb(105, 94, 82)`: white 0.80 reads 7.59:1 there and white 0.60 reads 5.06:1, and an acknowledgment row, which adds `rgba(0, 0, 0, 0.28)`, reads 9.48:1 and 6.04:1. Every sentence in the sheet still takes `--portal-text`; the faint rung stays the 3:1 UI class and never carries body copy.

The pdf.js scroll container takes `max-width: 100%`, `overflow: auto` and `touch-action: pan-x pan-y pinch-zoom`. Bare `pinch-zoom` would let two fingers zoom and stop one finger scrolling, which on a scroll container is worse than no rule at all.

In a tile reveal `portal-tile.css` drives `.portal-row` from the same rules as the `.ptile-link` it replaced, so the 44px floor, the full width and the 8px radius apply on a page but not in a card menu. `.ptile-reveal-body .portal-pane` strips the pane's padding, border, radius, fill and shadow for the same reason: the card is already the glass surface, and PortalReferralPanel renders one Pane for both the dashboard reveal and the profile's Team tab, where the pane IS the surface.

The profile's Licensing and Documents tabs add one page-level pattern rather than a primitive: `.portal-dropzone` in `portal-profile.css`, a `<label>` whose `<input type="file">` covers it at zero opacity. A file input is already a drop target, so the drag, the tap and the native picker all work without a drag handler, the label's copy names the control, and the ring goes on the zone through `:focus-within`. The chosen file reads back as a Chip under the zone, never as colour alone.

The Carrier logins tab adds the second page-level pattern: two surfaces for one list, swapped at 620px by `display` alone. Below that width each carrier is a ListRow carrying the name and the writing number, and a tap opens the Sheet. Above it the table returns with 44px rows, its cell padding horizontal only so a 44px control fills a row rather than adding to it. One surface is displayed at a time, so assistive tech meets a single list. The Sheet is the editor at both widths, since the primitive is already a bottom sheet on a phone and a 420px right panel on a desktop. The password is masked in both places, and a reveal button sits beside it. The table cell masks it with a fixed eight dots, so the cell never reports the real length, and hides them from assistive tech because the reveal button's own label carries the state; the Sheet uses a native password input, which masks per character the way every password field does. The three fields take `autocomplete="off"`, because a carrier login is not the agent's own login and a browser password manager should not capture it.

## State map canvas
`src/components/StateAvailabilityCanvas.tsx` paints the Three.js map. It keeps
its own three fills rather than the swatches in `STATE_AVAILABILITY_META`, which
sit at 1.48:1 between Active and Pending and 2.31:1 between Active and Inactive:
a viewer with red-green colour blindness reads those as one colour. Each fill
here clears 3:1 against the other two, and a second channel repeats the meaning.

| Encoding | Value | Measured |
|---|---|---|
| Active fill | `#27865a` | 3.32:1 against Inactive |
| Pending fill | `#fbdf9d` under a diagonal hatch in `#7a5c14` | 3.48:1 against Active; the hatch 4.79:1 on its own fill |
| Inactive fill | `#212730` | 11.55:1 against Pending |
| Licensed | a cream ring inside a near-black halo at the state centre | the cream ring alone reads 1.14:1 on the Pending fill, the halo 14.31:1 |
| Edge | `#171a20` at 0.85 on a bright fill, `#f4f0df` at 0.55 on a dark one | 3.30:1 on Active, 5.02:1 on Inactive |

One ring colour and one edge colour cannot serve all three fills. The fills sit
more than 3:1 apart, so any single tone lands inside 3:1 of one of them. The ring
carries two bands and the edge colour follows the fill it draws.

Layout (`src/styles/portal-state-map.css`): the directory is first in the DOM
and the map is put back above it with flex `order`, so a screen reader and a
keyboard reach all 51 states before the canvas neither can use. The legend is
four filter chips carrying the counts, each a 44px button with `aria-pressed`.
Pressing one fades the other statuses on the canvas to 0.2 through the `filter`
prop and filters the directory at the same time, so the map is never the only
place the filter shows. Pressed is a white ring, because the four chips already
differ by colour. The detail is a right Pane from 621px and a `size="half"`
Sheet below it, opened by a pick and never by the selection the page makes on
load. On a phone the canvas box is 60dvh and pinned to the top of the board,
and the page intro is hidden while the sheet is open, so the 60/40 split holds
wherever the directory was scrolled to when the pick was made. The camera fits
the atlas to the narrower axis, so the taller box letterboxes the map rather
than enlarging it, and the pinned card is opaque so the rows cannot read
through it. `matchesFilter` in `src/components/portal/state-map-filter.ts` is
the single predicate behind the canvas dim and the directory list; it lives
outside the canvas module because that module is lazy-loaded.

Interaction: `pointerdown` selects on any pointer type, and the hover highlight
runs under `(pointer: fine)` alone. The +/- and reset buttons are the
single-pointer alternative to a pinch (WCAG 2.5.1), 44px, top right of the canvas
and bottom right at 640px and below, which is this page's own breakpoint. Zoom is
one orthographic number from 1 to 4 in 1.4 steps; a zoomed camera centres on the
selected state and stops at the map's edge, which is why the map needs no drag.
Nothing runs on a loop: each frame is asked for, an off-screen canvas
(IntersectionObserver) or a hidden document drops the ask and replays it once on
return, and the pixel ratio is 1 under `(pointer: coarse)`.

### Direct deposit

The third form carries no canvas. `.pforms-dd-col` holds the loading pane, the submitted pane, the form and the "About this form" aside in one 560px column, which stops a five-character ZIP field short of the 1320px wrap. Inside it the controls are a single stack of Field, one per row at every width, with `inputmode="numeric"` and no `autocomplete` on the account and routing numbers. The checking and savings pair and the authorization line take `.pforms-ack` rows, the same 44px target the signing sheet uses, inside a `<fieldset>` whose legend names the group.

`.pforms-submit-bar` shares the pager's sticky recipe, its `overflow-x: clip` on the page wrapper and its lift above the bottom nav at 620px and below. `validatePortalDirectDepositForm` returns one message for the whole form and `src/lib` is read-only, so the page maps that message back to a control id by prefix and moves focus there. Every control carries `required`, so the browser catches an empty field before that runs and only a format error reaches the mapping.

## Shell
The portal carries one backdrop, one header, one nav and one sub-page header. 620px is the only breakpoint: above it the nav is text links in the masthead, below it a fixed tab bar in the thumb zone.

| Surface | File | Above 620px | 620px and below |
|---|---|---|---|
| Backdrop | `src/components/portal/PortalBackground.tsx` | The liquid gradient behind every pane: `LIQUID_GRADIENT_PRESETS.pncl` at 30fps and dpr 1, `blur(32px)` and `scale(1.16)`. | Same layer at 20fps and dpr 0.5, `blur(16px)`. The pointer type is read once in a `useState` initializer, because it does not change while the page is open. |
| Header | `src/components/portal/PortalHeader.tsx` | Logo, "Employee Portal", stage badge, profile chip right (name, email, avatar) | 56px bar: logo left, avatar right. The title stays in the DOM for assistive tech, the stage moves to the progress strip under it, the name and the email to the profile page. Props only, no hooks. `subpage` renders the title as a `<p>` instead of the `<h1>`, for a page that also carries PortalSubpageHeader: that header holds the page's h1, and two h1s on one page leave assistive tech with no single page title. |
| Primary nav | `src/components/PortalPrimaryNav.tsx` | Dashboard, Calendar, State Map text links | Hidden. |
| Bottom nav | `src/components/portal/BottomNav.tsx` | Hidden. | `position: fixed` tab bar: Dashboard, Calendar, State Map, Profile. 56px plus `env(safe-area-inset-bottom)`, items 44px minimum with a 20px icon over an 11px label, active white 0.95 and `aria-current="page"`, rest white 0.52. |
| Sub-page header | `src/components/portal/PortalSubpageHeader.tsx` | Breadcrumb back link over the title, `aside` slot right | 44px sticky bar: back chevron, title, aside. The back label stays in the DOM, hidden visually. |
| Footer | the page | Admin console, sign out, socials | Same, above the bar. Never in the bottom nav. An agent hits that bar with a thumb by accident, and sign out costs them the session. The markup and the `.portal-bento-footer` classes are the dashboard's; a page repeats them rather than importing another page. |

Mount `<PortalBackground />` as the first child of the page wrapper on every portal page. PortalDashboard and PortalAuthLayout carry their own canvas and must not gain a second. The canvas pauses itself offscreen, on a hidden tab and under `prefers-reduced-motion`, where it draws one frame and holds, and `fallbackColor="transparent"` leaves the page's own dark base showing when WebGL2 is unavailable. Two canvases on one page do not fight: the state map's Three.js atlas renders beside it at both widths.

Mounting it is not enough, and this trap was hit once already, in prototyping. A portal page paints an opaque fill over the fixed layer twice over, from `.home2-page:has(.portal-dash)` on the wrapper and `.home2-page .portal-dash` on `<main>`, both in `home2.css`, so the canvas renders into a layer nobody can see. `portal-shell.css` lets it through: `.home2-page:has(> .portal-backdrop)` keeps the dark base, and `.home2-page:has(> .portal-backdrop) > main` goes transparent and takes `position: relative; z-index: 1`. The position is not decoration; `z-index` applies to positioned boxes only, and the selector needs its trailing element to clear `.home2-page .portal-dash` at 0-2-0. Only `<main>` is raised: `.grain` and `.portal-bottom-nav` are already fixed with their own `z-index`, and `position: relative` would break both. Verify a page by screenshot, never by reading the CSS. Fourteen pages carry it; `src/components/portal/PortalBackground.test.tsx` scans every `Portal*.tsx` with a `home2-page` wrapper and fails if one lacks the mount or has it anywhere but first, so a new page cannot ship flat.

Letting the gradient through also moves every fill-less text run off the flat `--ink` and onto a live canvas, which is the second half of the same trap. See Contrast: the five runs that had no fill now take `--portal-bar-fill` from the same block in `portal-shell.css`. A new run that sits directly on the page wrapper needs one too.

`--portal-bar-fill` (`rgb(28, 22, 17)`, the pane fill colour made solid) backs all three shell surfaces. A fixed or sticky bar sits over scrolling content, so the translucent pane fill would let whatever scrolled under it set the contrast. On the solid fill white 0.95 reads 16.20:1 and the tab bar's white 0.52 label 5.58:1; under the sheen's maximum they are 13.36:1 and 5.08:1, so the quiet tab clears 4.5:1 across the whole bar. The 0.52 is declared on `.portal-bottom-nav`, the container, not on the item, for the reason in the last bullet below. Declared on the item it never reached the glyphs, so the figure described a colour nobody could see.

The masthead takes the same fill. It scrolls rather than sticks, but it sits over the gradient's brightest region: the wall light is anchored at 16% 4%, top left, under the logo and the title. Measured on the bare backdrop (pncl brightest stop `rgb(232, 205, 176)`) white reads 1.49:1 at 0.95, 1.41:1 at 0.80 and 1.30:1 at 0.60, all three below every threshold. On `--portal-bar-fill` under the sheen the same tiers read 13.36:1, 9.90:1 and 6.25:1. Padding is 12px 16px, matching the `.pbanner` that sits directly under it.

Where the two bars mount decides whether they hold position at all:
- Mount BottomNav outside `PortalBentoStage` and outside the page's `<main>`. `preserve-3d` is a containing block for `position: fixed`, and `.portal-bento > *` would pull the bar into the page's stacking context.
- A page carrying the bar ends above it: `padding-bottom: calc(56px + env(safe-area-inset-bottom) + 16px)` at 620px and below, applied through `.home2-page:has(> .portal-bottom-nav) > main`.
- `.home2-page` carries `overflow-x: hidden`, which computes `overflow-y` to `auto` and makes it a scrollport that never scrolls, so a sticky descendant never sticks. Switch the wrapper to `overflow-x: clip` for every `position: sticky` you put under it, which gives the same horizontal containment without the scroll container. Scope it with `:has()` to that element and to the widths where it sticks, so the marketing pages keep theirs. Shipped: `.home2-page:has(.portal-subhead)` at 620px and below (`portal-shell.css`), `.home2-page:has(.pcl-rail)` from 1100px (`portal-bento.css`) and `.home2-page:has(.pcal-day-head)` at every width (`portal-calendar.css`), whose agenda day headers stick on a phone and on a desktop alike. Add the rule in the same commit as the sticky.
- `.home2-page a { color: inherit; text-decoration: none }` is specificity 0-1-1, so it beats any bare single class on an `<a>`: a `.portal-*` link never gets its own declared colour, it takes the page's. That is `--ink` (near black) on the dashboard, which on a dark bar renders the link invisible, and `--bone` on a page still carrying `portal-dash`. Either declare the colour on the element's container and let `inherit` resolve to it, which is what `.portal-bottom-nav` does, or take the selector past 0-1-1, which is what `.portal-bottom-nav-item.active` does at 0-2-0. `.portal-header-logo`, `.portal-subhead-back` and `.portal-segment` in link mode still inherit; they land legible today, but their own `color` lines are not what renders.
- `.home2-page` carries `overflow-x: hidden`, which computes `overflow-y` to `auto` and makes it a scrollport that never scrolls, so a sticky descendant never sticks. Switch the wrapper to `overflow-x: clip` for every `position: sticky` you put under it, which gives the same horizontal containment without the scroll container. Scope it with `:has()` to that element and to the widths where it sticks, so the marketing pages keep theirs. Shipped: `.home2-page:has(.portal-subhead)` at 620px and below (`portal-shell.css`) and `.home2-page:has(.pcl-rail)` from 1100px (`portal-bento.css`). Add the rule in the same commit as the sticky.
- `.home2-page a { color: inherit; text-decoration: none }` is specificity 0-1-1, so it beats any bare single class on an `<a>`: a `.portal-*` link never gets its own declared colour, it takes the page's. That is `--ink` (near black) on the dashboard, which on a dark bar renders the link invisible, and `--bone` on a page still carrying `portal-dash`. Either declare the colour on the element's container and let `inherit` resolve to it, which is what `.portal-bottom-nav` does, or take the selector past 0-1-1, which is what `.portal-bottom-nav-item.active` does at 0-2-0. `.portal-header-logo`, `.portal-subhead-back` and `.portal-segment` in link mode still inherit; they land legible today, but their own `color` lines are not what renders. A ListRow with an `href` hits the same rule and renders one tier below the button and plain rows beside it, so the tools pages restore it from `portal-tools.css` at 0-2-1 (`.ptools-page a.portal-row`).

## Auth screens
The five routes an agent reaches without a session (login, set password, confirm email, activate, onboarding handoff) share `src/components/portal/PortalAuthLayout.tsx`: the dashboard's gradient canvas behind one centred Pane on a 440px measure, styles in `src/styles/portal-auth.css`. The logo and the help link sit inside the pane rather than above it, because white on the bare backdrop measures 1.49:1 and the pane is the only fill on the page. At most two Fields, one filled action, buttons full width at 44px, inputs at 16px. The set-password form carries a hidden `autocomplete="username"` input beside the new password, which is what Chrome and the password managers ask for in the console. Tailwind's preflight clears `list-style`, so the numbered instructions declare their own markers and stay in block flow: a flex item is not a list item and drops its numeral.
- `.home2-page` carries `overflow-x: hidden`, which computes `overflow-y` to `auto` and makes it a scrollport that never scrolls, so a sticky descendant never sticks. Switch the wrapper to `overflow-x: clip` for every `position: sticky` you put under it, which gives the same horizontal containment without the scroll container. Scope it with `:has()` to that element and to the widths where it sticks, so the marketing pages keep theirs. Shipped: `.home2-page:has(.portal-subhead)` at 620px and below (`portal-shell.css`), `.home2-page:has(.pcl-rail)` from 1100px (`portal-bento.css`) and `.home2-page:has(.portal-profile-savebar)` at every width (`portal-profile.css`). Add the rule in the same commit as the sticky.
- `.home2-page a { color: inherit; text-decoration: none }` is specificity 0-1-1, so it beats any bare single class on an `<a>`: a `.portal-*` link never gets its own declared colour, it takes the page's. That is `--ink` (near black) on the dashboard, which on a dark bar renders the link invisible, and `--bone` on a page still carrying `portal-dash`. Either declare the colour on the element's container and let `inherit` resolve to it, which is what `.portal-bottom-nav` and the profile's `.portal-profile-foot` do, or take the selector past 0-1-1, which is what `.portal-bottom-nav-item.active` does at 0-2-0. `.portal-header-logo`, `.portal-subhead-back` and `.portal-segment` in link mode still inherit; they land legible today, but their own `color` lines are not what renders.

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
