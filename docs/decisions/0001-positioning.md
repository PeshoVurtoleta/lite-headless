# ADR 0001: Positioning engine strategy

- Status: Accepted
- Date: 2026-08-31
- Scope: tooltip, popover, combobox, menu (the four anchored overlays that
  drive `_overlay/position`)

## Context

@zakkster/lite-headless ships a hand-rolled positioner (`src/_overlay/position.js`)
that covers ~95% of anchored-overlay needs: 12 placements, flip, shift, arrow,
clipping-ancestor boundaries, and a zero-allocation `autoUpdate` tick. Its
`getRect` / `getViewport` are injectable, which is what lets the happy-dom test
suite assert EXACT pixel coordinates without a real layout engine.

Separately, the suite already depends (optionally) on @zakkster/lite-floating,
a signal-native Floating-UI port used today only by hover-card. The question
for H5: should the four overlays migrate onto lite-floating, or stay on the
built-in engine, or gain a seam so a consumer can choose?

## Options

### A. MIGRATE -- replace the built-in engine with lite-floating everywhere

Rejected (blocked). lite-floating reads measurements directly from the DOM
(`getBoundingClientRect`, `window.innerWidth`/`innerHeight`) with no
measurement-injection surface. The four overlays' test contracts assert
exact pixel output under happy-dom, which has no real layout; those tests can
only pass because the built-in engine lets the harness inject synthetic rects
and a synthetic viewport. Migrating would force every one of those tests to be
rewritten against a real browser (Playwright), trading a fast, deterministic,
exact-pixel unit contract for a slow, environment-dependent one. lite-floating
exposes no hook to make this lossless today.

### B. INJECT -- keep the built-in engine as the default, add a pluggable seam

Chosen. A new `positioner?: (spec) => { update, autoUpdate, destroy }` option
on the four factories defaults to the internal `createPositioner`. The engine
is resolved ONCE at construction, so the default path keeps its exact code
shape: no new per-tick branch, no added allocation, no polymorphism on the hot
`autoUpdate` tick (the plug lives at the per-open call site, not inside
`update()`). An opt-in subpath, `@zakkster/lite-headless/floating-adapter`,
wraps lite-floating behind the identical spec signature and the identical
identity placement vocabulary. This is additive: no version bump, no new
required peer (lite-floating stays an optional peer), and no test rewrite --
the exact-pixel contracts keep running on the default engine.

### C. STATUS QUO -- do nothing

Rejected. It leaves consumers who already run lite-floating elsewhere (e.g. via
hover-card) unable to unify on one positioning engine, and forces them to
maintain two placement mental models. The cost of the seam (option B) is small
and its blast radius is zero on the default path, so "do nothing" wins nothing.

## Consequences

- The built-in engine remains the tested, exact-pixel default. No regression
  risk to the four overlays' existing contracts.
- Consumers can pass `createFloatingPositioner()` to route placement through
  lite-floating and its richer autoUpdate (ResizeObserver + capturing scroll +
  layout-shift IO), at the cost of adding lite-floating as a real dependency in
  their app.
- The adapter fails closed on an element `boundary` (lite-floating clamps to
  the viewport and offers no element-boundary surface) rather than silently
  coercing the request; the throw fires when the positioner runs at open, and
  re-fires on every open.
- The seam is validated once at construction (`checkPositioner`) and the
  returned handle is checked at first open (`checkPositionerHandle`), so a
  malformed custom engine surfaces immediately, not deep inside an open cycle.
- Two engines now exist behind one option. The adapter is thin and its
  divergences (viewport-only boundary, arrow paints `data-side` only) are
  documented in `src/floating-adapter.js`.

## Revisit trigger

Reconsider option A only at 2.0.0, and only after lite-floating ships a
measurement-injection surface (test rect + viewport injection) that lets the
exact-pixel happy-dom contracts pass without a real browser. Until both of
those hold, option B stands.
