# Lite-Headless Style Guide

Locked conventions for all new primitives, demo scenes, and the
admin-pro theme built on this library. These are not negotiable
without an explicit reversal.

## CSS

### Hover

ALL `:hover` rules live inside `@media (hover: hover)`. On touch
devices, hover styles cause sticky-state bugs (the "tap and the
hover stays") that confuse users. The container is cheap:

```css
@media (hover: hover) {
    .btn:hover { background: var(--bg-hover); }
    .card:hover { transform: translateY(-2px); }
}
```

NOT:
```css
.btn:hover { ... }   /* WRONG -- touch devices will get sticky hover */
```

### Font sizes — clamp()

Fluid type scales using `clamp(min, fluid, max)`. The fluid term
uses `vw` (viewport width) and a base rem so it scales between the
clamp endpoints. Typical recipe:

```css
--fs-xs:  clamp(0.6875rem, 0.15vw + 0.625rem, 0.75rem);
--fs-sm:  clamp(0.75rem,   0.2vw  + 0.7rem,   0.875rem);
--fs-md:  clamp(0.875rem,  0.25vw + 0.8rem,   1rem);
--fs-lg:  clamp(1rem,      0.35vw + 0.9rem,   1.125rem);
--fs-xl:  clamp(1.125rem,  0.5vw  + 1rem,     1.375rem);
--fs-2xl: clamp(1.375rem,  0.75vw + 1.2rem,   1.75rem);
--fs-3xl: clamp(1.75rem,   1.25vw + 1.4rem,   2.5rem);
```

### Color — OKLCH with hex fallback

OKLCH gives perceptually-uniform color and wider gamut. Older
browsers don't support it. Pattern:

```css
:root {
    /* Hex fallback (sRGB) */
    --primary:    #4070f0;
    --primary-d:  #2d5dd8;
    --primary-l:  #6b8df5;
}
@supports (color: oklch(0 0 0)) {
    :root {
        --primary:    oklch(62% 0.18 260);
        --primary-d:  oklch(54% 0.20 260);
        --primary-l:  oklch(70% 0.15 260);
    }
}
```

Optionally differentiate wide-gamut displays:
```css
@media (color-gamut: p3) {
    :root { --primary: oklch(62% 0.22 260); }   /* more saturated on P3 */
}
```

### Units

| Use                                            | Unit       |
| ---------------------------------------------- | ---------- |
| Spacing, gaps, padding, margin                 | `rem`      |
| Typography (size, line-height)                 | `rem`      |
| Component widths, max-widths                   | `rem`      |
| Container widths (fluid)                       | `%`        |
| Viewport-relative (full-page heroes, modals)   | `dvh`/`dvw`|
| Borders                                        | `px`       |
| Box-shadow blur, drop-shadow                   | `px`       |
| 1-pixel-perfect details (1px-thin lines)       | `px`       |
| Animation distances (small, ≤8px)              | `px`       |
| Everything else fluid                          | `clamp()`  |

`vh` is obsolete — `dvh` (dynamic viewport height) handles mobile
URL bar correctly.

### Modern selectors — abuse them

```css
/* :is() for grouped selectors */
:is(.btn, .input, .select):where(:hover, :focus-visible) { ... }

/* :not() liberally to scope cleanly */
button:not([disabled]):not([aria-disabled="true"]) { ... }
.list-item:not(:last-child) { border-bottom: 1px solid var(--line); }

/* :has() for parent queries (good support in 2026) */
.form:has(:invalid) { border-color: var(--err); }
.card:has(img[data-state="loading"]) { opacity: 0.7; }

/* :where() for zero-specificity utilities */
:where(.reset) * { margin: 0; padding: 0; }
```

### Container queries

For component-driven responsive (the right scale for admin themes):

```css
.card { container-type: inline-size; container-name: card; }
@container card (min-width: 24rem) {
    .card-body { display: grid; grid-template-columns: 1fr 1fr; }
}
@container card (max-width: 18rem) {
    .card-meta { display: none; }
}
```

Container queries override media queries for component scope.
Reserve `@media` for theme-level breakpoints (mobile vs desktop
layout shifts).

### Logical properties

For i18n-ready (RTL support without rewrites):

| Avoid                 | Use                          |
| --------------------- | ---------------------------- |
| `margin-left`         | `margin-inline-start`        |
| `margin-right`        | `margin-inline-end`          |
| `padding-top`/`bottom`| `padding-block`              |
| `left: 0`             | `inset-inline-start: 0`      |
| `text-align: left`    | `text-align: start`          |
| `border-left`         | `border-inline-start`        |

### Tokens

All colors, sizes, timings, easings as CSS custom properties.
Themes are swapped by overriding `:root` tokens. The primitive's
markup never has hardcoded colors.

```css
:root {
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    /* etc */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --dur-fast: 120ms;
    --dur-base: 180ms;
}
```

## JS / Primitives

### Single-file ESM, zero runtime deps

Every primitive is one `index.js` + one `element.js` + `llms.txt`.
No node_modules at runtime. Only peer: `@zakkster/lite-signal`.

### ASCII-only source

Exceptions: × (U+00D7), µ (U+00B5). Box-drawing in comments OK
(─└┌). No emoji in source.

### Reactive accessors

```js
const p = createPrimitive();
p.value();      // accessor, not property
p.setValue(v);  // imperative mutator
```

### One effect per dimension

Each `effect()` reads ONE reactive value. Multi-dim effects pick
up incidental deps from helper calls.

### attach* + return-cleanup pattern

```js
const off = p.attachRoot(el);
// later
off();   // detaches, clears listeners + attributes
```

### Initial paint on attach

Don't rely on the reactive effect for the first paint. The effect
runs once at construction (often with empty refs) and won't
re-fire unless a signal changes. Apply current state inline in
`attachRoot` / `attachItem` / `markItem`.

### node:test, not vitest

`import { test } from "node:test"` + `node:assert/strict`.

### Naming

- Files: kebab-case (`toggle-group/index.js`)
- Functions: camelCase
- Custom elements: kebab-case (`lite-toggle-group`)
- CSS data attrs: kebab-case (`data-pgn-page`)
- Reasons (callback strings): kebab-case (`"label-click"`)

---

Last revised: v0.7.24
