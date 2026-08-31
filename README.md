# @zakkster/lite-headless

> 58 headless UI primitives on signal-based reactivity. Overlays (dialog, alert-dialog, popover, tooltip, hover-card, menu, combobox, command-palette, toast, drawer, tour) share one composition core; form controls and data/display primitives live alongside. Each primitive ships an optional `<lite-*>` custom element. Framework-agnostic, tree-shakable, zero runtime deps, 1573 tests, MIT.

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-headless.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-headless)
[![sponsor](https://img.shields.io/badge/sponsor-PeshoVurtoleta-ea4aaa.svg?logo=github)](https://github.com/sponsors/PeshoVurtoleta)
![Headless](https://img.shields.io/badge/Headless-No%20CSS-00C853?style=for-the-badge&logo=tailwindcss&logoColor=white)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@zakkster/lite-headless?style=for-the-badge)](https://bundlephobia.com/result?p=@zakkster/lite-headless)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-headless?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-headless)
[![npm total downloads](https://img.shields.io/npm/dt/@zakkster/lite-headless?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-headless)
[![lite-signal peer](https://img.shields.io/badge/peer-lite--signal-blue?style=for-the-badge)](https://github.com/PeshoVurtoleta/lite-signal)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

## The headless layer the ecosystem was missing

`lite-headless` is the behavior tier of the `@zakkster` UI stack. Radix and Headless UI solve this problem but bind you to React; the framework-agnostic options (Floating UI, Tippy) each cover one slice. This package covers the whole surface -- 58 ARIA-correct primitives, from `dialog` to `datepicker` to `tree` -- with no framework, no CSS, no runtime dependency, and no allocation on the hot paths that matter (slider drag, positioner reflow). The reactive glue is one required peer, `@zakkster/lite-signal`; the signal IS the state, so React, Vue, Svelte, Solid, and vanilla all pay the same cost: zero.

```bash
npm install @zakkster/lite-headless @zakkster/lite-signal
```

```js
import { createDialog } from "@zakkster/lite-headless/dialog";

const dialog = createDialog({ modal: true, closeOnEscape: true });
dialog.attachTrigger(document.querySelector("#open-btn"));
dialog.attachContent(document.querySelector("#dialog"));

// Drive entry/exit animations from a signal:
dialog.status.subscribe((s) => {
    panel.dataset.state = s;   // "closed" | "opening" | "open" | "closing"
});

dialog.setOpen(true, "api");
```

Each primitive is a single subpath (`@zakkster/lite-headless/dialog`), carries its own `llms.txt` (options, API, painted-attribute contract), and ships an optional `<lite-{name}>` custom element from `@zakkster/lite-headless/{name}/element` (that layer alone needs the `@zakkster/lite-element` peer). Import only what you use; the shared composition core rides along with the overlay primitives you actually import.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [The composition core](#the-composition-core)
- [API reference](#api-reference)
- [Composability](#composability)
- [Zero-GC design notes](#zero-gc-design-notes)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Testing](#testing)
- [What this is not](#what-this-is-not)
- [Ecosystem](#ecosystem)
- [License](#license)

---

## Why this exists

Overlay primitives -- dialog, popover, tooltip, combobox, menu -- are the most-rewritten UI components in the industry. Every team writes them; almost every team writes them wrong. The ARIA contract is dense, the focus management is fiddly, the positioning math has corners, and the dismiss model has races that bite in production. The same is true one tier down: a date picker's keyboard grid, a slider's crossing constraints, a tree's roving focus.

The headless model -- primitive logic, consumer styling -- solves the styling tax. `lite-headless` was built under three constraints at once:

1. **Framework-agnostic without a wrapper tax.** State hooks into any model via `@zakkster/lite-signal`. React, Vue, Svelte, Solid, vanilla -- the signal IS the state, so no adapter duplicates the logic.
2. **Synchronous, predictable state transitions.** No microtask scheduling, no debounce on open. When `setOpen(true)` returns, the surface is portaled, ARIA is set, focus has moved -- same call stack, debuggable, no `act()` wrapper in tests.
3. **One composition core, many primitives.** The `_overlay/` layer (core state machine, positioner, dismiss, focus, portal, ARIA, scroll-lock, roving focus) is shared. Adding a new overlay is composition, not a rewrite.

No promise between `setOpen` and the DOM mutations. No `queueMicrotask`. No scheduler queue. Just call stack.

---

## What you get

**58 primitives**, each a single subpath under `@zakkster/lite-headless`, each with its own `llms.txt` and an optional `<lite-{name}>` custom element. Four groups:

- **Overlays** (11, share `_overlay/`): dialog, alert-dialog, popover, tooltip, hover-card, menu, combobox, command-palette, toast, drawer, tour.
- **Form controls** (13): button, slider, switch, rating, pin-input, tag-input, file-upload, color-picker, datepicker, stepper, inline-edit, form-field, password-input.
- **Data / display** (25): tabs, accordion, tree, pagination, carousel, calendar, kanban, sortable, timeline, descriptions, stat, meter, progress, skeleton, breadcrumb, badge, tag, avatar, card, banner, result, empty-state, separator, clipboard, notification-center.
- **Layout / util** (9): affix, anchor, backtop, split-panels, toolbar, toggle-group, steps, radio-group, picture.

`hover-card` is positioned by [`@zakkster/lite-floating`](https://www.npmjs.com/package/@zakkster/lite-floating) (its `autoUpdate` pulls in [`@zakkster/lite-observe`](https://www.npmjs.com/package/@zakkster/lite-observe) transitively); both are **optional** peers, needed only for `hover-card`. The other overlays use the in-house `_overlay/position` positioner. `alert-dialog` reuses the dialog contract verbatim (`role="alertdialog"`, always modal, no backdrop-dismiss by default).

The CSS contract is documented in [`docs/CSS_CONTRACT.md`](./docs/CSS_CONTRACT.md) (hand-curated taxonomy) and [`docs/CSS_CONTRACT_APPENDIX.md`](./docs/CSS_CONTRACT_APPENDIX.md) (per-primitive, auto-generated from source). Across the 58 primitives that is 201 distinct `data-*` attributes, 31 distinct `aria-*` attributes, and 23 CSS custom properties -- the entire styling surface, enumerated.

Zero runtime dependencies ship in the published package. The peer split lets a framework adapter wire its own state primitive into the same logic without duplicating it. Signal-driven, framework-free, tree-shakable. No scheduler queue, no microtask deferral, no styling assumptions.

---

## The composition core

<details>
<summary>Why small layers beat one base class; the _overlay layer map with measured sizes.</summary>

A traditional headless library defines a base `Overlay` class with hooks for positioning, dismissal, focus, portal, and ARIA; each primitive extends or configures it. That looks clean until you actually need composition: a combobox needs positioning + dismiss + a custom keyboard model + a value signal + `aria-activedescendant`; a menu needs positioning + dismiss + a different keyboard model + real focus + roving tabindex + submenu coordination. The base class either grows to cover every case (a god object) or does not, and you re-implement per primitive.

`lite-headless` inverts it. Small modules under `_overlay/` each do one thing, and each primitive imports only what it needs (line counts measured from source):

| Layer                   | Lines | Concern                                          |
| ----------------------- | ----: | ------------------------------------------------ |
| `_overlay/core`         |   269 | open signal, status machine, cleanup graph       |
| `_overlay/position`     |   431 | 12-placement positioner, flip, shift, autoUpdate |
| `_overlay/roving-focus` |   279 | roving tabindex model (menu, toolbar, radios)    |
| `_overlay/focus`        |   233 | focus trap + previously-focused-element restore  |
| `_overlay/aria`         |   214 | id generation + IDREF-list token addition        |
| `_overlay/element-roles`|   161 | custom-element role/slot wiring                  |
| `_overlay/dismiss`      |   128 | Escape stack + outside-click composedPath        |
| `_overlay/scroll-lock`  |    56 | body scroll lock + position-fixed compensation   |
| `_overlay/portal`       |    45 | move-to-container + DOM-position restore          |

The overlay primitives share the full stack; form-control and data primitives reuse only what their job needs (the ARIA id helpers universally, roving focus where items are navigable). Adding a new overlay is the wiring code plus its own keyboard model and item registry -- it does not duplicate positioning, dismissal, portaling, or ARIA helpers. Each layer is independently testable, which is why the suite can pin the positioner, the dismiss stack, and the focus trap in isolation.

The reactive contract is one-direction: signals -> DOM. Consumer mutations to the DOM (editing item labels, say) do not propagate back into signals; that is the consumer's responsibility. This keeps the engine small and predictable.

</details>

---

## API reference

Every primitive returns a handle with `attach*(el)` methods and `destroy()`. Overlays additionally expose `open`, `status`, `setOpen`, `toggle`; form controls expose a primitive-specific surface (`value()`, `setValue(next)`). Signatures for the full set live in [`types.d.ts`](./types.d.ts); the frequently reached-for factories:

### `createDialog(options) -> DialogHandle`

```ts
createDialog({
    open?, defaultOpen?, onOpenChange?,
    modal?,               // default true; focus trap + body scroll lock
    closeOnEscape?,       // default true
    closeOnOutsideClick?, // default true (meaningful for non-modal)
    container?,           // default document.body
    transition?,          // default false; wait for transitionend
    labelledBy?, describedBy?,
});
```

Returns `{ open, status, setOpen, toggle, attachTrigger, attachContent, attachOverlay, attachClose, attachInside, attachTitle, attachDescription, destroy, destroyed }`. `modal: true` traps focus and applies a scroll lock; `closeOnOutsideClick` on a modal is a no-op (the trap intercepts pointerdown).

### `createPopover(options) -> PopoverHandle`

```ts
createPopover({
    open, defaultOpen, onOpenChange,
    placement,   // 12 values: "bottom" (default) .. "right-end"
    offset,      // default 8
    flip,        // default true
    shift,       // default true
    boundary,    // "clipping" (default) | "viewport" | HTMLElement
    modal, container, transition, labelledBy, describedBy,
});
```

`attachAnchor(el)` separates the positioning anchor from the trigger. `attachArrow(el)` positions an arrow against the resolved side; the positioner emits `data-side` / `data-align` on the content so CSS can rotate it. `boundary: "clipping"` walks to the nearest scroll/overflow ancestor (intersected with the viewport); pass an element to use its rect verbatim.

### `createTooltip(options) -> TooltipHandle`

```ts
createTooltip({
    open, defaultOpen, onOpenChange,
    placement, offset, flip, shift, boundary, container,
    trigger,          // "hover focus" (default) | subset of hover|focus|click|manual
    openDelay,        // ms; default 200
    closeDelay,       // ms; default 150
    describesTrigger, // true -> aria-describedby (default); false -> aria-labelledby
});
```

Focus triggers ignore delays (keyboard accessibility -- Tab reveals instantly). `closeDelay` is the grace period for the pointer to cross from trigger to content.

### `createCombobox(options) -> ComboboxHandle`

```ts
createCombobox({
    open, defaultOpen, onOpenChange,
    value,            // external WriteSignal (controlled)
    defaultValue, onValueChange,
    placement, offset, flip, shift, boundary,
    typeahead,        // default true
    typeaheadTimeout, // ms; default 500
    loop,             // default true
    autoFocus,        // "first" (default) | "selected" | "none"
    closeOnSelect,    // default true
    closeOnEscape, closeOnOutsideClick, container, transition,
});
```

Returns `{ ..., value(), setValue(v, reason), attachTrigger, attachListbox, attachItem(el, { value, label }), attachInside, destroy }`. Uses the `aria-activedescendant` pattern: focus stays on the trigger; keyboard model is ArrowDown/Up/Home/End move highlight, Enter selects, Escape closes, Tab closes preserving native flow, printable chars typeahead.

### `createMenu(options) -> MenuHandle`

```ts
createMenu({
    open, defaultOpen, onOpenChange,
    placement, offset, flip, shift, boundary,
    typeahead, typeaheadTimeout, loop, container, transition,
    closeOnSelect,     // default true
    closeOnEscape, closeOnOutsideClick,
    isSubmenu,         // default false
    submenuOpenDelay,  // ms; default 100
    submenuCloseDelay, // ms; default 300
    safeTriangle,      // default true; pointer-triangle hover tracking
});
```

Real DOM focus with roving tabindex. `attachItem(el, { onSelect, disabled, label })`, plus `attachCheckboxItem`, `attachRadioItem`, `attachSeparator`, `attachContextTarget(el)` (right-click opens at the pointer via a virtual anchor), and `attachSubmenu(parentItemEl, submenu)` for arbitrarily nested menus. A submenu is just `createMenu({ isSubmenu: true })` linked in -- nesting is composition, not a special shape. `safeTriangle: true` replaces the naive close-timer with pointer-triangle tracking so a diagonal move toward the submenu never dismisses it.

### `createSlider(options) -> SliderHandle`

```ts
createSlider({
    value?, defaultValue?,   // length determines thumb count
    onValueChange?,
    min,  // default 0
    max,  // default 100 (> min)
    step, // default 1 (> 0)
    largeStep?,              // default step * 10
    orientation,            // "horizontal" (default) | "vertical"
    inverted, disabled,     // default false
    minStepsBetweenThumbs,  // default 0; -Infinity to allow crossing
});
```

Returns `{ value(), setValue(next, reason?), min, max, step, largeStep, orientation, inverted, thumbCount, attachTrack, attachRange, attachThumb(el, index), attachLabel, destroy, destroyed }`. Value is always an array (`[50]`, `[20, 80]`, `[10, 40, 70]`); the thumb count is locked at construction. Positioning is purely CSS-variable-based (`--lh-thumb-pct`, `--lh-range-start`, `--lh-range-end`); the primitive never sets `style.left` or `style.transform`. Keyboard direction is value-based (ArrowUp/Right always increase, regardless of orientation/inversion). Not an overlay.

### `createDatePicker(options) -> DatePickerHandle`

```ts
createDatePicker({
    mode,          // "single" (default) | "range"
    value?, defaultValue?, onValueChange?,
    minDate?, maxDate?,
    weekStartsOn,  // 0..6; default 0 (Sunday)
    disabled,      // default false
    now?, today?,  // today accepts a signal for lite-time integration
});
```

The consumer renders the 42-cell grid: `getDaysInView()` returns the dates, `attachDay(el, date)` binds each cell (idempotent, so 42 cells can be reused across months). Full keyboard nav crosses month boundaries; a `view` signal toggles `"days"` / `"months"` / `"years"` with `cycleView()` and matching `getMonthsInView()` / `getYearsInView()` + `attachMonth` / `attachYear`. Range values auto-sort to `start <= end`; all dates strip to start-of-day. Not an overlay -- wrap in `createPopover` for the input-click pattern.

### The CSS contract (four attribute classes)

Every primitive paints state onto the DOM; the consumer styles those hooks. The taxonomy is four classes:

| Class | What it is                          | Example                                             |
| ----- | ----------------------------------- | --------------------------------------------------- |
| 1     | ARIA attributes (semantic state)    | `aria-expanded`, `aria-selected`, `aria-modal`      |
| 2     | Boolean `data-*` (layout hooks)     | `data-open`, `data-disabled`, `data-highlighted`    |
| 3     | Enum `data-*` (multi-state hooks)   | `data-state="opening"`, `data-side`, `data-align`   |
| 4     | Slot markers (consumer-provided)    | `data-drawer-content`, `data-cal-prev`              |

Classes 1-3 are outputs the primitive writes; class 4 are inputs the wrapper reads to auto-discover elements. The full per-primitive enumeration is in [`docs/CSS_CONTRACT_APPENDIX.md`](./docs/CSS_CONTRACT_APPENDIX.md).

### Contract constants

| Export           | Meaning                                                           |
| ---------------- | ---------------------------------------------------------------- |
| `VERSION`        | Package version string (`"1.1.1"`), also mirrored in `llms.txt`. |
| status values    | `"closed"` -> `"opening"` -> `"open"` -> `"closing"` (per overlay). |
| generated id ns  | `lh-dialog-`, `lh-popover-`, ... namespaced per primitive.        |

Every factory validates its option object at construction and **fails closed**: an unknown key throws a `TypeError` with a did-you-mean hint (nearest legal key), never a silent ignore. `null` and non-object options are rejected; no-arg is legal.

---

## Composability

An admin form field: a modal `dialog` holding a `combobox` (assignee) and a `datepicker` (due date), both driven by a `@zakkster/lite-form` field signal, with `@zakkster/lite-signal` as the reactive spine. The field signal is the single source of truth -- pass it as the controlled `value` and the primitive renders it and emits changes back through the same signal; there is no controlled/uncontrolled fork.

```js
import { signal, effect }   from "@zakkster/lite-signal";
import { createForm }       from "@zakkster/lite-form";
import { createDialog }     from "@zakkster/lite-headless/dialog";
import { createCombobox }   from "@zakkster/lite-headless/combobox";
import { createDatePicker } from "@zakkster/lite-headless/datepicker";

// 1. One form owns the values + validation.
const form = createForm({
    initialValues: { assignee: null, dueDate: null },
    validators: {
        assignee: (v) => (v ? null : "pick an assignee"),
        dueDate:  (v) => (v ? null : "pick a due date"),
    },
});

// 2. A modal dialog wraps the whole editor.
const dialog = createDialog({ modal: true, transition: true });
dialog.attachTrigger(document.querySelector("#edit-task"));
dialog.attachContent(document.querySelector("#task-editor"));

// 3. Combobox: the field's signal IS the controlled value.
const assignee = createCombobox({ value: form.field("assignee").value });
assignee.attachTrigger(document.querySelector("#assignee-trigger"));
assignee.attachListbox(document.querySelector("#assignee-list"));
for (const u of users) assignee.attachItem(rowFor(u), { value: u.id, label: u.name });

// 4. Datepicker: same pattern, wrapped in a popover for the input-click UX.
const due = createDatePicker({ mode: "single", value: form.field("dueDate").value });
due.attachGridContainer(document.querySelector("#due-grid"));
repaintCalendar(due);   // getDaysInView() + attachDay() per cell

// 5. Submit gates on live validity; dialog closes on success.
document.querySelector("#save").addEventListener("click", async () => {
    if (await form.submit()) dialog.setOpen(false, "save");
});

// 6. Everything downstream is just a signal read.
effect(() => { saveBtn.disabled = !form.isValid(); });
```

Because the combobox and the datepicker both read and write `form.field(path).value` -- a genuine `lite-signal` `WriteSignal` -- the form owns the value, the primitives own the interaction, and no adapter glues them. Tear-down is one call: `dialog.destroy()`, `assignee.destroy()`, `due.destroy()`, `form.dispose()`.

---

## Zero-GC design notes

<details>
<summary>What the hot paths allocate (nothing), the one contract-forced allocation, and the gated proof.</summary>

The two hot paths -- a slider drag and a positioner reflow -- run at pointer rate (60-120Hz). Both are allocation-free in steady state, and the torture gate proves it.

| Operation                          | Steady-state allocations |
| ---------------------------------- | ------------------------ |
| `slider.setValue` same-value drag  | **0** (early-exit before slice) |
| `slider.setValue` step-crossing    | one array (signal contract; see below) |
| positioner `update()` no-op diff   | **0**                    |
| positioner `update()` with rewrite | **0** (mutates injected scratch) |
| option validation (`checkOptions`) | cold path only, never per event |
| `destroy()` seal + pool return     | cold path only (frozen stand-ins built at teardown) |

Three decisions carry that table:

- **The slider's one contract-forced allocation.** `setThumbValue` early-exits *before* its `.slice()` when the snapped value equals the current one, so a continuous drag that has not crossed a step boundary allocates nothing (about 80% of pointermoves at typical granularities). When the value does change, the slice is unavoidable: `lite-signal`'s contract is reference-equality, so a fresh array is the only thing that triggers downstream effects. One allocation per real change, zero per no-op.
- **`clampSnap` magnitude-guard, allocation-free.** Snapping a value to its step used to round-trip through `Number(x.toFixed(10))` to kill float drift -- a string allocation per call. It now corrects drift with `Math.round(x * 1e10) / 1e10` guarded by two compares: below 1e5 magnitude the correction is exact; at or above 1e5 it is skipped (the multiply would exceed the f64 exact-integer range and corrupt the value), diverging from the old path by about 1 ULP, on the order of the grid step at that magnitude. Two compares, zero alloc.
- **`checkOptions` is cold-path only.** The fail-closed validator runs once per factory call, at construction, never in a frame loop. Its membership test is an allocation-free bounded `indexOf` scan over a pipe-delimited key string (no `split`, no `Set`), and the two-row Levenshtein `suggest()` is reached only after a key has already failed and a throw is committed.
- **`destroy()` seals signals back into the pool (H-12).** lite-signal pools its nodes in a fixed-capacity registry (default 1024, fail-fast), and a signal that is never disposed occupies a slot forever -- pool-ledger accumulation that lite-leak cannot see (the handles ARE collected). Every factory therefore holds its owned signals in `let` bindings that accessors resolve at call time; `destroy()` disposes each pooled node and swaps the binding to a frozen stand-in (`src/_overlay/seal.js`), so create/destroy churn runs indefinitely on the default registry while a destroyed handle keeps answering its final `open()`/`status()`/`value()` (writes stay no-ops). Per-item nodes return on their removal paths too (kanban column order, file-upload entry progress, radio-group item disabled). Consumer-supplied controlled signals are never touched. Pinned by `test/signal-pool.test.js`, which churns every factory on a 256-node fixed registry asserting exact pool return after every destroy.

The gate is `test/torture.mjs` (`@zakkster/lite-leak` + `@zakkster/lite-gc-profiler`, run under `--expose-gc`), in two phases. **Phase A (retention):** churn every overlay and non-overlay primitive through create/attach/open/close/destroy inside a disposable signal owner; disposing the owner must untrack it, and any listener/timer/observer that outlives the owner surfaces as a finding. Phase A runs on lite-signal's default fixed 1024-node registry on purpose: a factory that stops returning its signal nodes on destroy fails fast with a `CapacityError` (H-12). **Phase B (GC budget):** drive the slider and the positioner `update()` tick with instances built outside the loop, sampling the heap; the gate is zero major collections and no pause over 4ms. The committed result:

```
GATE leak=size 0/0 findings=0 warnings=3 | gc major=0 minor=22 maxMs=0.21 | ok
```

Zero retained primitives, zero orphan findings, zero major GCs across 200000 hot iterations per path, a worst pause of 0.21ms. `npm run torture:control` injects a per-iteration retained allocation and drops one tracker registration; it must exit non-zero -- a gate that cannot fail is not a gate.

</details>

---

## Design decisions worth knowing

- **Swallow policy.** The engine never swallows a consumer error silently; the only `try/catch` swallows are around teardown of external async resources (e.g. happy-dom close in the harness) where a throw would mask the real result. Consumer callbacks (`onSelect`, `onOpenChange`) run in the same call stack and their throws propagate.
- **Status generation guard.** `transition: true` waits for a `transitionend` on the content before advancing to `open`/`closed`. A mid-transition `setOpen(true)` while `closing` correctly flips to `opening`; the `transitionend` listener checks the current direction at fire time, not at install time, so a fast open/close/open sequence lands in the right terminal state.
- **Escape open-recency.** The Escape stack pops the most-recently-opened overlay first. Nested overlays (a menu inside a dialog, a submenu inside a menu) close inner-first; a submenu with `isSubmenu: true` pops itself while leaving the parent's handler installed beneath, so a second Escape walks the chain.
- **Fail-closed options with did-you-mean.** Unknown option keys throw a `TypeError` naming the offending key and the nearest legal one. `null` is rejected as `null`, never coerced. This is construction-time only; the hot paths assume validated input and never branch on a bad state.
- **Positioner injection contract.** `createPositioner` takes injectable `getRect` / `getViewport` functions. In the browser they read real rects; in tests and the torture harness they return mutated-in-place scratch objects, so the positioner can be driven at 200000 ticks with zero DOMRect allocation -- the same code path, no branch for the test double.
- **Reference-equality reactivity.** Signals cut off on `Object.is`; a `setValue` to the same value is a no-op that allocates nothing and fires no effect. Consumers get change-driven updates for free, which is why the slider and datepicker expose array values (a new array is a real change; the same array is not).

---

## Testing

**1573 tests**, all passing, plus the torture gate and an optional real-browser suite.

```bash
npm test             # 1573 node:test cases (per-primitive + composition layers)
npm run types        # tsc --noEmit against types.d.ts (silent on success)
npm run torture      # @zakkster/lite-leak + lite-gc-profiler: retention + 0-major-GC
npm run torture:control  # the negative control; must exit non-zero
npm run verify       # test + types + torture, the publish gate
npm run test:browser # Playwright, real-layout cases (safe-triangle, drag, flip)
```

The unit suite runs on happy-dom with a per-test `setupDOM()` / `teardownDOM()` that calls `happyDOM.close()` -- without it, internal task queues accumulate and the suite SIGKILLs. `types.d.ts` declares the factories, return shapes, options, and `Lite{X}Element` host interfaces for all 58 primitives; `type-tests/api-surface.ts` exercises that surface so any drift between the declared types and real usage surfaces at `tsc` time. happy-dom does not simulate layout (`getBoundingClientRect()` returns zeros), so geometry-dependent behavior -- safe-triangle math, drag against a real track rect, popover flip against the real viewport -- is covered by the Playwright tier. `npm run verify` is the prepublish gate; the ASCII law is pinned by `test/ascii-law.test.js`, which also asserts this README's section order.

---

## What this is not

- **A rendering library.** No virtual DOM, no JSX runtime, no template compiler. You bring the markup; the primitives attach behavior to your elements.
- **A styling system.** Zero CSS in the package. The primitives expose `data-*` and `aria-*` hooks (201 and 31 distinct across the set); you style them.
- **An animation engine.** The `status` signal is the integration point. Pair with CSS transitions, Web Animations, `lite-ease`, GSAP, Motion One -- whatever.
- **A positioning library beyond the basics.** `_overlay/position` covers 12 placements + flip + shift + arrow + autoUpdate. For nested-scroll boundaries or middleware-style transforms, use Floating UI via `attachAnchor` (or the `hover-card` path, which already does).
- **A data grid.** The primitives are table-less by design; the sortable/virtualizable data grid lives in [`@zakkster/lite-table`](https://www.npmjs.com/package/@zakkster/lite-table). This package supplies the surrounding controls (menu, combobox, pagination, toolbar), not the grid itself.

---

## Ecosystem

Part of the **@zakkster** zero-GC stack.

- [`lite-signal`](https://www.npmjs.com/package/@zakkster/lite-signal) -- **required peer**. Synchronous, zero-GC reactive graph. `open`, `value`, `status` come from here. `destroy()` seals every factory-owned node back into its pool (H-12), so the default fixed 1024-node registry bounds concurrent primitives, not lifetime churn; size it up via `createRegistry` + `setDefaultRegistry` only if you hold hundreds of live primitives at once.
- [`lite-element`](https://www.npmjs.com/package/@zakkster/lite-element) -- **optional peer**. Enables the `<lite-*>` custom-element wrappers with reactive observed attributes.
- [`lite-floating`](https://www.npmjs.com/package/@zakkster/lite-floating) -- **optional peer**. Positions `hover-card`.
- [`lite-observe`](https://www.npmjs.com/package/@zakkster/lite-observe) -- **optional peer**. Backs `hover-card`'s `autoUpdate`.
- [`lite-table`](https://www.npmjs.com/package/@zakkster/lite-table) -- the sortable, virtualizable data grid. lite-headless is table-less on purpose; the grid lives here.
- [`lite-query`](https://www.npmjs.com/package/@zakkster/lite-query) -- async data + cache; feed a combobox or command-palette listbox.
- [`lite-form`](https://www.npmjs.com/package/@zakkster/lite-form) -- headless reactive forms. A field's `value` signal is the controlled `value` for slider, datepicker, or combobox (see Composability).
- [`lite-router`](https://www.npmjs.com/package/@zakkster/lite-router) -- drive `dialog.open` from a URL param signal; overlay state becomes a shareable link.
- [`lite-persist`](https://www.npmjs.com/package/@zakkster/lite-persist) -- persist `combobox.value` to storage with debounced cross-tab sync.
- [`lite-virtual`](https://www.npmjs.com/package/@zakkster/lite-virtual) -- windowing for a 10000-item listbox; `attachItem` visible rows, detach off-screen.
- [`lite-signal-decorators`](https://www.npmjs.com/package/@zakkster/lite-signal-decorators) -- a buildless decorators recipe over `lite-signal` for class-based consumers.
- [`lite-leak`](https://www.npmjs.com/package/@zakkster/lite-leak) + [`lite-gc-profiler`](https://www.npmjs.com/package/@zakkster/lite-gc-profiler) -- the retention + GC-budget gate behind `npm run torture`.

---

## License

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
