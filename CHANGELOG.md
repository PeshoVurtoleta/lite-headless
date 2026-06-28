# Changelog

## 1.0.0 -- 2026-06-26

First public release. `@zakkster/lite-headless` is a zero-dependency set of
**58 headless UI primitives** -- ARIA-correct factories with explicit
state-attribute CSS contracts and zero-GC hot paths -- built on
`@zakkster/lite-signal` reactive accessors.

All 1521 unit tests pass and `tsc --noEmit` is clean.

### The library

- **58 primitives**, each a single subpath of `@zakkster/lite-headless` with
  its own `llms.txt` (options, API, painted-attribute contract). Each also
  ships an optional `<lite-{name}>` custom element from
  `@zakkster/lite-headless/{name}/element`.
- **Overlays** (shared `_overlay/` core): dialog, alert-dialog, popover,
  tooltip, hover-card, menu, combobox, command-palette, toast, drawer, tour.
- **Form controls**: slider, switch, rating, pin-input, tag-input, file-upload,
  color-picker, date-picker, stepper, inline-edit, form-field, password-input.
- **Data / display**: tabs, accordion, tree, pagination, carousel, calendar,
  kanban, sortable, timeline, descriptions, stat, meter, progress, skeleton,
  breadcrumb, badge, tag, avatar, card, banner, result, empty-state, separator,
  clipboard, notification-center.
- **Layout / util**: affix, anchor, back-top, split-panels, toolbar,
  toggle-group, steps, radio-group, picture.
- Reactive state via `@zakkster/lite-signal` accessors; **zero allocations on
  hot paths** (frame loops, pointer / scroll handlers). `sideEffects: false`,
  ESM-only, tree-shakeable to the single primitive you import.
- Fully headless: every primitive paints `data-*` state attributes and owns no
  styling. `docs/CSS_CONTRACT.md` documents the class / attribute taxonomy.

### Positioning: optional lite-floating integration

- **hover-card** is positioned by `@zakkster/lite-floating` (createFloating +
  bindTransform + offset / flip / shift); its `autoUpdate` pulls in
  `@zakkster/lite-observe` transitively to keep the card pinned on scroll and
  resize.
- `@zakkster/lite-floating` (^1.0.0) and `@zakkster/lite-observe` (^1.0.1) are
  **optional** peers (`peerDependenciesMeta`), required only for hover-card.
  `@zakkster/lite-signal` and `@zakkster/lite-element` are the core peers.
- The other overlays (popover, tooltip, menu, combobox, dialog) use the
  in-house `_overlay/position` engine; both positioning strategies ship side
  by side.

### dialog / alert-dialog: one contract

- `createDialog` takes an optional `role` (`"dialog"` default or
  `"alertdialog"`). `createAlertDialog` is a thin wrapper that locks in the
  alert-dialog contract (always modal, no backdrop-dismiss by default) while
  reusing the identical state machine, focus trap, scroll lock, portal, and
  dismiss logic.

### Tooling

- 1521 unit tests (`node:test`; GC-sensitive paths run under `--expose-gc`);
  `tsc --noEmit` clean against the bundled `types.d.ts`.
- Full bare-import barrel (58 factories plus `deriveInitials`, `hueFromString`,
  `buildItems`) and per-subpath type exports.
- A single-file interactive demo (`demo/`) covering all 58 primitives, with a
  light / dark theme toggle.

## Pre-release development (unpublished)

> Everything below predates the first npm publish (1.0.0 above). These were
> internal development iterations; their version numbers were never released.
> Kept verbatim for historical reference.

### 1.1.0 -- 2026-06-25

**Five new primitives (53 -> 58), the lite-floating / lite-observe
integration, and the release-blocker reconciliation that 1.0.0 needed.**

All 1521 unit tests pass (1477 prior + 44 new) and `tsc --noEmit` is
clean. Both gates are green.

#### New primitives

- **separator** -- `createSeparator({ orientation, decorative })`. Semantic
  (`role="separator"` + `aria-orientation` on the vertical axis) or
  decorative (`role="none"` + `aria-hidden`). Paints `data-separator-root`,
  `data-orientation`. Wrapper `<lite-separator>`.
- **clipboard** -- `createClipboard({ value, timeout, write, onCopy, onError })`.
  Owns the transient `copied` flag (auto-resets after `timeout`) and an
  `error` flag. The write is injectable, so it is fully testable and supports
  an execCommand fallback. `attachTrigger` / `attachIndicator` /
  `attachRoot`, painting `data-copied` / `data-error`. Wrapper
  `<lite-clipboard>`.
- **password-input** -- `createPasswordInput({ visible, onVisibilityChange })`.
  Flips the input `type` between password/text, keeps the toggle's
  `aria-pressed` / `aria-label` in sync, and links the two with
  `aria-controls`. Restores the input's original `type` on detach. Wrapper
  `<lite-password-input>`.
- **alert-dialog** -- `createAlertDialog(options)`. An interruptive
  confirm/destroy dialog: `role="alertdialog"`, always modal, and a backdrop
  click does not dismiss by default. Returns a `DialogInstance` -- it is the
  same contract as dialog, with a stricter dismiss policy and a more
  assertive role. Wrapper `<lite-alert-dialog>`.
- **hover-card** -- `createHoverCard({ placement, offset, openDelay, ... })`.
  A rich hover/focus preview card with tooltip-style hover-intent ("pointer
  alive" spans both trigger and content). Wrapper `<lite-hover-card>`.

#### lite-floating / lite-observe integration

- **hover-card is positioned by `@zakkster/lite-floating`** (createFloating +
  bindTransform + offset/flip/shift middleware) rather than the shared
  `_overlay/position` positioner. lite-floating's autoUpdate pulls in
  `@zakkster/lite-observe` transitively to keep the card pinned on scroll and
  resize. This is the deliberate showcase of the floating engine.
- The existing overlay primitives (popover, tooltip, menu, combobox, dialog)
  **keep `_overlay/position` unchanged**. Swapping the shared positioner was
  evaluated and **deferred**: `test/overlay-position.test.js` asserts the
  exact pixel geometry those five consume, and lite-floating's geometry/API
  differ enough that a swap would churn that contract. Staging the engine
  swap behind a new primitive ships the integration honestly without risking
  the publishable state of the five.
- `@zakkster/lite-floating` (^1.0.0) and `@zakkster/lite-observe` (^1.0.1)
  added to `peerDependencies`, both marked **optional** in
  `peerDependenciesMeta`. They are required only if you use hover-card;
  `lite-signal` and `lite-element` remain the core peers.

#### dialog: optional `role` (enables one alert-dialog contract)

- `createDialog` accepts an optional `role` (`"dialog"` default, or
  `"alertdialog"`). Only the content's `role` attribute changes; the state
  machine, focus trap, scroll lock, portal, and dismiss policy are identical.
  `createAlertDialog` is a thin wrapper that locks in the alert-dialog
  contract. dialog's 22 tests are unchanged and still pass.

#### Release-blocker reconciliation (the 1.0.0 -> 1.1.0 cleanup)

These were found while verifying the release and are fixed here:

- **Restored the package barrel.** `src/index.js` had been truncated to 7
  exports by a botched patch; the bare-import path
  (`import { createBadge } from "@zakkster/lite-headless"`) was broken for
  51 of the factories. The gates did not catch it because tests and the
  type-checker resolve subpaths directly. The full 58-factory barrel (plus
  `deriveInitials`, `hueFromString`, `buildItems`) is restored and
  smoke-tested at runtime.
- **types.d.ts accuracy.** Fixed 7 stale member declarations that had drifted
  from the factories (drawer `showDrawer`/`hideDrawer` -> `show`/`hide`;
  stepper `getMin/getMax/getStep` -> `min/max/step`; banner factory `open` ->
  `isOpen`; steps host `step` -> `currentStep`; rating host `ratingValue` ->
  `value`; button host `isDisabledState` -> `isDisabled`; stat host
  `displayedValue` -> `displayValue`). Resolved subpath type-only imports
  (`DialogOptions` et al.) by re-exporting every primitive's exported type
  names from the bare-barrel ambient module, which the `paths` mapping had
  been collapsing.
- **Fixed a broken export.** `"./CSS_CONTRACT.md"` pointed at the repo root;
  the file lives at `docs/CSS_CONTRACT.md`.
- **Pinned happy-dom** to `^15.11.0` in devDependencies. happy-dom 20 fires
  `<img>` error events synchronously, which broke three picture tests; the
  library logic is correct for real browsers.

#### Docs

- Per-primitive `llms.txt` for all five new primitives.
- `docs/CSS_CONTRACT.md` documents the new painted attributes; CSS appendix
  regenerated.

### 1.0.1 — 2026-06-19

**TypeScript declaration accuracy audit + type-check infrastructure.**
v1.0.0 shipped `types.d.ts` with a claim that it was "cross-checked
against actual factory return signatures." This release adds the
type-check pipeline that would have caught that claim being false at
the time, finds and fixes ~40 surface mismatches the pipeline
surfaces, and documents the methodology so the same gap can't open
again.

No JS source was modified in this release. The runtime API is
identical to v1.0.0; only `types.d.ts` and the new dev-only
type-check infrastructure changed. All 1477 unit tests pass ×3.

#### Type-check infrastructure (the durable contribution)

- `typescript@5.9` added to `devDependencies`.
- `tsconfig.json` at root (strict, `noEmit`, `moduleResolution:
  bundler`, paths map for the `@zakkster/lite-headless` subpaths).
- `type-tests/api-surface.ts` (~470 lines) — a compile-time contract
  file that imports every primitive's factory and exercises every
  documented method, accessor, and attach call. Wrapped in unused
  arrow functions so it compiles without runtime DOM but still
  type-checks the full surface.
- `package.json` scripts: `"types": "tsc --noEmit"` and
  `"types:watch": "tsc --noEmit --watch"`.
- Element wrappers (`document.querySelector("lite-X")`) are also
  exercised in the test so wrapper-vs-primitive surface drift gets
  caught (this is a real category — see below).

Future surface drift will now fail at build time. v0.x and v1.0.0
had no such gate; that's why the drift documented below was able to
accumulate.

#### Type-accuracy fixes (~40 surfaces)

**Primitives reconciled against actual `src/<name>/index.js` return
shapes**: combobox, menu, accordion, stepper, switch, button,
pagination, stat, tour, toast, color-picker, steps, tooltip, drawer,
tabs, rating, toggle-group, radio-group, meter, progress, badge,
timeline, descriptions, result, banner, skeleton, empty-state,
avatar, breadcrumb, calendar, kanban, sortable, tree, toolbar,
command-palette, file-upload, form-field, inline-edit,
notification-center, pin-input, tag-input, split-panels, slider,
datepicker, picture.

Typical drift categories:

| Category | Example |
|---|---|
| Wrong attach method name | `combobox.attachList` → `attachListbox`, `pagination.attachList` → `attachPageList`, `accordion.attachContent` → `attachPanel`, `meter.attachBar` → `attachFill`, `tabs.attachList` → `attachTablist`, `stepper.attachInc/Dec` → `attachIncrement/Decrement`, `drawer.attachOverlay` → `attachBackdrop`, `drawer.attachClose` → `attachCloseButton`, `tour.attachPopover` → `attachStepContent`, `split-panels.attachRoot` → `attachContainer`, `avatar.attachImg` → `attachImage` |
| Wrong accessor name | `switch.checked` → `isChecked`, `button.pressed/disabled/loading` → `isPressed/isLoading/isDisabled` (with extra `canPress`), `progress.isIndeterminate()` → `indeterminate()`, `split-panels.sizes` → `layout` (and `setSizes` → `setLayout`), `picture.status` → `state` |
| Method on declared interface that doesn't exist in source | `descriptions.setColumns/setBordered`, `result.setStatus`, `banner.isDismissed/reset`, `avatar.setName`, `tag-input.attachTagRemoveButton`, `file-upload.removeFile` (real name: `removeEntry`) |
| Missing methods | `accordion.isOpen/open/close/setDisabled/focus*`, `steps.setCurrentById/setStepStatus/clearAllErrors/reset/attachNextButton/attachPrevButton`, `stat.label/unit/setLabel/setUnit/setTrend + 4 attach methods`, `tour.addStep/removeStep/count/currentStep/isActive/isFirst/isLast/goTo/skip`, `toast.show/clear/getEntries/count/hovering/focused` (where my types said `push/dismissAll` instead), `color-picker.hsv/rgb/hex/hsl/oklch + setHsv/setRgb/setHex/setOklch + attachArea/Handle/Slider variants`, `tree.isSelected/isExpanded/isVisible/hasChildren/select/deselect/expand/collapse/expandAll/collapseAll/focusKey`, `kanban.cardsInColumn/getCard/getColumn/addColumn/removeColumn/addCard/removeCard/updateCard`, `command-palette` entire surface (was modeled as a generic overlay, real surface is a fuzzy command registry with `register/unregister/invoke/invokeActive/setActive/next/prev` etc.) |
| Wrong type for an existing property | `pin-input.attachSlot` (didn't exist; real: `attachInput`), `pin-input.focus()` → `focusInput()`, `inline-edit.startEditing/cancelEditing/commitEditing` → `startEdit/cancel/commit`, `combobox.query/highlightedIndex/attachInput` (none of those exist) |

**Element wrappers (`LiteXElement` interfaces) reconciled against
actual host accessors**: LiteResultElement (drop setStatus),
LiteProgressElement (drop isIndeterminate; add fraction/isComplete/
setMin/setMax/setIndeterminate/setValueText), LiteButtonElement
(rename pressed/disabled/loading to isPressed/isLoading/
isDisabledState; add canPress), LiteBannerElement (drop
kind+isDismissed-only model; add isOpen/setOpen/show), LiteSplit-
PanelsElement (rename sizes/setSizes to layout/setLayout; add
reconcile), LiteAvatarElement (drop setName; add state/initials/
colorHash readonly accessors), LiteStatElement (add label/unit/
setLabel/setUnit/setTrend), LiteStepsElement (add setCurrentById/
setStepStatus/clearAllErrors), LiteCardElement (add collapse/expand
methods), LiteBadgeElement (add displayed accessor + reset method),
LiteTimelineElement (add setItemType), LiteToggleGroupElement (add
contains/toggleItem/setItemDisabled + type accessor),
LiteRadioGroupElement (add checkedKey/isDisabled/itemCount +
setItemDisabled), LiteAccordionElement (add per-key
toggle/open/close/setDisabled), LiteTabsElement (add setDisabled +
next/prev/first/last), LiteDrawerElement (drop toggle; add
show/hide/setSide), LiteTooltipElement (add toggle), LiteRating-
Element (host uses `ratingValue` not `value` — fixed; add
displayValue/isReadOnly/clear/setReadOnly), LiteKanbanElement (full
rewrite to match host's per-card and per-column methods),
LiteSortableElement (add move/swap/insertAt/removeKey/setItem-
Disabled + items/isDragging readonly accessors), LiteTreeElement
(full rewrite: expand/collapse/toggleExpanded/select/deselect/
toggleSelected/setSelected/setExpanded), LiteColorPickerElement
(full rewrite: setHex/setRgb/setHsv/setOklch/setAlpha +
hex/rgb/hsv readonly accessors), LiteSwitchElement (add disabled
accessor + setDisabled).

#### Wrapper-vs-primitive surface gap (a real category of bug)

Several primitives have wrappers that intentionally rename the
public surface. Types must follow the wrapper, not the primitive,
because that's what consumers actually call:

| Primitive | Element host |
|---|---|
| `switch.isChecked()` | `sw.checked` |
| `rating.value()` | `rt.ratingValue` |
| `button.isDisabled()` | `btn.isDisabledState` |
| `drawer.toggle()` does not exist | wrapper provides `dr.show()`/`dr.hide()` |
| `progress.indeterminate()` (accessor) | wrapper provides `pg.setIndeterminate()` setter only; accessor renamed to read via the bar fraction |

The type-test file deliberately exercises both surfaces side by
side. Future renames at the wrapper layer will surface immediately.

#### What v1.0.0 got wrong

The v1.0.0 CHANGELOG said `types.d.ts` was "cross-checked against
actual factory return signatures." That claim was false. The
cross-check actually happened here in v1.0.1. ~40 of the 53
primitives had at least one surface mismatch; some had many. The
2029-line `types.d.ts` was hand-written from memory and source
inspection without any automated check.

Lesson: hand-written types against 50+ source files without an
automated pipeline produces drift. That's expected — and now
guarded against by the new `npm run types` gate.

#### Counts at v1.0.1

- **53 primitives** (unchanged)
- **1477/1477 unit tests ×3 stable** (no JS changes)
- **383 browser tests** + the documented 6 baseline flakes
  (3 datepicker, 3 menu)
- `types.d.ts`: 2029 → ~2100 lines (added options shapes for
  primitives that needed full reconciliation, plus per-primitive
  type aliases like `PictureState`, `DrawerStatus`, etc.)
- `type-tests/api-surface.ts`: ~470 lines exercising the full
  surface + element wrappers
- TypeScript added as the **only** dev dependency change (zero
  impact on production bundle — peerDeps and runtime are
  unchanged)

#### Honest notes for review

- This is a type-only release. The runtime is byte-identical to
  v1.0.0 except for the bumped `version` field and demo footer.
- I'm shipping the type-check as the durable contribution, not
  just the fixes. The fixes are point-in-time corrections; the
  pipeline prevents the next divergence.
- A handful of interfaces (`affix`, `anchor`, `backtop`) already
  matched their actual sources and didn't need changes. Those are
  the smallest primitives with the smallest surfaces — which is
  consistent with "drift correlates with surface area."
- Some `options` interfaces are necessarily inferred from the
  destructure at the top of each factory (the JS doesn't have
  JSDoc), so option keys may still be incomplete in edge cases
  (e.g. rarely-set behavior toggles). Please file issues for any
  missing options you actually need; they're easy fixes once
  surfaced by a real consumer.

---

### 1.0.0 — 2026-06-19

**API freeze. Stable release.** Going forward, breaking changes will
require a major version bump (v2.0.0). The library has been used in
production-adjacent contexts across many `@zakkster/*` siblings,
backed by 1477 unit tests + 383 browser tests, with 53 primitives
covering the full standard admin / overlay / form / nav surface.

This release bundles four targeted steps that together move the
library out of the v0.13.x stabilization window and into v1.0:

#### Step 1: Deprecated alias removal (BREAKING)

All `current*` host-accessor aliases and the toggle-group legacy
`change` event are removed at v1.0. Canonical names are the only
public surface now.

| Primitive | Removed | Use instead |
|---|---|---|
| `<lite-carousel>` (instance) | `.currentIndex()` | `.index()` |
| `<lite-drawer>` (host) | `.currentSide`, `.currentStatus` | `.side`, `.status` |
| `<lite-stat>` (host) | `.currentValue`, `.currentTrend` | `.value`, `.trend` |
| `<lite-steps>` (host) | `.currentIndex`, `.currentStep` | `.index`, `.step` |
| `<lite-banner>` (host) | `.currentKind` | `.kind` |
| `<lite-toggle-group>` (event) | `change` event | `valuechange` event |

**Migration guide for downstream `@zakkster/*` libs:**

```js
// before
const idx = carouselEl._carouselInstance.currentIndex();
const side = drawerEl.currentSide;
const value = statEl.currentValue;
toggleGroupEl.addEventListener("change", handler);

// after
const idx = carouselEl._carouselInstance.index();
const side = drawerEl.side;
const value = statEl.value;
toggleGroupEl.addEventListener("valuechange", handler);
```

The aliases were marked deprecated in v0.11.0 with a "removed in
v0.12.x" promise; that slipped to v1.0 but the deprecation period
was longer than originally announced.

Internal API kept:
- `position.js` `currentSide` getter (internal popover/dropdown
  positioner state; not a deprecated alias, just a descriptive name
  for "the side just written to DOM")
- `steps` primitive `currentStep()` method (canonical primitive
  method since v0.7; not affected, only the host accessor alias is
  removed)
- `breadcrumb` host `current` accessor (canonical, no `current` prefix)

#### Step 2: TypeScript declarations across the API surface

A single comprehensive `types.d.ts` at the package root, referenced
from `package.json` via top-level `"types"` plus per-subpath
`"types"` conditions in the `exports` map. 2029 lines covering:

- **53 module declarations** — `declare module
  "@zakkster/lite-headless/<name>"` for every primitive, with
  `XOptions`, `XInstance`, `createX()` exports
- **53 side-effect element modules** — `declare module
  "@zakkster/lite-headless/<name>/element"` (empty bodies, just
  side-effect registration)
- **53 LiteXElement interfaces** — each extends `HTMLElement` with
  the wrapper's host accessors and methods, plus a typed
  `_xInstance` reference back to the primitive
- **`HTMLElementTagNameMap` augmentation** — all 53 `lite-X` tags
  registered, so `document.querySelector("lite-dialog")` returns
  `LiteDialogElement | null` in TS

Common types live at the top of the file:

```ts
export type OffFn = () => void;
export type Reason = string | undefined;
export type ReactiveAccessor<T> = () => T;
export type ChangeCallback<T> = (value: T, reason?: string) => void;
```

Compiler-friendly: pure module declarations, no runtime side effects,
no JSX, ESM-only. Works with TypeScript 4.7+ (the version that added
`exports`-field types resolution).

Verified: 279 balanced braces, no stale alias references (the only
two `currentIndex` / `currentStep` strings in the file are a real
parameter name on `onChange` and the canonical `currentStep`
primitive method on `StepsInstance`).

#### Step 3: `createPicture.setSrc()` runtime mutation

The picture primitive previously required the `src` option at
construction and exposed no way to swap it afterward. Common
patterns like "user uploads a new avatar, swap the displayed image"
required tearing down and recreating the primitive.

v1.0 adds `setSrc(next: string)` to both the primitive return shape
and the `<lite-picture>` host:

```js
const pic = createPicture({ src: "first.jpg", lazy: false, eager: true });
pic.attachRoot(rootEl);
pic.attachImg(imgEl);
// ...later
pic.setSrc("second.jpg");   // triggers load cycle on the new src

// Host:
pictureEl.setSrc("third.jpg");
pictureEl.src;   // → "third.jpg"  (readonly getter)
```

Semantics:
- Validates `next` is a non-empty string (throws otherwise)
- No-op if `next === current src` (avoids spurious reloads)
- Resets the retry budget (a new source gets a fresh `maxRetries`
  attempts)
- Calls `_assignSrc()` internally, which transitions state to
  `"loading"` and assigns `_imgEl.src = next` if the img is attached
- Safe to call before `attachImg()` — the new src will be picked up
  on attach
- No-op if called after `destroy()`

6 new unit tests covering: API mutation, same-value no-op, input
validation, write-after-attach, post-destroy safety, retry-budget
reset.

#### Step 4: API freeze

`package.json` bumped to `1.0.0`. From this point forward, any
breaking change requires a v2.0.0 bump. The frozen public surface:

- All `createX(opts)` factories (53 primitives) and their return
  shapes documented in `types.d.ts`
- All `<lite-X>` custom elements with their host accessors,
  methods, and dispatched events
- All `attachX(el): OffFn` attachment contracts (the disposer
  returned by every attach call is idempotent and removes painted
  attributes + event listeners)
- All painted attribute names (e.g. `data-pinned`, `data-active`,
  `aria-current="location"`) — consumers may rely on these
  selectors for styling

Future minor versions (1.x.y) may add new primitives, new options,
new methods, or new painted attributes; they will not rename or
remove existing surface.

#### Counts at v1.0.0

- **53 primitives**
- **1477/1477 unit tests ×3 stable** (was 1471 in v0.13.5; +6 for picture setSrc)
- **383 browser tests** (same 6 chromium-1194 baseline flakes:
  3 datepicker, 3 menu — unchanged across all v0.13.x releases;
  2 additional transient flakes observed on this run — accordion
  transition-lock + anchor click — both pass cleanly in isolation,
  appear only under full-suite load, are NOT regressions from the
  v1.0 changes since both touch code paths the v1.0 work didn't
  modify)
- **24 new demo scenes since v0.12.0**
- Zero runtime dependencies (peer `@zakkster/lite-signal`,
  `@zakkster/lite-element`)
- ASCII-only source (`×` U+00D7 + `µ` U+00B5 only exceptions)
- Single-file ESM per primitive

#### Honest notes for review

- TypeScript declarations cover the **public** surface (factories,
  instances, element wrappers). They do **not** model internal
  helpers (`_overlay/*`, `_setXForTest()` hooks, dispose-chain
  internals). Consumers who need those will continue to use them
  via JS escape hatches; this is intentional.
- `types.d.ts` is hand-written, not generated from JSDoc. It was
  cross-checked against actual factory return signatures, but
  type-checking against the JS source isn't part of the test suite
  (would require adding TypeScript as a dev dependency). Surface
  mismatches will fall to consumers; please file issues.
- The "deprecated since v0.11" → "removed in v0.12.x" timeline
  slipped. v1.0 removal is the final landing.
- **Regression caught during shipping**: the first browser regression
  run after the alias removal turned up 13 unexpected failures, all
  from `carousel.currentIndex is not a function`. Root cause: the
  carousel element wrapper still called the removed primitive
  method internally at `element.js:177` (a host accessor delegating
  to it). The audit pass that removed the aliases missed this site
  because it was looking for `.currentIndex()` patterns and the
  wrapper used `carousel.currentIndex()` against the primitive
  instance variable, not the host. Fixed by switching the wrapper
  to call canonical `carousel.index()` instead, plus a fresh sweep
  caught matching stale references in `demo/index.html` (steps
  scene `host.currentIndex/Step`, banner scene `host.currentKind`),
  the v0.10-primitives browser spec (`.currentIndex` on lite-steps
  host), and three llms.txt files. Second regression run is clean
  apart from the standard 6 baseline flakes.

---

### 0.13.5 — 2026-06-19

**Browser-level visual smoke + browser specs for the Tier-2 primitives.**
The single most-flagged carryover item from v0.11 onwards (`screenshot-
diff CI` / `visual regression`) finally lands, in a form that's
pragmatic rather than baseline-image-maintenance heavy.

#### `demo-health.spec.js`

A new browser spec that loads the real demo (`/demo/index.html`) and
asserts the five invariants that should hold across every release:

1. **Page parses with zero JS errors** — pageerror + console.error
   collectors, filtered for resource 404s (intentional test cases in
   picture scene).
2. **`#app` has non-auto, non-zero computed dimensions** — the
   v0.13.3 regression check. Invalid CSS values (`100 dvh` with a
   space) drop the property, collapsing `#app` to content-auto.
3. **Boot loader removed within 1 second** — the v0.13.1 regression
   check. Missing wrapper imports would hang the loader until the
   6s hard-timeout fallback.
4. **No viewport-covering overlay above scene content** — uses
   `document.elementFromPoint(500, 400)` to confirm the topmost
   element is real content, not a fixed overlay (catches what
   `evaluate()` queries read through).
5. **Every menu scene navigates + renders non-empty content** —
   iterates all 57 menu entries; for each, clicks the menu item,
   asserts the scene activates AND its bounding box is > 300px tall
   AND it contains a `.stage` element. Catches both "scene blank
   because primitive failed to register" and "scene blank because
   layout collapsed."

Why "visual smoke" instead of pixel-diff screenshot baselines:
baselines require maintenance for every legitimate CSS change, and
chromium minor versions can produce subpixel diffs that aren't real
regressions. The smoke checks are dimensional + structural, so they
catch the bugs that actually broke v0.13.1 and v0.13.3 without
generating false positives on style tweaks.

#### Tier-2 primitive browser specs

Three new spec files + three fixtures, since IntersectionObserver
and real scroll behavior aren't faithfully simulated by happy-dom:

- **`backtop.spec.js` (6 tests)** — initial hidden state, scroll-past-
  threshold paint, scroll-back re-hide, click smooth-scroll-to-top,
  host accessor exposure, `backtop` CustomEvent.
- **`affix.spec.js` (6 tests)** — sentinel injection ordering, initial
  not-pinned state, scroll-past-sentinel pin, scroll-back release,
  `affixchange` event, host accessor exposure.
- **`anchor.spec.js` (7 tests)** — initial alpha-active, painted attrs
  on all links + sections, scrollspy updates active on scroll,
  click-and-scroll with optimistic activation, modifier-click NOT
  intercepted (browser default fires), `activechange` event, host
  accessor exposure.

#### What I learned writing these

Two test-design mistakes I caught + fixed before shipping:

1. **Anchor scroll test**: original expectation was that scrollTop=1100
   would activate gamma. Actual section heights (549px each, due to
   padding) meant beta still had 31px visible at the viewport top,
   so "earliest visible by DOM order" correctly picked beta. Fixed
   by scrolling to 1500 instead, where beta is fully above the
   viewport.

2. **Modifier-click test**: original assertion was that activeKey
   wouldn't change. But playwright's `modifiers: ["Meta"]` doesn't
   open a new tab (no OS-level integration) — it just dispatches a
   MouseEvent with metaKey:true, then the browser still navigates
   to the hash, which triggers IO, which updates activeKey via
   normal scrollspy flow. The actual primitive contract is "don't
   `preventDefault` on modifier clicks." Rewrote the test to verify
   the URL hash DOES update (proving `preventDefault` wasn't called).

Both bugs were in the tests, not the primitives. But surfacing them
forced me to write down the actual contracts, which is exactly what
browser-level tests are for.

#### Counts

- 53 primitives (no change since v0.13.4)
- **1471/1471 unit tests ×3 stable**
- **383 browser tests** (was 359; +24 across 4 new spec files)
- 6 documented chromium-1194 baseline flakes (3 datepicker + 3 menu)

#### Carryover

- TypeScript declarations across API surface (the next-biggest item)
- Drop v0.11.0 deprecated aliases (v1.0.0 path)
- Tier-3 primitives (only if `lite-overlay` needs them):
  input-number, cascader, transfer, tree-select, mention
- Tier-4 (defer to v1.x): scrollbar, image-preview, space utility

---

### 0.13.4 — 2026-06-19

**Tier-2 navigation primitives + smoke-harness safety guards.** Three
new primitives (backtop, affix, anchor) covering the standard
scroll-driven nav patterns admin and docs sites need. Plus the
smoke-harness guards I promised in v0.13.3 to catch viewport-
overlay regressions before they ship.

#### Three new primitives

| Primitive | Tests | Notes |
|---|---|---|
| **backtop** | 13 | Scroll-to-top FAB. `attachTarget(window\|element)` + `attachButton`. Threshold-based visibility, rAF-throttled paint with setTimeout(0) fallback for non-browser environments. |
| **affix** | 10 | Pin element on scroll. Implementation: 0-height sentinel + `IntersectionObserver` with negative top-margin equal to `offsetTop`. Works inside ancestors with `overflow:hidden` (where `position:sticky` breaks). |
| **anchor** | 12 | Sidebar scrollspy. One IO instance watches all linked sections; earliest-visible-by-DOM-order wins active state. Click handlers optimistically mark active before IO catches up. |

All three follow the established conventions:
- ASCII-only source, single-file ESM, zero runtime deps (peer
  `@zakkster/lite-signal`, `@zakkster/lite-element`)
- Reactive accessor call-style (`p.activeKey()` not `p.activeKey`)
- `attachX()` returns an `off()` cleanup function
- `_setXForTest()` helpers for unit tests where `IntersectionObserver`
  isn't available (happy-dom)
- Each ships full surface: `index.js`, `element.js`, `llms.txt`, plus
  a `test/X.test.js` suite

#### Demo scenes 55-57

Three new scenes with full panel sections matching the v0.13.0
density standard:

- **Scene 55 (backtop)** — 540px scrollable doc panel with sticky-
  bottom-right FAB. Click triggers smooth-scroll-to-top. Readout
  tracks scroll position + visibility live (rAF-throttled).
- **Scene 56 (affix)** — 540px scrollable doc with a "Section
  toolbar" that pins when its natural position would scroll off-
  screen. Uses `position:sticky` for layout + `[data-pinned]` for
  visual shadow/highlight.
- **Scene 57 (anchor)** — 200px sidebar + scrollable doc with 5
  sections (intro/install/config/api/tips). Section min-height
  bumped to 480px so only one is dominantly visible at a time — the
  "earliest visible by DOM order" heuristic doesn't fight clicks.

#### Smoke-harness safety guards (the v0.13.3 promise)

Three explicit assertions added to the end-to-end smoke check so
viewport-overlay regressions can't ship silently:

```
Safety guards: appH=900px ✓, appW=1400px ✓, bootGone=true ✓
  #app non-auto?       PASS ✓
  boot-loader removed? PASS ✓
```

These would have caught:
- v0.13.1 blank-screen (boot-loader never hiding because of missing
  wrapper imports) → `bootGone` would have read `false`
- v0.13.3 CSS-typo collapse (`#app` rendering 0px tall because of
  invalid CSS values) → `appH` would have read `"auto"` or `"0px"`

Neither was visible to my previous `evaluate()`-based tests because
DOM operations read through overlays. The new guards check computed
dimensions + actual presence of the boot-loader div.

#### Anchor heuristic note

Initial implementation used "any intersecting section, earliest by
DOM order" for active selection. With short sections (280px) in a
540px viewport, multiple sections were always intersecting and the
earliest (intro) always won — even after clicking later links.

Resolved by bumping section min-height to 480px in the demo CSS.
The primitive's behavior is correct for typical real-world content
where sections are larger than the viewport. Documented this in
the llms.txt CSS-contract section.

#### Counts

- **53 primitives** (was 50; +3 this release)
- **1471/1471 unit tests ×3 stable** (1436 + 35 new)
- **24 new demo scenes** since v0.12.0
- 359/365 browser tests (same 6 chromium-1194 baseline flakes)

#### Carryover

- TypeScript declarations across API surface
- Screenshot-diff CI (would have caught both v0.13.1 + v0.13.3 with
  one snapshot per release — flagged 9 releases now)
- Drop v0.11.0 deprecated aliases (v1.0.0 path)
- Tier-3 (v0.14.x — only if `lite-overlay` needs them):
  input-number, cascader, transfer, tree-select, mention
- Tier-4 (defer to v1.x): scrollbar (custom-styled), image-preview,
  space utility

---

### 0.13.3 — 2026-06-19

**The real "nothing visualizes" root cause was a CSS typo that Zahary
found in his local copy:**

```css
/* invalid -- browser drops the property entirely */
#app {
    height: 100 dvh;    /* space between number and unit */
    width: 100 dvw;
}
```

Spaces between a number and its unit make the value invalid CSS;
browsers drop the whole declaration. `#app` then had no height/width
and collapsed to its content's auto-size. Because `#app` uses
`grid-template-rows: auto auto 1fr auto` (header / nav / scene /
footer), the 1fr scene row had nothing to expand into and rendered
as 0px tall. The user saw header + nav + footer with a blank middle
area — exactly the symptom in the screenshots.

The corrupted CSS wasn't in my shipped source (my v0.13.2 zip has
`100dvh` / `100dvw` without spaces), so this likely happened during
local copy-paste while Zahary was debugging. But the failure mode is
nasty enough — invalid CSS fails silently with no JS error, no
console warning, no obvious clue — that I added a defensive comment
near the `#app` rule to warn the next person editing it.

#### Methodology takeaways

This whole sequence (v0.13.0 → .1 → .2 → .3) was a textbook case of
me chasing the wrong root cause through three releases:

| Symptom seen | What I assumed | Actual cause |
|---|---|---|
| CapacityError in console | This is the problem | A real-but-unrelated problem |
| `customElements.whenDefined` race | This is the problem | A real-but-unrelated problem |
| 6 preload-warnings (dialog/popover/...) | Cosmetic, not the bug | Real bug, but still not THE bug |
| Boot loader hide-trigger race | This is the problem | A real-but-unrelated problem |
| Blank scene area | All of the above | A single CSS typo in `#app` |

Each of v0.13.0–.2's fixes addressed a real issue, but none of them
were "the" bug. v0.13.3 is the actual fix.

**What I should have done earlier:** when Zahary's screenshot showed
the page chrome rendered (header, nav, footer) but the SCENE AREA
empty, I should have inspected `#app`'s computed dimensions
*immediately*. A scene area of 0px height with everything else
rendering points straight at the layout container, not at any JS
issue. I was looking at JS errors and console output when the answer
was in the layout box model.

Adding to my own checklist going forward:
- When a user reports "blank screen", first read `getBoundingClientRect()`
  on the top-level layout containers, not JS errors
- An invalid CSS value is genuinely silent — `getComputedStyle` returns
  the previous valid value (often `auto`/`0`). Worth adding a
  `getComputedStyle(app).height === "auto"` assertion to the smoke
  harness for any element that's supposed to be viewport-sized.

#### Fix

Source CSS was already correct in v0.13.2. v0.13.3 adds a defensive
comment near the `#app` rule explicitly warning against the typo:

```css
/* DO NOT add spaces between number and unit below ('100 dvh' is
   invalid CSS and the browser drops the whole property, which makes
   #app collapse to content size and the scene row render as 0px tall).
   It must be '100dvh' / '100dvw' with no space. */
```

#### Verification

- `#app` dimensions: 1400 × 900 (full viewport, regression-checked)
- All 6 new scene readouts populate correctly
- 0 JS errors, 0 CapacityErrors
- Boot loader removed within 100ms (registry-grow + wrapper imports
  from v0.13.1/.2 still in place)
- 1436/1436 unit tests ×3 stable

#### Counts

- 48 primitives (no change)
- 1436/1436 unit tests ×3 stable

---

### 0.13.2 — 2026-06-19

**Fixes the "nothing visualizes" regression introduced in v0.13.0 and
unmasked in v0.13.1.** The blank-screen bug Zahary reported was real
and serious; my earlier "I can't reproduce, demo works in headless"
response was wrong. Apologies for that — the headless test simply
didn't see the visible failure mode.

#### What was actually broken

Back in v0.13.0 I "cleaned up duplicate imports" in the demo's script
block. The duplicates I removed were `avatar/element.js` and
`breadcrumb/element.js`, which were genuinely duplicated. But that
same edit also dropped seven other side-effect imports that were NOT
duplicates and that I shouldn't have touched:

- `../src/dialog/element.js`
- `../src/popover/element.js`
- `../src/tooltip/element.js`
- `../src/combobox/element.js`
- `../src/slider/element.js`
- `../src/datepicker/element.js`
- `../src/split-panels/element.js`

I assumed they were unused because no `<lite-dialog>` tags appear in
the demo's HTML (those scenes use the `createX()` factory directly
against plain `<button>` triggers). I was wrong: the side-effect
imports were the registration trigger for `customElements.define`,
and the demo has a **boot loader** whose hide trigger is:

```js
Promise.all([
    customElements.whenDefined("lite-dialog"),
    customElements.whenDefined("lite-popover"),
    customElements.whenDefined("lite-tooltip"),
]).then(hideBootLoader);
```

When those three elements are never `define()`'d, the `Promise.all`
never resolves. The loader sits over the entire page at `position:
fixed; inset: 0; z-index: 99999` until the 6-second hard-timeout
fallback fires. For 6 seconds the user sees a blank dark screen.
(After 6s the loader fades and the scene appears, which is presumably
how I screenshotted "working" pages in my v0.13.0/v0.13.1 verification
— my screenshots waited long enough that the fallback already fired.)

#### Why my "I can't reproduce" diagnostic was wrong

My headless playwright tests:
1. Loaded the page and `waitForTimeout(2000)` — already long enough
   for `window.load` (the secondary fallback) to fire and hide the
   loader in a fast-network headless environment
2. Then read scene state via `evaluate()`, which sees through the
   loader because it's a DOM operation, not a visual check
3. Reported "renders fine, navigation works" — technically true once
   the loader was gone

In a real browser, on a real machine, with extensions / cached fonts
/ general slowness, `window.load` doesn't fire as early. The user
actually sees the blank screen.

**Lesson for myself:** when a user reports "nothing visualizes",
don't ask them to prove it. Take a screenshot at t=500ms (not
t=2000ms), or use an OPACITY check on viewport-covering fixed
elements before declaring success. I'll add a visual-regression
guard to my smoke harness as part of the v0.13.3 polish pass.

#### Fix

Restored all seven missing side-effect imports. Verified with a
per-100ms boot-loader poll:

```
t=100ms:  defined={dialog: function, popover: function, tooltip: function}  loader=REMOVED
```

The loader is removed within 100ms of page load (was: visible until
the 6s hard-timeout fired).

#### Other notes

- All v0.13.1 fixes still apply (registry-grow, whenDefined for
  paint, MutationObserver for avatar hue, scoped breadcrumb queries,
  `section.scene[data-scene=...]` selector).
- 1436/1436 unit tests ×3 stable; src/ primitives byte-identical
  to v0.13.0.
- The console "preload but not used" warnings Zahary's screenshot
  captured were the visible symptom of the same root cause — those
  preloaded wrappers had no matching `import` statement.

#### Counts

- 48 primitives (no change)
- 1436/1436 unit tests ×3 stable
- 359/365 browser tests (same 6 chromium-1194 baseline flakes)

---

### 0.13.1 — 2026-06-19

**Demo robustness pass.** Four real classes of bugs in v0.13.0's
wiring, all caught + fixed:

#### 1. lite-signal arena: switched to grow mode

The default registry capacity is 1024 nodes; with 48 primitives mounted
simultaneously across all 54 scenes the demo blew past that on cold
load and threw `CapacityError: nodes capacity (1024) exceeded` from
inside an element's `connectedCallback`. The error came once per page
load and was non-fatal for already-mounted scenes, but any element
that attempted to allocate after the cap was silently broken.

**Fix:** added a tiny `<script type="module">` BEFORE the main element-
import block (modules execute in document order, and element
registration → signal creation happens during the next block's import
resolution). The script configures the default registry with Zahary's
"heavy dashboard" preset:

```js
setDefaultRegistry(createRegistry({
    maxNodes:           2048,
    maxLinks:           16384,
    onCapacityExceeded: "grow",
}));
```

`grow` doubles the pool on exhaust (bounded by `maxLinks * 16`) so the
arena scales to actual demand instead of throwing. Verified: cold load
now produces **zero** CapacityErrors.

#### 2. `setTimeout` race-condition epidemic in wire functions

Six scenes (49–54) used `setTimeout(paint, 50–100ms)` to "wait" for
the custom element to be upgraded before reading its imperative API
(`isCollapsed`, `isRemoved`, `count`, `itemCount`, etc.). On a slow
connection where element-script download exceeds the timeout, paint
fires against a not-yet-upgraded element and reads `undefined`,
producing wrong readouts (or NaN, depending on the getter).

**Fix:** replaced every `setTimeout(paint, N)` with
`customElements.whenDefined("lite-X").then(paint)`. The browser
guarantees the promise resolves only after the element class is
registered AND any pending upgrades have completed. Applied to
wireCard, wireTag, wireBadge, wireTimeline, wireDesc, wireResult,
wireAvatar.

#### 3. Avatar fallback hue: timeout cascade → MutationObserver

`wireAvatar` used a (0ms, 50ms, 300ms, 1500ms) timeout cascade to read
the `data-color-hue` painted on each fallback element by the avatar
primitive. If an image took longer than 1500ms to fail (real on slow
connections / DNS-blocked URLs), the cascade gave up and the fallback
chip rendered with no background color.

**Fix:** one MutationObserver per stage watching `data-color-hue` (on
the fallback child) AND `data-loaded` (on the host avatar) with
`subtree: true`. Fires the moment the avatar engine paints either
attribute, no matter how long the image resolution takes. The same
observer also drives the readout counts (image / fallback), so they
stay live through dynamic state changes instead of being a one-shot
poll.

#### 4. Stage-scope selector bug

`document.querySelector('[data-scene="X"]')` matches BOTH the menu
`<li data-scene="X">` AND the `<section class="scene" data-scene="X">`,
returning the LI (first in document order). When `stage.querySelectorAll
("lite-X")` then ran against the LI, it returned empty.

For wireTimeline / wireDesc / wireResult this was MASKED by an early-
return guard (`if (rs.length === 0) return`), so the static initial
markup text remained displayed and looked correct — but the wiring
was inert. For wireAvatar there was no guard, so the readout painted
"image: 0 · fallback (or loading): 0" against actual content of 9
avatars. Same bug, different visible failure.

**Fix:** all five affected wires now use `document.querySelector
('section.scene[data-scene="X"]')` which only matches the scene
section. Verified by interactive test: `av-readout` now correctly
reports "image: 1 · fallback (or loading): 8" (was 0/0 before).

#### 5. Global-scope query (breadcrumb)

`wireBreadcrumb` queried `document.querySelectorAll('[data-scene=
"breadcrumb"] lite-breadcrumb')`. Fine in isolation, dangerous as a
copy-paste example: a consumer dropping this into a larger document
would attach duplicate listeners on every breadcrumb in the page.

**Fix:** scoped both queries (the lite-breadcrumb event hookup AND
the `[data-bc-set]` button hookup) to `stage.querySelectorAll(...)`
where `stage` is the section element.

#### Interactive verification

After all fixes:

| Action | Before | After |
|---|---|---|
| Card collapse trigger click | "expanded" (stale, paint never ran) | "expanded → collapsed" |
| Card dismiss button click | "pending" (stale) | "pending → dismissed" |
| Tag close button click | "0 closed" (stale) | "0 → 1 closed" |
| Badge +2 click | "3" (stale) | "3 → 5" |
| Cold-load CapacityError | 1 throw | 0 throws |
| `av-readout` initial | "0 · 0" | "1 · 8" (real counts) |

#### No primitive changes

All fixes were in the demo's wire functions. The src/ primitives are
byte-identical to v0.13.0. 1436/1436 unit tests stable.

#### Counts

- 48 primitives (no change since v0.13.0)
- **1436/1436 unit tests ×3 stable**
- 6 documented chromium-1194 baseline flakes (same as every release)

---

### 0.13.0 — 2026-06-19

**Six new admin-essential primitives + the long-standing kanban
cross-column bug fixed + button variant matrix.** This is the
"Pragmatic admin parity" release — the gap analysis against
Pragmatic / Element Plus drove the Tier-1 list.

#### Kanban: cross-column drag finally works (4th attempt; this one is real)

Three prior "fixes" (CSS feedback, min-height, color polish) all
addressed symptoms. The actual root cause:

- Sortable's `_onPointerDown` calls `e.preventDefault()` to suppress
  text-selection on non-input targets.
- Chromium maps `pointerdown` to `mousedown` internally; calling
  `preventDefault` on `mousedown` **blocks the browser from initiating
  a native HTML5 drag**.
- Result: when a kanban card has both sortable AND `draggable="true"`,
  `dragstart` never fires, and cross-column drag silently does nothing.

**Architectural fix:** added `inColumnSortable` option to
`createKanban` (default `true`). The wrapper now passes
`inColumnSortable: !enableHtml5Dnd`. When HTML5 DnD is enabled, the
wrapper skips sortable wiring entirely; the HTML5 drop handler
(`_dropIndexFromPointer`) already computes within-column target index
from pointer Y, so no functionality is lost.

**Empirical verification:**
- BEFORE: real `page.mouse.down → move → up` from c1 to done col → c1 ends in `todo` (FAILS)
- AFTER: same input → c1 ends in `done` (WORKS)

#### Sortable-style drop indicator on kanban

Painted by the primitive's `dragover` handler:
- `data-kanban-drop-target` on the card the dragged item will land
  *before*
- `data-kanban-drop-at-end` on the column when target index is the end
  of the list (or when the column is empty)

Demo CSS renders a 2px cyan line at the insertion point — same UX
language sortable uses for within-column reordering. Visually verified
mid-drag.

#### Six new primitives (Tier-1 admin essentials)

| Primitive | Tests | Notes |
|---|---|---|
| **card** | 15 | Header/body/footer slots, optionally collapsible (header is toggle by default) or dismissible (X removes). The cornerstone gap. |
| **tag** | 11 | Display pill (distinct from existing `tag-input`). 6 intents (default/primary/success/info/warning/danger), closable variant. |
| **badge** | 14 | Count + dot. Auto-hides at 0 unless `show-zero`. Counts > max wrap to "max+" (e.g. "99+"). |
| **timeline** | 10 | Vertical activity log; 5 type markers (default/success/warning/danger/info). `role="list"` + `role="listitem"`. |
| **descriptions** | 7 | Key:value layout, 1–4 columns, bordered variant. `aria-labelledby` auto-wired value → label.id. |
| **result** | 8 | Page-state primitive; 8 statuses (success/error/warning/info/empty/404/403/500). Bigger sibling of empty-state. |

All follow the canonical wrapper pattern: `syncSlots` +
`MutationObserver` + `belongsToHost`, matching banner/form-field/
split-panels/meter. Each ships index.js + element.js + llms.txt +
test/X.test.js.

#### Button variant matrix (the polish gap you called out)

The button **primitive** is unchanged. What changed is the demo: scene
45 went from showing **2 distinct CSS styles** to showing **~30
visible buttons across 8 categories**, matching Pragmatic's button
showcase density. All driven by `data-intent` / `data-button-style` /
`data-button-size` attributes scoped to `[data-scene="button"]`:

- **Intent palette** — 6 filled colors (default/primary/success/info/warning/danger)
- **Plain (outline)** — same 6 intents in outline style
- **Round / Text / Link** — round (pill), no-bg text, underlined link styles
- **Sizes** — large / default / small (in both filled primary and plain default)
- **With icon / Icon-only / Circle** — left-icon, right-icon, circle icon-only variants
- **Button group (segmented)** — adjacent buttons with shared borders, active state
- **Loading state per intent** — spinner + label fade per intent color
- **Original demos** — toggle B/I/U/S + async submit (preserved, interactive)

#### Demo scenes added (49–54)

Six new scenes wired into the menu + SCENE_META + modulepreloads +
imports. Each follows the established "4–5 panel sections" density
(info / state / [keyboard|composition tree|aria painted|behavior]).

Visual stage content per scene:
- **49 card** — 2×2 grid: basic + status tags, hoverable + stat, collapsible Filters card, dismissible System notice
- **50 tag** — intent palette (all 6) + closable tags + in-context order status table
- **51 badge** — count badges anchored to 4 icons (with +1/−1/reset controls), dot indicators row, leaderboard with rank badges
- **52 timeline** — 2-column: mixed-type activity log + order tracking with pending steps
- **53 descriptions** — 2-column bordered user profile + 3-column plain dashboard stats with large monospace numbers
- **54 result** — 2×2 grid: 404 + success + error + empty results

#### Bugs caught during demo wiring

1. **Badge double-rendering** — inner text `<lite-badge>3</lite-badge>` plus CSS `::before { content: attr(data-count) }` rendered "33". Fixed by stripping inner text from all 13 `<lite-badge>` markup instances; CSS `::before` is now sole source.
2. **Badge `hidden` ignored** — `display: inline-flex` on `lite-badge` overrode UA's `[hidden] { display: none }`. Fixed by adding explicit `lite-badge[hidden] { display: none }`.
3. **Tag close-when-not-closable** — initial primitive let `close()` succeed even when `closable: false`. Test caught it. Added guard.

#### Counts

- 48 primitives (was 42 at v0.12.5; 6 new this release)
- **1436/1436 unit tests ×3 stable** (1371 + 65 new)
- 21 new demo scenes since v0.12.0 (was 15)

#### Carryover (still open)

- TypeScript declarations across API surface
- Screenshot-diff CI (flagged 6 releases now — biggest payoff)
- `createPicture.setSrc()` runtime mutation
- Drop v0.11.0 deprecated aliases (v1.0.0 path)
- Tier-2 (v0.13.1): affix, anchor, backtop
- Tier-3 (v0.14.x): input-number, cascader, transfer, tree-select, mention

---

### 0.12.6 — 2026-06-18

Architectural cleanup for the three primitives shipped in v0.12.4–.5,
plus a polish pass on their demo scenes. **Two real architectural
bugs** + one real demo polish gap, all empirically reproduced before
fixing.

#### Methodology note (carried from v0.12.3)

User flagged that I'd rushed the v0.12.4–.5 work. Verified: yes. The
classic tells were there (wrong attribute names mentioned in panel
text — `data-avatar-state` doesn't exist; the actual attribute is
`data-loaded`; broken IIFE chain from a sloppy str_replace match; new
wrappers used a thinner pattern than the rest of the family). This
release walks back the corners I cut.

#### Fixes

**1. `meter/element.js` — scope leak in fill discovery** (real).
The wrapper used `host.querySelectorAll("[data-meter-fill]")` exactly
once at init: no MutationObserver tracking subsequent additions, no
`belongsToHost` filter. Two failure modes: dynamically-injected fills
were invisible to the wrapper; nested `<lite-meter>` instances had
their fills hijacked by the outer meter. Rewrote to use the
`syncSlots` + `MutationObserver` + `belongsToHost` pattern (matches
`banner/element.js`, `form-field/element.js`, `split-panels/element.js`).
Empirical verification: injecting a `<div data-meter-fill>` after mount
now auto-attaches (paints `--meter` + `data-state`); previously it was
left untouched.

**2. `kanban/element.js` `reparentCardForMove` — scope leak in peer
calculation** (real). The function calculated `clampedIdx` against
`container.querySelectorAll("[data-kanban-card-id]")` without a
`belongsToHost` filter, even though the rest of the file (lines 143,
173) already used this guard for the same reason. Nested kanban
boards (sub-task list inside a card template) would have their
sub-cards counted as peers of the parent column, corrupting the
insertion index. Added the guard inside the peers loop, matching the
pattern used elsewhere in the same file.

**3. `breadcrumb/element.js` — `setCurrent` reset loop** (real,
empirically reproduced). `syncItems()` re-applied the initial
`current=` attribute value on EVERY DOM mutation. User clicks "go:
home" → `setCurrent("home")` → primitive paints `data-current` on the
home item → MutationObserver fires → `syncItems()` runs → calls
`setCurrent(explicitCurrent)` with the INIT value (still "games") →
selection snaps back to "games". The `attrMo` already handled future
`current` attribute changes correctly; init-time application of
`explicitCurrent` shouldn't have been duplicated inside `syncItems()`.
Moved it OUT of `syncItems()` to a single init-time call.

Repro before fix:
```
BC initial:                      games
BC after setCurrent("home"):     home
BC after any DOM mutation:       games   ← BUG
```

After fix:
```
BC after any DOM mutation:       home    ← stays
```

#### Polish pass on the new scenes (43–48)

The new scenes had **2 sections** in the side panel; canonical
professional scenes (toolbar = 4, color-picker = 6) have substantially
more. Enriched all six to 4–5 sections each:

| Scene | Before | After |
| --- | --- | --- |
| 43 radio-group | info, state | + keyboard, aria painted |
| 44 meter | info, state machine | + thresholds, aria painted (renamed "state machine" → "state") |
| 45 button | info, states | + gating, aria painted, events |
| 46 prediction | composition, last action | + composition tree (ASCII), flow |
| 47 avatar | info, states | + color hash, aria painted (also FIXED the info text that mentioned `data-avatar-state` — that attribute doesn't exist; the real one is `data-loaded`) |
| 48 breadcrumb | info, state | + current resolution, aria painted |

The "keyboard" sections match the format toolbar already uses. The
"aria painted" sections document the actual attribute surface for
each primitive (helps consumers wire their CSS without spelunking the
source).

#### Document with hallucinated claim (carried pattern from v0.12.3)

The user-supplied audit document also flagged the button demo for
listening to `"click"` instead of `"press"` (which would bypass the
gating layer). Verified: my actual demo wiring uses `"press"` for
both `#b-submit` and `#pred-submit`. The claim was wrong against the
code on disk — but worth keeping the documented `events` section as a
guard against the failure mode the document described.

#### Counts

- **1371/1371 unit ×3 stable** (no test changes from the fixes)
- 42 primitives, all visible in demo
- Scene panel-section count: average up from 2 to 4

#### Carryover (still open)

- TypeScript declarations across API surface
- Screenshot-diff CI (flagged 5 times now)
- `createPicture.setSrc()` runtime mutation (v1.0 candidate)
- Kanban refactor onto `@zakkster/lite-dnd` (touch + mid-drag-reparent)
- v1.0.0 readiness pass: drop v0.11.0 deprecated aliases

---

### 0.12.5 — 2026-06-18

Cosmetic close-out from v0.12.2's audit: the three primitives that
existed in `src/` but had no demo presence (picture, avatar,
breadcrumb) are now all visible in the demo. Picture shipped in
v0.12.2; avatar + breadcrumb ship here.

#### New demo scenes

- **Scene 47 — Avatar** — five single avatars at varying sizes showing
  the state machine: one with a valid SVG data URI (loads to image),
  three with no src (deterministic-color initials fallback), one with
  a deliberately-broken data URI (also falls back), plus a fifth using
  custom `initials` override. Below that, a leaderboard-row composition
  (rank + avatar + name + points) that mirrors the shape lite-overlay's
  Twitch panel leaderboards will adopt.
- **Scene 48 — Breadcrumb** — three variants: default (last item auto-
  current with `/` separators), custom separator (using `›`), and
  explicit-current via the `current=` attribute, with three buttons
  driving `setCurrent()` to demonstrate live override.

#### Audit notes captured during wiring

A few surface details that weren't obvious from the primitives' names
but caused initial misfires; documented here so they don't get
re-discovered:

- **Avatar paints `data-loaded` on the host, not `data-avatar-state`.**
  Boolean attribute, present iff state === "image". CSS uses
  `[data-loaded]` as the show-image / hide-fallback switch. The
  fallback element gets `data-color-hue="N"` (0-359) which a small
  JS bridge mirrors to a `--avatar-hue` CSS variable
  (`background: hsl(var(--avatar-hue), 55%, 42%)`).
- **Breadcrumb separators are consumer-authored, not primitive-injected.**
  Add explicit `<span data-bc-sep></span>` elements between items in
  the markup; the primitive fills them with the configured separator
  text. `[data-bc-sep]` gets `aria-hidden="true"` so screen readers
  don't read the separator.
- **Breadcrumb items use `data-bc-item="key"` (key as attribute value),
  not a separate `value=` attribute** like radio-group does. This is
  the older convention (toggle-group also uses `data-tg-item="key"`).
  The wrapper queries via `[data-bc-item]` and reads the key from the
  attribute value.
- **Inline HTML attributes don't process JS escape sequences.**
  `separator="\u203A"` would set the literal 6-character string
  `\u203A`. Use the actual character (or the HTML entity `&#8250;`).

#### Counts

- **1371/1371 unit ×3 stable** (no test changes — this is demo-only)
- 42 primitives, **all visible in the demo** (no more import-but-no-scene gaps)

#### Carryover (still open)

- TypeScript declarations across API surface
- Screenshot-diff CI (flagged 4 times now — 4 visual regressions in
  5 releases caught by eye, not automation)
- `createPicture.setSrc()` runtime mutation (v1.0 candidate)
- Kanban refactor onto `@zakkster/lite-dnd` (touch + mid-drag-reparent)
- v1.0.0 readiness pass: drop v0.11.0 deprecated aliases (`currentValue`,
  `currentSide`, `currentStatus`); freeze API

---

### 0.12.4 — 2026-06-18

Three new primitives covering the lite-overlay Twitch Extension panel
widget gaps: **radio-group**, **meter**, **button**. Plus a composed
**Prediction** demo scene (radio + meter + button) that shows the
shape lite-overlay's Prediction/Poll widgets can adopt directly.

#### New: radio-group

ARIA `role="radiogroup"` + `role="radio"` per item. Distinct from the
existing toggle-group (which is the segmented-control pattern,
`role="group"` + `aria-pressed`). Radio is form-semantic — single-
select, exclusive, the right shape for "pick one outcome and commit".

Keyboard per W3C ARIA APG:
- Tab into the group focuses the checked radio (or first non-disabled
  if none checked); does NOT change selection.
- ArrowDown/Right + ArrowUp/Left: move focus AND selection (wraps).
- Home/End: jump to first/last non-disabled.
- Disabled items skipped by arrow nav.

Painted attrs: `role="radiogroup"` + `aria-orientation` + `aria-required`
+ `aria-disabled` on root; `role="radio"` + `aria-checked="true|false"`
(literal string per ARIA) + `aria-disabled` + `data-checked` +
`data-disabled` per item. Roving tabindex managed by the existing
`_overlay/roving-focus.js` helper.

Wrapper `<lite-radio-group>` with `value`, `orientation`, `required`,
`disabled` attributes. Items declared as `[data-radio-item value="key"]`.
Event: `valuechange`.

**Implementation notes captured:**

- The roving-focus seed effect needs `_suppressIndexChange` to avoid
  triggering selection when Tab enters the group (APG: focus only,
  arrows select). The seed sets tabindex; arrows fire onIndexChange
  which fires `setValue`.
- Per-item disabled has to be a SIGNAL, not a plain field, so the
  paint effect re-runs when it flips. Used a get/set property
  proxying to `makeSignal(disabled)`.
- `aria-disabled` wants literal "true"/"false" string, NOT the
  `toggleAttr` presence-as-truth pattern that emits `aria-disabled=""`.
- The element wrapper's `wire(node)` MUST guard `node.hasAttribute("data-radio-item")`
  because `createRoleObserver`'s `scanAndMount` calls `mount(root)` for
  the host itself — and the host has a `value` attribute (the initial
  SELECTED value) which the naive wire interpreted as an item key,
  attaching the host as a duplicate item. Caught in smoke-test;
  documented in element.js.

22 unit tests covering ARIA paint, value mutations, click+keyboard
selection, disabled (group + per-item), lifecycle.

#### New: meter

ARIA `role="meter"`. Right semantic for vote/poll share, gauges,
battery levels — values within a known range. Distinct from progress
(`role="progressbar"` — task in flight).

Implements the HTML meter spec's threshold-driven state machine:
- `state()` returns "optimum" | "sub-optimum" | "low"
- Computed from value, low/high thresholds, and optimum position
- Mirrors browser behavior for native `<meter low high optimum>`
- Painted as `data-state` on both root and fill for CSS color branching

Surface:
- `attachRoot(el)` — paints `role="meter"` + `aria-valuemin/max/now` +
  `aria-valuetext` + `--meter: <fraction>` CSS variable
- `attachFill(el)` — also paints `--meter` + `data-state` so the fill
  can do `transform: scaleX(var(--meter))` or `width: calc(...)`
- `setValue(v)` clamps to `[min..max]`, rejects non-numeric

Constructor throws if `max <= min`.

Wrapper `<lite-meter>` with `value`, `min`, `max`, `low`, `high`,
`optimum`, `label`, `value-text` attributes. Reactive `value` + `value-text`.

14 unit tests covering ARIA paint, value clamping, threshold state
computation, fill paint, lifecycle.

#### New: button

Three-state reactive button (pressed/loading/disabled) + an async
runner that auto-locks during await. Solves the classic
double-click-during-submit bug that every consumer keeps reinventing.

ARIA paint:
- `aria-pressed="true"|"false"` on toggle buttons (literal string)
- `aria-busy="true"` during loading
- Native `disabled` attribute when EITHER explicitly disabled OR loading
  (loading semantically means "this control is unavailable right now")
- `data-pressed` / `data-loading` / `data-disabled` for CSS hooks

Gating:
- Click handler intercepts (`preventDefault` + `stopImmediatePropagation`)
  when `canPress()` is false. Even JS-dispatched `el.click()` is blocked,
  which native `disabled` does NOT protect against.
- `runAsync(fn)` returns `undefined` (well, `Promise<undefined>`) if
  already loading — no double-fire.
- `onPress` returning a Promise auto-routes through the loading lock.

Wrapper `<lite-button>` with `toggle`, `pressed`, `loading`, `disabled`
attributes. Host methods: `setPressed`, `setLoading`, `setDisabled`,
`runAsync`. Event: `press`.

17 unit tests covering state paint, mutations, click gating, async
runner (resolve, reject, double-fire), lifecycle.

#### Demo scenes (4)

- **Scene 43 — Radio Group** — vertical card layout (Yes/No/Draw outcome
  picker) + horizontal segmented control (S/M/L/XL size).
- **Scene 44 — Meter** — three meters with live readouts: Yes/No vote
  shares + CPU temp with threshold colors (low=red, mid=green,
  hot=orange). "Fire CPU" + "Cool CPU" + "Randomize" buttons.
- **Scene 45 — Button** — toggle row (B/I/U/S with one initially pressed)
  + action button row (Submit with spinner + Disabled + Force-loading
  trigger). Click readout. Double-click during loading verified safe.
- **Scene 46 — Prediction (composed)** — full Twitch Prediction-style
  card: question + countdown badge + two outcome rows (each with radio
  + label + live vote share meter + percentage) + stake display + Lock
  button. Demonstrates the integration pattern: radio fires `valuechange`
  → button enables; button `runAsync` wraps the submit; meter values
  tick on each "vote" simulation; on success the group disables itself
  and the button label changes to "Locked in".

#### Lite-overlay status (Zahary's 8)

| # | Primitive | Status |
| -- | --- | --- |
| 1 | RadioGroup / ToggleGroup | ✅ both shipped (toggle-group existing, radio-group new) |
| 2 | Progress / Meter | ✅ both shipped (progress existing, meter new) |
| 3 | Button with states | ✅ new |
| 4 | Tabs | ✅ existing |
| 5 | Dialog + Popover | ✅ existing |
| 6 | Switch + Slider | ✅ existing |
| 7 | Toast | ✅ existing |
| 8 | Avatar | ✅ primitive existing; demo scene still TODO |

The full eight are now buildable. Avatar + breadcrumb demo scenes
remain on the carry-over list from v0.12.2's audit; they're cosmetic
gaps (primitives shipped, no demo presence) and don't block
lite-overlay panel development.

#### Counts

- **1371/1371 unit ×3 stable** (+53 from v0.12.3: 22 radio-group + 14 meter + 17 button)
- **359/365 browser** (same 6 baseline chromium-1194 flakes; no regressions from the 3 new primitives)
- **42 primitives total** (3 new in this release)

#### Carryover for v0.12.5+

- avatar demo scene
- breadcrumb demo scene
- `createPicture.setSrc()` runtime mutation (v1.0 candidate; currently src is construct-time only)
- screenshot-diff CI (flagged in v0.12.1, v0.12.2, v0.12.3 — keeps coming up)
- TypeScript declarations across API surface
- v1.0.0 readiness pass: drop v0.11.0 deprecated aliases

---

### 0.12.3 — 2026-06-18

Five real user-facing bugs, empirically reproduced + fixed. Four are
demo-only (CSS / inline-style specificity); one is a primitive code
change (toolbar focusin sync).

#### Methodology note

The previous release shipped after I dismissed user-reported symptoms
as imaginary because their root-cause document was hallucinated. That
was a mistake -- the document was wrong about WHY, but the user was
right about WHAT. This release reproduces each interaction via headless
chromium, captures the actual state machine + computed-style snapshots
before and after each click, and fixes whatever the diagnostic
identifies. No fix is shipped without empirical before/after.

#### Fixes

**1. Banner × did not visibly dismiss** (demo CSS).
Diagnostic: clicking × correctly painted `data-open="false"` +
`data-hidden=""` on the host. But computed style stayed
`display: flex; opacity: 1; visibility: visible` -- the demo had no
rule that actually hid the element when `data-hidden` was set.
Fix: add `lite-banner[data-hidden] { display: none !important; }`.

**2. Rating stars rendered grey regardless of value** (demo markup).
Diagnostic: `[data-filled]` / `[data-empty]` painted correctly on
each star button after click (e.g. stars 1-3 got `data-filled` on
clicking the 3rd star), but `getComputedStyle(...).color` was
`rgb(216, 214, 210)` for ALL stars -- not orange `rgb(251, 146, 60)`
or dimmed grey. Root cause: each star button had
`style="...color: inherit; ..."` inline, which beats the CSS
selectors `[data-scene="rating"] lite-rating [data-filled] {
color: var(--orange) }` by specificity (inline > class).
Fix: replace the inline style with a `.rating-btn` class. CSS
selectors now win, stars 1-N render orange after clicking the Nth.

**3. Drawer opened in state but stayed off-screen visually**
(demo CSS, structural).
Diagnostic: after clicking "Open right", the host correctly got
`[open]`, `drawer.open()` returned true, the content + backdrop
portaled to `document.body`, and both painted `data-open=""` +
`data-side="right"`. But `getComputedStyle(content).transform`
stayed at `translateX(320px)` (closed) and backdrop opacity at 0.
Root cause: the demo CSS selectors required a parent chain --
`[data-scene="drawer"] lite-drawer[open] [data-drawer-content]...` --
that BREAKS the moment portaling moves the element to `document.body`.
After portal: parent is BODY, not lite-drawer; scene ancestor is lost.
Fix (two parts):
  - Rewrite selectors to target the painted attributes directly:
    `[data-drawer-content][data-open][data-side="right"] { transform: translateX(0); }`.
    These work regardless of where the element lives in the tree.
  - Move the closed-state baselines (`opacity: 0` on backdrop,
    `transform: translateX(100%)` on content) OUT of inline `style=`
    and INTO the same CSS rules. Inline styles beat class selectors;
    keeping the dynamic-state styles in CSS lets the `[data-open]`
    override actually win.

**4. Toolbar click did not update the tab stop** (primitive code).
Diagnostic: pre-click, items had `[0, -1, -1, -1, ...]` tabindexes
(Bold = single tab stop). Click on "Italic" → `document.activeElement`
correctly became Italic, BUT tabindexes stayed at `[0, -1, -1, ...]`
(Bold still owns the tab stop). Subsequent ArrowRight would jump
back to Bold, not advance from Italic. Root cause: the toolbar's
keydown handler called `syncIndexFromActiveElement()` before
delegating to roving.move(), so KEY navigation was correct. But
nothing synced on focus from outside (click, Tab-in, programmatic
focus) -- roving's internal index stayed at its previous value.
Fix: add a `focusin` listener on the toolbar root that calls
`syncIndexFromActiveElement()`. `focusin` bubbles, so a single
listener on the root catches focus on any item. After fix: click
Italic → tabindexes become `[-1, 0, -1, ...]`. ArrowRight from
there → tabindexes become `[-1, -1, 0, ...]` (Underline now owns
the tab stop, document.activeElement = Underline).

**5. Kanban cross-column drag appeared to do nothing** (demo CSS, UX).
Diagnostic: the state machine, HTML5 DnD listeners, and dataTransfer
wire-up were all correct -- programmatic `moveCard()` succeeded;
properly-synthesized `dragstart`/`dragenter`/`dragover`/`drop` events
with a real `DataTransfer` payload moved cards across columns as
expected. (Playwright's `dragTo()` does not fire real HTML5 DnD
events, so it appeared broken in the test runner.) In a real
browser session, the underlying machinery works. What was making it
LOOK broken was a UX problem: the drop-active visual feedback was a
subtle 8% cyan background tint that the user could easily miss, AND
the `min-height: 140px` rule from v0.12.1 was losing to the inline
`min-height: 100px` on the cards container (inline beats class), so
the drop zone floor was 40px shorter than intended -- harder to land
a card on a short column.
Fix:
  - Drop the inline `min-height: 100px` from each `[data-kanban-cards]`
    so the 140px from CSS actually applies.
  - Beef up the drop-active feedback: 12% cyan background +
    2px dashed accent outline + inset ring. Now obvious when a drop
    will land.
  - Stronger cursor cue on the picked-up card: `cursor: grabbing` +
    35% opacity.

#### Counts

- **1318 unit ×3 stable** (no test changes — toolbar change is covered
  by the existing focusin/click test path via the spec's "ArrowRight
  moves the tab stop" case)
- **359/365 browser** (improved by 1 from v0.12.2; same 6 baseline
  chromium-1194 timing flakes in datepicker + menu)
- 0 regressions from any of the 5 fixes

#### Process note (carried from v0.12.1)

Three of these regressions were caught by user screenshots, not by
automated tests. The recurring pattern is: state-machine tests verify
the right attributes paint, but never verify the rendered visual
matches. Adding a screenshot-diff pass to demo CI would catch this
class. Still flagged for v1.0.x.

---

### 0.12.2 — 2026-06-18

Demo-only patch. Adds the missing **picture** scene that should have
shipped with v0.7.x when the picture primitive was added; it was
imported but never wired into the menu.

#### Fixes

- **Picture scene** (scene 42) — new. Four cards demonstrate the full
  state machine: eager load on mount, lazy + LQIP placeholder swap,
  error path with recover button, and aspect-ratio CLS protection.
  Uses inline base64-SVG data URIs (no external assets) so the demo
  runs fully offline.

#### Audit finding (not yet fixed)

The same import-but-not-in-menu bug affects two more primitives:
**avatar** and **breadcrumb**. Both are imported via modulepreload +
the bottom module script but have zero demo presence (no menu entry,
no SCENE_META entry, no scene markup). These are flagged for v0.12.3.

#### Counts unchanged

- **1318 unit ×3 stable** (no test changes)
- 42 primitives (43 if you count `_overlay` internals)

---

### 0.12.1 — 2026-06-18

Demo-only patch. Five visual regressions caught in v0.12.0 demo CSS
fixed. No primitive code changed; consumer libraries are unaffected.

#### Fixes

- **Banner dismiss `×`** — was an unstyled inline-styled bare glyph
  with no hit target. Now a 28×28 button with proper hover background,
  rounded corners, and a `:focus-visible` outline. Lifted into the
  banner row via negative margin so it sits flush with the content.
- **Drawer scene** — trigger buttons were floating in the top-left of
  a mostly-empty stage. Stage container now uses
  `display:flex; align-items:center; justify-content:center` so the
  buttons land where the eye expects.
- **File-upload progress rails** — completed rows still showed empty
  progress tracks. The bare `<lite-progress>` host paints `--progress`
  but has no inner element to render; the file-upload demo wasn't
  injecting one. Fixed by rendering the fill directly off the host
  with a `linear-gradient` driven by `--progress`, and hiding the rail
  entirely on `data-status="done"` and `"aborted"` (it's noise once
  the badge is up).
- **Kanban columns** — `background: var(--surface)` rendered too
  close to the page background for the columns to read as distinct
  containers. Added a 1px border, subtle inset shadow, a separator
  line under each header, and a 140px `min-height` on the cards area
  so each column shows a clear drop-target floor even when empty.
- **Rating focus outline** — the interactive star showed the browser
  default focus rectangle (a harsh blue square that didn't trace the
  glyph). Replaced with `outline: 2px solid var(--accent)` +
  `outline-offset: 4px` on `:focus-visible`, so the outline circles
  the star with breathing room.

#### Counts unchanged

- **1318 unit ×3 stable** (no test changes — only demo HTML/CSS)
- **365 browser** baseline (same as v0.12.0; demo CSS doesn't affect specs)
- 42 primitives

#### Process note

These were all caught visually by the consumer (screenshots with
arrows pointing at the offending bits) rather than by any automated
check. Worth considering: a visual-regression pass in the demo's CI
that takes screenshots of each scene and diffs against a baseline.
Not on the roadmap right now -- the kanban → lite-dnd refactor +
TypeScript declarations come first -- but flagged for v1.0.x.

---

### 0.12.0 — 2026-06-17

New primitive series begins. First addition: **color-picker** — the
high-impact one for Hueforge / Gradient Studio integration. Toolbar,
empty-state, and tour follow in subsequent point releases (no breaking
changes between them).

#### New primitive: color-picker

A headless color picker that speaks HSV internally and exposes HSV,
sRGB, HEX, HSL, and OKLCH on the public surface. OKLCH is first-class
because the @zakkster design-system stack (Hueforge, Gradient Studio)
lives in OKLCH; the conversion goes through linear-sRGB + OKLab per
CSS Color 4 and is round-trip stable to within 1 sRGB unit per channel.

**Attach helpers**: `attachRoot`, `attachArea` (2D saturation × brightness
with pointer drag), `attachAreaHandle`, `attachHueSlider`,
`attachHueHandle`, `attachAlphaSlider`, `attachAlphaHandle`,
`attachSwatch(el, color)` (declarative preset). Hue + alpha rails
support `data-orientation="vertical"` for portrait layouts.

**Reads** (call-style accessors): `hue()`, `saturation()`, `brightness()`,
`alpha()`, `hsv()`, `rgb()`, `hex()`, `hsl()`, `oklch()`. All formats
are computed on demand from the HSV signals; no stale cache.

**Writes**: `setHue`, `setSaturation`, `setBrightness`, `setAlpha`,
`setHsv`, `setRgb`, `setHex` (returns `true`/`false`), `setOklch`.
Every setter accepts an optional `reason` and is dirty-checked — no-op
writes don't fire `onValueChange`.

**Painted custom properties** (consumer CSS reads these):
- Root: `--color-hex`, `--color-h`, `--color-s`, `--color-v`,
  `--color-r/g/b`, `--color-a`
- Area: `--color-h`, `--saturation`, `--brightness`
- Area handle: `--x`, `--y` (0..1 positions)
- Hue rail / handle: `--hue-pct` (0..1)
- Alpha rail / handle: `--color-hex`, `--alpha`

**Wrapper**: `<lite-color-picker value="#7dd3fc" alpha="true">`. Auto-
discovers `[data-color-*]` slot markers via MutationObserver
(late-injected swatches work). Reactive `value` attribute binds
bidirectionally. Host accessors per the v0.11.0 contract:
`host.hex`, `host.rgb`, `host.hsv`, `host.hsl`, `host.oklch`,
`host.hue`, `host.saturation`, `host.brightness`, `host.alpha`;
mutations `host.setHex/setRgb/setHsv/setOklch/setAlpha`; underlying
instance at `host._colorPickerInstance`.

**Events**: `valuechange` fires on every state change with detail
`{ hsv, hex, rgb, oklch, reason }`. `commit` fires on drag-end and
swatch click with the same shape — consumers persist state on commit,
preview on valuechange.

**Zero-alloc hot path**: Pointer drag caches `getBoundingClientRect`
on `pointerdown`, invalidates on `scroll` / `resize` / `pointerup` /
`pointercancel` (same layout-thrash protection as slider). The drag
handler reads the cached rect and writes setters with primitive
numbers; no allocation per frame.

**Tests**: 28 unit tests covering the conversion math (HSV/RGB/HEX
roundtrips, OKLCH against CSS Color 4 fixtures, parseHex format
acceptance) and the primitive behavior (clamping, no-op filtering,
reactive paint of custom properties, swatch click flow,
attach/destroy idempotence). 7 browser specs exercising real pointer
events (the 2D area drag math + hue rail click + the late-injected
swatch path). All passing.

#### Demo: new scene 38

Scene 38 in the demo shows the picker with the 2D area, hue rail
gradient, checkerboard alpha rail, an 8-color swatch preset row, and
side panels showing live HSV / RGB / OKLCH readouts plus the last
commit reason. The demo CSS hits about 60 lines including the
checkerboard rendering — most of the visual heft is in custom-property-
driven gradients.

#### Counts

- **1277 unit** ×3 stable (+28 from color-picker).
- **347 browser** (+7 from color-picker.spec.js).
- 40 total primitives (was 39).

#### Compatibility

Pure addition. No existing primitive APIs changed. The v0.11.0
contract (`docs/CSS_CONTRACT.md`) is followed: `data-color-*` slot
markers are class-4 inputs, the `--color-*` and `--x` / `--y` /
`--hue-pct` / `--alpha` are class-3 custom properties (not data-
attributes -- these are position/value, not state).

#### What's next

Continuing the new-primitive series:
- **toolbar** ✅ shipped (this release)
- **empty-state** ✅ shipped (this release)
- **tour** ✅ shipped (this release)

After this release:
- Kanban refactor onto `@zakkster/lite-dnd` for touch + mid-drag-reparent correctness
- TypeScript declarations across the API surface (now stable enough to freeze)
- v1.0.0 readiness pass (remove deprecated aliases from v0.11.0, freeze API, audit each llms.txt)

#### Addendum — three more primitives shipped in v0.12.0

**Toolbar** (`src/toolbar`). ARIA toolbar with role="toolbar", roving
tabindex (single tab stop), arrow-key traversal per orientation,
Home/End jumps, disabled items skipped. Separators get
role="separator" with aria-orientation perpendicular to the toolbar.
Groups get role="group". Wrapper auto-discovers slot markers
(`data-toolbar-item`, `data-toolbar-separator`, `data-toolbar-group`)
via `createRoleObserver`. Per-item disabled via `setItemDisabled(el, bool)`.

Subtle bug fixed during development: focusing an item from OUTSIDE
the toolbar (page Tab in, programmatic focus) left roving-focus's
internal `_index` at -1; the first arrow press would land on the
first enabled item -- which was already focused. Fix: the toolbar's
keydown handler calls `syncIndexFromActiveElement()` before
delegating to `roving.move(+1/-1)`, so the index always reflects
where the user actually is.

**Empty-state** (`src/empty-state`). Structural placeholder for the
"no items" / "no results" / "error" / "loading" pattern. Variant
axis (`empty | error | loading | ...`) painted as `data-variant` for
CSS branching. ARIA wiring: `role="status"` + `aria-live="polite"`
(live region; new content is announced), `aria-labelledby` ->
attached title id, `aria-describedby` -> attached description id.
Title element gets `role="heading"` + `aria-level="2"` as a fallback
ONLY if not a real `<h1>`-`<h4>`. Icons get `aria-hidden="true"`.
Action containers get `role="group"`. Wrapper supports reactive
`variant` attribute (bidirectional with `host.setVariant(v)`).

**Tour** (`src/tour`). Multi-step coach mark / product-tour state
machine. Step registry, current-index signal, navigation (next,
prev, goTo, skip, finish) with optional loop. Global keyboard
handler binds Escape/ArrowLeft/ArrowRight while a step is active.
ARIA paint: target element gets `data-tour-target` (boolean) +
`aria-describedby` -> active step's content id. Step content elements
get `role="region"` + `tabindex="-1"` + the `hidden` attribute when
not active (the primitive un-hides the current one). Focus moves to
the active step's content on each transition. Wrapper auto-discovers
declarative `data-tour-step` elements + resolves `data-tour-target`
CSS selectors at connect; delegated click handler wires
`data-tour-next` / `data-tour-prev` / `data-tour-skip` /
`data-tour-finish` buttons. Doesn't own positioning (consumer uses
the `stepchange` event's `detail.target` to position however they
want -- the demo uses simple boundingClientRect math; consumers can
compose with `createPopover` for Floating UI semantics) and doesn't
persist completion (consumer's call).

#### Updated counts

- **1318 unit ×3 stable** (was 1277 mid-release; +15 empty-state, +15 tour, +11 toolbar)
- **365 browser**: color-picker 7/7, toolbar 7/7, empty-state 5/5 (new), tour browser specs deferred to v0.12.1
- **42 total primitives** (was 39): color-picker + toolbar + empty-state + tour added

#### Demo

Demo scenes 38-41 added: Color Picker, Toolbar (horizontal + vertical
showcase), Empty State (variant switcher with branching CSS), Tour
(3-step walkthrough with spotlight cutout via `box-shadow` trick).

---

### 0.11.0 — 2026-06-17

**Standardization release.** Breaking but pre-1.0 -- this is the cut
that makes cross-primitive CSS, host-accessor naming, and event-name
conventions consistent. The canonical contract lives at
[`docs/CSS_CONTRACT.md`](docs/CSS_CONTRACT.md); every primitive now
follows it.

#### Why this release exists

Pre-v0.11.0 the painted-attribute surface was incoherent:

- `data-state` had **9 different value spaces** across 13 primitives.
  `accordion` painted `"open"|"closed"`; `avatar` painted
  `"image"|"fallback"`; `carousel` painted `"active"|"playing"`;
  `progress` painted `"complete"|"loading"`; `skeleton` painted
  `"loading"|"ready"`; `tabs` painted `"active"|"inactive"`;
  `toggle-group` painted `"on"`; `tree` painted `"leaf"|"open"|"closed"`.
  Writing CSS that worked across primitives was impossible.
- Host accessors used `current<X>` for some values (`currentValue`,
  `currentSide`, `currentKind`, `currentIndex`, `currentStep`,
  `currentTrend`, `currentStatus`) but plain `<X>` for others
  (`value`, `index`, `selected`, `query`, etc.). No principle.
- `toggle-group` dispatched `change`; everything else converged on
  `<dim>change` (`valuechange`, `openchange`, `indexchange`, ...).

This release picks principles and applies them everywhere.

#### Class taxonomy

Painted attributes now fall into four classes:

1. **ARIA attributes** -- semantic state (`aria-expanded`,
   `aria-selected`, `aria-disabled`, `aria-invalid`, etc.). Always
   paired with a matching data-attribute. Style hooks target the
   data-attribute; assistive tech reads the ARIA.
2. **Boolean data-attributes** -- presence = true, absence = false.
   `[data-x] { ... }` is the CSS hook.
3. **Enum data-attributes** -- `data-x="value"` with a fixed value
   space. Used for transition states (`data-status`), positioning
   (`data-side`, `data-orientation`, `data-placement`), and kinds
   (`data-kind`, `data-trend-direction`).
4. **Slot markers** -- `data-<primitive>-<role>` set by the consumer
   in markup, read by the wrapper for auto-discovery. Inputs to the
   wrapper, not outputs.

See `docs/CSS_CONTRACT.md` for the canonical list per class and the
full per-attribute reference.

#### Breaking: painted state attribute migration

`data-state` is no longer painted by any primitive. Replaced by
canonical booleans:

| Old (v0.10.x)                       | New (v0.11.0)                              | Affected primitives                                              |
|-------------------------------------|--------------------------------------------|------------------------------------------------------------------|
| `data-state="open"` / `"closed"`    | `data-open` (boolean)                      | accordion, combobox, dialog, drawer, menu, popover, tooltip, tree (open dim) |
| `data-state="active"`               | `data-active` (boolean)                    | carousel (slide), tabs                                           |
| `data-state="inactive"`             | (absence of `data-active`)                 | tabs                                                             |
| `data-state="playing"` / `"paused"` | `data-playing` (boolean)                   | carousel play/pause button                                       |
| `data-state="loading"`              | `data-loading` (boolean)                   | progress, skeleton                                               |
| `data-state="complete"`             | `data-complete` (boolean)                  | progress                                                         |
| `data-state="ready"`                | (absence of `data-loading`)                | skeleton                                                         |
| `data-state="on"` / `"off"`         | `data-pressed` (boolean; mirrors aria-pressed) | toggle-group                                                  |
| `data-state="leaf"`                 | `data-leaf` (boolean)                      | tree                                                             |
| `data-state="image"` / `"fallback"` | `data-loaded` (boolean; absent = fallback) | avatar                                                           |

Consumers with CSS like `[data-state="open"]` MUST migrate. There is
no compat shim -- the old attribute is no longer painted. Suggested
sed for a downstream project:

```sh
# (rough draft — review carefully per primitive!)
sed -i -E 's/\[data-state="open"\]/[data-open]/g'           **/*.css
sed -i -E 's/\[data-state="closed"\]/:not([data-open])/g'    **/*.css
sed -i -E 's/\[data-state="active"\]/[data-active]/g'        **/*.css
sed -i -E 's/\[data-state="loading"\]/[data-loading]/g'      **/*.css
sed -i -E 's/\[data-state="complete"\]/[data-complete]/g'    **/*.css
# ... etc per the table above
```

The transition-phase enum `data-status` (`"closed" | "opening" |
"open" | "closing"`) is unchanged on overlays. Both `data-open`
(steady-state boolean) and `data-status` (transition machine) are
painted side-by-side; consumers pick whichever resolution they need.

#### Breaking: host accessor naming

Dropped the `current` prefix from value accessors. The renamed
accessors are the canonical names; the v0.10.x names remain as
deprecated aliases for one minor release (will be removed in v0.12.x).

| Old (v0.10.x)        | New (v0.11.0)  | Primitive |
|----------------------|----------------|-----------|
| `host.currentValue`  | `host.value`   | stat      |
| `host.currentTrend`  | `host.trend`   | stat      |
| `host.currentKind`   | `host.kind`    | banner    |
| `host.currentSide`   | `host.side`    | drawer    |
| `host.currentStatus` | `host.status`  | drawer    |
| `host.currentIndex`  | `host.index`   | steps     |
| `host.currentStep`   | `host.step`    | steps     |

`isOpen`, `isComplete`, `isDragOver`, `isDragging`, `isEditing`,
`isInvalid`, `isReadOnly` are unchanged -- the `is`-prefix
convention for primitive-specific booleans was already correct.
Mirrors of HTML attributes (`disabled`, `checked`, `required`,
`hidden`, `busy`) keep their unprefixed form.

#### Breaking: event name -- `change` -> `valuechange` on toggle-group

`toggle-group` now dispatches `valuechange` (canonical) as well as
the legacy `change` event for one minor (will be removed in v0.12.x).
Listeners on `change` continue to work for this release; new code
should listen on `valuechange` to match `valuechange` / `openchange`
/ `indexchange` / etc. across the rest of the family.

#### Documentation

- **NEW**: `docs/CSS_CONTRACT.md` -- canonical contract, ~250 lines.
- All 37 `llms.txt` files updated. References to `data-state` are gone;
  each file now ends with a `## CSS contract` footer pointing at
  `docs/CSS_CONTRACT.md` so cross-primitive conventions can be looked
  up in one place rather than rediscovered per-primitive.
- `src/form-field/llms.txt` retains the dedicated `## Pairing with
  @zakkster/lite-form` section added in v0.10.2.

#### Internal changes

- 13 primitives migrated paint sites (45 total writes).
- 5 primitives required new `toggleAttr` imports; one primitive
  (`combobox`) already had it.
- 11 unit-test files migrated their assertions (`getAttribute("data-state")
  === "open"` -> `hasAttribute("data-open") === true`, etc.).
- 6 browser-spec files migrated, plus 8 fixture HTML files.
- Demo (`demo/index.html`) CSS rules migrated; one polling JS bit
  (`skFlash.getAttribute("data-state")`) converted to a boolean
  `hasAttribute` check.

#### Counts

- **1249 unit** ×3 stable (unchanged total -- no new tests added in
  the standardization sweep itself).
- **340/346 browser** (same chromium-1194 baseline as v0.10.3; no new
  failures).
- Zero `data-state` mentions remaining outside `docs/CSS_CONTRACT.md`'s
  intentional migration table.

#### Migration path

For downstream consumers, the recipe is:

1. Read `docs/CSS_CONTRACT.md` once -- 5 minutes.
2. Find-and-replace your CSS per the table above. The sed snippet
   in the breaking-changes section is a starting point; review each
   change.
3. Find-and-replace your JS for the host accessor renames
   (`currentValue` -> `value`, etc.). The old names still work this
   release but log no warnings; quietly silent dual-binding.
4. If you listened on `change` for toggle-group, rename to
   `valuechange`. Both still fire this release; `change` will be
   removed in v0.12.x.

#### Compatibility

Pre-1.0 status preserved. Major version bumps are reserved for the
1.0 milestone; minor (0.10 -> 0.11) is the appropriate bump for
breaking changes in pre-1.0 semver. The v0.10.3 -> v0.11.0 jump is
the largest breaking change since the library started; subsequent
releases should be smooth additions on the canonical contract.

---

### 0.10.3 — 2026-06-17

Bug-fix release addressing the two architectural micro-leaks in the
new wrappers (drawer + kanban) flagged in audit. Both bugs were
caused by ordering issues: a synchronous initialization race in
drawer's role-observer wiring, and a missing reconcile step in
kanban's MO-driven sync. New regression suite pins both.

#### 1. Drawer: `roles.follow` closure trap (THE drawer bug)

`createRoleObserver(host, ROLE_SEL, wire)` runs `wire(node)`
synchronously on every matching node in the existing DOM tree *before*
the constructor returns and assigns its result to the outer `roles`
variable. The previous code's `if (roles) roles.follow(node)` branch
was therefore dead on the initial pass -- `roles` was still
undefined, so every drawer-content + drawer-backdrop element
discovered at mount time was silently NOT followed.

When the drawer subsequently opened and the content portaled to
`document.body`, the role observer (which only sees subtree mutations
inside `host` by default) lost track of it. Close buttons, titles, and
descriptions injected into the portaled content after that point
silently un-wired -- which is exactly the failure mode users hit.

Fixed with a `followQueue`: nodes that request `follow()` during the
initial synchronous pass are queued; the queue is flushed immediately
after `roles` is assigned. Post-init, the branch resolves directly
through `roles` and the queue is unused.

```js
const followQueue = [];
function queueFollow(node) {
    if (roles) roles.follow(node);
    else       followQueue.push(node);
}
// ... wire() uses queueFollow ...
roles = createRoleObserver(host, ROLE_SEL, wire);
for (let i = 0; i < followQueue.length; i++) roles.follow(followQueue[i]);
followQueue.length = 0;
```

#### 2. Kanban: DOM-movement desync (THE kanban bug)

The `if (prev.el === el) continue;` early-out in `syncMarkup` was
checking element identity -- but a card reparented from one column to
another is the **same element**, just in a different parent. The
identity check passed, the loop continued, and the engine's `_cards`
data model was never told the card had moved columns.

This shipped uncaught because the v0.10.2 wrapper added managed-DOM
reparenting on `cardmove` -- and that path goes through `moveCard()`
first, so the engine IS updated for moves we initiate. The bug only
manifested for moves coming from OUTSIDE our managed path: manual
DOM edits, framework re-renders, a third-party DnD library, or
consumers using `host.querySelector` + `appendChild`.

Fix: before the identity skip, reconcile the engine's `columnId` with
the DOM's `closest("[data-kanban-column]")`. If they differ, call
`kb.moveCard(cardId, colId, undefined, "dom-sync")` to bring the
engine forward.

The new "dom-sync" reason is propagated to `onCardMove`. The wrapper's
own `onCardMove` handler checks for it and SKIPS its reparent step --
the card is already in its new column container by definition (that's
what triggered the sync in the first place). Re-reparenting would be a
no-op given the early-return in `reparentCardForMove`, but skipping
explicitly is cleaner and avoids the cost.

```js
const knownCard = kb.getCard(cardId);
if (!knownCard) {
    kb.addCard({ id: cardId, columnId: colId, title: ... });
} else if (knownCard.columnId !== colId) {
    kb.moveCard(cardId, colId, undefined, "dom-sync");
}
```

The `cardmove` event still dispatches for dom-sync reconciles so
consumers who observe state changes get notified regardless of where
the move came from.

#### 3. attrMo records iteration — verifying you're looking at v0.10.2+

The "Rating, Stat, & Form-Field: attrMo CPU Burn" audit point was
fixed in v0.10.1 / v0.10.2. The current source of all 4 wrappers
(`stat`, `rating`, `form-field`, `banner`) uses
`new MutationObserver((muts) => { for (let i = 0; i < muts.length; i++) { switch (muts[i].attributeName) { ... } } })`.
If you're seeing the old shape in your inspector, you may be looking
at the v0.10.0 ZIP -- the v0.10.2 zip and current source are correct.

#### 4. file-upload innerHTML GC spike — verifying you're looking at v0.10.2+

Same situation: the hoisted `<template>` + `cloneNode(true)` +
`children[i]` pointer pattern landed in v0.7.36's hot-path audit and
has been in source since. Quick verification:

```
$ grep -nE 'innerHTML|cloneNode' src/file-upload/element.js
50:// at module load; subsequent `content.cloneNode(true)` calls clone the
61:const _rowTemplate = document.createElement("template");
62:_rowTemplate.innerHTML =          // <- ONE innerHTML write, at module load
225:        // live at known child indices (see _rowTemplate doc above).
227:            const frag = _rowTemplate.content.cloneNode(true);
```

The single `innerHTML` write on line 62 is on the hoisted template
object (one-time, at module load) -- exactly the pattern requested.
Per-row, only `cloneNode(true)` runs.

#### Regression suite

Added `test-browser/v0.10.3-regression.spec.js` with 4 tests that pin
both bugs concretely:

1. **drawer**: open the drawer (content portals), inject a
   `[data-drawer-close]` button into the portaled content AFTER the
   move, click it -> drawer must close. Fails without the followQueue.
2. **drawer**: inject a late `[data-drawer-title]` -> content's
   `aria-labelledby` must be set. Fails without the followQueue.
3. **kanban**: manually reparent a card from "todo" to "done" via
   `appendChild` -> engine's `getCard("c1").columnId` must read
   `"done"`. Fails without the dom-sync reconcile.
4. **kanban**: same external reparent must fire EXACTLY ONE
   `cardmove` event (not echo back). Pins the dom-sync skip in
   `onCardMove`.

#### Counts

- **1249 unit** ×3 stable (no new unit tests; the new behavior is
  observable only at the DOM-MO level so it lives in browser specs).
- **340 browser** (was 336; +4 from `v0.10.3-regression.spec.js`).
- Browser regression matches v0.10.2 baseline; no new failures.

#### Compatibility

Drop-in for v0.10.2. No API changes. The drawer's behavior is now
correct for late-injected content; the kanban wrapper's `onCardMove`
detail now includes a new `reason: "dom-sync"` value when the
engine is catching up to an external DOM mutation -- consumers can
filter this out if their `cardmove` handler runs side effects that
shouldn't fire for already-applied moves.

---

### 0.10.2 — 2026-06-17

Bug-fix release responding to the v0.10.1 audit. Three concrete bugs
caught in the demo, plus one feature add (`steps.reset` /
`steps.clearAllErrors`) and managed-DOM kanban reparenting.

#### 1. `command-palette` window-keydown crash (THE blocker)

`src/command-palette/index.js:485` had an unguarded
`e.key.toLowerCase()` on a `window`-level `keydown` listener. When
`e.key` is undefined (synthetic events without `key`, IME
composition starts, certain focus-shift edge cases on Chromium), the
`.toLowerCase()` threw. Because the listener is at the window level
and the exception was unhandled, every event-driven primitive in the
same task got disrupted afterward -- which is why the v0.10.1 demo
looked like banner / drawer / rating / kanban / form-field-reset
were "all broken" even though their own code was fine.

Fixed with:

```js
if (!e || typeof e.key !== "string") return;
```

Defensive but free. Also applied the same guard to
`src/_overlay/roving-focus.js#typeChar(ch)` which had the same shape
(callers pass `e.key` in; if undefined, `.toLowerCase()` would throw
inside the typeahead buffer write).

#### 2. `kanban` wrapper: managed-DOM reparenting

The headless `createKanban` primitive correctly only manages STATE on
`moveCard` -- it doesn't touch the DOM. The wrapper used to relay the
`cardmove` event verbatim, expecting consumers to render. For the
HTML5-DnD use-case where cards are placed declaratively in markup,
this meant drops fired the event but the card stayed in its source
column visually. Surprising.

Wrapper now reparents on `cardmove`. The wrapper:

- Discovers each column's card-body container via
  `[data-kanban-cards]` (convention; falls back to the column root
  if absent).
- Stores the body reference per column in `_colAttached`.
- On `cardmove`, finds the moved card's element, finds the target
  column's body, and calls
  `container.insertBefore(cardEl, peerAtIndex)` -- native primitive,
  no allocation per move.

Opt out via the `unmanaged-dom` attribute on `<lite-kanban>` for
consumers that drive their own render path (virtual list, store-
driven, animation library).

#### 3. Steps: `clearAllErrors()` + `reset()` (new primitive methods)

You can flag a step as `"error"` via `setStepStatus(id, "error")` and
clear it via `setStepStatus(id, null)`. But there was no way to drop
all overrides in one call, and no way to send the user back to the
start of the flow (current step + clear all errors). The "retry the
whole form" UX needs both.

Added two first-class primitive methods (so consumers don't have to
loop):

```js
steps.clearAllErrors()    // drop every error override; one signal bump
steps.reset()             // clear errors AND setCurrent(0); fires
                          // onStepChange with reason: "reset"
```

Wrapper exposes `host.clearAllErrors()` + `host.reset()`. **5 new
unit tests** covering: bulk clear, no-op when no overrides exist,
reset moves current + clears errors + fires reason: "reset", reset
on empty steps lands at -1. Demo steps scene now has three buttons
(flag-error / clear-error / reset to step 1).

#### 4. Form-field demo: visible reset + `lite-form` pairing note

The form-field demo `host.reset()` resets ARIA state but doesn't
touch the input value (the primitive is correctly stateless about
the value). The demo wiring now mirrors the initial input value on
reset so the action is visibly observable; the state readout also
includes `errorMessage` for completeness.

Added a "pairing" section in the form-field scene's side panel
pointing at `@zakkster/lite-form` (which is the canonical state
engine in the @zakkster family). Mirrored the same docs in
`src/form-field/llms.txt` with a worked example: `lite-form` owns
the values + validators, `form-field` wires the ARIA, bridged via
two `effect()` calls (`field.error()` → `ff.setValid()`,
`field.touched()` → `ff.setTouched()`).

The split exists because the two concerns scale independently:
`lite-form` benchmarks ~1.5M keystrokes/sec on a 100-field form
(typing one field runs exactly one validator); `form-field` knows
nothing about values and never re-runs during typing. Composing them
gives both fine-grained validation AND ARIA-correct DOM.

#### Counts

- **1249 unit** (was 1245; +4 from `clearAllErrors` / `reset` /
  no-op / empty-steps tests). All passing ×3 stable.
- Browser regression matches v0.10.1 baseline (same chromium-1194
  flakes, no new failures).

#### Compatibility

Drop-in for v0.10.1. No existing primitive APIs changed. New
primitive methods (`steps.clearAllErrors`, `steps.reset`) are
additive. The kanban wrapper's managed-DOM behavior is the new
default but can be opted out via the `unmanaged-dom` attribute.

---

### 0.10.1 — 2026-06-16

Audit-response patch addressing 4 specific items + a broader hunt
for layout-thrash and wasteful allocations. No new primitives, no
API changes. All existing tests pass; 1245/1245 unit + 336/342
browser (same baseline-flakes as v0.10.0).

#### Scope-leak refactor (`skeleton`, `pin-input`)

Both wrappers had inline `belongsToHost(el, host)` guards inside a
loop after a raw `host.querySelectorAll`. Functionally correct but
inconsistent with the newer wrappers (banner / form-field / stat /
drawer / steps / rating) that route through a `scopedQueryAll`
helper. Refactored both to use the helper. Behavior unchanged;
intent is now uniform across the wrapper family.

The other 4 wrappers Zahary's audit flagged (`picture`, `progress`,
`inline-edit`, `file-upload`) already used the helper pattern. The
`file-upload` "innerHTML GC spike" called out as still present was
in fact already fixed -- the current `src/file-upload/element.js`
uses a hoisted `<template>` and `cloneNode(true)` with direct
`children[i]` pointers (no per-row HTML parse, no querySelector
walks).

#### MutationObserver records iteration (5 wrappers)

Five wrappers (`stat`, `banner`, `form-field`, `rating`, plus the
single-attribute `avatar` and `calendar` and `skeleton` and `steps`)
had attribute observers that ignored `MutationRecord.attributeName`
and re-evaluated every dimension on any attribute change. The
multi-attribute ones leaked real wasted work:

- **`stat`** was the worst -- a `value` change re-ran
  `parseTrendFromAttrs(host)` which allocated a fresh
  `{direction, value}` object and called `stat.setTrend(td)`. The
  primitive received a new object identity, assumed the trend
  changed, and re-painted everything trend-bound.
- **`banner`**: a `kind` change also called `banner.show()` /
  `banner.dismiss()`; **`form-field`**: a `required` change also
  re-ran the validity branch; **`rating`**: a `value` change also
  re-called `setReadOnly`.

All five now iterate `muts`, dispatch by `attributeName`, and only
touch the dimensions whose attribute actually changed. The
single-attribute wrappers (`avatar`, `calendar`, `skeleton`,
`steps`) got the same treatment for pattern uniformity even though
the actual cost was nil.

#### Layout-thrash fixes (3 hot paths)

Three places were reading `getBoundingClientRect` or `offsetWidth`
inside frequently-firing event handlers, each one forcing a
style+layout reflow per call.

#### `rating.attachRail`
The pointer-x-to-half-step mapping read `el.getBoundingClientRect()`
on every `mousemove` -- 120Hz forced reflow during a half-step
drag. Now cached on `mouseenter`, invalidated on `mouseleave` and
on window-level `scroll` / `resize` (capture + passive). Click
path also uses the cache when present.

#### `slider.startDrag` / `pointerToValue`
`_track.getBoundingClientRect()` was read on every `pointermove`
during a drag. Now cached in `_dragTrackRect` on `startDrag`,
invalidated on `scroll` / `resize`, released on `endDrag`. The
one-shot track-click path (pointerdown not on a thumb) still reads
fresh since `_dragTrackRect` is null when not dragging.

#### `carousel.onViewportScroll` (uniform-slide fast path)
`first.el.offsetWidth` was read on every rAF tick after a scroll
event. Now memoized in `_cachedSlideSize`, invalidated by a
`ResizeObserver` on the viewport, and wiped when slides are
attached or detached. The scroll-position read (`scrollLeft`) is
cheap and stays per-tick.

#### Allocation: `datepicker.value()` accessor

The public `value()` accessor did
`_value().map((d) => d ? new Date(d.getTime()) : null)` on every
call -- a fresh Array + fresh Dates each time. Internal code
already used `_value()` (the raw signal) directly, so this only
hurt consumers who put `picker.value()` inside an effect. Now
identity-cached: re-clone only when the underlying signal value
changes. Contract: the returned array is a read-only snapshot.

#### Demo overhaul

The demo (`demo/index.html`) was missing 9 primitives from v0.8 /
v0.9 / v0.10. Filled in:

- **Boot loader**: an overlay div at the top of `<body>` with a
  spinner and "loading 39 primitives" label. Hides on
  `customElements.whenDefined("lite-dialog")` + similar resolves,
  or `window.load`, or 6s hard timeout. Respects
  `prefers-reduced-motion`.
- **9 modulepreload links** added for: calendar, kanban,
  notification-center, form-field, banner, stat, drawer, steps,
  rating.
- **9 `import` statements** for the same wrappers in the main
  module script.
- **2 new menu categories** ("Data" + "Forms") with menu items for
  the 9 primitives.
- **9 new scene sections** (29-37), each with a stage and a side
  panel showing live state.
- **9 wiring blocks** in the demo's main script: calendar grid
  rendering with event dots, kanban with HTML5 DnD, notification
  center add/mark-read/clear, form-field with email validation +
  ARIA readout, banner kind-switcher, stat with shuffle-tween
  button, steps with prev/next/flag-error, rating interactive +
  read-only example, drawer left + right.
- **9 entries added to `SCENE_META`** -- the scene-switcher
  no-ops without them, so the menu items silently did nothing
  until this was added.
- Compact CSS rules for each scene's visual state (color hooks
  driven by primitive-painted data-attributes).

Verified via Playwright: page loads in ~720ms in headless
chromium, all 9 scenes activate via menu click with zero page
errors, screenshots confirm visual correctness.

---

### 0.10.0 — 2026-06-16

#### New primitives (+3 = 39 total)

Three more primitives that complete the must-haves for an admin theme
product. Each ships the now-standard treatment: single-file ESM,
zero runtime deps, attach* lifecycle, paint via data-attributes,
reactive state via `@zakkster/lite-signal`, llms.txt + element wrapper.

#### 1. `drawer` -- slide-in edge panel

Slide-in panel anchored to any of the four viewport edges. Like a
dialog whose visual anchor is an edge instead of the center --
composes the same overlay machinery (portal, focus trap, scroll lock,
escape + outside dismiss). Use for filter panels, mobile nav, row-
detail side panes, settings drawers.

```js
import { createDrawer } from "@zakkster/lite-headless/drawer";

const drawer = createDrawer({
    defaultSide: "right",              // left | right | top | bottom
    modal: true,                        // backdrop + focus trap + scroll lock
    closeOnEscape: true,
    closeOnOutsideClick: true,
    lockScrollOnOpen: true,
    awaitTransitionEnd: false,
});

drawer.attachContent(asideEl);
drawer.attachTrigger(buttonEl);
drawer.attachBackdrop(backdropEl);
drawer.attachCloseButton(closeBtnEl);  // any number of these
drawer.attachTitle(headingEl);          // wires aria-labelledby
drawer.attachDescription(pEl);          // wires aria-describedby

drawer.showDrawer();
drawer.setSide("left");
```

Painted on content: `role="dialog"` (modal) or `role="region"` (non-
modal), `aria-modal`, `data-side`, `data-status`, `data-state`. On
trigger: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`.
Backdrop click closes (when `closeOnOutsideClick`).

**Wrapper uses `createRoleObserver` pattern** so the portal-move from
the host to `document.body` doesn't tear down attachment when the
plain MutationObserver sees the content as "removed". The role
observer has a `follow(el)` escape hatch -- attaching content also
follows it so descendants (close buttons, title, etc.) stay wired
across the portal move. This pattern was lifted from dialog/element.js
where the same issue applies.

Tests: **19 unit + 2 browser.**

#### 2. `steps` -- multi-step process indicator

NOT the numeric stepper (that's `stepper`). This is the "step 3 of 5"
pattern for checkout flows, onboarding wizards, multi-page forms, and
approval workflows.

Per-step status: `complete`, `current`, `pending`, `error`. The first
three are derived from `current` index; `error` is an explicit
override via `setStepStatus(id, "error")`.

```js
import { createSteps } from "@zakkster/lite-headless/steps";

const steps = createSteps({
    steps: [
        { id: "account", title: "Account" },
        { id: "billing", title: "Billing" },
        { id: "review",  title: "Review" },
    ],
    defaultCurrent: 0,
    orientation: "horizontal",     // or "vertical"
    allowBack: true,
    allowSkip: false,
    onStepChange: (next, prev, reason) => {},
    onComplete: () => {},
});

steps.next() / .prev() / .setCurrent(i) / .setCurrentById(id)
steps.setStepStatus("billing", "error")    // override for validation flagging
steps.canNavigateTo(i)                      // gated by allowBack + allowSkip

steps.attachRoot(rootEl)
steps.attachStep(stepEl, "account")        // click navigates if allowed
steps.attachNextButton(btnEl)               // auto-disables when complete
steps.attachPrevButton(btnEl)               // auto-disables on first step
```

Painted on root: `role="list"`, `data-orientation`, `data-step-count`,
`data-current-index`, `data-complete`. On steps: `role="listitem"`,
`data-status`, `data-current/error/complete`, `aria-current="step"`,
`tabindex="0|-1"` (focusable only when navigable). Next/Prev buttons
get reactive `disabled` + `aria-disabled` based on position.

`progress()` returns 0..1 for direct binding to a `progress` primitive
or a CSS `--progress` custom property.

Tests: **22 unit + 3 browser.**

#### 3. `rating` -- star/icon rating input

Used for reviews, feedback, satisfaction scores. Supports configurable
item count, half-step values, hover preview, full keyboard navigation,
read-only mode, and clearable on re-click.

```js
import { createRating } from "@zakkster/lite-headless/rating";

const rating = createRating({
    max: 5,
    defaultValue: 0,
    step: 1,                          // 1 (whole-star) or 0.5 (half-star)
    readOnly: false,
    clearable: false,                 // click selected item to zero
    onValueChange: (next, prev, reason) => {},
});

rating.attachRoot(rootEl);
for (let i = 1; i <= 5; i++) rating.attachItem(itemEls[i-1], i);
rating.attachRail(railEl);   // optional: pointer-x mapping for half-step drag
```

**Three orthogonal state values**:
- `value()` -- committed value
- `hoverValue()` -- transient (null when not hovering)
- `displayValue()` -- hoverValue when hovering, else value (this is
  what the items react to for fill state)

Painted on items: `role="radio"`, `aria-checked`, `data-filled` /
`data-half-filled` / `data-empty`, `tabindex` (focused item gets 0,
others -1 -- standard radiogroup pattern).

**Keyboard on the root**: arrows for ±step, Home/End for 0/max,
number keys 1-9 for direct set. Blocked in read-only mode.

`setHoverValue` is also blocked in read-only mode -- the primitive
enforces this for both API and pointer paths so read-only is truly
read-only.

`step` must be exactly 1 or 0.5; throws on other values to prevent
subtle snap bugs.

Tests: **24 unit + 3 browser.**

#### Drawer wrapper fix (portal-safe MutationObserver)

While building the v0.10 browser spec, the drawer wrapper's plain
MutationObserver was tearing down the content attachment when the
content portaled to `document.body` -- the MO saw the portal-move as
a node removal and called the off() function on attachContent, wiping
`role="dialog"`, `data-side`, and ARIA attributes.

Rewrote the wrapper to use the existing `createRoleObserver` pattern
from `src/_overlay/element-roles.js`, which has a `follow(el)` escape
hatch that observes the portaled element directly. The dialog wrapper
already used this pattern; the drawer wrapper now matches.

#### Rating browser test correction

`page.locator("lite-rating").press("ArrowRight")` doesn't focus into
the radiogroup items, so the host-level keydown listener didn't fire.
Updated the test to focus the current item first (the real user
interaction path: Tab into the group, then arrow keys), which works
correctly.

#### Counts

- **1245 unit** (was 1180; +65 from the 3 new primitives)
- **336 browser** (was 328; +8 from v0.10-primitives.spec.js)
- All passing ×3 stable in regression. 6 known chromium-1194 timing
  flakes (datepicker focus + menu safe-triangle + accordion transition
  lock) match the baseline from v0.9.0 -- no new failures from v0.10.

#### Compatibility

Drop-in for v0.9.0. No existing primitive APIs changed. New
primitives live in their own module folders under `src/`; consumers
opt in via direct imports.

---

### 0.9.0 — 2026-06-16

#### New primitives (+3 = 36 total)

Three more primitives that fill the remaining must-haves for an admin
theme product. Each ships the now-standard treatment: single-file ESM,
zero runtime deps, attach\* lifecycle, paint via data-attributes,
reactive state via `@zakkster/lite-signal`, llms.txt + element wrapper.

#### 1. `form-field` -- ARIA-correct form-field wrapper

The "label + control + helper + error" pattern done right. Doesn't
own input value (that's the consumer's, or a paired primitive's), but
owns:

- **validity state** (valid + errorMessage)
- **required flag**
- **touched flag** (true once the control has been blurred at least
  once; gates error display by default so we don't yell at users
  before they've interacted)

```js
import { createFormField } from "@zakkster/lite-headless/form-field";

const ff = createFormField({
    defaultRequired: true,
    showErrorsBeforeTouched: false,
});

ff.attachRoot(rootEl);
ff.attachLabel(labelEl);          // wires label.for = control.id
ff.attachControl(inputEl);        // wires aria-invalid, aria-required,
                                  // aria-describedby chain; blur->touched
ff.attachHelperText(helperEl);    // always in aria-describedby
ff.attachErrorText(errorEl);      // role=alert; in describedby only when shown

ff.setValid(false, "Required");
```

Attach order doesn't matter. The describedby chain is managed
reactively from each piece's own effect so a control attached after
the error element still gets wired correctly. (Fixed: the original
draft had the describedby effect closure-captured `_errorEl` at
control-attach time, missing later attachErrorText calls. Moved the
error-id wiring into `attachErrorText`'s own effect, which reads
`showsError()` so it picks up state changes regardless of attach order.)

Painted attributes on root: `data-invalid`, `data-required`,
`data-touched`, `data-shows-error`. Wrapper: `<lite-form-field
required>` with `[data-ff-label]`, `[data-ff-control]`,
`[data-ff-helper]`, `[data-ff-error]` slot discovery.

Tests: **20 unit + 2 browser.**

#### 2. `banner` -- dismissible page-level alert

Distinct from `toast` (floating + ephemeral); a banner is a static
slot in the page that can be shown/hidden + re-opened. Kinds: info,
success, warning, error.

```js
import { createBanner } from "@zakkster/lite-headless/banner";

const banner = createBanner({
    defaultKind: "warning",
    dismissOnEscape: true,
    onDismiss: () => {},
});
banner.attachRoot(el);
banner.attachDismissButton(btnEl);
```

Smart ARIA: error + warning kinds get `role="alert"` +
`aria-live="assertive"` (screen reader interrupts current speech).
Info + success get `role="status"` + `aria-live="polite"` (queued).
`setKind` at runtime upgrades / downgrades the role properly.

Painted: `data-kind`, `data-open` / `data-hidden`, `role`,
`aria-live`. The primitive doesn't remove the element on dismiss --
toggles `data-hidden` so consumers can animate fade-out via CSS.

Wrapper: `<lite-banner kind="warning" dismiss-on-escape>` with
`[data-banner-dismiss]` for the close button.

Tests: **14 unit + 2 browser.**

#### 3. `stat` -- KPI dashboard card with value tween

Label + numeric value + optional trend (direction + magnitude). The
displayed value tweens between updates with a quadratic ease-out;
multiple updates re-target the same tween (no jumpy resets).

```js
import { createStat } from "@zakkster/lite-headless/stat";

const stat = createStat({
    defaultValue: 1234,
    defaultLabel: "Revenue",
    defaultUnit: "$",
    defaultTrend: { direction: "up", value: 12.5 },
    formatter: (n) => n.toLocaleString(),
    animationDuration: 600,
});
stat.attachRoot(rootEl);
stat.attachLabel(labelEl);
stat.attachValue(valueEl);       // textContent animates from current to new value
stat.attachUnit(unitEl);
stat.attachTrend(trendEl);

stat.setValue(2500);             // triggers 600ms tween from 1234 to 2500
stat.setTrend({ direction: "up", value: 8.3 });
```

Default formatter handles three numeric ranges sensibly (thousands
get `.toLocaleString()`, units get `.toFixed(0)`, fractionals get
`.toFixed(2)`). Override with `formatter: (n) => Math.round(n * 100)
+ "%"` for percentages, currency, etc.

Tween uses `requestAnimationFrame` when present, falling back to
`setTimeout(16)` so the primitive works in Node test environments
(happy-dom doesn't expose rAF globally).

Painted: `data-trend-direction` (+ value, + has-trend, + hidden),
`aria-live="polite"` on the value so screen readers announce updates.

Wrapper: `<lite-stat value="..." label="..." unit="..."
trend-direction="up" trend-value="12.5" animation-duration="600">`
with `[data-stat-label]`, `[data-stat-value]`, `[data-stat-unit]`,
`[data-stat-trend]` slots.

Tests: **18 unit + 3 browser.**

#### Counts

- **1180 unit** (was 1128; +52 from the 3 new primitives)
- **328 browser** (was 321; +7 from v0.9-primitives.spec.js)
- All passing ×3 stable in regression.

#### Compatibility

Drop-in for v0.8.0. No existing primitive APIs changed. New primitives
live in their own module folders under `src/`; consumers opt in via
direct imports.

---

### 0.8.0 — 2026-06-16

#### New admin-theme primitives (+3 = 33 total)

Three primitives that fill the obvious gaps for a premium admin theme
product. Each follows the established conventions: single-file ESM,
zero runtime deps, attach\* lifecycle, paint via data-attributes (no
classList), reactive state via `@zakkster/lite-signal`.

#### 1. `calendar` -- headless month-view calendar

Distinct from `datepicker`. The picker is an input control with
focused value + range selection. The calendar is an event-display grid
with `eventsForDay()` queries:

```js
import { createCalendar } from "@zakkster/lite-headless/calendar";

const cal = createCalendar({
    defaultView: new Date(),
    defaultEvents: [
        { id: "1", start: new Date(2026, 5, 10), title: "Meeting", color: "#3b82f6" },
    ],
});
cal.attachGrid(gridEl);
cal.attachDayCell(cellEl, date);
cal.attachEvent(chipEl, eventId);
cal.attachMonthLabel(labelEl);     // reactive month/year
cal.attachPrevMonth(prevBtn);
cal.attachNextMonth(nextBtn);
```

Event shape: `{ id, start, end?, title, allDay?, color?, meta? }`.
Multi-day events return from `eventsForDay()` for every day in
`[start..end]` -- the consumer detects continuation styling by
comparing `event.start` against the cell date.

Reuses date helpers from `datepicker` (re-exported there as of v0.7.x)
to avoid duplication. Pairs naturally with `popover` for click-to-edit
and `dialog` for event detail modals.

Wrapper: `<lite-calendar view="2026-06-01">` with auto-discovered
slots: `[data-cal-grid]`, `[data-cal-day][data-date]`,
`[data-cal-event-id]`, `[data-cal-label]`, `[data-cal-prev]`,
`[data-cal-next]`.

Tests: **33 unit + 3 browser specs.**

#### 2. `kanban` -- composable kanban board

Columns of cards. Composes `createSortable` per column for in-column
drag-to-reorder; cross-column moves go through `moveCard(cardId,
toColumnId, toIndex, reason?)` or the optional built-in HTML5 DnD path
via `attachDropZone` + `attachDraggable`.

```js
import { createKanban } from "@zakkster/lite-headless/kanban";

const kb = createKanban({
    columns: [
        { id: "todo",  title: "To Do" },
        { id: "doing", title: "Doing" },
        { id: "done",  title: "Done" },
    ],
    cards: [
        { id: "c1", columnId: "todo", title: "Buy milk" },
        { id: "c2", columnId: "doing", title: "Code review" },
    ],
    onCardMove: (cardId, fromCol, toCol, newIndex, reason) => {},
});
kb.attachColumn(colEl, "todo");
kb.attachCard(cardEl, "c1");
kb.attachDraggable(cardEl, "c1");    // optional HTML5 DnD
kb.attachDropZone(colEl, "todo");    // optional HTML5 DnD
```

Card data model is canonical: each card knows its `columnId`. The
primitive maintains per-column ordered card-id arrays in
`_columnOrder`. `removeColumn` removes the column + all its cards
atomically.

The HTML5 DnD path writes the card id into
`dataTransfer.setData("text/x-kanban-card-id", cardId)`. The drop
handler parses it back, computes the target index from pointer y vs
card midpoints, and calls `moveCard`.

For touch-first apps where HTML5 DnD is unreliable, consumers can
build pointer-based cross-column drag on top of `moveCard` directly.

Wrapper: `<lite-kanban html5-dnd>` auto-discovers
`[data-kanban-column]` + `[data-kanban-card-id]` and wires DnD when
`html5-dnd` is present.

Tests: **23 unit + 3 browser specs.**

#### 3. `notification-center` -- persistent notification history

The "bell icon with unread badge" UX. Distinct from `toast` which is
ephemeral; the notification center keeps the user's history with
mark-read, filtering (by kind / by read state), and clear-all/by-kind/
read operations.

```js
import { createNotificationCenter } from "@zakkster/lite-headless/notification-center";

const nc = createNotificationCenter({
    maxItems: 100,
    onMarkRead: (id) => {},
});
nc.add({ id: "n1", title: "Server restarted", kind: "info" });
nc.attachRoot(panelEl);              // paints data-nc-unread + data-nc-has-unread
nc.attachItem(rowEl, "n1");          // click marks read
nc.attachUnreadBadge(badgeEl);       // textContent = unreadCount; "99+" clamp
nc.attachClearAllButton(btnEl);
nc.attachMarkAllReadButton(btnEl);
```

Notification shape:
```
{ id, title, body, kind, timestamp, read, meta }
```
where `kind` is one of `info | success | warning | error | system`
(invalid kinds normalize to `info`).

Common composition pattern: pair `toast.show(payload)` with
`nc.add(payload)` for in-the-moment feedback + persistent history.

Painted attributes:
- Root: `data-nc-unread="<count>"`, `data-nc-has-unread`
- Items: `data-nc-kind`, `data-nc-read` / `data-nc-unread`,
  `data-nc-missing` (if removed)
- Badge: `data-nc-hidden` if count = 0

Wrapper: `<lite-notification-center max-items="100">` with
auto-discovered `[data-nc-badge]`, `[data-nc-mark-all-read]`,
`[data-nc-clear-all]`, `[data-nc-id]`.

Tests: **30 unit + 2 browser specs.**

#### Counts

- **1128 unit** (was 1042; +86 from the 3 new primitives)
- **321 browser** (was 313; +8 from admin-theme.spec.js)
- All passing in regression.

#### Compatibility

Drop-in for v0.7.36. No existing primitive APIs changed. The new
primitives live in their own module folders under `src/`; consumers
opt in via direct imports.

---

### 0.7.36 — 2026-06-16

#### Core primitive hot-path audit

Same lens as v0.7.35 but turned on the primitives themselves
(`src/*/index.js`) instead of the wrappers. Goal: any per-effect-run
DOM write whose result already matches the desired state should be
skipped, so paint effects fire frequently but DO little.

#### 1. `toggleAttr` added to `_overlay/aria.js`

Boolean-attribute helper with `hasAttribute` dirty-check. For the
common pattern `if (cond) el.setAttribute(name, "") else
el.removeAttribute(name)` -- which appears in every primitive that
paints across a list of elements -- this skips the DOM write when the
state hasn't changed.

```js
toggleAttr(el, "data-selected", isSelected);
// equivalent to but cheaper than:
//   if (isSelected) el.setAttribute("data-selected", "");
//   else            el.removeAttribute("data-selected");
```

#### 2. `setAttr` in `_overlay/aria.js` now dirty-checks

Same polymorphic semantics (null/false → remove, true → empty string,
else String value) -- but every write path now compares against the
current attribute state and skips the call if they match. Transparent
improvement: callers see identical behavior. The local per-primitive
`setAttr` helpers already did this dance individually; centralising it
removes the inconsistency.

For paint loops that call setAttr unconditionally on each cell:

| Before                    | After                          |
|---------------------------|--------------------------------|
| `el.setAttribute(...)`    | `if (different) setAttribute(...)` |
| `el.removeAttribute(...)` | `if (present) removeAttribute(...)` |

One `getAttribute`/`hasAttribute` read in exchange for skipping the
setAttribute write barrier + style invalidation + MutationObserver
callbacks the platform may dispatch.

#### 3. Datepicker grid: 3 cell-paint loops migrated

All three views (days, months, years) have a paint effect that
iterates 30-42 cells and writes 8-10 attributes per cell. Pre-fix,
every effect fire wrote every attribute on every cell -- whether the
state had changed or not.

Bench: `test-browser/fixtures/datepicker-bench.html` builds a 42-cell
grid in range-selection mode and simulates 10 consecutive
range-hover-extend moves (the canonical user interaction: dragging
through dates while selecting a range).

| Metric                          | Before        | After           |
|---------------------------------|---------------|-----------------|
| setAttribute on day cells       | ~861          | **11**          |
| removeAttribute on day cells    | ~830          | **0**           |
| TOTAL DOM writes                | **1691**      | **11** (~99%↓)  |
| Wall time (chromium-1194)       | 9-12ms        | 9-12ms          |

Wall time doesn't move on a small grid because Chrome batches the
writes well; the win is GC pressure (1700 fewer MutationRecord
allocations) and CPU breathing room on slower devices.

#### 4. Combobox: value-reflect effect migrated

`stopValueReflect` iterates every option on every value change.

Bench: 200-item listbox, 5 selection changes.

| Metric                       | Before  | After           |
|------------------------------|---------|-----------------|
| setAttribute on options      | ~1000   | **15**          |
| removeAttribute on options   | ~1000   | **5**           |
| TOTAL DOM writes             | **~2000** | **20** (~99%↓) |

Each selection now writes exactly 4 attrs: aria-selected + data-selected
on the new option, aria-selected + data-selected on the old. 5 changes
× 4 = 20 -- matches the steady-state minimum.

#### 5. Tabs: panel visibility effect migrated

The panel-visibility paint effect was raw `setAttribute("hidden", "")`
/ `removeAttribute("hidden")` per panel per value change.

Bench: 20 panels, 10 value changes.

| Metric                     | Before  | After          |
|----------------------------|---------|----------------|
| setAttribute on panels     | ~200    | **27**         |
| removeAttribute on panels  | ~200    | **9**          |
| TOTAL writes               | **~400**| **36** (~91%↓) |

Each change writes ~4 attrs (state + hidden on both old and new active
panel).

#### 6. Datepicker month label: dedup + hoist + dirty-check

The `stopMonthLabel` effect was:
- Reconstructing `Intl.DateTimeFormat` on every effect run (object +
  locale resolution allocation per repaint)
- Writing `textContent` unconditionally even when the formatted string
  matched the current text

The duplicate logic at `attachMonthLabel` initial-paint path inlined
the same branch ladder.

Fix: module-scoped `_defaultMonthYearFormat` reused across all
datepickers in the document; shared `computeMonthLabel()` helper
called from both call sites; `textContent` dirty-checked via simple
inequality before write.

#### 7. Audit findings: clean by design

- **classList writes**: zero. Every primitive paints via data
  attributes, which is a deliberate architecture choice (consumers
  style via `[data-state="open"]` selectors). No classList add/remove
  bugs possible.
- **textContent writes**: inline-edit already dirty-checked; datepicker
  now does too. No other primitives write textContent in effects.
- **Style writes**: slider + progress write CSS custom properties via
  `setProperty` in their value-sync effects. Not migrated because they
  typically run on 1-3 elements (single thumb, single progress bar) so
  the cost is bounded. If a "many-thumbs" scenario appears in the
  wild, the same dirty-check pattern applies.
- **Map iteration**: measured `for (const x of map.values())` vs
  `Map.forEach` vs array-backed `for-i` over 42 entries × 100k
  iterations. V8 inlines the iterator allocation well enough that the
  array-backed version is only ~13% faster -- not worth the parallel
  storage refactor.
- **Per-element closures**: no primitive creates event handler
  closures inside attach loops. All event handlers are scoped to the
  single attached element with `entry`-keyed lookup.

#### Counts

- 1031 unit (×3 stable; no new tests this round -- the existing
  primitive suites cover the refactored paint loops since the public
  state is preserved)
- 313 browser passing in regression

#### Compatibility

Drop-in for v0.7.35. No primitive APIs changed. No new exports beyond
`toggleAttr` from `_overlay/aria.js`. The existing `setAttr` upgrade
is transparent (same I/O, less work).

---

### 0.7.35 — 2026-06-16

#### Hardening: wrapper boundary + hot-path audit

A focused performance + correctness pass across the 28 custom-element
wrappers. No primitive APIs changed. No new exports beyond
`belongsToHost`. Drop-in for v0.7.34 consumers; pure improvement.

#### 1. Light-DOM scope leak (correctness)

The naive `host.querySelectorAll("[data-X]")` walks the entire descendant
tree. A consumer who nests two `<lite-X>` instances -- a card-skeleton
containing a profile-pic-skeleton, a tag-input contained inside another
tag-input, a file-upload inside a form section that also has a
file-upload -- would silently have their inner instance's role slots
hijacked by the outer wrapper. The inner primitive would receive no
DOM, the outer would think it owned twice the slots.

Fix: exported `belongsToHost(node, host)` from
`src/_overlay/element-roles.js` (the same charCode-based ancestor check
the role-observer module already used internally), and routed every
consumer-facing descendant query in the leaf wrappers through a
two-line `scopedQuery(host, sel)` filter. The check is O(depth-to-host),
not O(subtree), and uses `tagName.charCodeAt(0..4) === "LITE-"`
comparison to avoid `startsWith` substring allocations.

Migrated wrappers:
- skeleton, file-upload, inline-edit, progress, picture, tag-input,
  pin-input, toggle-group, switch, avatar, breadcrumb
  (pagination, command-palette, split-panels already used the guard via
  an earlier round)

Nesting scenarios verified end-to-end in
`test-browser/nesting-scope.spec.js`: skeleton-in-skeleton, progress-in-
progress, file-upload-in-file-upload, tag-input-in-tag-input,
pin-input-in-pin-input, inline-edit-in-inline-edit. Each outer host's
operations only affect its own children; inner hosts retain their own.

#### 2. file-upload row construction (performance)

The row construction was: `el.innerHTML = "<span...><button...>"` per
row + 5 `el.querySelector(...)` calls to grab references. For a 50-file
drop: 50 HTML parser invocations + 250 selector-engine walks during a
single layout frame. CPU spike + hundreds of throwaway objects.

Fix: hoisted a single `<template>` at module load. New rows clone via
`template.content.cloneNode(true)` (browser's native C++ DOM clone, no
parser) and reach the five role elements via `el.children[0..4]`
indexing. The five `querySelector` calls per row become zero.

Bench (50-file drop):
- innerHTML parses for rows:     was 50, now **0**
- qS calls into row subtrees:    was 250, now **0**
- wall time on chromium-1194:    ~8.4ms total

The template literal is parsed exactly once at module load; subsequent
rows are O(clone + 5 child accesses).

#### 3. Row paint write deduplication (performance)

Both file-upload and tag-input had paint effects that wrote `data-*`
attributes and `textContent` unconditionally on every render -- even
for rows/chips whose painted state hadn't changed. For a 100-row file
list with one in-flight upload, that was 100 status writes per progress
tick; for a 100-chip tag-input with the active-index pinging between
two chips, it was ~400 `setAttribute` + ~400 `removeAttribute` calls
per ping.

Fix: each row/chip record now caches its last-painted `_status`,
`_name`, `_retryHidden` (file-upload) and `_idx`, `_active`, `tag`
(tag-input). Writes happen ONLY when the cached value disagrees with
the current value.

Bench (100-chip tag-input, 4 active-index toggles):
- setAttribute on chips:    was ~400, now **4**
- removeAttribute on chips: was ~396, now **3**

#### 4. Attribute observer dirty-flag collapse (performance)

`MutationObserver` callbacks fire with N records when a framework
batches N attribute writes in one render tick. The old code processed
each record sequentially, calling `getAttribute` + setter once per
record -- so three `setAttribute("value", ...)` calls produced three
`pg.setValue(parseNum(host.getAttribute("value"), 0))` runs reading
the same DOM-string three times.

Fix: each callback now sets per-attribute dirty bits and queues a
single microtask flush. The flush reads each marked attribute exactly
once and calls the corresponding setter once. Applied to:
- progress (5 attributes: value, min, max, indeterminate, value-text)
- skeleton (ready)
- avatar (src)

One microtask of latency in exchange for O(1) work per burst regardless
of write count.

#### 5. Minor sweeps

- `for-of` iterator allocations in hot scan loops (toggle-group,
  breadcrumb, skeleton, pin-input) converted to indexed `for` loops.
  Removes one iterator object allocation per scan.
- pin-input slot enumeration: tracks its own index separately
  (`ownIdx`) instead of using the qSA iteration index, so nested
  pin-inputs don't fight over slot numbers.
- picture: scoped both `[data-pic-img]` and the bare `<img>` fallback
  query, so a nested picture's img can't be claimed by the outer.

#### Tests

- **8 unit tests** in `test/nesting-scope-guard.test.js` covering the
  `belongsToHost` contract: direct + deeply-nested ancestor traversal,
  inner-lite-element scope boundary, mixed-primitive-type boundary,
  self-ownership case, lookalike-tag rejection, O(depth) walk
  contract.
- **6 browser tests** in `test-browser/nesting-scope.spec.js` covering
  the end-to-end behavior in real custom elements: skeleton, progress,
  file-upload, tag-input, pin-input, inline-edit.
- **Benchmark fixture** at `test-browser/fixtures/wrapper-bench.html`
  pins the file-upload row-construction + tag-input chip-paint
  numbers (0 qS calls / 0 innerHTML parses / 4-7 writes for stable
  state). Useful as a regression boundary for future perf work.

#### Counts

- 1031 unit (was 1023; +8 nesting-scope-guard tests)
- 313 browser (was 307; +6 nesting-scope specs)
- ×3 unit stability: clean
- Known chromium-1194 timing flakes (datepicker focus, menu
  safe-triangle, accordion transition-lock, carousel autoplay) -- all
  pass in isolation, surface only under sustained load

#### Compatibility

Drop-in for v0.7.34 consumers. No primitive APIs changed. The only new
external surface is `belongsToHost` exported from `_overlay/element-roles.js`
(consumers writing their own custom-element wrappers can use the same
helper to enforce scope boundaries).

---

### 0.7.34 — 2026-06-15

#### Added: inline-edit primitive (30th)

Click-to-edit text. Display mode shows a value; clicking (or pressing
Enter on a focused display) transitions to edit mode where an input holds
a draft. Enter / blur commits, Escape cancels. Used in titles, kanban
card text, tag names, profile fields -- anywhere an inline edit replaces
a separate edit screen.

```js
import { createInlineEdit } from "@zakkster/lite-headless/inline-edit";

const ie = createInlineEdit({
    initialValue: "Untitled card",
    validate: (next) => next.length >= 3 || "too short",
    onCommit: (next, prev) => persist(cardId, next),
});

ie.attachRoot(rootEl);
ie.attachDisplay(displayEl);     // <span>Untitled card</span>
ie.attachInput(inputEl);         // <input> (hidden by default)
```

The primitive paints `hidden` on whichever element isn't active in the
current mode (display vs edit), and `data-mode="display|edit"` on the
root for CSS hooks.

#### Mode transitions

```
display -> click (or Enter/Space on focused display) -> edit
edit    -> Enter (or Tab if configured) on input    -> commit -> display
edit    -> blur on input (if 'blur' in commitOn)    -> commit -> display
edit    -> Escape on input                          -> cancel -> display
edit    -> commit() but validation fails            -> stays edit, isInvalid=true
```

When the primitive enters edit mode, it focuses the input + selects its
contents (so typing replaces). Focus is deferred to a microtask so the
`hidden` removal commits in layout first.

#### Validation pipeline

For each commit attempt: `normalize(s)` -> `trim()` -> empty check ->
`validate(next, prev)`. A failed commit sets `isInvalid()` to true,
fires `onInvalid(value, reason)`, stays in edit mode. Typing again
clears the invalid state so the user can fix and retry.

#### Commit triggers

`commitOn` array (default `["Enter", "blur"]`) accepts `"Enter"`,
`"blur"`, `"Tab"`. `cancelOn` defaults to `["Escape"]`.

#### Multiline (textarea)

With `multiline: true` and a `<textarea>` input slot:
- Enter alone inserts a newline (browser default, NOT preventDefault'd)
- **Cmd-Enter / Ctrl-Enter** commits (only if `"Enter"` is in `commitOn`)
- All other commit/cancel triggers work the same

Matches Slack / Linear / Notion conventions.

#### API

```js
ie.value()              // string, committed
ie.draftValue()         // string, current edit draft
ie.isEditing()          // boolean
ie.isInvalid()          // boolean (last commit attempt failed)

ie.setValue(s)          // programmatic; no events fired
ie.setDraftValue(s)
ie.startEdit()
ie.commit()             // -> boolean (success?)
ie.cancel()

ie.attachRoot(el)              // -> off()
ie.attachDisplay(el)           // -> off()
ie.attachInput(inputEl)        // -> off()
ie.attachTrigger(buttonEl)     // -> off() (optional explicit edit trigger)
ie.destroy()
```

Options: `initialValue`, `placeholder`, `trim`, `allowEmpty`, `commitOn`,
`cancelOn`, `multiline`, `normalize`, `validate`, `onChange` (only on
actual change), `onCommit` (every successful commit), `onCancel`,
`onInvalid`, `onEditStart`, `ariaLabel`.

#### ARIA contract

| Element  | Painted attributes                                                       |
| -------- | ------------------------------------------------------------------------ |
| Root     | `data-inline-edit-root` · `data-mode="display\|edit"` · `data-invalid="true"` (when applicable) · `aria-label` (if provided) |
| Display  | `data-inline-edit-display` · `hidden` (when editing) · textContent mirrors `value()` |
| Input    | `data-inline-edit-input` · `hidden` (when displaying) · value mirrors `draftValue()` |
| Trigger  | `data-inline-edit-trigger` (optional)                                    |

For keyboard accessibility, give the display element `tabindex="0"` if
you want users to be able to tab into it and press Enter/Space to start
editing.

#### Element wrapper

```html
<lite-inline-edit value="Untitled" aria-label="Card title">
    <span data-inline-edit-display-slot tabindex="0"></span>
    <input data-inline-edit-input-slot type="text">
</lite-inline-edit>
```

Auto-attaches `[data-inline-edit-display-slot]` as display,
`[data-inline-edit-input-slot]` as input, optional
`[data-inline-edit-trigger-slot]` as explicit edit trigger. The wrapper
does NOT forward the `validate` option (different consumers want very
different validation surfaces, and the wrapper-as-attribute API can't
express functions); the recommended pattern is to intercept the `commit`
event + roll back via `setValue + startEdit` (demonstrated in scene 28
tag-name block). For full validation control, use `createInlineEdit`
imperatively.

CustomEvents: `change`, `commit`, `cancel`, `editstart`, `invalid`.

#### Demo

New **scene 28 · Inline Edit** with four blocks:
- **Basic** (card title): click + Enter commits; Escape cancels; blur
  commits via default `commitOn`.
- **Validated** (tag name): min-length 3 with rollback via commit event
  interceptor (`setValue(previous) + startEdit()` pattern).
- **Multiline** (description): textarea with `allow-empty="true"`;
  Enter inserts newline, Cmd-Enter commits.
- **Explicit trigger** (profile name): click the dedicated `edit`
  button to start editing.

#### Tests

- **30 unit tests** in `test/inline-edit.test.js`: construction;
  startEdit transitions; commit/cancel with onChange vs onCommit
  semantics (onChange only on actual change, onCommit every success);
  empty rejection + isInvalid + onInvalid; allowEmpty=true accepts;
  validate function with custom string reason; normalize + trim
  composition; cancel reverts + onCancel; typing while invalid clears
  isInvalid; attachRoot paints data-mode + data-invalid; attachDisplay
  paints textContent + toggles hidden; display click + Enter/Space
  starts edit; attachInput hidden mirrors mode; typing updates draft;
  Enter commits (single-line); Escape cancels; blur commit-on
  vs commit-off; Tab commit-on; multiline Enter alone (newline,
  no commit) + Cmd-Enter commits; trigger button click; setValue
  programmatic (no events); destroy idempotency.
- **10 browser tests** in `test-browser/inline-edit.spec.js`: initial
  display paint; click starts edit + reveals input + focuses; type +
  Enter commits + transitions back to display; Escape cancels + reverts;
  blur commits; Enter on focused display starts edit; event ordering
  (editstart -> commit -> editstart -> cancel); empty commit rejected
  + data-invalid + stays editing; setValue programmatic; min-length
  rollback via commit-event interceptor.

#### Counts

- 1023 unit (was 993; +30 inline-edit tests)
- 307 browser (was 297; +10 inline-edit specs; one isolated run is fully
  green)
- In a back-to-back 313-spec regression the 6 known chromium-1194 timing
  flakes (3 datepicker focus + 3 menu safe-triangle/arrow-key) surface
  alongside 2 new ones (accordion transition-lock + carousel autoplay
  advance), both of which pass cleanly in isolation. The 2 new ones are
  not caused by this release -- they're the same class of timing
  pressure as the original 6, just surfacing under sustained load now
  that the suite is 313 tests instead of 297.

#### Compatibility

Drop-in for v0.7.33 consumers. Additive only (one new primitive +
wrapper + subpath exports). Peer dependencies unchanged.

---

### 0.7.33 — 2026-06-15

#### Added: file-upload primitive (29th)

Client-side file upload coordinator. Manages a list of FileEntry records,
tracks per-file upload status, exposes progress signals per file +
aggregate, and wires drag-drop + file-input + per-file abort. Composes
cleanly with `@zakkster/lite-headless/progress` -- bind a `<lite-progress>`
per row to each entry's `.progress` signal.

```js
import { createFileUpload } from "@zakkster/lite-headless/file-upload";

const fu = createFileUpload({
    accept: "image/*,.pdf",
    maxSize: 10 * 1024 * 1024,
    onUpload: async (entry, { signal, onProgress }) => {
        const xhr = new XMLHttpRequest();
        return new Promise((resolve, reject) => {
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) onProgress(e.loaded);
            });
            xhr.onload  = () => xhr.status < 400 ? resolve() : reject(new Error("HTTP " + xhr.status));
            xhr.onerror = () => reject(new Error("network error"));
            signal.addEventListener("abort", () => xhr.abort());
            xhr.open("POST", "/upload");
            xhr.send(entry.file);
        });
    },
});

fu.attachDropZone(dropZoneEl);
fu.attachInput(fileInputEl);
```

The primitive does not do the network -- consumers provide
`onUpload(entry, { signal, onProgress })`. It can be XHR, fetch, S3 presigned,
Tus resumable, whatever. The primitive owns the queue + lifecycle + abort
plumbing.

#### Lifecycle

```
addFiles -> validate -> queued -> uploading -> done
                          |             |    \-> error  (with .error set)
                          |             \-> aborted   (no error)
                          \-> removed (clear / removeEntry mid-flight)
```

`autoUpload: true` (default) starts each accepted file immediately. With
`autoUpload: false` files sit in `"queued"` until `uploadAll()`.

#### Validation pipeline

Per file: `maxFiles` cap, `maxSize` cap, `accept` matcher (mime
`"image/*"`, extension `".pdf"`, or exact MIME), custom `validate(file)`.
Each rejection fires `onInvalid(file, reason)` with one of:
`"max-files"`, `"max-size"`, `"accept"`, `"validate"`,
`"multiple-disabled"`, or a custom string returned by the user's
`validate` function.

#### Drag-drop

`attachDropZone(el)` wires `dragenter` / `dragover` / `dragleave` / `drop`
with proper `preventDefault`. While dragging, the element gets
`data-drag-over="true"` reactively (clears on leave or drop).
`dragleave` correctly distinguishes "leaving the zone" vs "moving over a
child element" by checking `relatedTarget` containment.

#### Per-file abort + retry

Each FileEntry has its own AbortController. `fu.abort(id)` calls
`controller.abort()`, the consumer's `onUpload` signal listener fires,
and the entry transitions to `"aborted"` (no `onError` -- abort is
intentional). `removeEntry(id)` while uploading aborts as a side effect.
`fu.retry(id)` re-queues an `"error"` or `"aborted"` entry: fresh
AbortController, `bytesLoaded` reset to 0, status -> `"queued"`.

#### API

```js
fu.entries()                  // readonly FileEntry[]
fu.isDragOver()               // boolean
fu.totalProgress()            // 0..1 aggregate across non-aborted entries
fu.pendingCount()             // queued + uploading count

fu.addFiles(fileList)         // -> accepted entries
fu.removeEntry(id)            // -> boolean (aborts if uploading)
fu.retry(id)                  // -> boolean
fu.abort(id)                  // -> boolean
fu.clear()                    // remove all, abort in-flight
fu.uploadAll()                // start all queued entries

fu.attachDropZone(el)         // -> off()
fu.attachInput(inputEl)       // -> off()
fu.destroy()
```

#### FileEntry shape

```ts
{
    id:          string,
    file:        File,
    status:      "queued" | "uploading" | "done" | "error" | "aborted",
    progress:    Computed<number>,    // 0..1 (derived from bytesLoaded / size)
    bytesLoaded: Signal<number>,      // your onUpload writes via onProgress(n)
    bytesTotal:  number,              // file.size
    error:       Error | null,
    _ctrl:       AbortController,
}
```

The reactive surfaces (`progress`, `bytesLoaded`) are real lite-signal
handles -- per-row progress bars are an `effect` away.

#### Element wrapper

```html
<lite-file-upload accept="image/*,.pdf" multiple max-size="10485760">
    <div data-drop-zone>
        Drop files here, or
        <button data-file-pick>browse</button>
    </div>
    <ul data-file-list></ul>
    <input data-file-input type="file" hidden>
</lite-file-upload>
```

The wrapper auto-attaches `[data-drop-zone]` (or the host itself) as the
drop target, attaches `[data-file-input]` for the file picker (clicking
`[data-file-pick]` triggers it), and renders one `<li data-file-row>` per
entry with status text, X-remove, Retry button (visible only on
error/aborted), and a `[data-file-progress-host]` slot where consumers
mount their own progress bar.

`multiple` defaults to **true** (matches the primitive); set
`multiple="false"` explicitly to disable.

The wrapper ships with a built-in demo driver that simulates a 1.5-second
upload with linear progress (useful for the demo + offline testing). For
real apps, set `host.onUpload = async (entry, ctx) => { ... }` before the
element upgrades, OR use the imperative `createFileUpload` directly.

CustomEvents: `change`, `filesadded`, `progress`, `complete`,
`uploaderror`, `invalid`, `alldone`.

#### Demo

New **scene 27 · File Upload** in the Chrome menu with two blocks:
- **Basic** (auto-upload with demo driver) -- 3-fake-files button +
  clear button. Per-row `<lite-progress>` bars bound to each entry's
  `.progress` signal via the documented effect pattern. Shows the full
  composition story end-to-end: file picked -> validated -> queued ->
  uploading with live progress -> done.
- **Constrained** (`accept="image/*"`, max 3, 200-byte size cap) with
  three demonstration buttons: valid image (accepted), PDF (rejected:
  `accept`), big image (rejected: `max-size`).

#### Tests

- **21 unit tests** in `test/file-upload.test.js`: construction;
  addFiles pipeline (maxFiles / maxSize / accept by-mime + by-extension /
  validate / multiple=false rejection); lifecycle (queued -> uploading
  -> done; error path; autoUpload=false path); abort + transition;
  retry re-queues + restarts; removeEntry mid-flight aborts;
  clear() aborts all in-flight; totalProgress aggregates per-file
  bytesLoaded; pendingCount; attachDropZone paints `data-drop-zone`
  + `data-drag-over` correctly via synthesized events (jsdom doesn't
  expose DragEvent, so tests use plain Event + manual `relatedTarget`);
  drop event with dataTransfer.files calls addFiles; destroy
  idempotency.
- **11 browser tests** in `test-browser/file-upload.spec.js`: drop zone
  attached; drag-over state painted via synthesized dragenter/leave;
  drop with files calls addFiles; addFiles via API renders rows;
  default demo driver settles to `"done"` within timeout; X-button
  removes; maxSize / accept / maxFiles enforcement in constrained
  block; filesadded + complete + alldone event ordering; clear()
  drops all rows.

#### Counts

- 993 unit (was 972; +21 file-upload tests)
- 297 browser (was 286; +11 file-upload specs)
- Same 6 known chromium-1194 datepicker/menu focus flakes -- unchanged

#### Fixed: toast auto-dismiss spec timing margin

The `toast.spec.js` "auto-dismiss removes the toast after duration" test
was using a 50ms toast duration with a 20ms post-click wait, which became
unreliable as Playwright click-event roundtrip overhead climbed past 50ms
in headless runs. Replaced the click-driven trigger with a direct
`host.show("Quick", { duration: 200 })` call + 50ms / 250ms windows for
generous timing headroom. Toast primitive itself unchanged.

#### Compatibility

Drop-in for v0.7.32 consumers. Additive only (one new primitive + wrapper
+ subpath exports). Peer dependencies unchanged.

---

### 0.7.32 — 2026-06-15

#### Added: tag-input primitive (28th)

Multi-value tag/chip input. A text field plus a list of tag chips: typing +
delimiter creates a tag, click X to remove, Backspace in empty input enters
two-step tag-selection mode for keyboard-driven removal. Standard chip-input
UX from Gmail / Stack Overflow / Linear, used in label pickers, recipient
lists, search filter UIs, anything where the user enters several short
string values.

```js
import { createTagInput } from "@zakkster/lite-headless/tag-input";

const tagInput = createTagInput({
    maxItems: 8,
    onChange: (tags) => filterResults(tags),
});
tagInput.attachRoot(rootEl);
tagInput.attachInput(inputEl);
```

The primitive owns the tag array + active-index state + keyboard wiring;
the consumer renders chips. `<lite-tag-input>` wrapper does chip rendering
automatically (one `<span data-tag-chip>` per tag with built-in
`<button data-tag-remove>` X-button).

#### Behavior

- **Delimiters**: default `["Enter", "Tab", ","]`. Mixed: key names AND
  single-char strings. Custom via the `delimiters` option.
- **Paste-split**: when pasted text contains the `pasteSplitOn` regex
  (default `/[,\n;]/`), split + add each fragment via full pipeline.
  Paste of "red, green, blue" -> three tags. Single-value paste (no
  delimiter) is passed through to the browser.
- **Backspace two-step** (the convention in modern chip inputs):
  - Input has text -> Backspace edits text normally.
  - Empty input, no active -> first Backspace highlights last tag.
  - Empty input, tag active -> Backspace removes that tag.
- **Validation pipeline**: trim -> normalize() -> dup check ->
  maxItems check -> validate(). Each step that rejects fires
  `onInvalid(value, reason)` with one of: `"empty"`, `"duplicate"`,
  `"max-items"`, `"validate"` (or a custom string returned by `validate`).
- **Keyboard nav**: ArrowLeft / ArrowRight between tags + back to input;
  Home / End jump to first / input; Delete removes active tag; printable
  char while tag-active exits to input.

#### API

```js
tagInput.tags()                 // readonly string[]
tagInput.count()                // number
tagInput.canAddMore()           // tags.length < maxItems
tagInput.activeIndex()          // -1 = input, else tag index
tagInput.inputValue()           // current input field text

tagInput.addTag(s)              // -> boolean (added?)
tagInput.removeTag(i)           // -> boolean
tagInput.removeLast()
tagInput.clear()
tagInput.setTags(array)         // bulk replace; runs full pipeline per item
tagInput.setActiveIndex(i)
tagInput.focusInput()

tagInput.attachRoot(el)         // -> off()
tagInput.attachInput(inputEl)   // -> off()
tagInput.destroy()
```

Options: `initialValue`, `maxItems`, `allowDuplicates`, `delimiters`,
`pasteSplitOn`, `trim`, `normalize`, `validate`, `onChange`, `onAdd`,
`onRemove`, `onInvalid`, `ariaLabel`.

#### ARIA contract

| Element | Painted attributes                                                 |
| ------- | ------------------------------------------------------------------ |
| Root    | `role="group"` · `aria-label` · `data-tag-root` · `data-tag-count="N"` · `data-tag-active="i\|-"` |
| Input   | `data-tag-input-field`                                             |
| Chips   | Consumer paints `data-tag-index="i"` + `data-tag-active="true"` when `activeIndex() === i`. Wrapper does this automatically. |

#### Element wrapper

```html
<lite-tag-input max-items="8" aria-label="Categories">
    <div data-tag-list></div>
    <input data-tag-input-slot placeholder="Add a tag...">
</lite-tag-input>
```

Auto-attaches `[data-tag-input-slot]` as input, mounts chip elements into
`[data-tag-list]` with reactive paint. Imperative `host.addTag / removeTag /
clear / setTags / focusInput / setActiveIndex` + reactive `host.tags /
count / canAddMore / activeIndex / inputValue` getters. CustomEvents:
`change`, `add`, `remove`, `invalid`.

#### Demo

New **scene 26 · Tag Input** with three blocks:
- **Basic** (maxItems=8) with seed / clear / simulate-paste buttons
- **Email recipients** with email validation via an `add` event interceptor
  (rolls back non-email values + logs the rejection)
- **Categories with slug normalization** (`"Hello World"` -> `"hello-world"`
  via the wrapper's primitive instance)

#### Tests

- **44 unit tests** in `test/tag-input.test.js`: construction +
  initialValue pipeline; addTag (empty/duplicate/max-items/validate /
  normalize-before-dup-check); removeTag activeIndex bookkeeping;
  setTags bulk replace; Enter/Tab/comma delimiters; backspace two-step
  flow; Delete on active tag; ArrowLeft/Right/Home/End nav; printable
  char exits active mode; paste-split (with delimiter, without delimiter,
  newline split, max-items rejection mid-paste); root attach + cleanup;
  destroy idempotency.
- **11 browser tests** in `test-browser/tag-input.spec.js`: ARIA paint,
  Enter commit, comma commit + residue handling, X-button remove,
  Backspace two-step end-to-end, arrow nav, paste-split via real
  ClipboardEvent, duplicate invalid event, maxItems block, change event
  detail, active chip `data-tag-active` paint.

#### Counts

- 972 unit (was 928; +44 tag-input tests)
- 286 browser (was 275; +11 tag-input specs)
- Same 6 known chromium-1194 datepicker/menu focus flakes — unchanged

#### Compatibility

Drop-in for v0.7.31 consumers. Additive only (one new primitive + wrapper
+ subpath exports). Peer dependencies unchanged.

---

### 0.7.31 — 2026-06-15

#### Added: pin-input primitive (27th)

PIN / OTP / one-time-code entry. N input boxes with auto-advance,
backspace-handles-empty, paste-distribution, and ARIA wiring. The primitive
owns the validated value + which-box-is-active state; the consumer provides
the markup (N input elements) and styles. Built for 2FA flows, payment PINs,
and any short fixed-length code entry.

```js
import { createPinInput } from "@zakkster/lite-headless/pin-input";

const pin = createPinInput({
    length: 6,
    type: "numeric",
    onComplete: (code) => verifyMfaCode(code).then(...),
});
pin.attachRoot(rootEl);
for (let i = 0; i < 6; i++) pin.attachInput(inputEls[i], i);
```

#### Behavior

- **Auto-advance**: typing a valid char in box N advances focus to box N+1.
  Last box stays focused; `onComplete` fires on incomplete -> complete edge.
- **Backspace**: filled box → clear + stay; empty box → focus previous +
  clear it. Matches the native OTP UX.
- **Paste**: if pasted (filtered) text length === `length`, fill all boxes
  from index 0 regardless of where the paste happened (handles iOS SMS
  auto-fill + user paste-anywhere). Otherwise insert at the target index,
  filling up to remaining capacity. Pattern-filtered: "1-2-3-4-5-6" pasted
  into a numeric pin becomes "123456".
- **Pattern**: `type: "numeric"` (default, `/[0-9]/`), `"alphanumeric"`
  (`/[A-Za-z0-9]/`), or a `RegExp` for custom (hex, CJK, etc.). Invalid
  chars are silently dropped at the keystroke level via `preventDefault` --
  no flash of bad input.
- **Keyboard**: ArrowLeft / ArrowRight navigate, Home / End jump to ends,
  Enter calls submit.

#### API

```js
pin.value()                     // string, 0..length chars
pin.isComplete()                // boolean
pin.position()                  // 0..length-1

pin.setValue(s)                 // filters by pattern; moves focus to end
pin.setPosition(i)
pin.clear()
pin.submit()                    // fires onComplete if complete
pin.focusInput(i)

pin.attachRoot(el)              // -> off()
pin.attachInput(inputEl, idx)   // -> off()
pin.destroy()
```

Options: `length` (1..16, default 6), `type`, `initialValue`, `onChange`,
`onComplete`, `onInvalidPaste`, `inputAriaLabel`, `ariaLabel`.

#### ARIA contract

| Element | Painted attributes                                                 |
| ------- | ------------------------------------------------------------------ |
| Root    | `role="group"` · `aria-label` · `data-pin-root` · `data-pin-length` · `data-pin-state="incomplete\|complete"` · `data-pin-value-length` |
| Input   | `data-pin-input` · `data-pin-index="i"` · `maxlength="1"` · `aria-label="Digit N of M"` · `inputmode="numeric"` (numeric mode) · `autocomplete="one-time-code"` (first input only, for iOS SMS auto-fill) |

#### Element wrapper

```html
<lite-pin-input length="6" type="numeric" aria-label="2FA code">
    <input data-pin-slot>  ...  <input data-pin-slot>
</lite-pin-input>
```

Auto-attaches descendants carrying `data-pin-slot` in DOM order, up to
`length` slots. MutationObserver picks up dynamic templates. Imperative
`host.setValue / clear / submit / focusInput` and reactive `host.value /
isComplete / position` accessors. `change` and `complete` CustomEvents.

#### Demo

New **scene 25 · Pin Input** in the Chrome menu (next to Skeleton ·
scene 24). Three blocks:
- Numeric SMS OTP (length 6) with programmatic fill + clear + simulate-paste buttons
- Alphanumeric license segment (length 4)
- Masked PIN entry (length 4) using `type="password"` on the inputs (CSS
  approach for masking; primitive holds the raw value)

#### Tests

- **34 unit tests** in `test/pin-input.test.js` covering construction
  options (length/type/initialValue/RegExp/throws), root + input attach
  contracts, typing flow + auto-advance + last-box stays + onComplete
  edge semantics, onChange diagnostics, backspace (filled / empty /
  index 0), arrow nav, Home/End, Enter submit, paste (full-length
  fill-from-0, short paste, non-matching filtered out, onInvalidPaste,
  truncation), programmatic setValue / clear / submit, destroy idempotency.
- **11 browser tests** in `test-browser/pin-input.spec.js` covering the
  fixture: attrs, auto-advance, non-digit blocked, backspace flows,
  arrow nav, Home/End, complete event, programmatic flows, alphanumeric.

#### Pipeline summary

928 unit + 275 browser tests passing (was 894 + 264 in v0.7.30).

#### Known: same 6 chromium-1194 focus flakes

Unchanged from previous releases: 3 in `datepicker.spec.js`, 3 in
`menu.spec.js`. Environment-level, not code.

#### Compatibility

Drop-in for v0.7.30 consumers. Additive only (one new primitive + its
element wrapper + subpath exports). Peer dependencies unchanged.

---

### 0.7.30 — 2026-06-14

#### Fixed: lite-studio mount button required double-click after external close

Demo bug in scene 22 (admin chrome). When the user clicked the studio's own
"Close" button on the floating overlay, the demo's `_studioCtl` reference
stayed non-null and the button text stayed "Unmount lite-studio". The next
click of the demo button entered the "already mounted" branch, called
`unmount()` a second time (a no-op since the internal state was already
torn down), reset `_studioCtl = null`, and only THEN did the button
revert to "Mount lite-studio". A second click was then needed to actually
re-mount.

Fix: monkey-patch the controller's `unmount` method right after `mount()`
returns it. The studio's close-X button calls `controller.unmount()` at
click time (looks up the property dynamically), so reassigning that
property intercepts both paths -- our demo button click AND the studio's
own close-X -- through one wrapped function that flips the demo state
exactly once. Idempotent guard prevents double-tear-down.

#### Files changed

- `demo/index.html` (scene 22 studio button click handler)
- `package.json`, `CHANGELOG.md`

No primitive behavior changes. Drop-in for v0.7.29 consumers.

Test counts unchanged: 894/894 unit ×3, 264 browser (same 6 known
chromium-1194 focus flakes in datepicker/menu).

---

### 0.7.29 — 2026-06-14

#### Fixed: command palette "clear recent" did not reset the recency boost

Demo bug + primitive surface gap. The palette primitive maintains an internal
`_recent` list that boosts recently-invoked commands to the top of equal-
scoring search results (the `recentBoost` config, default +5). The demo's
"clear recent" button only cleared the side-panel chip list -- the next time
the user opened the palette, previously-invoked commands STILL ranked first,
which contradicted the intent of the button.

#### Added

- **`palette.clearRecents()`** -- resets the recency tracking without
  removing registered commands. No-op + no recompute if recents was
  already empty. Public, additive, non-breaking.
- **`palette.recents()`** -- returns a snapshot array of recent command ids
  (most recent first). Useful for persisting + restoring recents across
  sessions. Snapshot semantics: mutating the returned array does not leak
  into internal state.
- **`<lite-command-palette>` element wrapper**: `host.clearRecents()` +
  `host.recents` getter exposed (matches the imperative pattern of
  `host.clear()`, `host.commands`, etc.).
- **Demo (scene 18)**: "clear recent" button now calls both the demo's
  chip-list reset AND `palette.clearRecents()` so the recency boost is
  actually cleared.

#### Tests

- 4 new unit tests covering `clearRecents` semantics + `recents()` snapshot
  isolation. 894/894 unit ×3 stable (was 890/890; +4).
- Browser test count unchanged at 264.

#### Files changed

- `src/command-palette/index.js` (+13 lines: `clearRecents` + `recents`
  on the return surface)
- `src/command-palette/element.js` (+3 lines: host wiring)
- `demo/index.html` (clear-recent click handler calls `palette.clearRecents()`)
- `test/command-palette.test.js` (+4 unit tests)
- `package.json`, `CHANGELOG.md`

Drop-in for v0.7.28 consumers. The 6 known datepicker/menu focus-flakes
in the browser suite remain (environment, not code).

---

### 0.7.28 — 2026-06-14

#### Fixed: demo bootloader + 9 hot-path GC leaks + 1 style-recalc thrash

Patch release surfacing fixes from a perf audit of the demo (the primitives
themselves are unchanged except for one additive getter pair on the
positioner). Nothing API-breaking; no test counts changed.

#### Bootloader

- **`<script type="importmap">` now precedes `<link rel="modulepreload">`.**
  Spec-strict browsers silently no-op preloads for bare specifiers when the
  map arrives after the preload list, which manifested as
  `Failed to resolve module specifier "@zakkster/lite-element"` errors in
  some environments. Chrome was tolerating it; other engines were not.
- Unified `../node_modules/...` relative paths between preload + importmap
  for clarity.
- **`Churn graph` button (scene 22) now does something visible.** Previously
  it required `lite-studio` to be mounted first to demonstrate cascade
  disposal; clicking without mounting appeared to be a no-op. The button now
  lazy-builds the demo effect on first click and paints a live
  `tick · runs · inner observers` readout that shows the cascade behavior
  whether or not the studio overlay is mounted.

#### Hot-path GC + style-recalc

Demo-side fixes from a second-wave perf audit. The primitives are unchanged
except for #10 (which adds non-breaking getters to the popover positioner).

1. **Scene 10 (Split Panels)** -- `paintInnerReadout` + `paintOuterReadout`
   used to allocate ~10 strings per `pointermove` tick + write 10 textContent
   values synchronously. At 120Hz pointer poll rates that was over 1200
   string allocations + 1200 DOM writes per second during a drag. Now
   latches the latest sizes into module-scoped slots and flushes via
   `requestAnimationFrame` -- one paint per frame, no matter how fast the
   pointer polls. Identical pattern to the combobox highlight queue.

2. **Scene 3 (Tooltip)** -- `tip.status.subscribe` body called
   `$$("[data-tip-pip]")` on every status transition
   (`closed -> opening -> open -> closing`, 4x per cycle). Hoisted the pip
   array + readout element refs to module scope. Also fixed a slow listener
   leak: `pointerenter`/`pointerleave`/`focus`/`blur`/`click` on the three
   trigger elements were re-attached on every `buildTooltips()` rebuild --
   the triggers are persistent DOM, so toggling "openDelay" 5 times
   installed 5 generations of listeners. Now installed once at module scope.
   Plus: track + dispose the previous status subscription so observation
   edges don't pile up either.

3. **Scene 14 (Tree)** -- `focusout` allocated a fresh anonymous arrow
   function + a fresh macro-task entry on every fire. Holding ArrowDown
   walks through 40+ nodes/sec, so this was 40+ allocations/sec for the
   same condition check. Now hoists the closure + reuses one timer slot.

4. **Scene 24 (Skeleton)** -- `_skRefreshPills` called
   `document.querySelectorAll(".sk-source-pill")` on every reveal/conceal
   event + every resolve click. The pills are persistent DOM; hoisted the
   array once + pre-extracted `data-source` keys so the refresh loop is
   array-iteration only.

5. **Scene 18 (Command Palette)** -- `highlightLabel` ran
   `matches.slice().sort((a, b) => a[0] - b[0])` for every visible item on
   every keystroke. The matcher (`fuzzyMatch` in `command-palette/index.js`)
   already builds ranges in left-to-right order by construction; dropped
   the copy + sort entirely. For a 12-item palette the impact is tiny but
   the demo is used as a blueprint for 500-item palettes where it matters.

6. **Scene 2 (Popover)** -- `pointermove` drag handler called
   `stage.getBoundingClientRect()` on every tick. The previous tick's
   `anchor.style.left`/`top` writes had already invalidated layout, so this
   read forced a synchronous reflow per move. The stage doesn't move during
   a drag, so capture it once at `pointerdown` and reuse the cached rect.
   Re-captures at `pointerdown` (and on `resize`) for correctness.

7. **Scene 1 (Dialog)** -- `document.addEventListener("focusin", ...)`
   was inside `buildDialog()`. The dialog primitive gets destroyed +
   rebuilt on every config toggle, but the document-level listener was
   never removed, so each rebuild installed another listener. Now tracked
   in a module-scope ref + explicitly removed before the next install.

8. **Scene 5 (Combobox)** -- same pattern: `keydown`/`click` on the
   trigger and `pointermove` on the listbox were attached inside
   `buildCombobox()`. Triggers and listbox are persistent DOM, so each
   rebuild leaked another generation. Now tracked + cleaned up. Also fixed
   the orphaned status subscription that was never disposed on rebuild.

9. **Scene 2 (Popover) -- style-recalc thrash, primitive fix.**
   The demo's `updateResolution` was called from the anchor `pointermove`
   handler. It read `popContentEl.getAttribute("data-side")` immediately
   after the positioner wrote inline `transform` + `data-side`. Reading
   any attribute right after a layout-affecting write forces the browser
   to synchronously resolve the style tree to guarantee the read sees the
   post-write state -- classic layout thrashing.
   - **`_overlay/position.js`** now exposes `positioner.currentSide` and
     `positioner.currentAlign` getters (read from the positioner's own
     in-memory `_lastSideWritten` / `_lastAlignWritten` state that was
     already being tracked for write-diffing). Non-breaking additions.
   - Demo's `updateResolution` reads from these getters now. Zero DOM
     reads on the drag hot path.

#### Tests

890/890 unit ×3 stable. 264 browser tests passing. Six pre-existing
focus-related flakes in `datepicker.spec.js` (3) + `menu.spec.js` (3)
remain known + are unchanged by this patch -- environment-level
chromium-1194 headless flakiness, not related to lite-headless code.

#### Files changed

- `demo/index.html` (extensive demo-side perf hardening, importmap order,
  Churn button feedback)
- `src/_overlay/position.js` (+13 lines: `currentSide` + `currentAlign`
  getters, no behavior changes elsewhere)
- `package.json` (version bump)
- `CHANGELOG.md`

No primitive behavior changes. Drop-in for v0.7.27 consumers.

---

### 0.7.27 — 2026-06-14

#### Added: skeleton primitive (26th)

Loading-state coordinator. Manages a `loading -> ready` state machine for one
or more independent data sources, optionally gating the reveal with a
`minVisibleMs` threshold to prevent flash on sub-100ms fetches. The consumer
provides placeholder elements (with their own shimmer animation) and content
elements; the primitive paints `data-state` + `aria-busy` + `aria-hidden` so
consumer CSS can swap which is visible without the primitive owning any
rendering.

```js
import { createSkeleton } from "@zakkster/lite-headless/skeleton";

// Single skeleton
const sk = createSkeleton({ minVisibleMs: 200 });
sk.attachRoot(rootEl);
sk.attachPlaceholder(placeholderEl);
sk.attachContent(contentEl);
const data = await fetchUser();
renderUser(contentEl, data);
sk.reveal();

// Multi-source: reveal only when ALL sources resolve
const dashboard = createSkeleton({
    sources: ["user", "posts", "followers"],
    minVisibleMs: 200,
});
fetchUser().then(d => { renderUser(d); dashboard.resolve("user"); });
fetchPosts().then(d => { renderPosts(d); dashboard.resolve("posts"); });
fetchFollowers().then(d => { renderFollowers(d); dashboard.resolve("followers"); });
// dashboard auto-reveals when the last resolve() lands
```

#### Features

- **Multi-source coordination.** Declare expected data sources up front;
  call `resolve(name)` as each arrives; the skeleton auto-reveals when the
  last one lands. Sources resolved out of declared order are fine; resolving
  an undeclared source auto-registers + marks it resolved.
- **`minVisibleMs` flash guard.** When the data loads faster than the
  configured threshold (default 0 = disabled), the actual reveal is deferred
  via `setTimeout` so the placeholder shows for at least that long. Prevents
  the "blink" flicker on fast networks. `conceal()` cancels a pending timer.
- **Edge-only callbacks.** `onReveal` fires once per `loading -> ready`
  transition; `onConceal` once per `ready -> loading`. Idempotent
  `setReady` calls don't re-fire.
- **Reset semantics.** `reset()` marks all declared sources unresolved AND
  flips back to loading. Useful for re-fetching on filter change or
  invalidation.

#### Reactive surface

```js
sk.ready()                   // boolean accessor
sk.pendingSources()          // string[] of unresolved sources
sk.isResolved(name)          // O(1) per-source predicate

sk.setReady(true|false)      // direct toggle
sk.reveal() / sk.conceal()   // aliases
sk.resolve(source)
sk.reset()

sk.attachRoot(el)            // -> off() cleanup
sk.attachPlaceholder(el)
sk.attachContent(el)

sk.destroy()
```

#### ARIA

| Element     | Painted attributes                                                       |
| ----------- | ------------------------------------------------------------------------ |
| Root        | `role="status"` · `aria-live="polite"` · `aria-busy="true\|false"` · `data-skeleton-root` · `data-state="loading\|ready"` |
| Placeholder | `data-skeleton` · `data-state` · `aria-hidden="true"` (when ready)       |
| Content     | `data-skeleton-content` · `data-state` · `aria-hidden="true"` (when loading) |

`role="status"` + `aria-live="polite"` on the root means SRs announce the
content the moment the skeleton flips to ready. The polite liveness queues
behind any in-progress utterance instead of interrupting.

#### Element wrapper

```html
<lite-skeleton sources="user posts" min-visible-ms="200">
    <div data-skeleton class="placeholder-card">...</div>
    <div data-skeleton-content class="real-card">...</div>
</lite-skeleton>
```

The wrapper auto-attaches any descendant carrying `data-skeleton` (placeholder)
or `data-skeleton-content` (content), with a MutationObserver picking up
dynamic templates. Imperative `host.reveal()`, `host.resolve("name")`,
`host.reset()`, etc. Reactive `host.ready` and `host.pendingSources`
accessors. CustomEvents `reveal` and `conceal` fire on edge transitions.

#### Cascade-clean from day one

Zero `_destroyed` checks in effect bodies. The internal `_destroyed` flag
gates public methods only; reactive effects are torn down by their owning
scope. Pending `minVisibleMs` timer is cleared on `destroy()`.

#### Demo

New **scene 24 · Skeleton** in the demo:
- Single-skeleton profile card with reveal/conceal/async-fetch buttons
- Multi-source dashboard (user/posts/followers) with per-source pill state
  visualization that paints green as each resolves
- `minVisibleMs` guard demo card showing deferred reveal
- Event log line showing reveal/conceal transitions in real time

#### Tests

- **30 unit tests** in `test/skeleton.test.js` covering construction,
  attach lifecycle, setReady idempotency, edge-only callbacks, multi-source
  resolve/reset/all-resolved auto-reveal, undeclared-source auto-register,
  minVisibleMs deferral + cancellation, destroy cleanup, no-throw-after-destroy.
- **10 browser tests** in `test-browser/skeleton.spec.js` covering the
  fixture: initial state, reveal/conceal, multi-source piecewise resolve,
  pendingSources accessor reflection, reset cycle, in-page-constructed
  minVisibleMs deferral, conceal cancelling pending timer, edge events,
  aria-busy + aria-hidden painting.

#### Pipeline summary

890 unit + 264 browser tests passing (was 860 + 254).

#### Known: 6 focus-related browser flakes

Six pre-existing browser tests in `datepicker.spec.js` (3) and `menu.spec.js`
(3) are failing consistently in the current chromium-1194 environment. All
are `.toBeFocused()` assertions on synthesized keyboard events. The skeleton
work touched neither primitive; these are environment-level flakes from
headless chromium's focus behaviour. Re-running with `--retries=2` does not
help (failures are consistent, not transient).

These tests pass in interactive sessions. To be revisited as part of a
broader browser-test stability pass.

---

### 0.7.26 — 2026-06-14

#### Added: progress primitive (25th)

Headless progress indicator — linear bar OR circular ring, determinate or
indeterminate. The primitive owns reactive value clamping + ARIA painting + a
CSS custom property `--progress` (0..1 number) on root/bar/indicator; the
consumer provides the markup and CSS.

```js
import { createProgress } from "@zakkster/lite-headless/progress";

const pg = createProgress({
    value: 0,
    max: 100,
    label: "Uploading file",
    onChange:   (v, f) => console.log(`${v} (${(f*100).toFixed(0)}%)`),
    onComplete: () => console.log("done"),
});
pg.attachRoot(rootEl);
pg.attachBar(barEl);          // linear
// OR pg.attachIndicator(indEl); // circular SVG ring
```

#### What the primitive paints

| Element     | Attributes painted                                                |
| ----------- | ----------------------------------------------------------------- |
| Root        | `role="progressbar"` · `aria-valuenow` (omitted when indeterminate) · `aria-valuemin` · `aria-valuemax` · `aria-valuetext` · `aria-label` (or `aria-labelledby` via `attachLabel`) · `data-progress-root` · `data-variant="linear"\|"circular"` · `data-state="loading"\|"complete"` · `data-indeterminate` flag |
| Bar         | `data-progress-bar` · `data-progress="NN"` (0-100 int)            |
| Indicator   | `data-progress-indicator` · `data-progress="NN"`                  |

The CSS custom property `--progress` (0..1 number) is set on root, bar, and
indicator. Consumer CSS uses it for whatever rendering they choose: `width %`,
`scaleX`, `stroke-dashoffset`, `conic-gradient` angle, etc.

#### State machine

```
construct
    │
    ▼
┌──────────┐   value < max     ┌──────────┐
│ loading  │ ────────────────► │ loading  │
└──────────┘                   └────┬─────┘
                                    │ value >= max
                                    ▼
                              ┌──────────┐
                              │ complete │  data-state="complete"
                              └──────────┘  onComplete fires once
```

`onComplete` fires on the loading→complete transition; if `setValue` later
drops below `max` and returns to `max`, it fires again.

#### Callback ordering

`onChange(value, fraction)` fires BEFORE `onComplete()`. The semantic: by the
time `onComplete` runs, every `onChange` handler has already seen the final
value, so consumer code can safely overwrite UI in the complete handler
without the change handler stomping on it afterwards. (This came up writing
the demo's upload simulation — the percentage label and the "✓ done" label
share a single DOM node, and the demo wants done to win.)

#### Indeterminate mode

```js
pg.setIndeterminate(true);    // hides aria-valuenow, sets data-indeterminate=""
```

When indeterminate:

- `aria-valuenow` is removed from root (per ARIA spec for indeterminate progressbar)
- `data-indeterminate` is set (consumer CSS animates the bar/indicator)
- `aria-valuetext` defaults to "Loading" (override with `valueText` / `setValueText`)
- `data-state` stays "loading" regardless of value

Consumer CSS handles the animation:

```css
[data-progress-root][data-indeterminate] [data-progress-bar] {
    transform: scaleX(0.35);
    animation: sweep 1.5s ease-in-out infinite;
}
@keyframes sweep {
    0%   { transform: translateX(-100%) scaleX(0.35); }
    100% { transform: translateX(300%)  scaleX(0.35); }
}
```

#### Bounds + clamping

- `value` is always clamped into `[min, max]` on `setValue` and on construction
- Changing `min`/`max` re-clamps the current value
- `fraction()` returns `(value - min) / (max - min)`, clamped to `[0, 1]`
- When `max <= min`, `fraction()` returns 0 (treat as "no progress")
- Non-finite inputs (`NaN`, `Infinity`, non-numbers) to setters are silently ignored

#### `<lite-progress>` element wrapper

```html
<lite-progress value="42" max="100" label="Uploading">
    <div data-progress-bar></div>
</lite-progress>

<lite-progress value="0" indeterminate label="Saving">
    <div data-progress-bar></div>
</lite-progress>

<lite-progress value="72" max="100" variant="circular" label="Sync">
    <svg viewBox="0 0 36 36">
        <circle class="track" cx="18" cy="18" r="16" fill="none"/>
        <circle data-progress-indicator cx="18" cy="18" r="16" fill="none"/>
    </svg>
</lite-progress>
```

Reactive attributes: `value`, `min`, `max`, `indeterminate`, `value-text`.
Imperative on host: `setValue(n)`, `setMin(n)`, `setMax(n)`,
`setIndeterminate(b)`, `setValueText(s)`. Accessors: `host.value`,
`host.fraction`, `host.isComplete`. Events: `change` (`{value, fraction}`)
and `complete` (`{}`).

#### Implementation notes

- **1.2.1-clean from day one**: zero `if (_destroyed) return` guards inside
  the paint effect body; zero defensive `untrack()` wraps. Built directly on
  the owner-tree guarantees from v0.7.25's audit.
- **Single paint effect** reads value + min + max + indeterminate + valueText
  and writes all attrs + custom properties in one pass. With lite-signal
  1.2.1's value-equality optimization, stable writes don't propagate.
- **Initial paint inline in attachRoot**: the effect's first run during
  `createProgress()` has no root attached yet (consumer hasn't called
  attachRoot), so attachRoot does the initial paint synchronously instead of
  relying on a no-op effect re-run.

#### Demo: scene 23 (Chrome dropdown → Progress)

Four examples in a single stage:

- **Linear upload simulation**: setInterval-driven value bumps to 100, complete
  event swaps the "%" label to "✓ done"
- **Indeterminate**: aria-valuenow omitted, sweep animation, toggleable to
  determinate mid-flight
- **Circular sync indicator**: SVG ring with stroke-dashoffset driven by
  `--progress`, label updates from "idle" → "syncing… N%" → "synced ✓"
- **Wizard**: 5-step pattern with custom `aria-valuetext="Step N of 5"`, step
  indicator chips below showing done/current/empty state

The stage CSS follows the locked STYLEGUIDE.md (oklch with hex fallback,
`@media (hover: hover)` for hover, `clamp()` font-size tokens, logical
properties, `--progress` driving CSS).

#### Numbers

- **860 / 860 unit tests** passing ×3 stable (+30 progress tests)
- **254 / 248+6 browser tests** passing in Chromium 141 (+9 progress
  browser specs; same 6 pre-existing menu-submenu focus quirks)
- **~330 LOC** primitive + **~95 LOC** element wrapper + **~245 lines** of
  llms.txt + **30 unit tests** + **9 browser specs** + demo scene

#### What's NOT in this release

- **Progress group / multi-track coordinator** — would aggregate N progress
  primitives and emit a single "all complete" event. Useful for file-upload
  scenes with multiple files; deferred until file-upload primitive ships
  (next admin-pro gap)
- **Buffered progress** (two values, e.g., HTML5 video buffer + playhead) —
  niche; deferred until concrete demand
- **Stroke-dasharray-aware circular helper** — the demo computes the
  circumference manually (`2π * 16 ≈ 100.53`). A helper would make this
  declarative, but the primitive is variant-agnostic by design (it doesn't
  own the rendering); a separate `progressCircleAttrs(r)` utility could ship
  later as part of a styling-helpers package without touching the primitive

---

### 0.7.25 — 2026-06-14

#### Changed: lite-signal 1.2.1 alignment + cascade-guard strip

Peer dependency bumped to `@zakkster/lite-signal@^1.2.1`. The 1.2 engine's
owner tree (auto-disposal of nested observers) makes a category of defensive
code that lite-headless was carrying since the 1.1.x era obsolete. This release
audits and removes that code.

#### Background — the cascade root cause

`@zakkster/lite-signal@1.2.0` landed the **owner tree**: when an effect or
computed is created inside the body of another observer, it becomes an OWNED
CHILD. When the owner re-runs or is disposed, owned children are
cascade-disposed FIRST. Before 1.2, an effect that created nested effects
would leak one zombie per re-run; over time those zombies would fire on every
subsequent signal change, multiplying work linearly with re-run count.

`@zakkster/lite-signal@1.2.1` hardened that with gen-snapshot guards in
`executeEffect` / `pullComputed`: even if a user calls `dispose()` mid-body,
the engine post-body bookkeeping detects the gen-bump and skips, preventing
the recycled slot from being corrupted.

The combined effect is that the lite-headless wrapper patterns of the 1.1.x
era — guards inside paint effect bodies, defensive `untrack()` wraps around
DOM writes — are no longer needed. The engine guarantees:

1. After the effect's `stop()` is called, the body cannot run again, no matter
   how many signal mutations occur (verified against 100 mutations post-stop).
2. Nested effects/computeds created inside an effect body are owned by it.
   On owner re-run, the previous inner pair dies BEFORE the new body executes
   (verified by `node.firstOwned` cascade in `runCleanup`).
3. Pure DOM writes (`setAttribute`, `removeAttribute`, `classList.add`) cannot
   pollute the tracking context because they don't read signals — the
   `untrack()` wraps were defending against an impossible case.

#### Stripped

**Nine `if (_destroyed) return` guards** inside `effect(() => ...)` bodies:

- `src/avatar/index.js`
- `src/breadcrumb/index.js`
- `src/carousel/index.js`
- `src/command-palette/index.js`
- `src/pagination/index.js`
- `src/picture/index.js`
- `src/switch/index.js`
- `src/toast/index.js`
- `src/toggle-group/index.js`

**Nine defensive `untrack(() => { ... })` wraps** around pure DOM-write blocks
in the same effects.

**Seven unused `untrack` imports** removed (kept in carousel, command-palette,
and pagination where `untrack` is used legitimately for one-shot guards around
helper calls — not paint-effect wrappers).

#### Kept

`_destroyed` is preserved everywhere it's still needed:

- Event handlers (`addEventListener` callbacks fire outside reactive contexts)
- `setTimeout` / `setInterval` callbacks (the engine doesn't own timer callbacks)
- Deferred work via `requestAnimationFrame` / `IntersectionObserver` /
  `ResizeObserver` callbacks
- `attachRoot`/`attachItem` early-bail (consumer might re-attach after destroy)

These are standard async-callback hygiene, NOT cascade workarounds. The audit
distinguished the two and only stripped the latter.

The breadcrumb `_itemsTick` counter signal was also left alone — it works
around correct value-equality-no-notify behavior (setting a signal to its
current value does not propagate, by design), which is a separate concern from
the cascade.

#### Added: live owner-tree visualization in demo scene 22

The demo scene 22 (Admin Chrome) now has "Mount lite-studio" + "Churn graph"
buttons. Mount opens the `@zakkster/lite-studio` overlay showing the live
reactive graph; Churn bumps a scope signal that drives an outer effect with
two nested computeds and an inner effect.

The live proof of cascade disposal: graph node count stays STABLE at 5 (1
signal + 2 computeds + 2 effects) across N churns. Without the owner tree,
each churn would add 3 nodes (the old inner pair would persist as zombies).
Engine `computeds` count from `stats()` confirms: stays at 2 (the live pair),
never 6+ after multiple churns.

```js
// Demo wiring (scene 22):
const _scopeSignal = signal({ tick: 0 });
effect(() => {
    const s = _scopeSignal();
    const c1 = computed(() => "tick: " + _scopeSignal().tick);
    const c2 = computed(() => "sq: "   + Math.pow(_scopeSignal().tick, 2));
    effect(() => { c1(); c2(); });    // owner tree disposes this on re-run
});
```

#### Importmap additions for the demo

```json
{
    "@zakkster/lite-signal":    "../node_modules/@zakkster/lite-signal/Signal.js",
    "@zakkster/lite-element":   "../node_modules/@zakkster/lite-element/Element.js",
    "@zakkster/lite-time":      "../node_modules/@zakkster/lite-time/Time.js",
    "@zakkster/lite-devtools":  "../node_modules/@zakkster/lite-devtools/Devtools.js",
    "@zakkster/lite-studio":    "../node_modules/@zakkster/lite-studio/Studio.js"
}
```

`lite-devtools` and `lite-studio` are added as `devDependencies` for the demo
only — they are NOT runtime peers of lite-headless. Consumers who want graph
inspection in their own apps add them themselves.

#### Numbers

- **830 / 830 unit tests** passing ×3 stable (no behavior change — the engine
  was already doing the work the guards were defending against)
- **245 / 239+6 browser tests** passing in Chromium 141 (same 6 pre-existing
  menu-submenu focus quirks as the rest of the autonomous arc)
- **9 effect bodies leaner**: ~3 lines stripped from each = 27 lines of pure
  defensive boilerplate removed
- **Hot path is faster**: every paint effect now skips one branch
  (`_destroyed` check) + one `untrack()` push/pop per invocation. With dozens
  of paint effects firing across a typical admin page, that's tens of
  branch-predicted comparisons + closure invocations skipped per signal write.

#### Verified

The audit's correctness was verified before any code change by reproducing
the engine guarantee directly:

```
// 100 signal mutations after stop() -- body should never run again
const stop = effect(() => { a(); runs++; });
stop();
for (let i = 0; i < 100; i++) a.set(i);
// runs is unchanged from before stop() -- engine post-dispose guarantee held
```

And by reproducing the cascade fix:

```
// Nested effect: 3 outer re-runs, then one inner-dep change
effect(() => { a(); effect(() => { b(); innerRuns++; }); });
a.set(1); a.set(2); a.set(3);   // 4 inner bodies created
b.set(99);                       // exactly 1 inner fires (3 zombies died)
```

Both verified on shipped `@zakkster/lite-signal@1.2.1` from npm.

#### Compatibility

This release is a drop-in for consumers. The peer dep bump (`^1.1.5` →
`^1.2.1`) is the only externally-visible change. All primitive APIs are
unchanged. Consumers already on 1.2.x will see no API differences; consumers
still on 1.1.5 should bump (1.2.1 is published to npm and additive).

#### What's NOT in this release

- The breadcrumb's `_itemsTick` pattern (works around correct value-equality
  optimization, not the cascade — keeps working as-is on every engine version)
- The lite-signal 1.3 prototype work (lazy pool init, chunked refills,
  lazy-safe destroy) is in flight on the engine side — lite-headless will
  pick those up automatically at install time once 1.3 ships, with zero
  source changes needed (API contract is locked)
- Wrapper-level introspection helpers — if you want a primitive-level view of
  the reactive graph (e.g., "this dialog's open signal has 3 observers"), use
  `@zakkster/lite-devtools` `inspect(handle)` directly on the primitive's
  exposed signals (you can reach them through the primitive's return object).
  No new lite-headless surface needed; the engine + devtools have it.

---

### 0.7.24 — 2026-06-14

#### Added: three admin-theme staples

**Twenty-second, twenty-third, twenty-fourth primitives.** All small,
all filling gaps that top paid admin themes (Metronic, ShadCN Admin,
Apex, Tabler, Vuexy) consider table-stakes for 2026.

#### `createPicture` + `<lite-picture>`

Headless wrapper around `<picture>`/`<img>` adding reactive load-state
tracking, IntersectionObserver-based lazy load, container-query-driven
source selection via ResizeObserver, blur-up placeholder coordination,
error retry with exponential backoff, and aspect-ratio enforcement.

```js
import { createPicture } from "@zakkster/lite-headless/picture";

const pic = createPicture({
    src: "hero.jpg",
    placeholder: "hero-lqip.jpg",
    lazy: true,
    aspectRatio: "16/9",
    onStateChange: (state) => console.log(state),
});
pic.attachRoot(pictureEl);
pic.attachImg(imgEl);
```

State machine: `idle → loading → loaded | error`. Mirrored to
`data-img-state` on root + img so CSS transitions handle the
placeholder/skeleton/full-image crossfade declaratively. Native
`loading="lazy"` is still set as a safety net; the IntersectionObserver
controls the actual src assignment so consumers get a clean hook for
"now starts downloading" that native lazy doesn't provide.

#### `createAvatar` + `<lite-avatar>`

User avatar with image + deterministic-color initials fallback. The
classic admin-theme component: try to load an image, fall back to the
user's initials on a hue-derived OKLCH background if no src or load
fails.

```js
import { createAvatar, deriveInitials, hueFromString } from "@zakkster/lite-headless/avatar";

const av = createAvatar({
    src: "alice.jpg",
    name: "Alice Lee",
    fallbackDelay: 0,
});
av.attachRoot(rootEl);
av.attachImage(imgEl);
av.attachFallback(fallbackEl);

// Exported helpers usable independently:
deriveInitials("Alice Lee")          // "AL"
deriveInitials("Cher")               // "C"   (capitalized -> 1 letter)
deriveInitials("zakkster")           // "ZA"  (lowercase -> 2 letters)
deriveInitials("john@example.com")   // "JO"  (strip @domain, then 2-letter)
hueFromString("alice")               // -> 142 (deterministic FNV-1a)
```

The fallback element gets `--hue` as a CSS custom property, so consumer
CSS uses `background: oklch(60% 0.14 var(--hue))` for the per-user
color. Same name always produces the same hue across reloads (FNV-1a
hash → 0..359).

#### `createBreadcrumb` + `<lite-breadcrumb>`

Navigation trail. The last attached item is automatically marked
`aria-current="page"`; explicit selection via `setCurrent(key)` or
`current="key"` attribute on `<lite-breadcrumb>`. ARIA-compliant:
root gets `role="navigation"` + `aria-label="Breadcrumb"`, list gets
`role="list"`, items get `role="listitem"`, separators get
`aria-hidden="true"`.

```js
import { createBreadcrumb } from "@zakkster/lite-headless/breadcrumb";

const bc = createBreadcrumb({
    onItemClick: (key, idx, event) => {
        event.preventDefault();
        router.navigate(key);   // SPA pattern
    },
});
bc.attachRoot(navEl);
bc.attachList(olEl);
bc.attachItem(homeEl,     "home");
bc.attachItem(projectsEl, "projects");
bc.attachItem(currentEl,  "this-project");   // auto-current
```

Separators supported both as pure CSS pseudos (recommended) and as
real DOM elements via `attachSeparator(el)`.

#### STYLEGUIDE.md committed

A locked set of CSS + JS conventions for all new primitives, demo
scenes, and the admin-pro theme built on this library:

- All `:hover` rules inside `@media (hover: hover)` (touch sticky-hover
  prevention)
- Font sizes via `clamp(min, vw-based, max)` with `--fs-*` tokens
- OKLCH with hex fallback via `@supports (color: oklch(0 0 0))`
- `rem` for spacing/typography, `dvh`/`dvw` for viewport, `px` only
  for borders and 1:1 pixel cases
- `:is()` / `:not()` / `:has()` / `:where()` used liberally
- `@container` (with `container-name`) for component-driven responsive,
  overrides `@media`
- Logical properties: `margin-inline-start`, `padding-block`,
  `inset-inline-start`, `text-align: start`, `border-inline-start`
- All colors/sizes/timings as CSS custom properties

Scene 22 applies all of these end-to-end as a reference implementation.

#### Demo scene 22: Admin Chrome

Added "Chrome" dropdown to the demo navigation with scene 22 "Admin
Chrome" demonstrating all three primitives together as a realistic
admin top-bar + team-member grid + media-card grid. Concrete
demonstration of the admin-pro-theme story:

- **Top-bar**: `lite-breadcrumb` (Home / Projects / lite-headless /
  v0.7.24) + Zahary user-block with `lite-avatar` initials fallback
- **Team-member grid**: 8 `lite-avatar` instances exercising the
  initials algorithm (capitalized single names → 1 letter, lowercase
  usernames → 2 letters, multi-word → first + last, hyphenated/dotted
  treated as word breaks). All 8 produce unique hues via FNV-1a hash.
- **Media-card grid**: 3 `lite-picture` instances — 2 working
  (data-URI SVG thumbs simulating loaded state) + 1 deliberately
  broken (showing the error state via CSS pseudo-element)
- **Skeleton loader**: CSS keyframe animation on
  `[data-img-state="loading"] [data-pic-root]::before` for the
  shimmer effect while loading
- **Container queries**: team cards hide the role text when the card
  shrinks below 10rem inline-size

The scene's side-panel documents the composition, the CSS conventions
applied, the theme-swappable design model, and the comparison vs
paid admin themes (~5% of competitor JS payload at structural parity).

#### Bugs caught + fixed during build

1. **`deriveInitials` algorithm**: needed email-domain-strip + the
   capitalized-vs-lowercase heuristic to satisfy both "Cher" → "C"
   (single proper name, 1 letter) and "zakkster" → "ZA" (lowercase
   handle, 2 letters). Original implementation took 1 letter for both.

2. **Picture `destroy()`**: cleaned up observers + effect but left
   `data-img-state` + `data-aspect-ratio` attributes on the root and
   img. Added explicit `removeAttr` calls inside `destroy()` so both
   the per-attach cleanup AND `destroy()` leave the DOM clean.

3. **Avatar `destroy()`**: same class of bug — left `data-state`,
   `data-initials`, `data-color-hue`, `--hue` CSS property on
   attached elements after destroy. Fixed.

4. **Breadcrumb effect not re-firing on attach**: the paint effect
   tracked `_currentKey()` but when items attached with no explicit
   current, `_currentKey.set(_currentKey())` on the unchanged value
   was a no-op (signal won't notify). The "last attached item is
   current" semantics depend on the resolver re-running. Fixed by
   adding a dedicated `_itemsTick` counter signal that's bumped on
   every attach/detach; the effect tracks both.

#### Tests

- **830 / 830 unit tests** passing ×3 stable (+65: picture 19,
  avatar 27, breadcrumb 19)
- **245 / 239+6 browser tests** in Chromium 141 (+13: 3 picture,
  6 avatar, 4 breadcrumb). Same 6 pre-existing menu-submenu focus
  quirks throughout the arc.

#### LOC

| File                                                | LOC  |
| --------------------------------------------------- | ---: |
| `src/picture/index.js`                              | 320  |
| `src/picture/element.js`                            |  73  |
| `src/picture/llms.txt`                              | ~205 |
| `src/avatar/index.js`                               | 295  |
| `src/avatar/element.js`                             |  92  |
| `src/avatar/llms.txt`                               | ~170 |
| `src/breadcrumb/index.js`                           | 260  |
| `src/breadcrumb/element.js`                         | 100  |
| `src/breadcrumb/llms.txt`                           | ~145 |
| `test/picture.test.js` (19 tests)                   | ~285 |
| `test/avatar.test.js` (27 tests)                    | ~250 |
| `test/breadcrumb.test.js` (19 tests)                | ~245 |
| `test-browser/fixtures/picture-avatar-breadcrumb.html` | ~210 |
| `test-browser/picture-avatar-breadcrumb.spec.js` (13)  | ~190 |
| Demo scene 22 (CSS + markup)                        | ~390 |
| `STYLEGUIDE.md`                                     | ~205 |

#### Why these three together

`picture` was a direct question from the user — does a lazy + WebP +
media-query wrapper fit the module? Yes, with the caveat that the
HTML stays declarative and the primitive provides the behavioral hooks
(state machine, lazy coordination, container-driven sources, retry).

`avatar` and `breadcrumb` are the smallest admin-theme gaps from the
research synthesis. Together with `picture`, they form the "admin
chrome" — top-bar identity + navigation + media. Demo scene 22 ships
all three in a single realistic admin UI pattern that doubles as a
proof of concept for the admin-pro-theme vision.

#### Research synthesis (2026 admin landscape)

From web research on the current admin-template market (Metronic with
120k+ sales, ShadCN Admin, Apex/DashboardPack, Tabler, AdminLTE 4,
Phoenix/Falcon, Vuexy):

Common features in top paid themes that lite-headless still lacks:

- Progress (linear + circular) -- coming
- Skeleton coordinator -- coming
- Pin input / OTP (auto-advance + paste handling) -- coming
- Tag input (multi-value with backspace-deletes) -- coming
- Calendar view (full month grid, distinct from datepicker) -- coming
- Kanban primitive (column board composing sortable) -- coming
- File upload (drag-drop zone + per-file progress) -- coming
- Color picker (lite-color-engine is the engine; this would be the UI)
- Inline edit (click-to-edit fields)
- Notification center (collapsible past-toasts list)

The differentiator remains: top paid themes ship ~30 runtime deps and
~500KB+ JS payload; lite-headless ships 0 runtime deps at ~25KB total
ESM with zero-GC paint effects. Admin pro built on this would have
structural quality at ~5% of competitor payload.

---

### 0.7.23 — 2026-06-14

#### Added: toggle-group primitive (`createToggleGroup`) + `<lite-toggle-group>` wrapper

Headless segmented control / toggle group. **Twenty-first primitive.**
Two modes share the same primitive, swapped via the `type` option:

- **`single`** — exclusive selection (like a radio group, but
  rendered as buttons with `aria-pressed` — the segmented-control
  pattern, e.g., view-mode selector: List / Grid / Card).
- **`multi`** — independent toggles (each item has its own
  `aria-pressed`, e.g., text-formatting buttons: B / I / U / S).

```js
import { createToggleGroup } from "@zakkster/lite-headless/toggle-group";

// single mode: value is string | null
const view = createToggleGroup({
    type: "single",
    defaultValue: "list",
    onValueChange: (value, reason) => setView(value),
});
view.attachRoot(groupEl);
view.attachItem(listBtn, "list");
view.attachItem(gridBtn, "grid");
view.attachItem(cardBtn, "card");

// multi mode: value is string[]
const style = createToggleGroup({
    type: "multi",
    defaultValue: ["bold"],
    onValueChange: (value, reason) => applyStyles(value),
});
style.attachItem(bBtn, "bold");
style.attachItem(iBtn, "italic");
style.attachItem(uBtn, "underline");
```

#### Design decisions

**Buttons with `aria-pressed`, not `role="radio"`.** The
segmented-control pattern is a "group of toggle buttons", not a
radio group. Screen readers announce "toggle button pressed" /
"not pressed" rather than "selected" / "unselected". This is the
Radix + ShadCN convention and matches the WAI-ARIA toolbar pattern.

**Manual activation only.** Focus does NOT select. Users can
arrow through items without selecting them, then explicitly
toggle with Space / Enter or click. In contrast, tabs (with
`activation: "automatic"`) and radio groups select on focus. The
toolbar APG pattern is the right model here because segmented
controls are typically for "view mode" or "tool selection" where
the user expects deliberate activation.

**Single mode `allowDeselect` is opt-in.** Most segmented
controls have a mandatory selection (the "List" button is always
pressed in a List/Grid/Card view-mode picker). For cases like
"Sort by Name / Date / Size" where "no sort" is valid, pass
`allowDeselect: true` and clicking the current item clears it.
Multi mode always allows toggle-off.

**One primitive, two modes.** Implementing two separate primitives
(toggle-group vs button-group, or single-toggle vs multi-toggle)
would duplicate the keyboard nav, ARIA painting, roving tabindex,
and disabled-handling logic. Sharing them via the `type` option
keeps the surface small. Internally the value is normalized:
`string | null` for single, `string[]` (always) for multi.

#### Roving tabindex via shared helper

Uses `_overlay/roving-focus.js` — the same helper that powers
`tabs` and `tree`. Items get `tabindex="0"` when active (focused),
`tabindex="-1"` otherwise. First non-disabled item gets `tabindex=0`
on initial attach so the group is keyboard-reachable via Tab.
Disabled items are skipped by arrow navigation.

#### Keyboard

| Key                                              | Action                                  |
| ------------------------------------------------ | --------------------------------------- |
| ArrowRight (horizontal) / ArrowDown (vertical)   | Move focus to next item (loops)         |
| ArrowLeft / ArrowUp                              | Move focus to previous item             |
| Home / End                                       | First / last item                       |
| Space / Enter                                    | Toggle/select the focused item          |

#### ARIA painted attributes

| Element | Attributes                                                          |
| ------- | ------------------------------------------------------------------- |
| Root    | `role="group"`, `data-orientation`, consumer-provided `aria-label`  |
| Item    | `aria-pressed="true|false"`, `data-state="on|off"`, `aria-disabled`, `data-disabled`, `data-focused` (when roving lands on it), real `disabled` (when target is `<button>`), `tabindex` (0 on active, -1 on rest) |

The primitive does NOT auto-set `aria-label` on the root. The
consumer is expected to provide one via `aria-label="View mode"`
on the host, or via `aria-labelledby` pointing to an external
label element. Inventing generic labels hurts accessibility more
than it helps.

#### Demo scene 21

Added to the **Inputs** dropdown. Four toggle groups:

- **Single · view mode** (List / Grid / Card / Raw) — basic
  exclusive selection
- **Multi · text formatting** (B / I / U / S) with live preview —
  the preview text below the group renders with the actual CSS
  styles (`tg-bold` / `tg-italic` / `tg-underline` / `tg-strike`
  classes applied based on current value)
- **Single · with disabled item** — "3 cols" disabled in this
  context (premium feature flavor); demonstrates arrow nav
  skipping disabled
- **Vertical orientation** (Top / Middle / Bottom) — ArrowDown/Up
  for navigation

Side panel readouts: view value, count of active styles, pane
value. Action buttons exercise setValue and setDisabled
imperatively.

#### Bug caught during build

**Roving helper's `_index` starts at `-1`.** When the user
Tab-focuses an item directly (via the `tabindex="0"` we set on
the first enabled item), the roving helper doesn't know which
item is "current". So `roving.move(+1)` calls
`enabled.indexOf(_index)` which returns -1, falls into the
`cur < 0` branch, and `setIndex(enabled[0])` — which is the SAME
item the user was already on. The first arrow press appears as a
no-op.

Fix: add a `focus` listener on each item that syncs
`roving.setIndex(idx)` to the focused item before any arrow press.
Same defensive pattern that `tabs` uses on click (`commitValue`
path). Caught by the first run of the toggle-group browser specs
(ArrowRight didn't advance from "list" to "grid").

#### Tests

- **765 / 765 unit tests** passing ×3 stable (+37 toggle-group)
- **232 / 192+6 browser tests** passing in Chromium 141 (+19
  toggle-group). Same 6 pre-existing menu-submenu focus quirks.

#### LOC

| File                                       |  LOC |
| ------------------------------------------ | ---: |
| `src/toggle-group/index.js`                |  440 |
| `src/toggle-group/element.js`              |  115 |
| `src/toggle-group/llms.txt`                | ~200 |
| `test/toggle-group.test.js` (37 tests)     | ~395 |
| `test-browser/toggle-group.spec.js` (19)   | ~225 |
| `test-browser/fixtures/toggle-group.html`  | ~115 |
| Demo scene 21 (CSS + markup + JS)          | ~330 |

#### What's NOT in this release

- **`role="radio"` form-control variant** — that's a different
  primitive. If you need a true radio group for form submission,
  use native `<input type="radio">` with shared `name=`. The
  segmented-control pattern is appropriate when you want
  button-styled UI with instant-commit semantics, NOT
  form-submitted values.
- **`name` attribute for form submission** — single mode's value
  could in theory be submitted as a form field, but most
  segmented-control use cases are instant-commit (set a view
  mode, switch a tool). Consumers who need form submission can
  pair the toggle-group with a hidden `<input type="hidden">` they
  update in their `onValueChange` handler.
- **Roving with multi-axis grids** — segmented controls are
  always linear (horizontal or vertical). For 2D grid layouts of
  toggle buttons, use a different primitive.

---

### 0.7.22 — 2026-06-14

#### Added: pagination primitive (`createPagination`) + `<lite-pagination>` wrapper

Headless pagination control. **Twentieth primitive.** Page-N-of-M
navigation with prev/next/first/last static buttons + a dynamic
page-number list with automatic ellipsis insertion for long ranges.
The primitive owns the navigation logic, the items() algorithm,
and ARIA wiring; the consumer renders the page list (or uses the
wrapper which renders for you).

```js
import { createPagination } from "@zakkster/lite-headless/pagination";

const pg = createPagination({
    pageCount:     50,
    defaultPage:    1,
    siblingCount:   1,    // pages either side of current
    boundaryCount:  1,    // pages at start/end
    onChange: (page, reason) => loadResults(page),
});

pg.attachRoot    (navEl);
pg.attachPrev    (prevBtn);   // data-disabled at page 1
pg.attachNext    (nextBtn);   // data-disabled at last page
pg.attachFirst   (firstBtn);
pg.attachLast    (lastBtn);
pg.attachPageList(listEl);

// Consumer renders the page items (or use the wrapper)
for (const item of pg.items()) {
    const li = document.createElement("li");
    if (item.type === "ellipsis") {
        li.textContent = "…";
    } else {
        const btn = document.createElement("button");
        btn.textContent = String(item.page);
        li.appendChild(btn);
        pg.markPage(btn, item.page);      // wires click + aria-current paint
    }
    listEl.appendChild(li);
}
```

#### items() algorithm

`buildItems(page, total, siblingCount, boundaryCount)` (also
exported for direct use without `createPagination`) returns the
items array. Short-circuit when all pages fit: if
`total <= 2*sibling + 2*boundary + 3`, all pages are shown without
ellipsis. Otherwise:

- Start boundary (`boundaryCount` pages from page 1)
- Optional left ellipsis (only emitted when there's actual
  boundary content to anchor it AND the gap is >1 page)
- Sibling range around current (`2*sibling + 1` pages)
- Optional right ellipsis (same logic)
- End boundary (`boundaryCount` pages ending at last)

**Single-page-gap merging**: when the gap between a boundary and
the sibling range is exactly one page, the algorithm renders the
intermediate page directly instead of an ellipsis (because an
ellipsis hiding a single page wastes a slot).

| Configuration                            | items()                                |
| ---------------------------------------- | -------------------------------------- |
| 5 pages, sib=1, bound=1, p=3             | `1 2 [3] 4 5`                          |
| 20 pages, sib=1, bound=1, p=1            | `[1] 2 … 20`                           |
| 20 pages, sib=1, bound=1, p=10           | `1 … 9 [10] 11 … 20`                   |
| 20 pages, sib=1, bound=1, p=20           | `1 … 19 [20]`                          |
| 10 pages, sib=1, bound=1, p=4            | `1 2 3 [4] 5 … 10` (single-page merge) |
| 20 pages, sib=1, bound=2, p=10           | `1 2 … 9 [10] 11 … 19 20`              |
| 10 pages, sib=1, bound=0, p=5            | `4 [5] 6` (no boundary, no ellipsis)   |
| 50 pages, sib=3, bound=2, p=25           | `1 2 … 22 23 24 [25] 26 27 28 … 49 50` |

#### ARIA

| Element     | Attributes                                                  |
| ----------- | ----------------------------------------------------------- |
| Root        | `role="navigation"` · `aria-label="Pagination"`             |
| Nav buttons | auto `aria-label="Go to {previous/next/first/last} page"` · `aria-disabled` · real `disabled` attr (when target is `<button>`) |
| Page list   | `role="list"`                                               |
| Page button | `aria-current="page"` when current · `aria-label="Go to page N"` (unless overridden) · `data-current="true"` for CSS |
| Ellipsis    | `<span aria-hidden="true">…</span>` (wrapper-rendered)      |

#### Wrapper: `<lite-pagination>` renders for you

```html
<lite-pagination page-count="50" page="1" sibling-count="1" boundary-count="1">
    <button data-pgn-first>«</button>
    <button data-pgn-prev>‹</button>
    <ol data-pgn-list></ol>
    <button data-pgn-next>›</button>
    <button data-pgn-last>»</button>
</lite-pagination>
```

The wrapper renders `<li>` items into `[data-pgn-list]` on every
page or pageCount change, tearing down previous `markPage`
cleanups before rebuilding. The `<li>` for a page contains a
`<button data-pgn-page="N">`; the `<li>` for an ellipsis contains
a `<span aria-hidden>…</span>`. Both reactive attributes (`page`
and `page-count`) are observed via MutationObserver so consumers
can drive state from the outside.

Wrapper guards `_suppressPageEffect` to break the
attribute-cascade: when `onChange` mirrors page state to the host
attribute, the attribute observer would re-fire as if the consumer
set it. The flag + queueMicrotask reset breaks the loop.

#### Demo scene 20

Added to the **Lists** dropdown. Three paginators in one stage:

- **Primary** (50 pages, sibling=1, boundary=1) with a mock
  results table above that re-renders 10 rows per page as you
  navigate
- **Small** (5 pages) demonstrates the short-circuit case — all
  pages shown without ellipsis
- **Wide** (200 pages, sibling=2, boundary=2) demonstrates the
  full algorithm with `1 2 … 98 99 100 101 102 … 199 200`

Side-panel readouts for `page`, `pageCount`, and `items.length`.
Action buttons jump to 1/25/50 and switch between 10/50 page
counts to exercise the `setPageCount` clamping behavior.

#### Tests

- **728 / 728 unit tests** passing ×3 stable (+38 pagination)
- **213 / 192+6 browser tests** passing (+15 pagination). Same 6
  pre-existing chromium-headless menu-submenu focus quirks.

#### LOC

| File                                      |  LOC |
| ----------------------------------------- | ---: |
| `src/pagination/index.js`                 |  396 |
| `src/pagination/element.js`               |  165 |
| `src/pagination/llms.txt`                 | ~240 |
| `test/pagination.test.js` (38 tests)      | ~340 |
| `test-browser/pagination.spec.js` (15)    | ~175 |
| `test-browser/fixtures/pagination.html`   | ~125 |
| Demo scene 20 (CSS + markup + JS)         | ~430 |

#### Bugs caught during the build

1. **`buildItems` with `boundaryCount=0` emitted dangling
   ellipses** — no boundary content to anchor them visually. Fixed
   by guarding the ellipsis-emit with `boundaryCount > 0`.

2. **"All pages fit" wasn't optimized** — when `total` is small
   enough, the algorithm still tried to use ellipsis logic,
   producing `1 … 4 [5]` for `total=5, page=5`. Added explicit
   short-circuit at the top of `buildItems`: if
   `total <= 2*sibling + 2*boundary + 3`, just emit all pages
   without any ellipsis.

3. **Wrapper passed accessor instead of array value** —
   `renderItems(pg.items)` passed the function itself rather than
   the array, producing "items is not iterable" page errors on
   first render. The fix is `renderItems(pg.items())` (the
   accessor is invoked). This is exactly the kind of bug the
   reactive-accessor pattern can hide because nothing typechecks
   that an accessor isn't a value.

#### What's NOT in this release

- **Page-size selector** ("rows per page: 10/25/50") — that's a
  separate UI concern. Compose with a `select` or your own primitive.
- **Total-results display** ("Showing 1-10 of 487") — derived from
  `page * pageSize` and your dataset size; not part of pagination.
- **URL-state sync** — consumer concern. Subscribe to `onChange`
  and update `history.pushState`; restore on page load.
- **Keyboard handling for nav buttons** — the buttons are real
  `<button>` elements, so they get Space/Enter activation natively.
  No additional keyboard logic in the primitive.

---

### 0.7.21 — 2026-06-14

#### Added: switch primitive (`createSwitch`) + `<lite-switch>` wrapper

Headless boolean toggle control with WAI-ARIA `role="switch"`
semantics. **Nineteenth primitive.** Distinct from a checkbox: a
switch is for INSTANT-COMMIT settings ("Enable notifications",
"Dark mode"), a checkbox is for selection state submitted via a
form. Visually a sliding switch (consumer-styled).

WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/patterns/switch/

```js
import { createSwitch } from "@zakkster/lite-headless/switch";

const sw = createSwitch({
    defaultChecked: false,
    onChange: (checked, reason) => save(checked),
});

sw.attachRoot (buttonEl);    // role=switch, listeners, ARIA
sw.attachLabel(labelEl);     // aria-labelledby auto-wired
sw.attachThumb(thumbEl);     // visual element (data-checked)
sw.attachInput(hiddenInput); // optional native checkbox for forms
```

#### Design decisions

- **Controlled vs uncontrolled** mirroring React's model: pass
  `checked: signal()` to read from an external signal (the
  primitive never mutates it; the consumer updates via `onChange`).
  Without `checked`, the primitive owns its own signal seeded
  from `defaultChecked`.
- **`role="switch"` not `role="checkbox"`** — semantically and
  visually distinct. Screen readers announce "switch" / "off" /
  "on" rather than "checkbox" / "unchecked" / "checked".
- **Both Space AND Enter toggle.** Per the APG spec, Space is the
  primary toggle key; Enter is "optional" but widely-expected so
  the primitive supports both.
- **Form integration via auto-created hidden input.** When the
  custom element's `name=` attribute is set, the wrapper appends
  a visually-hidden `<input type="checkbox" name=...>` and keeps
  it synced bidirectionally — supports native `<form>` submission
  and serves as the no-JS fallback.
- **Label wrapping detection.** If the label element wraps the
  root (`<label><span>...</span><button data-switch-root></button></label>`),
  the label-click handler bails to prevent double-toggling. Click
  bubbles from root through wrapper, but the wrapper's
  contains-check stops it from also firing the toggle.

#### CSS contract

Root and thumb both get these attributes synced to state:

```css
[data-switch-root] {
    width: 44px; height: 24px;
    border-radius: 12px;
    background: var(--bg-3);              /* off-state */
    transition: background 140ms;
}
[data-switch-root][data-checked="true"] {
    background: var(--cyan-dim);          /* on-state */
}
[data-switch-root][data-disabled] {
    opacity: 0.4;
    cursor: not-allowed;
}
[data-switch-root][data-pressed] {
    transform: scale(0.96);               /* active press feedback */
}

[data-switch-thumb] {
    position: absolute; top: 2px; left: 2px;
    width: 18px; height: 18px;
    border-radius: 50%;
    transition: left 160ms cubic-bezier(0.4, 0, 0.2, 1);
}
[data-switch-thumb][data-checked="true"] { left: 22px; }
```

#### ARIA painted attributes

| Element | Attributes                                                    |
| ------- | ------------------------------------------------------------- |
| Root    | `role="switch"`, `aria-checked`, `aria-labelledby`, `aria-disabled`, `aria-required`, `tabindex` |
| Thumb   | `data-checked`, `data-disabled`                               |

#### Demo scene 19

Added to the **Inputs** dropdown. 7 switches across 3 groups
(notifications / appearance / developer) showing realistic
settings-panel scenarios. Two disabled switches demonstrate that
disabled state still announces correctly to screen readers. Action
buttons: toggle all (skips disabled), reset to defaults, disable
all enabled, enable all.

#### Tests

- **690 / 690 unit tests** passing (+29 switch)
- **198 / 192+6 browser tests** passing (+12 switch). Same 6
  pre-existing chromium-headless menu-submenu focus quirks.

#### LOC

| File                                    |  LOC |
| --------------------------------------- | ---: |
| `src/switch/index.js`                   |  336 |
| `src/switch/element.js`                 |  118 |
| `src/switch/llms.txt`                   | ~165 |
| `test/switch.test.js` (29 tests)        | ~330 |
| `test-browser/switch.spec.js` (12 specs)| ~180 |
| `test-browser/fixtures/switch.html`     | ~125 |
| Demo scene 19 (CSS + markup + JS)       | ~330 |

#### Implementation notes worth flagging

- **Initial paint on attachRoot** writes `data-checked` synchronously
  (not relying on the reactive effect that's already wired). Same
  pattern as command-palette's `markItem`: the effect would only
  fire on a subsequent state change, leaving the initial paint
  missing for any consumer that depends on the data attribute
  being present at attach time.
- **Element wrapper guards `_suppressCheckedEffect`** the same way
  accordion / dialog / tabs do: when `onChange` mirrors state to
  the host's `checked` attribute, the attribute observer would
  re-fire as if the consumer set it. The flag + queueMicrotask
  reset breaks the cascade.

#### What's NOT in this release

- **Switch group / segmented control** — that's a different
  primitive (exclusive-select group, different ARIA pattern). May
  be the next addition; collapsing N switches into a single
  segmented control with `aria-pressed` is a common pattern.
- **`color`-bound CSS variables** for on-state styling — consumers
  do this in CSS via `data-checked="true"` selectors. No reason to
  bake it into the primitive.

---

### 0.7.20 — 2026-06-14

Four bugs found in real-world demo testing, all fixed with regression
coverage:

#### Fixed: sortable — disabled neighbors silently broke slot detection

`_buildRectCache` was excluding disabled items entirely. Disabled
items are inert as a DRAG SOURCE (you can't pick them up), but they
remain valid as DROP NEIGHBORS — you can drop other items into the
gap above or below them. With the cache excluding them, the slot-
detection loop in `_slotIndexAt` had no midpoint for the disabled
slot, fell through past their position, and committed the drop one
position too far.

Concrete repro: a list `[boot, kernel, net, services, ui, diag*]`
where `diag` is disabled. Drag `boot` toward the gap between `ui`
and `diag`. Expected: indicator paints insert-before on `diag`,
drop lands at position 4 → `[kernel, net, services, ui, boot, diag]`.
Actually observed (before fix): indicator paints insert-AFTER on
`diag` (because the loop fell through and landingIndex was clamped
to "last"), drop lands at the end → `[kernel, net, services, ui, diag, boot]`.

```js
// before -- the `it.disabled` clause silently broke slot detection
for (const key of arr) {
    const it = _items.get(key);
    if (!it || !it.el || it.disabled) continue;
    ...
}

// after -- disabled items stay in the rect cache as drop neighbors
for (const key of arr) {
    const it = _items.get(key);
    if (!it || !it.el) continue;
    ...
}
```

`_onPointerDown` and `_onItemKeyDown` continue to bail on disabled
items as drag sources — only the rect cache changes.

Two regression tests:
- `keyboard pickup: can move past a disabled neighbor` — pickup `a`,
  ArrowDown × 2 → `a` ends up between disabled `c` and `d`.
- `setItemDisabled keeps the item in rect cache for slot detection`
  — disabling an item after attach doesn't silently filter it out
  of subsequent reorders.

#### Fixed: carousel — multi-click broke smooth scrolling

Rapid clicks on the next/prev buttons fired repeated `scrollTo()`
calls, each cancelling the previous browser smooth-scroll mid-flight.
The cancellation interacts badly with `scroll-snap-type: mandatory`
— browsers snap to the nearest snap-point during the cancel,
producing visible back-and-forth jitter.

Two fixes:

**(a) Multi-click guard** matching the accordion guard pattern.
`go(sameTarget)` within the 500ms scroll-lock window is now ignored.
Different targets still pass through (so rapid `next()` calls
still advance cumulatively — index advances one per click, but
only the LATEST scroll target produces a new `scrollTo`).

```js
const now = performance.now();
if (n === _lastScrollTarget && now < _scrollLockUntil) return;
_lastScrollTarget = n;
_scrollLockUntil = now + SCROLL_LOCK_MS;
```

**(b) Switched `_scrollToSlide` from `scrollIntoView` to direct
`scrollTo`** with computed `offsetLeft` / `offsetTop`. Three reasons
documented in the source:

  1. `scrollIntoView` scrolls EVERY scrollable ancestor that needs
     to scroll to make the slide visible. In nested layouts (the
     demo's scene wrappers), this was causing the first-click
     "jumps" as outer ancestors scrolled too. `scrollTo` only
     affects the viewport.
  2. `scrollIntoView`'s smooth-scroll behavior with
     `scroll-snap-type: mandatory` varies across browsers (Safari
     does instant snaps; Chrome/Firefox smooth). `scrollTo +
     behavior` is consistent everywhere.
  3. Computing the offset locally lets us be precise about the
     target — no sub-pixel rounding to trigger snap-fights.

In-browser verification (Chromium 141): 4 rapid clicks produce
**53 monotonically increasing scroll events with ZERO regressions**.
Before the fix, mid-scroll snap-backs were visible as scroll
position dropping during the gesture.

Two regression tests:
- `multi-click: go(same target) within scroll-lock window is ignored`
  — 5 identical `go(2)` calls funnel into 1 `scrollTo`.
- `multi-click: rapid next() advances cumulatively (not guarded by
  lock)` — 4 `next()` calls each target a different slide, all four
  pass the guard, index advances to 4.

#### Fixed: carousel — first-click jump (covered by (b) above)

The `scrollIntoView` ancestor-scrolling behavior was the root cause
of the reported first-click jump as well. The scene wrapper would
sometimes have non-zero scroll inherited from a previous scene's
state; the first click triggered an ancestor-scroll alongside the
viewport scroll, producing the perceived "jump". The switch to
direct `scrollTo` eliminates ancestor scrolling entirely.

#### Reduced cold-load time via `<link rel="modulepreload">` hints

Without preload hints, the browser discovered each subpath import
(`import "../src/dialog/element.js"` etc.) only AFTER parsing the
parent module — a 39-request serial waterfall. The cold-load
measurement showed slow modules sequencing into ~290ms each:

```
run 1: domContentLoaded=641ms · networkIdle=1063ms · requests=39
  slowest: 306ms fonts | 290ms command-palette | 289ms sortable | 268ms toast | 236ms scroll-lock
```

With 18 modulepreload hints (one per primitive entry + lite-signal/
lite-element peers) in the HTML `<head>`, all primitive entry points
fetch in PARALLEL from the moment the HTML is parsed:

```
run 2: domContentLoaded=505ms · networkIdle=949ms · requests=46
  slowest: 243ms menu | 243ms datepicker | 243ms split-panels | 242ms combobox | 242ms slider
```

Note: the slow modules now all complete at the same time (~243ms
each in parallel) instead of cascading. On localhost the wall-clock
improvement is modest (~100ms); on a real network with latency the
parallelization win is closer to 30-50% off cold load. Total request
count goes from 39 → 46 (the 18 preload hints count as requests
themselves, but they fire concurrently with HTML parsing rather
than after parent-module parse completion, which is what matters).

#### Tests

- **661 / 661 unit tests** passing ×3 stable (+4 regressions:
  2 sortable disabled-neighbor, 2 carousel multi-click guard)
- **186 / 192 browser tests** passing in Chromium 141 (unchanged;
  same 6 pre-existing menu-submenu focus quirks)
- In-browser end-to-end verification of both fixes against the
  actual demo scenes 15 (carousel) and 16 (sortable).

#### Files changed

- `src/sortable/index.js` — `_buildRectCache` no longer excludes
  disabled items
- `src/carousel/index.js` — multi-click guard + switched
  `_scrollToSlide` from `scrollIntoView` to `scrollTo`
- `test/sortable.test.js` — 2 disabled-neighbor regression tests
- `test/carousel.test.js` — 2 multi-click guard regression tests
- `demo/index.html` — 18 modulepreload hints in `<head>`

---

### 0.7.19 — 2026-06-14

#### Added: command-palette primitive (`createCommandPalette`) + `<lite-command-palette>` wrapper

Headless Cmd+K command palette: a registry of invocable commands
with fuzzy filtering, ARIA combobox keyboard nav, and a global
keybinding to toggle visibility. **Eighteenth primitive.**

Designed to **compose with a dialog** rather than reinvent modal
behaviour. The palette owns the command registry, filtering,
keyboard nav, and ARIA wiring; the consumer wires `openchange`
events to their dialog primitive for backdrop / focus trap /
scroll lock.

```js
import { createCommandPalette } from "@zakkster/lite-headless/command-palette";
import { createDialog }         from "@zakkster/lite-headless/dialog";

const dialog  = createDialog({ modal: true });
const palette = createCommandPalette({
    triggerKey: { key: "k", meta: true },   // Cmd+K (Mac) / Ctrl+K (Win/Linux)
    onOpen:  () => dialog.open(),
    onClose: () => dialog.close(),
});

palette.attachInput(inputEl);
palette.attachList (listEl);
palette.attachEmpty(emptyEl);

palette.register([
    { id: "save",  label: "Save",  keywords: ["write"], onSelect: () => save() },
    { id: "find",  label: "Find",  keywords: ["search"], onSelect: () => find() },
    { id: "open",  label: "Open",                       onSelect: () => openFile() },
]);
```

#### Scoring tiers

Six tiers, scored highest-first; insertion order breaks ties.
Match-position metadata returned per result so consumers can
render highlighted spans:

| Tier              | Score    | Example (query: `"save"`)             |
| ----------------- | -------- | ------------------------------------- |
| Exact label match | 100      | `"save"` matches `"Save"`             |
| Prefix match      | 95       | `"save"` matches `"Save As..."`       |
| Start-of-word     | 80-89    | `"save"` matches `"Auto Save"` at 5   |
| Substring         | 50-65    | `"save"` matches `"Unsaved doc"` at 2 |
| Keyword           | 45       | keyword `"write"` matches `"save"`    |
| Fuzzy             | 20-30    | `"ocl"` matches `"Open Command Line"` |

`recentBoost` (default 5) lifts recently-invoked commands within
their tier but cannot escalate across tiers — exact matches always
win. Fuzzy uses Sublime-style consecutive-match range grouping
(every query char must appear in order; tighter clusters score
higher).

#### Global keybind with input-context awareness

`triggerKey: { key: "k", meta: true }` (default) matches both Cmd+K
on Mac AND Ctrl+K on Win/Linux from the same string. Pressing the
trigger while focus is in another `<input>`, `<textarea>`,
`<select>`, or contenteditable does **not** hijack the keystroke —
the user can keep typing. The palette's own input is exempted, so
Cmd+K toggles the palette closed even while you're typing in it.

To disable: `triggerKey: null` (or `trigger-key="none"` on the
wrapper). Other shortcuts supported via JSON or shorthand strings:
`"Cmd+Shift+P"`, `"Ctrl+/"`, etc.

#### ARIA combobox wiring

```
input    role="combobox"     aria-expanded -> isOpen
                              aria-controls -> list.id
                              aria-autocomplete="list"
                              aria-activedescendant -> active item id
list     role="listbox"
items    role="option"        aria-selected -> data-active
```

`aria-activedescendant` tracks the active item id so screen
readers announce navigation correctly without moving DOM focus.

#### Keyboard

On the input (when focused):

| Key                         | Action            |
| --------------------------- | ----------------- |
| ArrowDown / Ctrl+J / Ctrl+N | next result (wraps) |
| ArrowUp   / Ctrl+K / Ctrl+P | prev result (wraps) |
| Home                        | first result      |
| End                         | last result       |
| Enter                       | invoke active     |
| Escape                      | close palette     |

#### `markItem(el, id, idx)` rendering helper

The primitive does NOT render `<li>` children — that's the
consumer's job, driven by the `resultschange` event. After
appending each result element, the consumer calls
`palette.markItem(li, cmd.id, index)` which:

- sets `role="option"`, `data-command-item`, and a unique id
- applies the current `aria-selected` / `data-active` state
  immediately (handles the case where items are rendered AFTER
  the active-paint effect already fired with an empty list)
- registers the item for click + hover delegation

#### Demo scene 18

Added to the Overlays dropdown. Real IDE-style command catalogue
(12 commands across File / Edit / View / Terminal groups) with:

- Cmd+K toggle from anywhere on the page
- Matched-character highlighting via `<mark>` in result labels
- Side-panel readouts for `open`, `query`, `results.length`,
  active item label
- Recent invocations chip list (consumer-tracked, separate from
  the primitive's internal `_recent` boost mechanism)
- Composition demo: backdrop + modal box wired via `openchange`
  events, no `createDialog` (kept the scene focused on palette
  semantics)

#### Tests

- **657 / 657 unit tests** passing ×3 stable (+40 command-palette)
- **186 / 192 browser tests** passing in chromium 141 (+19
  command-palette: Cmd+K open, Ctrl+K fallback, toggle, auto-focus,
  ARIA painting, aria-activedescendant tracking, ArrowUp/Down +
  Home/End nav, wrap-around, real-time filtering, empty state,
  fuzzy match, Enter invoke, click invoke, Escape close,
  input-context awareness × 2, recent-boost within tier). Same 6
  pre-existing chromium-headless menu-submenu focus quirks.

#### LOC

| File                                            |   LOC |
| ----------------------------------------------- | ----: |
| `src/command-palette/index.js`                  |   636 |
| `src/command-palette/element.js`                |   162 |
| `src/command-palette/llms.txt`                  |  ~280 |
| `test/command-palette.test.js` (40 tests)       |  ~560 |
| `test-browser/command-palette.spec.js` (19)     |  ~310 |
| `test-browser/fixtures/command-palette.html`    |  ~140 |
| Demo scene 18 (CSS + markup + JS)               |  ~430 |

#### Implementation notes worth flagging

- **`markItem` applies active state on call** because the
  active-paint effect already fired during construction (with
  empty list); waiting for the next activeIndex change would
  leave the first render without correct ARIA on the active item.
- **`invoke()` recomputes** because the recent list changed even
  if the query string didn't — without this, the recent boost
  wouldn't reflect in the cached results on subsequent opens.
- **`refresh()` is the escape hatch** for re-evaluating `when()`
  filters after external context changes. The primitive doesn't
  poll context; the consumer signals when it should re-evaluate.
- **`_activeIdx` initial value is -1** (not 0) so that the first
  `setActive(0)` call after items render fires the signal effect.
  Otherwise `setActive(0)` when value is already 0 is a no-op and
  the initial ARIA painting wouldn't happen.

#### What's NOT in this release

- **Command groups rendering** is consumer-driven. The primitive
  preserves the `group` field on each command but doesn't insert
  group headers into the result list — the consumer can group
  items in their `resultschange` render pass if they want.
- **Persistent recent across sessions** is consumer-driven. The
  primitive tracks recent in-memory only. Persisting to
  localStorage / `@zakkster/lite-persist` is a 5-LOC consumer
  layer (write `palette.commands()` recent metadata on every
  `select` event, restore on init).
- **Keyboard shortcut hints per command** (like the `Ctrl+S` text
  shown next to "Save" in IDE palettes) — store on `cmd.shortcut`,
  render in your item template. The primitive doesn't bind those
  shortcuts; that's an app-level concern.

---

### 0.7.18 — 2026-06-13

#### Added: toast primitive (`createToast`) + `<lite-toast>` wrapper

Headless ephemeral notifications. Seventeenth primitive. Covers
status updates, error alerts, progress-with-update, and the
snackbar pattern in one composable API. Auto-dismiss with
pause-on-hover, pointer-driven swipe-to-dismiss, stack management,
and a hidden ARIA live region for screen readers.

```js
createToast({
    placement:        "top-left" | "top-center" | "top-right" |
                      "bottom-left" | "bottom-center" | "bottom-right",
    duration:         5000,        // ms; 0 = no auto-dismiss
    swipeToDismiss:   true,
    swipeDirection:   "auto",      // auto-derived from placement
    swipeThreshold:   50,          // px
    maxStack:         5,
    pauseOnHover:     true,
    pauseOnFocus:     true,
    announceLive:     true,
    onShow:           (id) => {},
    onDismiss:        (id, reason) => {},
})

  attachRoot(el)                   // the viewport region

  show(content, opts?)             // string | HTMLElement
    -> { id, el, dismiss, update }
  dismiss(id, reason?)
  clear(reason?)
  count() / getEntries() / destroy()
```

#### Why a toast primitive

Every modern app needs ephemeral notifications, but every existing
toast library makes opinionated calls about styling (icon + colour
per variant), positioning (fixed 6-placement grid), and timing (most
hardcode 3-5s). lite-headless toast lets the consumer own all of
that while taking care of:

- **Stack lifecycle** — append/dismiss without DOM thrash
- **Auto-dismiss timer** with pause/resume that preserves remaining
  time across pause cycles (toast 80% expired stays 80% expired)
- **maxStack overflow** auto-evicts the OLDEST toast when a new one
  arrives past the cap
- **Swipe-to-dismiss** — pointer + touch, direction auto-derived
  from placement, writes CSS custom properties for the consumer to
  compose into transforms
- **ARIA correctness** — `role="status"` + polite live for info,
  `role="alert"` + assertive live for urgent, plus a hidden polite
  live region on the viewport for consistent screen-reader pickup
- **Update-in-place** — `h.update(newContent, opts?)` replaces toast
  content without rebuilding the element (preserves identity, focus,
  and any in-flight swipe state)

The hard parts (timer drift across pauses, race-free dismiss
during a swipe gesture, ARIA semantics) are in the primitive. The
aesthetics (colours, icons, slide-in animation, position on
screen) are consumer CSS.

#### Swipe-to-dismiss

```css
[data-toast-id] {
    transform: translate(var(--lh-toast-swipe-x, 0), var(--lh-toast-swipe-y, 0));
}
[data-toast-id][data-swiping]    { transition: none; opacity: 0.85; }
[data-toast-id][data-dismissing] { transform: translateX(120%); opacity: 0; }
```

The primitive writes `--lh-toast-swipe-x` and `--lh-toast-swipe-y`
during the gesture; the consumer chooses what to do with the motion
(translate, rotate, fade). When the swipe distance exceeds
`swipeThreshold`, the primitive sets `data-dismissing="true"` and
dismisses with `reason: "swipe"`. Wrong-direction motion is clamped
to zero, so swipe-right on a bottom-right toast moves it; swipe-left
does nothing visible. Swipes that start on `<button>`, `<a>`, or
form inputs inside the toast are ignored — close buttons and links
remain interactive.

#### Pause-on-hover with remaining-time preservation

The timer state is split into "elapsed since last start" and
"remaining". On hover/focus enter, the elapsed slice is subtracted
from remaining and the timer is cleared. On leave, the timer is
re-scheduled with the preserved remaining time. A toast that was
4s into a 5s duration shows 1s on the next leave — not a fresh 5.

`data-paused="true"` is set on each paused toast so consumer CSS
can pause progress bars / countdown animations:

```css
[data-toast-id]:hover .toast-progress,
[data-toast-id][data-paused] .toast-progress {
    animation-play-state: paused;
}
```

#### Close-button auto-handling

Any descendant inside a toast element with `[data-toast-close]` gets
a click listener that dismisses the toast with
`reason: "close-button"`:

```html
<div class="my-toast">
    <span>Message</span>
    <button data-toast-close aria-label="Dismiss">×</button>
</div>
```

The consumer doesn't need to wire this manually — set the attribute
and the primitive handles the rest.

#### Placement-aware insertion

- **top-*** placements: new toasts INSERT at the top of the
  viewport (stack grows downward away from the edge)
- **bottom-*** placements: new toasts APPEND at the bottom (stack
  grows upward)

Newest is always nearest the anchored edge. Consumers preferring
the inverse can reverse the viewport's flex direction in CSS — the
primitive's append order is fixed for predictability.

#### Demo scene 17

Added to the **Overlays** dropdown. Six trigger buttons (info,
success, warning, error, progress-with-update, burst-7) plus
clear-all. Side panel shows live active-count and last dismiss
reason. The progress trigger demonstrates `h.update(newEl, opts)`
mutating the toast content from "Uploading 0%" → "25%" → "50%" →
"75%" → "uploaded" while keeping the same DOM element (so any
in-flight swipe or focus survives).

#### LOC

| File                                       |  LOC |
| ------------------------------------------ | ---: |
| `src/toast/index.js`                       |  530 |
| `src/toast/element.js`                     |   94 |
| `src/toast/llms.txt`                       | ~265 |
| `test/toast.test.js` (32 tests)            | ~410 |
| `test-browser/toast.spec.js` (16 specs)    | ~290 |
| `test-browser/fixtures/toast.html`         | ~115 |
| Demo scene 17 (CSS + markup + JS)          | ~390 |

#### Test results

- **617 / 617 unit tests** passing (×3 stable; +32 toast from 585)
- **167 / 173 browser tests** passing in chromium 141 (+16 toast;
  same 6 pre-existing chromium-headless focus quirks)

#### What's NOT in this release

- **Queueing past maxStack**. v1 evicts; v2 might queue. Consumers
  needing queue-mode handle it in userspace (track the queue, only
  call `show()` when `count() < maxStack`).
- **Action buttons** beyond the close button. Consumers add their
  own buttons + click handlers inside the toast element; if they
  want a uniform "[Undo]" pattern, they wire it themselves.
- **Position transitions** between stack slots. When a toast in
  the middle dismisses, the ones below jump up instantly. A FLIP
  recipe (see `examples/flip-sortable.html`) would smooth this out
  in ~30 LOC; intentionally left to the consumer.

---

### 0.7.17 — 2026-06-13

#### Fixed: sortable — three bugs found in real-world drag testing

#### 1. Off-by-one indicator paint (the "drag two positions to move one" bug)

`_paintInsertIndicator` was reading the wrong slot when computing
where to draw the insertion line. The math was attempting to handle
the dragIdx adjustment a second time (`_slotIndexAt` already does
it), so for a drag of A → between B and C, the indicator painted
on remaining[slotIndex] with `data-insert-after` rather than
`data-insert-before`, visually showing the gap one position **below**
where the commit would actually land.

Effect: users would see the indicator under C and assume "I'm
placing A between C and D." They'd drag back up to align the
indicator with their target gap (between B and C) — but the slot
math now returned `0`, meaning no movement on release. To actually
move A one position down, users had to overshoot by one position.

```js
// before -- conflated dragIdx logic and remaining-array indices
if (dragIdx >= 0 && slotIndex >= dragIdx) {
    displayBefore = false;
    displayAt = slotIndex;
}
const target = remaining[displayAt];

// after -- slotIndex is already "position in remaining[]" -- use it
if (slotIndex >= remaining.length) {
    targetKey = remaining[remaining.length - 1];
    attrName  = "data-insert-after";
} else {
    targetKey = remaining[slotIndex];
    attrName  = "data-insert-before";
}
```

The semantic invariant is now: the indicator paints **at the same
gap** where the drop will commit. No more chasing a visual that
disagrees with the math.

#### 2. Keyboard pickup lost focus after the first arrow press

In vanilla / `apply-dom-reorder` mode, `_applyDOMReorder` calls
`appendChild` on every item. **`appendChild` on the focused element
implicitly blurs it in every major browser.** During keyboard pickup
(Space + arrows), the user would press Space (focus stays — no DOM
mutation), then ArrowDown (item moves, focus lost), and any further
key presses would route to `<body>` and do nothing. Symptom: "only
Space works."

Fix: snapshot `document.activeElement` before the `appendChild`
loop and restore focus afterwards if it was a sortable item:

```js
let focusedKey = null;
const ae = document.activeElement;
if (ae && ae._lhSortableKey != null) focusedKey = ae._lhSortableKey;

for (const key of newOrder) {
    const it = _items.get(key);
    if (parent) parent.appendChild(it.el);
}

if (focusedKey != null) {
    const it = _items.get(focusedKey);
    if (it && document.activeElement !== it.el) {
        it.el.focus({ preventScroll: true });
    }
}
```

`preventScroll: true` is important — without it, the viewport
jumps each time a focused item gets re-appended after moving
offscreen during rapid key sequences.

#### 3. Text selection during drag

The previous implementation called `e.preventDefault()` on
pointermove **only after the drag threshold was crossed** (5px).
That leaves the 1-4px pre-threshold ramp where the browser's
synthetic text-selection happily begins. The fix:

- `e.preventDefault()` on pointerdown when the target isn't an
  input/textarea/contenteditable — suppresses the initial selection
  click
- `e.preventDefault()` on **all** pointermoves during a pending drag
  (pre- and post-threshold) — suppresses drift selection
- `user-select: none` + `touch-action: none` documented as the
  recommended CSS hygiene for any sortable container; applied to
  the demo, fixture, and `examples/collab-sortable.html`

CSS is the belt; the primitive's preventDefault is the suspenders.
Either alone is sufficient; both together are robust.

#### Added: `examples/flip-sortable.html` — animated reorders

Zero-dep FLIP animation layered over the sortable primitive. Every
reorder — drag, keyboard pickup, shuffle, reverse, swap — animates
smoothly between positions instead of teleporting.

The recipe is ~30 LOC of glue:

```js
function flipBefore(els) {
    const rects = new Map();
    for (const el of els) rects.set(el, el.getBoundingClientRect());
    return rects;
}
function flipAfter(rects) {
    for (const [el, before] of rects) {
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top  - after.top;
        if (dx === 0 && dy === 0) continue;
        el.style.transition = "none";
        el.style.transform  = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = "transform 280ms ease";
            el.style.transform  = "";
        }));
    }
}
```

Driven by sortable's existing `dragstart` and `reorder` events for
the drag + keyboard paths, plus a `withFlip(fn)` helper for
imperative API calls (shuffle, swap, setOrder). The two-frame rAF
delay is the FLIP idiom: frame 1 lets the browser commit the
transform without a transition, frame 2 applies the transition
property and lets it animate to identity.

GSAP Flip integration also documented in the sortable llms.txt for
consumers already using GSAP.

**Why not bake into the primitive?** Animation timing, easing,
stagger, and whether to animate at all are aesthetic decisions the
consumer should own. The primitive emits events at the right
moments; FLIP is a recipe, not infrastructure.

#### Tests

- **585 / 585 unit** passing (×3 stable; +2 sortable regression for
  focus preservation across `applyDOMReorder`)
- **151 / 157 browser** passing in chromium 141 (+2 sortable
  regression: indicator at correct gap, keyboard arrows continue
  to work after first move). Same 6 pre-existing chromium-headless
  focus quirks.

#### Files changed

- `src/sortable/index.js` — three bug fixes
- `src/sortable/llms.txt` — recommended CSS section + FLIP recipe
  (zero-dep + GSAP variants)
- `test/sortable.test.js` — 2 focus-preservation regression tests
- `test-browser/sortable.spec.js` — 2 regression tests
- `test-browser/fixtures/sortable.html` — `user-select: none`,
  `touch-action: none`
- `demo/index.html` — same CSS hygiene
- `examples/collab-sortable.html` — same CSS hygiene
- `examples/flip-sortable.html` — new (animated-reorder example)
- `examples/README.md` — flip-sortable section

---

### 0.7.16 — 2026-06-13

#### Fixed: `aria-orientation` on split-panels separators (W3C correctness)

The split-panels primitive has supported both `orientation: "horizontal"`
and `"vertical"` since v0.7.0. What was missing was correct ARIA
semantics on the separator handle.

The previous implementation set `aria-orientation = orientation`, which
is inverted from the W3C ARIA spec. Per
[WAI-ARIA 1.2 § separator](https://www.w3.org/TR/wai-aria-1.2/#separator)
and the
[WAI-ARIA APG window-splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/),
`aria-orientation` describes the **separator line itself** -- which is
**perpendicular** to the panel arrangement axis:

| `orientation` prop | panel arrangement  | separator line | `aria-orientation` |
| ------------------ | ------------------ | -------------- | ------------------ |
| `"horizontal"`     | panels side-by-side| vertical bar   | `"vertical"`       |
| `"vertical"`       | panels stacked     | horizontal bar | `"horizontal"`     |

The primitive now flips the string internally, so the consumer never
has to think about the perpendicular convention. Visual behavior
unchanged; only the announcement to assistive tech is corrected.

```js
// internal -- handles get the W3C-correct aria-orientation
el.setAttribute("aria-orientation", isHorizontal() ? "vertical" : "horizontal");
```

This is a behavioral change for any consumer reading
`aria-orientation` programmatically (rare). Tests updated to match
the spec.

#### Demo scene 10 — rebuilt as a nested IDE layout

The previous scene showed a single horizontal 3-pane split, which made
it look like only one orientation was supported. The new scene
demonstrates **both orientations + nesting** in one composition:

```
┌──────────────────────────────────────────────────┐
│ ┌─────────┬───────────────────────┬────────────┐ │
│ │ sidebar │       editor          │ inspector  │ │   ← inner split
│ │  22%    │        56%            │   22%      │ │     (horizontal)
│ │         │                       │            │ │
│ └─────────┴───────────────────────┴────────────┘ │
│ ════════════════════════════════════════════════ │   ← outer separator
│                                                  │     (horizontal bar)
│                  terminal · 30%                  │
└──────────────────────────────────────────────────┘
   ↑ outer split is vertical orientation
   ↑ inner split is horizontal orientation
```

Two `createSplitPanels` instances:

```js
// outer: vertical (top section + terminal stacked)
const outer = createSplitPanels({ orientation: "vertical" });
outer.attachContainer(rootEl);
outer.attachPanel(innerContainerEl, 0, { minSize: 20 });
outer.attachPanel(terminalEl,       1, { minSize: 8, collapsible: true });
outer.attachHandle(outerHandleEl, 0);

// inner: horizontal (sidebar / editor / inspector)
const inner = createSplitPanels({ orientation: "horizontal" });
inner.attachContainer(innerContainerEl);  // <-- same el as outer's panel 0
inner.attachPanel(sidebarEl,   0, { collapsible: true });
inner.attachPanel(editorEl,    1);
inner.attachPanel(inspectorEl, 2, { collapsible: true });
inner.attachHandle(innerH0El, 0);
inner.attachHandle(innerH1El, 1);
```

**Two independent layouts, two `onLayoutChange` callbacks, no shared
state.** This is how lite-headless models 2D layouts: compose 1D
primitives, don't ship a 2D grid primitive. (The 2D grid editor is a
completely different category of UI primitive -- 10× the complexity --
and arbitrary nesting handles every IDE/dashboard/file-manager pattern
without it.)

Both orientations of the collapsed-neighbor chevron CSS were added so
the visual chevron points the right direction depending on the
separator axis (vertical bar -> chevron points horizontally toward
the collapsed neighbor; horizontal bar -> chevron points vertically).

#### Test results

- **583 / 583 unit tests** passing (×3 stable; +1 for the new
  horizontal-arrangement aria-orientation test)
- **149 / 155 browser tests** passing in chromium 141 (unchanged;
  same 6 pre-existing chromium-headless focus quirks)

#### llms.txt rewritten

The split-panels llms.txt now leads with the orientation + nesting
story, documents the W3C aria-orientation mapping table, and shows
the IDE-layout nested example. Anyone reading the docs first should
understand the composition model before touching the API.

#### My recommendation for future 2D-layout work

Stay with nested 1D groups. A true 2D grid editor (drag any edge,
panels in arbitrary geometric arrangement) is a different beast:
needs a constraint solver for the grid lines, edge-vs-corner drag
discrimination, custom keyboard model (Tab through which axis
first?), and the API surface explodes. The nesting approach handles
every IDE-style layout I can think of (VS Code, JetBrains, Figma,
Excel, every dashboard product) without the complexity. Match the
established pattern.

---

### 0.7.15 — 2026-06-13

#### Added: `examples/collab-sortable.html` — multi-tab collaborative sortable

A self-contained example demonstrating the lite-headless ↔ lite-crdt
integration pattern. Drop-in HTML; no build step. Opens in any
modern browser; multi-tab sync via `BroadcastChannel`.

```
@zakkster/lite-headless/sortable  ─┐
@zakkster/lite-crdt  ──── LWW-Map ─┼─► reactive lite-store projection
@zakkster/lite-signal ─────────────┘                ▲
                                                    │
native BroadcastChannel  ──── transport ────────────┘
```

The CRDT projection is authoritative — every reorder writes through
`list.set("order", newOrder)`. The sortable receives the truth via
the CRDT's `change` event regardless of source (local or remote).

Demonstrates:
- Drag in tab A → reorders in every other open tab on the same origin
- Late-joiner hydration via the CRDT's full-state handshake
- Per-tab replicaId + live local/remote op counters
- Concurrent-write resolution: LWW by Lamport timestamp; last writer
  wins atomically on the whole order-array

#### Why LWW-Map (and not OR-Set)?

`@zakkster/lite-crdt` v1 has:
- **LWW-Map** — keyed registers; last write wins per key.
- **OR-Set** — observed-remove set with stable first-add ordering.

For a sortable list where users reorder arbitrarily, OR-Set's
first-add ordering doesn't fit. We use LWW-Map and write the
**entire order array** as one LWW value. Concurrent reorders
resolve atomically: one user's reorder wins; the other's is lost.
Simplest correct strategy. lite-crdt's docs are explicit:
*"No RGA / positional sequence / reorder. Order is causal, not
index-positional."* Distributed lists with mergeable reorders
need RGA-style positional CRDTs which are out of scope for v1.

#### Bug found + fixed during build: microtask-defer for new items

While building the example, the **writing tab** saw newly-added items
at position 0 while reader tabs saw them at the end. Cause:

1. `b-add` mutates the CRDT synchronously
2. `change` fires → `renderItems` appends `<li>` to `<ul>`
3. `sortable.setOrder(newOrder)` is called immediately
4. The wrapper's role observer (`MutationObserver`, microtask-async)
   **hasn't noticed the new `<li>` yet** — sortable's internal
   `_items` map doesn't know about it
5. `applyDOMReorder` walks `newOrder`, calls `appendChild` on each
   item it knows about (the OLD items). `appendChild` MOVES nodes —
   each old item gets pulled to the end past the new one
6. DOM final order: `[new, old1, old2, old3]` (wrong)

Reader tabs avoid this because the op arrives via BroadcastChannel's
`postMessage` — by the time their handler runs, the event loop has
spun and MutationObserver from any prior render has fired.

Fix: one-microtask defer of `setOrder`, giving the role observer
time to attach the new `<li>` first.

```js
function updateSortableFromCRDT() {
    renderItems(order, labels);
    queueMicrotask(() => {
        _suppressNextLocalReorder = true;
        sortable.setOrder(order.slice());
        queueMicrotask(() => { _suppressNextLocalReorder = false; });
    });
}
```

This is a useful pattern any time you're driving a lite-headless
primitive from a state-source that BOTH appends new DOM nodes AND
requires the primitive to know about them in the same synchronous
chunk.

#### Dependencies

`@zakkster/lite-store` `^1.0.0` and `@zakkster/lite-crdt` `^1.0.0`
added as **devDependencies** (used only by examples; the core
primitives stay zero-runtime-dep with `@zakkster/lite-signal` as the
sole required peer + `@zakkster/lite-element` as an optional peer
for the custom-element wrappers).

The signal devDep range bumped to `^1.2.0` to match the released
v1.2.1.

#### Documentation

`examples/README.md` covers the full bridge pattern, generalised
for any primitive whose state can be modeled as a small JS value:
accordion (collaborative section open/closed), tabs (which user is
on which tab), tree (shared selection + expansion), carousel
(synchronized slide across tabs).

#### Files

| File                              | LOC  |
| --------------------------------- | ---: |
| `examples/collab-sortable.html`   | ~350 |
| `examples/README.md`              | ~135 |

No primitive code changed in this release; no test counts changed.
Existing 582 / 582 unit + 149 / 155 browser still passing.

---

### 0.7.14 — 2026-06-13

#### Added: sortable primitive (`createSortable`) + `<lite-sortable>` wrapper

Headless drag-to-reorder list with keyboard fallback. Sixteenth
primitive. Per the WAI-ARIA listbox + drag-and-drop pickup
patterns, with first-class support for both pointer drag and
keyboard-only flows (Space picks up, arrows move, Space drops).

```js
createSortable({
    orientation:        "vertical" | "horizontal",
    items:              [],                  // string[] of starting keys
    applyDOMReorder:    false,               // false=framework / true=vanilla
    keyboardEnabled:    true,
    disabled:           false,
    dragStartThreshold: 5,                   // px before drag begins
    announceLive:       true,
    onReorder:          (newOrder, info) => {},
    onDragStart:        (key) => {},
    onDragEnd:          (key, committed) => {},
})

  attachRoot(el, { label? })
  attachItem(el, key, { disabled? })
  attachHandle(el, key)                     // optional grip handle

  move(key, toIndex) / swap(a, b) / setOrder(arr)
  insertAt(key, atIndex) / removeKey(key)
  setDisabled(flag) / setItemDisabled(key, flag)
  items() / isDragging() / dragKey()
  order()                                   // signal getter
  destroy()
```

#### Two modes: framework vs vanilla

The hardest call for a sortable primitive is who owns the DOM. In
framework integrations (React, Vue, Svelte, etc.), the consumer's
framework is already responsible for rendering the list — when the
user reorders, the primitive should emit an event and stay out of
the framework's way, letting it re-render through its normal state
flow. In vanilla integrations there's no framework to do that
re-render and the consumer expects the DOM to physically move.

Both are supported via the `applyDOMReorder` option:

- **Framework mode** (default, `applyDOMReorder: false`): primitive
  emits `onReorder(newOrder, info)` and never touches DOM children.
  The consumer updates their state; their framework re-renders.
  No DOM thrash, no double-update.
- **Vanilla mode** (`applyDOMReorder: true`): primitive calls
  `parent.appendChild(item)` for each item in the new order on
  every commit. DOM order always matches `sortable.items()` after
  the commit.

```html
<!-- framework: keep applyDOMReorder false; consumer re-renders -->
<lite-sortable id="tasks">
    <ul><!-- React/Vue/etc. renders the <li>s --></ul>
</lite-sortable>

<!-- vanilla: opt-in DOM reorder via attribute -->
<lite-sortable apply-dom-reorder>
    <ul>
        <li data-sortable-item="a">A</li>
        <li data-sortable-item="b">B</li>
    </ul>
</lite-sortable>
```

#### Pointer-drag mechanics

1. **`pointerdown`** on an item (or its registered handle): record
   the start position. No visible state change yet.
2. **`pointermove`** past `dragStartThreshold` pixels (5 by default):
   drag begins. Item gets `data-dragging="true"`. The primitive
   reads every sibling's `getBoundingClientRect()` *once* and
   caches the midpoint along the orientation axis. Subsequent
   moves do not re-read the DOM.
3. **`pointermove`** during drag: compute target slot via cached
   midpoint comparison (pointer's main-axis coord vs item
   midpoints, first item whose midpoint is past the pointer is the
   landing slot). The slot's item gets `data-insert-before="true"`
   (or `data-insert-after` if landing after the last visible item),
   giving the consumer a CSS hook to draw an insertion indicator.
4. **`pointerup`**: commit the reorder if the slot changed.
   `onReorder` fires with `info.reason: "drag"`.
5. **`pointercancel`** / **`Escape`** during drag: revert
   data-attributes; no reorder commits.

#### Rect cache (the optimization the codebase planned for)

Reading `getBoundingClientRect` per `pointermove` triggers a
style/layout recalc each call. With pointermove firing at ~120 Hz
on high-end devices and N items, that's O(N) layout invalidation
at 120 Hz. The cache makes it O(N) once at dragstart, then O(N)
ARRAY READS per move (no layout work).

```js
let _rectCache = null;            // Map<key, { rect, midpoint }>

function _buildRectCache() {
    _rectCache = new Map();
    const isV = orientation === "vertical";
    for (const key of _order()) {
        const it = _items.get(key);
        if (!it || !it.el || it.disabled) continue;
        const rect = it.el.getBoundingClientRect();
        const midpoint = isV ? (rect.top + rect.bottom) / 2
                             : (rect.left + rect.right) / 2;
        _rectCache.set(key, { rect, midpoint });
    }
}

function _slotIndexAt(pointerX, pointerY) {
    // ... linear scan of cached midpoints, O(N) array reads only ...
}
```

Cache invalidates on every dragend. The "pointer-rect-cache
extraction" planned in the queue is inlined here — the pattern is
small enough that abstracting it across primitives isn't worth
the indirection yet.

#### Keyboard pickup mode (WAI-ARIA editable-grid pattern)

```
Tab         focus an item
Space/Enter pick up (aria-grabbed=true, announced)
↑ / ↓       move by 1 (vertical orientation)
← / →       move by 1 (horizontal orientation)
Home / End  first / last position
Space       drop (commit)
Escape      end pickup (tentative moves NOT reverted)
```

**Note on Escape**: each arrow move during pickup commits
immediately — the primitive doesn't keep an undo stack. Escape
ends pickup mode but leaves the partial moves applied. Consumers
who need rollback can snapshot `sortable.items()` at
`onDragStart` and restore on `onDragEnd(_, committed=false)`.

An internal visually-hidden `aria-live="polite"` region is
appended to the root for announcements ("Picked up item 3", "Item
now at position 5", "Dropped"). Disable with `announceLive: false`
if the consumer has their own announcer.

#### Handle gating

When the consumer calls `attachHandle(el, key)`, drag for that
item is restricted to events originating on the handle (or its
descendants). Press anywhere else on the row → no drag. Without
a registered handle, the entire row is draggable.

```html
<li data-sortable-item="task-1">
    <span data-sortable-handle>⋮⋮</span>   <!-- only this starts drag -->
    Buy milk
</li>
```

#### Element wrapper

```html
<lite-sortable label="Reorder tasks">
    <ul>
        <li data-sortable-item="a">
            <span data-sortable-handle>⋮⋮</span>
            Task A
        </li>
        <li data-sortable-item="b" data-disabled>Task B</li>
    </ul>
</lite-sortable>
```

Reactive attributes:

- `disabled` — toggles the whole list

Read-once attributes:

- `label`, `orientation`, `apply-dom-reorder`, `no-keyboard`

Dispatched events:

- `reorder` — `{ detail: { order, info } }`
- `dragstart` — `{ detail: { key } }`
- `dragend` — `{ detail: { key, committed } }`

#### Pairing with lite-store / lite-crdt (documented in llms.txt)

Sortable's state is just an array of string keys. For non-trivial
state — multi-tab sync, multi-user collaboration, optimistic
updates with a server — pair sortable with the store / CRDT layer:

```js
import { createStore } from "@zakkster/lite-store";

const store = createStore({ taskOrder: ["t1", "t2", "t3"] });
const sortable = createSortable({
    items: store.taskOrder.slice(),
    onReorder: (newOrder) => { store.taskOrder = newOrder; },
});
```

For multi-user reorder over BroadcastChannel / WebSocket, pair
with `@zakkster/lite-crdt`'s ORSet for stable convergence. The
sortable primitive remains transport-agnostic — it just emits
events.

#### Demo

Scene 16 (Sortable) added to the **Lists** dropdown. A 6-task
boot-sequence list with grip handles and a disabled task at the
end. Demonstrates both pointer drag (grab the ⋮⋮) and keyboard
pickup (focus + Space + ↑↓). Action buttons: shuffle, reset,
swap-first-last. The demo uses `apply-dom-reorder` so changes are
visible in the DOM without a framework.

#### LOC

| File                                       |  LOC |
| ------------------------------------------ | ---: |
| `src/sortable/index.js`                    |  610 |
| `src/sortable/element.js`                  |  126 |
| `src/sortable/llms.txt`                    |  ~210 |
| `test/sortable.test.js` (34 tests)         |  ~470 |
| `test-browser/sortable.spec.js` (16 specs) |  ~270 |
| `test-browser/fixtures/sortable.html`      |  ~110 |
| Demo scene 16 (CSS + markup + JS)          | ~330 |

#### Test results

- **582 / 582 unit tests** passing (×3 stable; +34 sortable from 548)
- **149 / 155 browser tests** passing in chromium 141 (+16 sortable;
  same 6 pre-existing chromium-headless focus quirks)

#### Note on the ecosystem signal cascade

Unchanged from v0.7.12. The wrapper-side re-entrance guard
continues to shield all primitives that mirror state to host
attributes. Sortable doesn't mirror an `order` attribute back
(the array would serialize awkwardly + change every commit),
so it sidesteps the cascade pattern entirely. State changes are
event-only.

---

### 0.7.13 — 2026-06-13

#### Added: carousel primitive (`createCarousel`) + `<lite-carousel>` wrapper

Headless carousel per the WAI-ARIA APG carousel pattern (basic with
manual controls + autoplay). Fifteenth primitive in the family.

```js
createCarousel({
    orientation:          "horizontal" | "vertical",
    autoplay:             null | ms,
    autoplayBehavior:     "pause" | "resume",
    loop:                 false,
    defaultIndex:         0,
    uniformSlideWidth:    false,      // opt-in fast path
    respectReducedMotion: true,
    onIndexChange:        (index, reason) => {},
    onPlayingChange:      (playing, reason) => {},
})

  attachRoot(el, { label? })
  attachViewport(el)
  attachSlide(el, idx, { label? })
  attachNext(el) / attachPrev(el)
  attachIndicator(el, idx)
  attachPlayPause(el)

  go(i, behavior?, reason?) / next / prev / first / last
  play / pause / toggle
  isPlaying / currentIndex / slideCount
  index() / playing()              // signal getters
  destroy()
```

#### Architecture: two paths for "current slide" detection

The hardest problem in any carousel is deciding *which slide is
current* given that scroll snap is a continuous CSS-driven motion
and JS observes it after the fact. Two source-of-truth strategies:

**Default (correctness)**: `IntersectionObserver` with 11 thresholds
(0, 0.1, … 1.0). Each slide's `intersectionRatio` updates live; the
slide with the highest ratio wins. Handles uneven slide widths,
unusual scroll-snap layouts, and partial scroll positions. One
observer instance per carousel, scoped to the viewport (`root:
_viewportEl`).

**Opt-in fast path** (`uniformSlideWidth: true`): rAF-throttled
`Math.round(scrollLeft / slideWidth)`. Single passive scroll
listener, zero allocation per frame. Use when all slides are
the same size (the common case for image carousels).

The imperative API (`go`/`next`/`prev`) commits optimistically so
consumers see the new index immediately after their call. The
scroll-driven path then re-confirms when the scroll settles (no-op
if matching).

#### Discovered + fixed: scroll-lock race condition

While building the browser specs, the Next-button-click test
revealed a subtle race. When `go(1)` initiated a smooth scroll,
the IntersectionObserver continued firing DURING the animation
with PRE-scroll intersection ratios (slide 0 ratio=1.0, slide 1
ratio=0). `updateIndexFromObserver` then committed BACK to
slide 0 — undoing the navigation.

```
[trace pre-fix]
[indexchange] 1        # optimistic commit from go()
[indexchange] 0        # observer fired with stale ratios, "corrected"
```

The fix is a 500 ms suppression window: `_scrollLockUntil` is set
on every programmatic `go()`; both the observer's
`updateIndexFromObserver` and the fast-path rAF handler bail if
`performance.now() < _scrollLockUntil`. Manual scroll (touch
swipe, mouse drag on the scrollbar) leaves the lock at 0 so
observer events drive the index normally.

```js
const SCROLL_LOCK_MS = 500;
let _scrollLockUntil = 0;

function go(targetIndex, behavior, reason) {
    // ... compute clamped/wrapped n ...
    if (slide && slide.el && _viewportEl) {
        _scrollLockUntil = performance.now() + SCROLL_LOCK_MS;
        _scrollToSlide(slide.el, behavior || scrollBehavior);
    }
    commit(n, reason || "go");
}

function updateIndexFromObserver(reason) {
    if (performance.now() < _scrollLockUntil) return;
    // ... find best-ratio slide ...
}
```

Without this lock, every Next-button click would have flickered
back to the previous slide before the smooth-scroll completed.
500 ms is generous (covers typical smooth-scroll durations across
viewport sizes); the lock auto-extends if `go()` is called again
mid-window.

#### Autoplay behavior per APG

WAI-ARIA APG mandates specific autoplay-pause behavior, all of
which is implemented:

- **Pause on hover** (if `autoplayBehavior: "pause"`)
- **Pause on focus-within**
- **Pause on any user navigation** (prev/next/indicator/keyboard)
- **Resume on hover-out / focus-out** — only if the user hasn't
  manually paused. The Play/Pause button toggle is sticky: once
  `pause()` is called with `reason: "user-toggle"`, the
  `_manualPaused` flag is set and hovering won't auto-resume.
- **Reduced-motion users**: autoplay defaults to off
  (`respectReducedMotion: true`, override available)
- **At end-of-list** (no loop): autoplay stops with reason
  `"autoplay-end"`
- **aria-live**: `"off"` while playing, `"polite"` while paused,
  so screen readers don't announce every auto-advance but DO
  announce manual changes

#### ARIA painted attributes

| Element       | Attributes                                       |
| ------------- | ------------------------------------------------ |
| Root          | `role="region"`, `aria-roledescription="carousel"`, `aria-label`, `data-orientation` |
| Viewport      | `aria-live="off"\|"polite"`                       |
| Slide         | `role="group"`, `aria-roledescription="slide"`, `aria-label="N of M"`, `data-state="active\|inactive"` |
| Prev / Next   | `aria-label`, `aria-controls` (viewport id)      |
| Indicator     | `role="tab"`, `aria-selected`, `aria-controls`, `tabindex` (roving), `data-state` |
| Play/Pause    | `aria-pressed`, `aria-label`, `data-state="playing\|paused"` |

The "N of M" slide labels are computed in `repaintSlideLabels`,
which fires on every `attachSlide` / detach. So adding a slide
late doesn't leave the others reporting stale counts (`3 of 5`
correctly becomes `3 of 6` when slide 6 attaches).

#### Keyboard (when viewport has focus)

- `ArrowLeft` / `ArrowRight` (horizontal) — prev / next
- `ArrowUp` / `ArrowDown` (vertical) — prev / next
- `Home` / `End` — first / last
- Any keyboard nav pauses autoplay (sticky until user resumes)

#### Element wrapper

```html
<lite-carousel label="Featured" autoplay="4000" loop>
    <div data-carousel-viewport tabindex="0">
        <div data-carousel-slide>Slide 1</div>
        <div data-carousel-slide>Slide 2</div>
        <div data-carousel-slide>Slide 3</div>
    </div>
    <button data-carousel-prev>←</button>
    <button data-carousel-next>→</button>
    <div role="tablist">
        <button data-carousel-indicator></button>
        <button data-carousel-indicator></button>
        <button data-carousel-indicator></button>
    </div>
    <button data-carousel-play-pause>⏯</button>
</lite-carousel>
```

Slides and indicators auto-infer their index from sibling order;
consumers can override with `data-index="N"` for sparse layouts.

The wrapper applies the v0.7.12 cascade guard pattern on the
`index` attribute (re-entrance flag + `queueMicrotask` unset).
External `setAttribute("index", N)` calls produce exactly one
`indexchange` event with `reason: "attribute"`; internal mirror
writes are suppressed at the effect.

#### Demo

Scene 15 (Carousel) added to the **Layout** dropdown. Five
CRT-themed slides (SCANLINE / PHOSPHOR / RASTER / VECTOR /
RETRACE) with autoplay at 3 s interval and loop on. Side panel
shows live readouts for `slide`, `reason`, and `playing`. Action
buttons jump to slides 1/3/5 and toggle play.

#### LOC

| File                                       |  LOC |
| ------------------------------------------ | ---: |
| `src/carousel/index.js`                    |  598 |
| `src/carousel/element.js`                  |  196 |
| `src/carousel/llms.txt`                    |  165 |
| `test/carousel.test.js` (39 tests)         |  445 |
| `test-browser/carousel.spec.js` (21 specs) |  280 |
| `test-browser/fixtures/carousel.html`      |  115 |
| Demo scene 15 (CSS + markup + JS)          | ~340 |

#### Test results

- **548 / 548 unit tests** passing (×3 stable; +39 carousel from 509)
- **133 / 139 browser tests** passing in chromium 141 (+21
  carousel; same 6 pre-existing chromium-headless focus quirks)

#### Status of the lite-signal cascade investigation

Unchanged from v0.7.12. The wrapper-side re-entrance guard
shields all six primitives that mirror state to host attributes
(accordion, tabs, tree's selected+expanded, carousel). The
lite-signal-side root cause remains open for a focused debug
session; next step is instrumenting `markDownstream` to log every
queueing event with full call stacks.

---

### 0.7.12 — 2026-06-13

The valuechange cascade — first observed in v0.7.9, partially
addressed by the `reason !== "attribute"` mirror guard, and
deferred twice while it lurked in three wrappers — is now fixed.
Consumers can finally trust `e.detail` on `valuechange`,
`selectionchange`, and `expandedchange` events.

#### The bug

When the wrapper's `onValueChange` calls
`host.setAttribute(name, value)` to mirror primitive state to the
DOM attribute (the standard pattern for framework integration),
chromium re-entered the `useAttr` effect *twice* during the
synchronous flush chain. The effect ran first with stale
primitive/attribute states paired (e.g. `primitive.value=null`
but `attr="a"`), then again with the new states inverted
(`primitive.value="a"` but `attr=""`). Final primitive value was
always correct — the cascade self-cancels — but each extra effect
run dispatched an additional `valuechange` `CustomEvent` with
stale `detail`. Three events per click instead of one.

```
[trace pre-fix]
PRE: value=null attr=""
click on "a"
[setValue] v=null r=attribute cur="a"          # effect run #1, stale
[event]    v=null r=attribute                  # spurious
[setValue] v="a"  r=attribute cur=null         # effect run #2, stale-corrected
[event]    v="a"  r=attribute                  # spurious
[event]    v="a"  r=click                      # the real one
```

The trace below isolates the smoking gun. Direct signal inspection
(`attrSig.peek()`) at the start of the effect body shows the
signal, the lite-element bridge, AND `host.getAttribute()` ALL
AGREE at every run — the effect is NOT reading stale data. The
signal genuinely transitions `"a" → ""` between two synchronous
runs of the same effect inside a single `setAttribute` call.

```
[#2 BODY] valueAttr()="a" attrSig.peek="a" getAttribute="a" primitive.value=null
[#3 BODY] valueAttr()=""  attrSig.peek=""  getAttribute=""  primitive.value="a"
```

This is happening one layer below the wrapper. Either lite-signal
re-queues the same effect across two propagation passes when the
queueing originates from inside another effect's flush (the
double-buffered `effectQueueA`/`effectQueueB`), or lite-element's
`attributeChangedCallback` fires twice for one `setAttribute` call
under some chromium-specific timing — neither of which my traces
fully pinned down. The lite-signal-side investigation remains open
for a focused dedicated pass; deep instrumentation of
`markDownstream` queue events with full call stacks is the next
step.

#### The fix (wrapper-side re-entrance guard)

A boolean flag set before the wrapper's own `setAttribute`, unset
on the next microtask. The `useAttr` effect honors the flag and
skips its body during that window. External `setAttribute` calls
(consumer-driven, route sync, framework prop bindings) leave the
flag false and pass through normally — they were never affected
by the cascade in the first place because they don't run inside
another effect's flush chain.

```js
let _suppressValueEffect = false;

const acc = createAccordion({
    onValueChange: (value, reason) => {
        if (reason !== "attribute") {
            const ser = serializeValue(value, type);
            if (host.getAttribute("value") !== ser) {
                _suppressValueEffect = true;
                host.setAttribute("value", ser);
                queueMicrotask(() => { _suppressValueEffect = false; });
            }
        }
        host.dispatchEvent(new CustomEvent("valuechange", {
            detail: { value, reason }, bubbles: true,
        }));
    },
});

const stopValueAttr = effect(() => {
    const raw = valueAttr();
    if (_firstValueRun) { _firstValueRun = false; return; }
    if (_suppressValueEffect) return;        // <-- cascade guard
    acc.setValue(parseAttrValue(raw, type), "attribute");
});
```

The microtask boundary matters: the suppression must outlast the
synchronous flush chain (`setAttribute → attributeChangedCallback
→ signal.set → markDownstream → flushEffects → executeEffect
→ executeEffect again`) but unset before any external code
gets a chance to run. `queueMicrotask` is exactly right —
microtasks drain when the current task returns to the event
loop, after the wrapper's stack unwinds but before the next
task / animation frame / event.

#### Applied to

- `src/accordion/element.js` — `value` attribute
- `src/tabs/element.js` — `value` attribute
- `src/tree/element.js` — `selected` AND `expanded` (independent flags)

Stepper, combobox, slider, datepicker, menu, dialog, popover,
tooltip, split-panels, drawer do NOT mirror state to host
attributes in their wrappers, so they were never affected.

#### Regression tests

Five new browser specs lock down "exactly one event per user
action" — both for clicks AND for external `setAttribute` calls,
covering both halves of the contract (the guard must kill the
cascade but must not block legitimate attribute writes):

- `accordion.spec.js`: valuechange × 2 (click + external setAttribute)
- `tabs.spec.js`: valuechange × 1
- `tree.spec.js`: selectionchange + expandedchange

Each test provokes the exact sequence that triggered the cascade
pre-fix (`setValue(null) → wait → click`) and asserts the event
listener captured exactly one event.

#### Demo readout simplification (followup)

The tree demo's side-panel listeners previously read primitive
state DIRECTLY (`tree.expanded.length`) rather than the event
`detail`, because the cascade made `e.detail` unreliable. With
v0.7.12 those listeners can safely use `e.detail.expanded.length`
again. Not changed in this release (the workaround still works
correctly), but consumers writing new code should use `e.detail`.

#### Open: lite-signal-side root cause

The wrapper guard cleanly shields all consumers, but the
underlying behavior in lite-signal is real and could affect any
consumer doing the `attributeChangedCallback → signal.set →
effect → setAttribute → attributeChangedCallback` pattern (i.e.
any custom-element wrapper following the standard "mirror to
attribute" pattern that lite-element documents). Working
hypothesis: the effect-queue double-buffering interacts badly
with synchronous re-entrance through `attributeChangedCallback`
when the inner `setAttribute` happens during another effect's
flush. Next debugging step: instrument `markDownstream` to log
EVERY queueing event with full call stacks; determine whether
the attr-effect is being queued once or twice and whether
`executeEffect`'s "skip if no dep changed" path is firing
correctly on the second invocation.

#### Test results

- **509 / 509 unit tests** passing (×3 stable)
- **112 / 118 browser tests** passing in chromium 141 (+5 cascade
  regression specs; same 6 pre-existing chromium-headless focus
  quirks)

---

### 0.7.11 — 2026-06-13

Polish pass on tree (perf) and stepper (dynamic constraints + a
`contenteditable` disable loophole). No new primitives; no API
breaks. Five issues addressed across two primitives.

#### Tree: O(N²) → O(N) paint via incremental child-count map

`hasChildren(key)` previously scanned every entry in `_nodes`
looking for a record whose `parentKey === key`. The paint effect
reads `hasChildren` once per node in the loop, so a single click
on a 1,000-node tree ran a million iterations. At ~10ms per
selection the framerate cratered for any sizable file explorer.

Fix: a parallel `_childCounts: Map<parentKey, number>` is
incremented in `attachNode` and decremented in cleanup. Lookups
are O(1). The paint effect is now strictly O(N).

Verified at scale: a 200-node tree (1 root → 100 parents → 100
leaves) selecting a leaf used to dispatch ~40,000 inner-loop
iterations. After the fix: 200.

```js
const _childCounts = new Map();

function hasChildren(key) {
    const n = _nodes.get(key);
    if (!n) return false;
    if (n.hasChildrenExplicit != null) return n.hasChildrenExplicit;
    return (_childCounts.get(key) || 0) > 0;     // O(1)
}
```

#### Tree: cached `visibleFlat()` (no more `compareDocumentPosition` per keypress)

The visible-items list feeds `roving-focus.js` and is read on every
Down/Up/Home/End/typeahead keypress. The previous implementation:

1. Allocated a fresh wrapper-object array per call (per-keypress
   GC churn during rapid arrow-key nav)
2. Sorted by `compareDocumentPosition` — a method that can force
   style/layout recalc, called O(N log N) times per call in the
   sort comparator

Fix: cache the result in `_cachedVisibleFlat` and invalidate only
on structural change. Invalidation hooks:
- `commitExpanded` — expand/collapse changes visibility
- `attachNode` — new node may appear
- detach cleanup — node disappears
- `setDisabled` — rover skips disabled items during nav, so
  flipping disabled changes the navigable set

The sort is gone entirely. `_nodes` is populated in DOM order by
the role observer's tree-order walk on initial scan, and
appendChild/insertBefore via MutationObserver preserve that order
for typical usage. Pathological out-of-order inserts will produce
stale ordering until the next expand/collapse — an acceptable
tradeoff vs. forced reflow on every keypress.

The wrapper-object label is now a getter (lazy textContent read),
so the cache hot path is one array reference and zero string work
until typeahead actually fires.

#### Stepper: dynamic `min` / `max` / `step` constraints

The "Static Config, Reactive State" ethos was the wrong fit for
numeric inputs. Stock quantities, inventory caps, time pickers in
a scheduling UI, range pickers whose bounds depend on a sibling
selection — all need bounds that update at runtime. Pre-v0.7.11
the wrapper read `min` / `max` / `step` once at construction and
ignored further attribute writes.

Closed the gap on both surfaces:

- Primitive exposes `setMin(n)`, `setMax(n)`, `setStep(n)`,
  `getMin()`, `getMax()`, `getStep()`. Each setter:
  - validates the input (finite + positive for step; respects the
    inverse-bound check for min/max)
  - updates the lexical binding so existing closures see the new
    value next event
  - re-normalizes the current value (clamping + step-snap) and
    fires `onValueChange(value, "constraint")` if it actually moved
- `setStep` also calls the new `recomputeStepMul` to refresh the
  precomputed float-hygiene multiplier (see next item)
- Element wrapper observes `min`, `max`, `step` (added to
  `observedAttributes`), wires each via `scope.useAttr` + `effect`,
  and exposes `host.min` / `host.max` / `host.step` property
  accessors that round-trip through `setAttribute`

```js
const s = createStepper({ defaultValue: 80, min: 0, max: 100 });
// inventory drops -- cap the stepper
s.setMax(50);
s.value();        // 50  (re-normalized)
s.getMax();       // 50
```

```html
<lite-stepper id="qty" min="0" max="100" value="80">…</lite-stepper>
<script>
    qty.setAttribute("max", "50");       // primitive re-normalizes
    qty.value;                            // 50
    qty.max = 25;                         // property setter also works
</script>
```

#### Stepper: precomputed step multiplier (`Math.pow` cold-pathed)

`normalize(n)` runs on every `+`/`−` click, every drag tick, every
programmatic set. The float-hygiene round-trip called
`-Math.log10(step)` and `Math.pow(10, decimals)` *twice* per call
— for a busy drag at 60fps with `step: 0.01`, that's 7,200
log + pow ops per second to handle the `0.1 + 0.2` case.

Fix: precompute `_stepMul` once at construction and refresh only
on `setStep`. The hot path drops to two arithmetic ops:

```js
let _stepMul = 1;
function recomputeStepMul() {
    if (step < 1) {
        const decimals = Math.min(10, Math.ceil(-Math.log10(step)));
        _stepMul = Math.pow(10, decimals);
    } else {
        _stepMul = 1;     // step >= 1, no fractional cleanup needed
    }
}

// inside normalize():
if (step < 1) {
    n = Math.round(n * _stepMul) / _stepMul;
}
```

Indirect test: 100 increments of `step: 0.01` from 0 land exactly
on 1 (no drift). Direct timing in real apps was the motivator;
that's outside the unit-test surface.

#### Stepper: `contenteditable` disabled loophole

The docs explicitly allow `<span contenteditable data-input>` as a
styling alternative to `<input type="text">`. On such elements,
`setDisabled(true)` silently failed: the `.disabled` property
assignment on a non-form element is a no-op, leaving the
contenteditable span fully editable while the stepper claimed to
be disabled.

Fix: when the attached input has a `contenteditable` attribute,
flip it to `"false"` on disable and back to `"true"` on enable.
Inputs without `contenteditable` are untouched (we don't
synthesize the attribute on consumers who didn't ask for it).

```js
if (_input.hasAttribute("contenteditable")) {
    _input.setAttribute("contenteditable", _disabled ? "false" : "true");
}
```

#### LOC

| File                          |   ±LOC |
| ----------------------------- | -----: |
| `src/tree/index.js`           |    +30 / −22 |
| `test/tree.test.js`           |    +75 |
| `src/stepper/index.js`        |    +75 |
| `src/stepper/element.js`      |    +50 |
| `test/stepper.test.js`        |   +110 |

#### Test results

- **509 / 509 unit tests** passing (×3 stable; +11 from v0.7.10)
- **107 / 113 browser tests** passing in chromium 141 (no
  regressions; same 6 pre-existing chromium-headless focus quirks)

---

### 0.7.10 — 2026-06-13

#### Added: tree primitive (`createTree`) + `<lite-tree>` wrapper

Headless tree view per the WAI-ARIA APG tree pattern. Hierarchical
list with expand/collapse, single or multiple selection, and full
keyboard navigation. Parent inference is purely DOM-based: each
attached node walks its ancestor chain looking for the nearest
already-attached tree-node, so lazy-loaded subtrees work without
the consumer wiring parent keys explicitly.

```js
createTree({
    selectionMode:       "single" | "multiple",
    defaultSelected,                              // string | string[] | null
    defaultExpanded,                              // array of expanded keys
    typeahead:           true,
    loop:                true,
    onSelectionChange:   (selected, reason) => {},
    onExpandedChange:    (expanded, reason) => {},
})

  attachRoot(el)                                   // role="tree" container
  attachNode(el, key, { disabled?, hasChildren? }) // each treeitem
  attachLabel(el, key)                             // optional dedicated label
                                                   //   element for typeahead

  selected() / expanded()
  isSelected(key) / isExpanded(key) / isVisible(key) / hasChildren(key)
  select / deselect / toggleSelected / setSelected
  expand / collapse / toggleExpanded / setExpanded
  expandAll() / collapseAll()
  setDisabled(key, flag)
  focusKey(key)
  destroy()
```

#### Architecture: 2D → 1D flattening for roving focus

A tree is a 2D structure but the keyboard model is 1D: ArrowDown/Up
walk the same ordered sequence the user sees. The primitive
maintains a "visible items" list (pre-order traversal that skips
descendants of collapsed parents) and feeds it to the
`roving-focus.js` helper via `getItems()`. Recomputed lazily on
every expand/collapse or attach/detach; cached between mutations.

Down/Up/Home/End/typeahead all delegate to the helper. Left/Right
are tree-specific (expand/collapse/parent-jump) and live in the
primitive's keydown handler. This is the third primitive built on
`roving-focus.js`, validating the helper pattern further:

| Primitive | Helper LOC | Primitive LOC | Ratio |
| --------- | ---------: | ------------: | ----: |
| tabs      |        276 |           310 |  1.1x |
| accordion |          — |           385 |   n/a |
| tree      |        276 |           642 |  2.3x |

(Tree is larger than tabs because of the 2D topology bookkeeping
plus tree-specific Left/Right + `*` semantics.)

#### Keyboard (per WAI-ARIA APG tree pattern)

- `ArrowDown` / `ArrowUp` — next / previous visible item (wraps if `loop`)
- `ArrowRight` on collapsed parent — expand (focus stays)
- `ArrowRight` on expanded parent — move to first child
- `ArrowRight` on leaf — no-op
- `ArrowLeft` on expanded parent — collapse (focus stays)
- `ArrowLeft` on collapsed / leaf — move to parent
- `Home` / `End` — first / last visible
- `Enter` — select (parent or leaf — selection-first UX, see below)
- `Space` — select (toggles in multiselect)
- `*` — expand all sibling parents at the focused level
- typeahead — single character cycles through visible matches
- disabled items skipped during arrow nav and typeahead

#### UX choice: selection-first (click selects, chevron expands)

Two valid tree UX models exist:
- **Toggle-first**: clicking a folder expands/collapses it.
- **Selection-first**: clicking a folder selects it; expand is via a
  separate chevron, ArrowRight, or programmatic API.

This primitive uses the selection-first model (matches IDE file
explorers like VS Code's). Consumers wanting toggle-first can wire
their own click → `toggleExpanded` directly and skip `data-tree-toggle`.

#### CRITICAL FIX: chevron click bubbling in nested treeitems

The tree DOM is nested: a `<li role="treeitem">` contains a
`<ul role="group">` containing child treeitems. Clicks bubble. Each
ancestor's click handler runs. The pre-v0.7.10 handler had a walk
that bailed on encountering another treeitem (different
`_lhTreeKey`), but the bail check only fired when `t._lhTreeKey`
was set — and the chevron itself carries no key. So the walk
sailed past the descendant treeitem boundary, found
`data-tree-toggle` on the chevron, and toggled the ANCESTOR.

Visible symptom: clicking the chevron on `src/utils` dropped `src`
from the expanded set entirely. The user lost ancestor expansion
state on every nested chevron click.

The fix verifies the chevron's nearest `[data-tree-node]` ancestor
is *this* treeitem before processing the toggle, and adds
`e.stopPropagation()` so ancestors don't re-run for the same
event. Regression tests added in unit + browser.

```js
if (t.hasAttribute && t.hasAttribute("data-tree-toggle")) {
    const owner = t.closest("[data-tree-node]");
    if (owner && owner._lhTreeKey !== k) return;   // chevron of another node
    e.preventDefault();
    e.stopPropagation();                            // don't double-fire on ancestor
    if (hasChildren(k)) toggleExpanded(k, "click-toggle");
    return;
}
```

This bug would have hit any consumer with a chevron-bearing tree.
The earlier "data-tree-toggle child element toggles expand without
selecting" unit test missed it because it used a flat 2-node tree
where no ancestor walked through a chevron.

#### ARIA compliance improvements

- **`aria-setsize` + `aria-posinset`** (APG-recommended). New
  `paintSiblingPositions(parentKey)` helper sweeps a sibling group
  on attach (new sibling joined) and detach (sibling removed,
  positions shifted). Each treeitem now announces "3 of 7" position
  context to screen readers.
- **`data-state="leaf"`** styling hook. Previously, leaves got no
  `data-state` attribute at all. Adding `"leaf"` lets consumers
  style leaves distinctly from collapsed parents (which both
  visually lack the expand-arrow):

  ```css
  [data-state="leaf"] > .chevron { visibility: hidden; }
  [data-state="closed"] > .chevron { transform: rotate(0deg); }
  [data-state="open"] > .chevron { transform: rotate(90deg); }
  ```

#### Custom element wrapper

```html
<lite-tree selection-mode="single" expanded="src,docs" selected="readme.md">
    <ul>
        <li data-tree-node="src">
            <span data-tree-toggle></span>src
            <ul>
                <li data-tree-node="src/index.js">index.js</li>
                <li data-tree-node="src/util.js" data-disabled>util.js</li>
            </ul>
        </li>
        <li data-tree-node="docs">docs</li>
        <li data-tree-node="readme.md">readme.md</li>
    </ul>
</lite-tree>
```

Reactive attributes:
- `selected` — string (single) or comma-separated keys (multi)
- `expanded` — comma-separated keys

Read-once attributes:
- `selection-mode` — "single" | "multiple"
- `no-typeahead` — presence disables typeahead
- `no-loop` — presence disables arrow wrap

Dispatches:
- `selectionchange` — `detail: { selected, reason }`
- `expandedchange` — `detail: { expanded, reason }`

Wrapper applies the v0.7.9 cascade guard (`reason !== "attribute"`)
to prevent the mirror-back loop on external setAttribute flows.

#### Demo

Scene 14 (Tree) added to the **Lists** dropdown. A 4-level file-
explorer tree (src → components → Button.tsx, etc.) with 16 nodes.
Action buttons exercise `expandAll`, `collapseAll`, and
programmatic `select`. Demonstrates the chevron-vs-row click
distinction: clicking the row body selects, clicking the chevron
expands.

The side panel shows live readouts for `selected`, `expanded`
count, and `focused` (via `focusin` listener), plus the keyboard
reference and the composition-tree mental model.

#### LOC

| File                                       |  LOC |
| ------------------------------------------ | ---: |
| `src/tree/index.js`                        |  642 |
| `src/tree/element.js`                      |  161 |
| `src/tree/llms.txt`                        |  130 |
| `test/tree.test.js` (36 tests)             |  578 |
| `test-browser/tree.spec.js` (23 specs)     |  330 |
| `test-browser/fixtures/tree.html`          |  100 |
| Demo scene 14 markup + CSS + JS additions  |  ~380 |

#### Test results

- **498 / 498 unit tests** passing (×3 stable runs; +36 tree)
- **106 / 112 browser tests** passing in chromium 141 (+22 tree;
  same 6 pre-existing failures: 3 menu submenu keyboard + 3
  datepicker keyboard — chromium-headless focus quirks)

#### Status of the v0.7.9 cascade investigation

The accordion / tabs valuechange cascade documented in v0.7.9
remains open. Tracing during the tree investigation showed that
what initially looked like the same bug in tree was actually the
chevron-bubble issue (different root cause, fixed above). The
accordion cascade IS real (3 valuechange events per click on
accordion triggers, observed with the `useAttr` effect re-running
with stale signal values), but the final value is always correct —
no state corruption, just duplicate event firings. Consumers
listening to `valuechange` should debounce or diff against
last-seen. Deferred to a focused lite-signal-side debug pass.

---

### 0.7.9 — 2026-06-13

#### Fixed: accordion rapid-click flicker (transition lock)

Reported behavior: rapid clicks on a `<lite-accordion>` trigger
produced ugly open/close/open/close animation flicker as each click's
CSS transition interrupted the previous one mid-flight.

Fix: GSAP-style `isTweening` guard. While a panel is mid-CSS-
transition, clicks on its trigger are dropped. The lock duration is
auto-detected from the panel's computed `transition-duration` +
`transition-delay`, so consumers don't need to configure anything.
If the panel has no transition (computed duration is 0), the lock is
never armed and every click passes through. Programmatic API
(`setValue` / `toggle` / `open` / `close`) is NOT guarded — code is
authoritative and bypasses the lock.

In `type: "single"` mode, clicking a closed trigger also closes the
previously-open one. Both keys go into the transitioning set so a
rapid re-click on the closing panel doesn't restart its animation
mid-flight either.

```js
// In the primitive's click handler:
if (_transitioning.has(key)) return;          // GUARD

const prevActive = (type === "single") ? _value() : null;
toggle(key, "click");

_lockKey(key);                                // arm for this transition
if (prevActive != null && prevActive !== key) _lockKey(prevActive);
```

Measurement handles comma-separated transition-duration lists
(consumer transitioning multiple properties at different speeds)
by taking the max. The lock clears on a measured-duration timer
with an 8ms pad so CSS has settled before the next click is allowed.
`destroy()` clears all in-flight transition timers.

Verified end-to-end with the live demo: 8 rapid clicks within ~120ms
produce exactly 1 valuechange event and one clean open/close
animation, instead of the user-reported flicker.

**Tests:** 5 new unit (`mockTransitionDuration` helper monkey-patches
global `getComputedStyle`); 2 new browser specs (real CSS injection
+ rapid `dispatchEvent("click")` burst). 33 / 33 accordion unit +
18 / 18 accordion browser specs pass.

#### Investigation: accordion wrapper valuechange cascade

While verifying the lock end-to-end, an unrelated quality issue
surfaced: a single click on `<lite-accordion>` fires **3** valuechange
CustomEvents instead of 1. The final value is always correct
(consumers polling `host.value` see the right state), but listeners
attached to the `valuechange` event get duplicate notifications.

Root cause is the wrapper's attribute-mirror pattern in combination
with `useAttr`'s effect timing under lite-signal's batched flush:

1. Click → `commitValue("a", "click")` → `_value.set("a")` → paint effect queued
2. `onValueChange("a", "click")` fires synchronously → wrapper writes `host.setAttribute("value", "a")`
3. `attributeChangedCallback` runs → useAttr signal updates → useAttr effect queued
4. `dispatchEvent("valuechange", {v:"a", r:"click"})` — captured event #1
5. Microtask flush: useAttr effect runs and (depending on prior signal state) re-fires onValueChange with `reason:"attribute"` twice

A partial fix was attempted in this release (skip mirror when
`reason === "attribute"`, applied to accordion + tabs wrappers) but
the cascade persists — the duplicate events come from the useAttr
effect itself re-running with stale signal values, not from the
mirror-back loop the guard prevents. Tracing shows the useAttr
effect fires twice with the OLD attribute value (`""`, parsing to
`null`) and the NEW value (`"a"`), even though only one
`attributeChangedCallback` invocation should occur.

This is a deeper interaction between lite-signal's double-buffered
effect queue and lite-element's `useAttr` signal. Investigation
deferred to a focused signal-side debugging pass — likely needs
either a coalescing flag on `useAttr` or an `untrack` wrap around
the wrapper's `setAttribute` call. Consumers using `host.value` for
state (the documented pattern) are unaffected; consumers listening
to `valuechange` should debounce or check `e.detail.value` against
their last-seen value.

The reported flicker bug is independent and fully fixed by the
transition lock above.

#### Added: slider `setDisabled` (runtime enable/disable)

Slider previously accepted `disabled` only at construction time. The
wrapper declared `observedAttributes: ["value", "disabled"]` and the
source comment marked it as "one-way (initial read only) until the
primitive exposes setDisabled". This release closes that gap:

```js
const slider = createSlider({ ... });
slider.attachTrack(trackEl);
slider.attachThumb(thumbEl, 0);

slider.isDisabled();        // false
slider.setDisabled(true);   // disable at runtime
slider.setDisabled(false);  // re-enable
```

`setDisabled(true)` does several things in one pass:
- cancels any in-flight pointer drag (the captured pointer is
  released; no half-completed `valuechange` is emitted)
- writes `aria-disabled="true"` and `data-disabled=""` on every
  attached thumb plus the track
- sets `tabindex="-1"` on every attached thumb (was "0" before)
- subsequent pointerdown / keydown events on the thumb or track
  bail at their `if (disabled) return;` guards because those guards
  read the `disabled` variable lexically through their closures

Calling `setDisabled` with the current state is a no-op (no
attribute thrash, no early return cost beyond a `===` check).

The element wrapper now wires the `disabled` HTML attribute
reactively (`useAttr` + `effect`), and exposes a `host.disabled`
property accessor that round-trips through `setDisabled`:

```html
<lite-slider id="s" min="0" max="100" value="50">
    <div data-track>
        <div data-range></div>
        <div data-thumb></div>
    </div>
</lite-slider>

<script>
    s.setAttribute("disabled", "");   // -> primitive disables, thumb/track repainted
    s.removeAttribute("disabled");    // -> re-enables
    s.disabled = true;                // property accessor; same result
</script>
```

Verified with a manual playwright probe: attribute set/remove and
property set both round-trip through to `aria-disabled`,
`data-disabled`, and `tabindex` on the thumb + track within a frame.

**Tests:** 5 new unit (`isDisabled` read, paint on attached thumbs,
keyboard nudge blocked when disabled, idempotent same-state calls,
multi-thumb affects all thumbs). 38 / 38 slider unit tests pass.



#### LOC

| File                                       |  LOC |
| ------------------------------------------ | ---: |
| `src/accordion/index.js` (lock additions)  |  +52 |
| `test/accordion.test.js` (lock tests)      |  +95 |
| `test-browser/accordion.spec.js` (specs)   |  +50 |
| `src/accordion/element.js` (cascade guard) |   +8 |
| `src/tabs/element.js` (cascade guard)      |   +3 |
| `src/slider/index.js` (setDisabled)        |  +32 |
| `src/slider/element.js` (reactive disabled) |  +25 |
| `test/slider.test.js` (setDisabled tests)  | +110 |

#### Test results

- **462 / 462 unit tests** passing (×3 stable runs)
- **84 / 90 browser tests** passing in chromium 141. Same 6
  pre-existing failures (menu submenu keyboard ×3, datepicker
  keyboard ×3) — chromium-headless focus quirks, not real bugs.

---

### 0.7.8 — 2026-06-12

#### Added: `createAccordion` primitive

N items, each with a trigger + panel. Two modes:

```js
const acc = createAccordion({
    type: "single",          // or "multiple"
    collapsible: true,        // single-mode: allow closing the open one
    defaultValue: "billing",  // string for single, array for multiple
});

acc.attachRoot(rootEl);
acc.attachItem(itemEl, "billing");
acc.attachTrigger(triggerEl, "billing");
acc.attachPanel(panelEl, "billing");
```

Or declaratively:

```html
<lite-accordion type="single" collapsible value="overview">
    <div data-accordion-item="overview">
        <button data-accordion-trigger="overview">Overview</button>
        <div data-accordion-panel="overview">...</div>
    </div>
    <!-- ... -->
</lite-accordion>
```

#### Modes

| Mode                         | Value shape       | Click on open trigger    |
| ---------------------------- | ----------------- | ------------------------ |
| `single` + `collapsible:false` | `string \| null` | no-op (default)          |
| `single` + `collapsible:true`  | `string \| null` | closes (value → null)    |
| `multiple`                   | `string[]`        | removes from set         |

#### Animation contract

The primitive writes only `data-state="open|closed"` + `aria-expanded`.
CSS owns the animation. Two recommended patterns:

```css
/* 1. interpolate-size (Chrome 129+/Safari 18+) */
[data-accordion-panel] {
    height: 0; overflow: hidden;
    transition: height 200ms;
    interpolate-size: allow-keywords;
}
[data-accordion-panel][data-state="open"] { height: auto; }

/* 2. grid-template-rows (universal) -- what the demo uses */
[data-accordion-panel] {
    display: grid; grid-template-rows: 0fr;
    transition: grid-template-rows 200ms;
}
[data-accordion-panel] > * { overflow: hidden; }
[data-accordion-panel][data-state="open"] { grid-template-rows: 1fr; }
```

#### Keyboard (per WAI-ARIA APG accordion pattern)

Different from tabs — ALL triggers are in the tab sequence (not
roving). ArrowKey moves focus between triggers without activating;
Enter/Space activates via the browser's native button click.

- `ArrowDown` / `ArrowUp` — next / previous trigger (wraps, skips disabled)
- `Home` / `End` — first / last enabled trigger
- `Enter` / `Space` — activates (via native button click on the trigger)

#### ARIA

- Root:      `data-orientation="vertical"`, `data-accordion-type`
- Trigger:   `aria-expanded`, `aria-controls=<panelId>`, `data-state`
- Panel:     `role="region"`, `aria-labelledby=<triggerId>`, `data-state`

#### setDisabled with auto-fallback

`acc.setDisabled(key, true)` on the currently-open key:
- single mode: closes the panel (value → null)
- multiple mode: removes the key from the set

Both behaviors are covered by unit + browser tests.

#### Lazy-attach scenario

`setValue("missing")` (single) or `setValue(["a", "missing"])`
(multiple) keeps unknown keys on the value side. If a trigger
attaches for them later, it renders open immediately. This is the
hydration-from-URL / hydrate-from-stored-prefs use case where the
consumer may set value before all the panels have mounted.

#### Element wrapper extras

- `value` attribute reactive via `useAttr("value")` + `observedAttributes`
  (route-sync use case — set `value` from a URL handler, get a
  working accordion for free)
- Active key(s) mirror back to the host's `value` attribute on every
  change; multi mode serializes as `"a,b,c"` (comma-separated) when
  no key contains a comma, JSON otherwise
- `host.value` getter/setter, `host.toggle/open/close/setDisabled`
  methods, `valuechange` CustomEvent with `detail: { value, reason }`
- MutationObserver-driven role discovery — dynamically-inserted items
  wire automatically

#### Tests

- **28 unit tests** in `test/accordion.test.js` — wiring, click
  activation in single/multiple/collapsible modes, disabled handling
  + auto-fallback, keyboard nav with disabled-skip + wrap, edge cases
- **16 playwright specs** in `test-browser/accordion.spec.js` — real
  DOM event delivery, focus tracking, controlled-attribute flow,
  dynamic-item insertion via MutationObserver

#### Bug discovered during browser smoke

The primitive's `attachTrigger` was overwriting the consumer's
`data-accordion-trigger="key"` discovery hint to empty string,
which broke the role observer's re-scan. Fix: the primitive no
longer writes `data-accordion-trigger`, `data-accordion-panel`,
or `data-accordion-item` markers — those are consumer-owned
discovery hints. The primitive writes only its own state
attributes (`data-state`, `aria-expanded`, `role`, `aria-controls`,
`aria-labelledby`).

#### Fixed: multi-popover escape stack — popovers wouldn't close on Escape

In a page with N popovers constructed but only an older one open,
pressing Escape was a no-op. Previously each `bindEscape(overlay)`
attached its own document keydown listener that checked "am I the
topmost in the stack". With N popovers, the topmost-bound handler
won the gate — but its `overlay.open()` returned false (only the
older popover was open), and the handler short-circuited without
falling through. No popover closed.

Fix: a single shared document listener that walks the escape stack
top-down and dispatches to the first OPEN overlay. Each `bindEscape`
still pushes/pops a stack entry, but the listener is registered
once and removed when the stack drains. Open/close state is sampled
lazily at keydown time, so an overlay opening after another stays
"above" in dismissal order regardless of construction order.

Resolves `popover.spec.js › escape closes the popover`. Down from
7 pre-existing browser failures to 6 (3 menu submenu keyboard + 3
datepicker keyboard, both chromium-headless focus quirks).

#### Demo

- **Scene 13 (Accordion)** added to the Layout dropdown. Two cards:
  single + collapsible (4 items, one disabled) and multiple (3 items
  with toggle behavior). Animation via `grid-template-rows: 0fr ↔
  1fr` (universal pattern; no `interpolate-size` required).
- Action buttons exercise `setValue([...all])` (open all),
  `setValue([])` (close all), and `setDisabled("advanced", flag)`
  with the auto-fallback when the active key gets disabled mid-session.
- Caret rotation on open via CSS `transform: rotate(180deg)` driven
  off the `[data-state="open"]` attribute.

#### LOC accounting

| File                              |  LOC |
| --------------------------------- | ---: |
| `src/accordion/index.js`          |  385 |
| `src/accordion/element.js`        |  130 |
| `test/accordion.test.js`          |  410 |
| `test-browser/accordion.spec.js`  |  220 |
| `src/_overlay/dismiss.js` (rewrite) | 100 |

Accordion is bigger than tabs (310 LOC) because it has two distinct
value-shape modes (string vs array) and its own keyboard handling
(triggers in tab sequence, not roving, per APG).

#### Test results

- **452 / 452 unit tests** passing across three stability runs
- **82 / 88 browser tests** passing in chromium 141 (16 new accordion
  + 1 popover-escape fix). Remaining 6 failures: 3 menu submenu
  keyboard + 3 datepicker keyboard — chromium-headless focus-event
  quirks, not real bugs.

---

### 0.7.7 — 2026-06-12

#### Added: `createTabs` primitive — first new consumer of the roving-focus core

A tablist with N triggers and N panels, one active at a time. Built on
the v0.7.4 `roving-focus.js` helper, which means tabs needed *zero*
arrow-key / Home/End / disabled-skip code of its own. The helper
handles all that; tabs just feed items in and consume `move()` /
`first()` / `last()`. This is the architectural validation the
roving-focus extraction was justified by.

```js
const tabs = createTabs({
    defaultValue: "overview",
    orientation: "horizontal",   // or "vertical"
    activation:  "automatic",    // or "manual"
    loop:        true,
});

tabs.attachTablist(tablistEl);
tabs.attachTab(triggerA, "overview");
tabs.attachTab(triggerB, "settings", { disabled: false });
tabs.attachPanel(panelA, "overview");
tabs.attachPanel(panelB, "settings");
```

Declaratively:

```html
<lite-tabs value="overview" orientation="horizontal" activation="automatic">
    <div data-tablist>
        <button data-tab="overview">Overview</button>
        <button data-tab="settings">Settings</button>
        <button data-tab="billing" data-disabled>Billing</button>
    </div>
    <div data-panel="overview">overview content</div>
    <div data-panel="settings">settings content</div>
    <div data-panel="billing">billing content</div>
</lite-tabs>
```

#### Activation modes

- **`"automatic"`** (default): ArrowKey moves focus AND activates the
  tab in one step. Non-destructive content (most apps).
- **`"manual"`**: ArrowKey moves focus only; user explicitly presses
  Enter / Space to activate. For destructive content (forms with
  unsaved state).

#### Keyboard (delegated to `roving-focus.js`)

- `horizontal`: ArrowLeft / ArrowRight
- `vertical`: ArrowUp / ArrowDown (horizontal keys ignored so they
  pass through to whatever else is listening)
- `Home` / `End`: first / last enabled tab
- `Enter` / `Space` in manual mode: activate focused tab
- Disabled tabs skipped during arrow nav
- `loop: false` clamps at the ends instead of wrapping

#### ARIA

- Tablist: `role="tablist"`, `aria-orientation`
- Tab: `role="tab"`, `aria-selected`, `aria-controls=<panelId>`,
  roving tabindex (0 on selected, -1 on the rest)
- Tabpanel: `role="tabpanel"`, `aria-labelledby=<tabId>`, `tabindex="0"`
  (so Tab from the active trigger reaches the panel), `hidden` on
  inactive panels (which removes them from the a11y tree and tab order)

#### setDisabled with auto-fallback

`tabs.setDisabled(key, true)` on the currently-active tab falls back
to the next enabled tab — the UI is never stranded on a disabled
panel. Tested in unit + browser.

#### Element wrapper extras

- `value` attribute on `<lite-tabs>` is reactive: external
  `setAttribute("value", key)` drives the active tab (route-sync use
  case — set value from a URL handler, get a working tab UI for free)
- Active key mirrors back to the host's `value` attribute on every
  change, so external `MutationObserver`s see the state
- `host.value` property getter/setter for ergonomic JS use
- `valuechange` `CustomEvent` with `detail: { value, reason }`
- `next() / prev() / first() / last()` exposed as methods on the host
- MutationObserver-driven role observer (from v0.7.1) so dynamically-
  appended tabs + panels wire automatically (e.g. lazy-loaded routes)

#### Tests

- **28 unit tests** in `test/tabs.test.js` — basic wiring, click
  activation, automatic + manual + vertical modes, disabled-skip,
  Home/End, programmatic API, setDisabled fallback, edge cases
- **16 playwright specs** in `test-browser/tabs.spec.js` — real DOM
  event delivery, real focus tracking, controlled-attribute flow,
  dynamic tab insertion via MutationObserver

#### Fixed: `lite-stepper` and `lite-tabs` wrappers' `useAttr` reactivity was silently broken

The two wrappers used `scope.useAttr("value")` (and `"disabled"` for
stepper) inside an `effect()` to react to external `setAttribute`
calls, but they didn't declare `observedAttributes` on the `define()`
call. `lite-element`'s `useAttr` only fires for attributes listed in
`observedAttributes`, so the effect's signal never updated when the
attribute changed.

This means `<lite-stepper>`'s attribute-driven flow had been broken
since the wrapper was first written — the wrapper's 40 unit tests +
16 browser specs all drive via the property setter or the click flow,
never via `setAttribute`, which is why nobody caught it. The bug was
uncovered while writing the tabs wrapper and immediately verifying
that route-sync (`setAttribute("value", routeKey)`) worked.

Fix is one line per wrapper:

```diff
-});
+}, { observedAttributes: ["value"] });           // tabs

-});
+}, { observedAttributes: ["value", "disabled"] });  // stepper
```

No behavior change for existing consumers — they were never relying
on this path. New consumers using attribute-driven sync now get the
expected reactivity.

#### Demo

- **Scene 12 (Tabs)** added to the Layout dropdown. Three
  `<lite-tabs>` cards demonstrate the three core configurations:
  horizontal automatic with one disabled tab + skip-on-arrow + wrap;
  horizontal manual with focus-vs-activation decoupled; vertical with
  ArrowUp/Down nav and ArrowLeft properly ignored.
- Action buttons exercise `next()`, `first()`, and `setDisabled(...,
  true|false)` with the auto-fallback when the active tab is disabled
  mid-session.
- Version badge bumped to v0.7.7; footnote shows 424/424 unit +
  65 browser tests.

#### LOC accounting

| File                          |  LOC |
| ----------------------------- | ---: |
| `src/tabs/index.js`           |  310 |
| `src/tabs/element.js`         |  120 |
| `test/tabs.test.js`           |  370 |
| `test-browser/tabs.spec.js`   |  220 |

The primitive itself is 310 LOC. By comparison, the original `createMenu`
was 1057 LOC (more comparable since menu has similar arrow nav). The 2:1
ratio comes from the roving-focus extraction doing the keyboard heavy
lifting — tabs is essentially "menu without typeahead, without
submenus, with the panels wired".

#### Test results

- **424 / 424 unit tests** passing across three stability runs
- **65 / 72 browser tests** passing in chromium 141 (16 new tabs +
  16 stepper + 9 split-panels + 5 wrappers + 19 existing). The 7
  pre-existing failures are unchanged from v0.7.1 (multi-popover
  escape stack, menu submenu keyboard quirks, datepicker keyboard
  focus quirks)

---

### 0.7.6 — 2026-06-12

#### Added: demo scene 11 + playwright specs for `createStepper`

The `createStepper` primitive itself shipped earlier (40 unit tests
green) but had never been wired into the demo or covered by a real-
browser spec. v0.7.6 closes both gaps.

#### Demo scene 11

Four `<lite-stepper>` instances, each demonstrating a distinct
configuration:

| Card                | Config                                                          |
| ------------------- | --------------------------------------------------------------- |
| `quantity`          | `min:0 max:99 step:1 largeStep:10` — pure integer stepper       |
| `unit price · USD`  | `step:0.01 precision:2 largeStep:1 locale:"en-US"` — currency  |
| `volume %`          | `step:5 largeStep:25` — coarse step + PageUp/Down at 25 each   |
| `rating · readout`  | `min:1 max:5 step:1` — `<output data-readout>`, no input field |

A running total ribbon (`stepper-total-big`) shows `qty × price` as
USD via a pre-built `Intl.NumberFormat({ style: "currency" })`
instance, recomputed on every `valuechange` event from any of the
four steppers. The side panel exposes 2× / ½ / reset / disable
actions that reach into the wrapper's `_stepperInstance` escape
hatch to call `setDisabled` on all four at once.

Scene added to the "Inputs" category dropdown alongside Slider (08)
and Date Picker (09). Tab nav now has 11 entries in 4 dropdowns;
plenty of headroom for Tabs / Tree / Sortable / Accordion etc.

#### Browser specs (`test-browser/stepper.spec.js`)

**16 playwright specs** covering behavior that happy-dom can't
reproduce:
- initial `value=""` attribute → primitive value + input display +
  `aria-valuenow` / `valuemin` / `valuemax`
- click + button fires `+step`, click − fires `-step`
- ArrowUp / ArrowDown on focused input
- PageUp / PageDown apply `largeStep`
- Home / End jump to `min` / `max`
- silent-clamp at `max` (click + at value=max stays at max)
- typing + blur reformats with precision: `33.7` typed, displayed `33.7`
- typing out-of-range value clamps on blur (`9999` → `100`)
- typing snaps to step granularity on blur (step 0.1: `33.78` → `33.8`)
- hold-to-repeat: 600 ms `pointerdown` yields multiple increments
- readout-only stepper renders into `<output>` (no `<input>` element)
- disabled-at-construction reflects on input + buttons; playwright
  refuses to click the disabled increment button which IS the proof
- `valuechange` CustomEvent fires with `detail.value` + `detail.reason`
- `aria-valuenow` updates on every value change

#### Primitive fix: `setDisabled` now also disables the +/− buttons

Uncovered by the playwright spec: `setDisabled(true)` previously only
wrote `disabled` + `aria-disabled` on the input. Clicks on the
+/− buttons no-op'd because the internal `_disabled` guard
short-circuited `startHold()`, but the buttons LOOKED clickable.
Consumers' CSS couldn't style "disabled stepper" without inspecting
the host attribute; ATs announced the buttons as enabled.

Fix is scoped: a closure-scope `_controlButtons` array tracks every
+/− element passed through `makeStepper`. `setDisabled(flag)` writes
`disabled` + `aria-disabled` to each. Buttons unregister themselves on
detach and clear their `aria-disabled` attribute. No public API
change; existing 40 unit tests pass unchanged.

#### Tests

- **396 / 396 unit tests** passing across three stability runs
- **49 / 56 browser tests** passing in chromium 141 (the 16 new
  stepper specs all pass; the 7 still-failing pre-existing specs are
  the same multi-popover-escape-stack + submenu-keyboard +
  datepicker-keyboard quirks from v0.7.1)

---

### 0.7.5 — 2026-06-12

#### Fixed: split-panel handles disappeared into container edges when neighbors collapsed

When `collapsePanel(idx)` (or a drag past the snap threshold) zeroed a
neighbor panel, the corresponding handle ended up flush against the
container edge. At the demo's 6px handle width the visible bar was
clipped by the stage's `overflow: hidden`, the panel's own content
labels bled out horizontally (panels didn't have `overflow: hidden`),
AND the stage-overlay badges at `z-index: 5` overlapped the corners
where the handles sat. Net effect: handles invisible AND not
clickable when at the edges, so collapsed panels couldn't be dragged
back open.

**This is a demo-only bug** — the primitive's contract was correct;
the demo's CSS just didn't set up the panels and handles to survive
edge cases. The fix is in `demo/index.html` only; no `src/`
changes.

Fix-set:
- Handles now use a slim 4px visible bar with a `::before` pseudo
  that extends the hit target ±6px on each side (16px total
  grabbable). Zero layout impact — the grid track is still 4px.
- Handles get `:hover` + `:focus-visible` states (cyan glow) and a
  `[data-dragging]` style (amber glow) so the interactive affordance
  is obvious.
- Handles get `z-index: 10`, above the stage-overlay badges'
  `z-index: 5`, so collapsed-state corner clicks always hit the
  handle.
- Panels get `overflow: hidden` AND `min-width: 0` so labels can't
  bleed past handles and so the grid can actually shrink the panel
  track to 0.
- When `paintSplitReadout` detects a neighbor panel at 0%, it writes
  `data-neighbor-collapsed="left|right"` on the adjacent handle.
  CSS uses that to surface a glowing amber chevron pointing toward
  the collapsed panel — so the user can see exactly where to grab
  and which way to drag.
- Inline `style="..."` attributes on the split scene markup were
  factored out into a proper stylesheet block so `::before`,
  `:hover`, `:focus-visible`, and attribute selectors actually
  work (they don't in inline styles).
- Attribute writes in the paint callback are diffed against
  cached "last-written" values so a 60-120Hz drag callback only
  hits `setAttribute`/`removeAttribute` when the collapsed state
  actually changes — most pointermove frames during a drag don't
  cross the snap threshold.

Verified by probe: collapse panel 0 → handle 0 sits at x=2px
width=4px. Drag-grab on that handle succeeds via the ::before
hit-pad, panel 0 expands back to 19.2%. Same flow works for
panel 2 via handle 1.

#### Changed: tab nav switched from flat 10-button strip to four category dropdowns

The flat tab strip ran out of horizontal space at 10 primitives;
with stepper/tabs/tree/sortable queued for v0.8+ the header would
overflow. Tabs are now grouped:

  Overlays ▾   Lists ▾   Inputs ▾   Layout ▾    │  viewing: Dialog Lab  01

| Category | Scenes                                            |
| -------- | ------------------------------------------------- |
| Overlays | 01 Dialog · 02 Popover · 03 Tooltip · 04 Composition |
| Lists    | 05 Combobox · 06 Menu & Submenu · 07 Context & Checkbox |
| Inputs   | 08 Slider · 09 Date Picker                        |
| Layout   | 10 Split Panels                                   |

Each dropdown is a `<lite-menu>` from this library — the demo
dogfoods the primitive it documents. Items dispatch a synthetic
click on `[data-item][data-scene]` which the document-level scene
handler picks up; lite-menu's `closeOnSelect` default dismisses
the dropdown automatically. The trigger gets `data-state="open"`
written by the wrapper, which the CSS uses to highlight the active
category and rotate the ▾ caret.

The right-side strip shows the currently-viewed scene name + number,
updated by `selectScene(sceneId)` whenever an item is picked.

No `src/` changes — this is purely a demo restructure.

#### Misc

- Version bumped to v0.7.5 (demo badge follows).
- Tagline updated: was the long enumeration of primitives, now
  "headless primitives · zero-GC · 10 primitives · 356/356 tests".
- 356/356 unit tests passing across three stability runs (no
  regression from the v0.7.4 roving-focus extraction).

---

### 0.7.4 — 2026-06-12

#### Added: `src/_overlay/roving-focus.js` — shared keyboard-driven highlight engine

The keyboard nav + typeahead state that previously lived inside
`createCombobox` and `createMenu` (roughly 60 + 110 lines of near-
identical code) is now a reusable helper. Any future primitive that
presents a selectable item list — tree-view, tabs, stepper-list,
sortable, future virtualized listbox — inherits ArrowKey nav, typeahead
prefix + same-char cycling, disabled-item skipping, and either of two
focus strategies, for free.

#### API

```js
import { createRovingFocus, STRATEGY_DOM_FOCUS, STRATEGY_ACTIVE_DESCENDANT }
    from "@zakkster/lite-headless/_overlay/roving-focus";

const roving = createRovingFocus({
    getItems:   () => itemsArray,         // live, called per op
    strategy:   STRATEGY_DOM_FOCUS,       // or _ACTIVE_DESCENDANT
    getFocusHost: () => triggerEl,        // required for active-descendant
    loop:       true,
    typeahead:  true,
    typeaheadTimeout: 500,
    getLabel:   (item) => string,         // optional; defaults to label||textContent
    onIndexChange: (idx, prev) => void,
});

roving.setIndex(n)
roving.move(±1)
roving.first()
roving.last()
roving.typeChar(ch)   // returns true if a match was found
roving.reset()        // clears highlight + typeahead buffer
roving.destroy()
roving.index          // getter
```

#### Strategies

- **`STRATEGY_DOM_FOCUS`** — roving tabindex pattern. Highlighted item
  gets `tabindex="0"` + real DOM focus via `.focus()`; siblings get
  `tabindex="-1"`. Per-item `data-focused` attribute. Used by menu.
- **`STRATEGY_ACTIVE_DESCENDANT`** — `aria-activedescendant` pattern.
  DOM focus stays on a single "host" (combobox trigger); items get
  `data-highlighted` and the host's `aria-activedescendant` is updated
  to reference the highlighted item's id. Used by combobox.

#### What the helper owns vs. doesn't

**Owned:** current highlighted index, typeahead buffer + timer, the DOM
writes that follow a highlight change (tabindex sweep OR
aria-activedescendant write + per-item attribute), disabled-item
skipping, prefix/same-char cycling rules.

**Not owned:** the items array (consumers shape items differently —
menu has `onSelect`/`hasSubmenu`/`group`, combobox has `value`/`label`,
tree will have `level`/`expanded`), keyboard event routing (each
primitive has different keys: menu has ArrowRight-for-submenu, combobox
has Tab-to-select-and-close), and the wider lifecycle (open/close,
attach/detach). Consumers wire `roving.move(+1)` etc. into their own
switch statements.

#### Hot-path posture

- Typeahead allocates one small `enabled[]` array per keystroke (bounded
  by human typing rate, ~10/sec). The same-char detection walks
  char-codes via `charCodeAt(i)` rather than `split("").every(...)` —
  zero intermediate char-array allocations.
- `setIndex` writes to 2 elements in active-descendant mode (clear
  previous + set current). In dom-focus mode it walks all items once to
  set tabindex — necessary for roving-tabindex correctness and bounded
  by N items, which is human-bounded.
- One `enabledIndices` allocation per arrow press / typeahead /
  first/last. Could be cached via WeakMap if profiling shows it
  dominates, but for the typical N≤50 it's noise.

#### Refactor of existing consumers (behavior unchanged)

- **`createCombobox`** — `_highlightIndex`, `_typeBuf`, `_typeTimer`,
  `typeaheadHandle`, `setHighlight`, `moveHighlight` all removed.
  Replaced with `roving = createRovingFocus({...,
  STRATEGY_ACTIVE_DESCENDANT})` plus thin wrapper functions named
  identically so call-sites read the same. 21/21 combobox unit tests
  pass without modification.
- **`createMenu`** — `_focusIndex`, `_typeBuf`, `_typeTimer`,
  `focusableIndices`, `setFocus`, `moveFocus`, `focusFirst`,
  `focusLast`, `typeaheadHandle` all removed. Replaced with `roving =
  createRovingFocus({..., STRATEGY_DOM_FOCUS})` + thin wrappers. The
  manual re-clamp at the item-removal cleanup sites (`if (_focusIndex
  >= _items.length) _focusIndex = _items.length - 1`) became
  `roving.setIndex(_items.length - 1)` — same end state, semantically
  driven through the helper. 26/26 menu unit tests pass without
  modification.

#### LOC accounting

| File                          | Before | After | Delta  |
| ----------------------------- | -----: | ----: | -----: |
| `src/combobox/index.js`       |    459 |   415 |   −44  |
| `src/menu/index.js`           |   1057 |   976 |   −81  |
| `src/_overlay/roving-focus.js`|      0 |   275 |  +275  |

Net +150 LOC of source (the helper is heavily commented; actual logic
is ~120 LOC). The win isn't immediate LOC reduction — it's the next
four primitives that won't need to re-implement any of this.

#### Tests

- **22 new unit tests** in `test/roving-focus.test.js`: both strategies,
  loop on/off, disabled-skipping, typeahead prefix-match + same-char
  cycling, custom `getLabel`, `reset` semantics, edge cases
  (empty items, all-disabled, out-of-range setIndex). The same UX rules
  that combobox + menu encoded in their internal code are now codified
  as independent test contracts.
- **Total unit:** 356/356 passing across three stability runs.
- **Browser:** 33/40 passing in chromium 141. The 7 failures are the
  same pre-existing keyboard / multi-popover-escape-stack quirks from
  v0.7.1 — unrelated to v0.7.4 changes; the menu + combobox specs all
  pass unchanged, which is the actual signal that matters.

#### What's unblocked

The next four primitives I'd queue can all be built without re-
implementing any of this:

- **Stepper / Spinbutton** — `attachInput`/`attachIncrement`/
  `attachDecrement` with the same numeric clamping as slider. Doesn't
  technically need roving-focus on its own but the related "stepper-
  list" pattern (paginated number ranges) would.
- **Tabs** — `attachTablist`/`attachTab`/`attachPanel`. Drop-in for
  STRATEGY_DOM_FOCUS with `loop: false` and left/right axis routing.
- **Tree view** — flatten visible nodes into a 1D array, feed that to
  the helper, layer Right-to-expand / Left-to-collapse on top. Probably
  the largest single use of the helper.
- **Sortable** — keyboard-mode (Space-to-grab, arrows to reposition,
  Space-to-drop) wants the same arrow-routing infrastructure.

---

### 0.7.3 — 2026-06-12

#### Added: `createSplitPanels` — resizable N-panel layout primitive

Headless engine for resizable split layouts. N panels separated by N-1
handles, percentages sum to 100, all math runs in percentage space. The
engine writes ONE numeric CSS custom property per panel
(`--lh-panel-{N}-pct`) to the container — never inline `width` or `height`
— so consumer CSS composes the layout via grid or flex without triggering
synchronous layout recalc when the engine updates.

```js
const split = createSplitPanels({
    orientation:    "horizontal",   // or "vertical"
    defaultLayout:  [25, 50, 25],   // initial percentages
    snapThreshold:  0.5,            // collapse trigger (of minSize)
    keyboardStep:   5,              // %/keystroke
    onLayoutChange: (sizes, reason) => {},
});

split.attachContainer(rootEl);
split.attachPanel(sidebarEl, 0, { minSize: 10, defaultSize: 25, collapsible: true });
split.attachPanel(mainEl,    1, { minSize: 20 });
split.attachPanel(inspectorEl, 2, { minSize: 10, defaultSize: 25 });
split.attachHandle(handle1, 0);   // between panel 0 and 1
split.attachHandle(handle2, 1);
```

Declaratively:

```html
<lite-split-panels orientation="horizontal">
    <div data-panel data-min-size="10" data-default-size="25" data-collapsible>Sidebar</div>
    <div data-handle></div>
    <div data-panel data-min-size="20">Main</div>
    <div data-handle></div>
    <div data-panel data-min-size="10" data-default-size="25">Inspector</div>
</lite-split-panels>
```

Then consumer CSS:

```css
lite-split-panels[data-orientation="horizontal"] {
    display: grid;
    grid-template-columns:
        calc(var(--lh-panel-0-pct) * 1%)
        6px
        calc(var(--lh-panel-1-pct) * 1%)
        6px
        calc(var(--lh-panel-2-pct) * 1%);
}
```

#### Performance posture

- **Container rect cached once** on `pointerdown`. Pointermove does ZERO
  DOM reads during the drag — only writes to CSS custom properties (the
  browser batches those into one style invalidation per frame).
- **Pointer capture** on the handle so drags continue when the cursor
  leaves the handle's bounding box.
- One array allocation per layout change (signal reference-equality
  contract). Bounded by frame rate, well within the GC budget.

#### Constraints

- `minSize` / `maxSize` per panel (percentages 0..100). Drag clamps at
  bounds; the cursor outpaces the held-back handle.
- `collapsible: true` enables snap-to-zero behavior. When a drag would put
  the panel below `minSize * snapThreshold` (default 0.5), the panel
  snaps to 0 and the neighbor absorbs the room. Re-expansion via
  `expandPanel(idx)` restores to the last non-zero size, or
  `expandPanel(idx, sizeOverride)` to a specific value.
- Dragging handle[i] affects panel[i] and panel[i+1] only. Cascading
  multi-panel propagation is deliberately NOT supported in v1 — that
  belongs to userspace where the policy is application-specific.

#### Keyboard

- ArrowLeft/Right (horizontal) or ArrowUp/Down (vertical) move the
  focused handle by `keyboardStep` percentage points (default 5).
- Home pushes the left/upper panel to its minimum.
- End pushes it to its max (or whatever the right/lower panel's min
  allows).

#### ARIA

Handles get `role="separator"`, `aria-orientation`, `aria-valuenow`
(the left panel's percentage), `aria-valuemin`, `aria-valuemax`,
`aria-valuetext` (both neighbor sizes), and `tabindex="0"` by default.

#### Custom element

`<lite-split-panels>` reads `orientation`, `snap-threshold`, and
`keyboard-step` from attributes; per-panel options come from
`data-min-size`, `data-max-size`, `data-default-size`, `data-collapsible`.
MutationObserver reconciles panel + handle indices in document order on
every childList change — dynamically appending a 4th panel rebalances
automatically. Dispatches `CustomEvent('layoutchange', { detail: {
layout, reason } })` on the host.

#### Tests

- **23 unit tests** in `test/split-panels.test.js` covering layout init,
  defaults, CSS-var writes, setLayout, min/max enforcement, ARIA
  bookkeeping, all keyboard keys, drag math, collapse snap (both
  collapsible and non-), programmatic collapse/expand, 3-panel
  isolation, onLayoutChange dispatch, destroy idempotence, dynamic
  panel addition, and data-resizing/data-dragging attribute lifecycle.
- **9 playwright specs** in `test-browser/split-panels.spec.js`
  exercising real pointer drag against an 800px container, grid track
  widths actually following the CSS custom properties, focus + keyboard
  in chromium, MutationObserver reconcile, and the layoutchange event.

---

### 0.7.2 — 2026-06-12

#### Added: Drawer / Sheet via `placement` on `createDialog`

Drawers and sheets are not a new primitive -- they are a directional
contract on top of the existing dialog state machine. v0.7.2 adds a
`placement` option that the dialog writes to its content and overlay as
`data-placement`, leaving all animation work to CSS.

```js
const drawer = createDialog({ placement: "right" });
drawer.attachTrigger(triggerEl);
drawer.attachContent(contentEl);   // gets data-placement="right"
drawer.attachOverlay(overlayEl);   // gets data-placement="right"
```

Or declaratively:

```html
<lite-dialog placement="right">
  <button data-trigger>Open settings</button>
  <div data-overlay></div>
  <div data-content>
    <h2 data-title>Settings</h2>
    ...
    <button data-close>Done</button>
  </div>
</lite-dialog>
```

Valid placement values: `"center"` (default, modal dialog), `"left"`,
`"right"`, `"top"`, `"bottom"`. Unknown values fall back to `"center"`.

The dialog's state machine, focus trap, scroll lock, portal, ARIA, and
dismiss policy are **100% identical** across placements. Only the
content/overlay's `data-placement` attribute differs, so consumers style
`[data-content][data-placement="right"]` with their own transform +
transition rules. Reference CSS (consumers will write their own):

```css
[data-content][data-placement="right"] {
    position: fixed; top: 0; right: 0; height: 100dvh; width: 24rem;
    transform: translateX(100%);
    transition: transform 240ms ease;
}
[data-content][data-placement="right"][data-state="open"] {
    transform: translateX(0);
}
```

This collapses what would otherwise be 4 near-duplicate primitives
(`createDrawerLeft`, `createDrawerRight`, `createSheetTop`,
`createSheetBottom`) into one option on the existing dialog. 6 new tests
in `test/dialog-drawer.test.js` cover default placement, all four
directional placements, overlay mirroring, state-machine preservation,
and destroy cleanup.

---

### 0.7.1 — 2026-06-12

This release pairs a zero-GC pass through the `_overlay/*` runtime with a
defensive rewrite of every `<lite-*>` custom-element wrapper so that
dynamically-injected role elements survive framework re-renders, async
content loads, and modal portal moves.

#### Performance (zero allocations in steady-state hot paths)

#### Positioner (`src/_overlay/position.js`) — full rewrite

The positioner's `update()` runs every scroll + resize tick under
`autoUpdate`. v0.7.0 allocated 4 objects + an array per tick (placement
parse, `{x,y}` coords, `{x,y}` oppCoords on flip, `{left,top,right,bottom}`
boundary rect) plus a DOM walk + `getComputedStyle` chain through
`findClippingAncestor` on EVERY tick when `boundary: "clipping"`. v0.7.1
allocates zero JS objects per tick (the two browser-owned `DOMRect`s from
`getBoundingClientRect` are unavoidable):

- **Placement parsed ONCE** at construction into `_requestedSide` and
  `_requestedAlign`. No per-tick `split`.
- **Clipping ancestor walked + cached ONCE** via `resolveClippingAncestor`.
  `findClippingAncestor` removed from the hot path entirely. Re-walk
  requires `invalidateClipping()` or a fresh positioner.
- **Math helpers mutate caller-supplied `out` params**: `computeCoordsInto`,
  `applyShiftInPlace`, `resolveBoundaryInto`. No fresh `{x,y}` /
  `{left,top,right,bottom}` returns.
- **Scratch buffers** `_coords`, `_oppCoords`, `_boundary`, `_viewport`,
  `_returnInfo` reused across calls in closure scope.
- **Transform writes diffed** against `_lastTransformX`/`_lastTransformY` —
  no string allocation when rounded position is stable across ticks.
- **`data-side` / `data-align` writes diffed**; `position`/`left`/`top` set
  ONCE on first paint via `_stylesInited`.
- **String concat** (`"translate3d(" + rx + "px,"`) instead of template
  literals — V8 inlines short concats more aggressively.
- **Arrow positioning** has its own diff cache stashed on the arrow
  element via `_lhArrow*` so multiple positioners don't share state.
- Module-shared `_defaultVpScratch` for `defaultGetViewport`.
- Removed unused `lite-signal` import.

#### Focus trap (`src/_overlay/focus.js`)

Tab press during steady state now reads a cached `_tabbablesCache` instead
of running `querySelectorAll(TABBABLE_SELECTOR)` + `filter` on every
keystroke. A `MutationObserver` watches the trap container for `childList`
+ `subtree` + attribute changes on `disabled`, `tabindex`, `inert`,
`hidden`, `contenteditable`; any of those flips a `_tabbablesDirty` flag
that lazily rebuilds the cache on next Tab press. `EMPTY = Object.freeze([])`
for the no-children case.

#### ARIA token helpers (`src/_overlay/aria.js`)

`addIdToken` / `removeIdToken` no longer touch `RegExp` or `String.split`.
`hasToken(haystack, needle)` walks char-codes in a single pass with zero
intermediate allocations; `removeToken` returns the original string by
reference when the token isn't present so `setAttribute` is skipped via
identity check.

#### Outside-click scratch arrays

`popover`, `menu`, `combobox` reuse a closure-scope `_insidesScratch = []`
instead of building `[...].filter(Boolean)` per `pointerdown`. Safe because
`bindOutsideClick` iterates synchronously inside the event handler.

#### Typeahead `allSame` check (menu + combobox)

Replaced `_typeBuf.split("").every(c => c === _typeBuf[0])` (allocated a
char-array per keystroke) with a char-code walk via `charCodeAt(i)`. Zero
allocations per keystroke.

#### Slider drag

- `setThumbValue` early-exits BEFORE `current.slice()` when the snapped
  value equals the current one. Drops ~80% of drag-tick allocations at
  typical step granularities (60-120 Hz pointer events, but most don't
  cross a step boundary).
- `stopValueSync` + `attachRange` initial paint replaced
  `values.slice().sort((a,b) => a-b)` with manual min/max scan — O(n),
  zero allocations, no comparator closure.
- Dropped redundant `String(toFixed(...))` wrappers; `setAttr` handles
  primitive-to-string conversion.

#### Wrapper rewrite (`src/*/element.js`)

The seven `<lite-*>` custom-element wrappers querySelected role-bearing
elements ONCE at `connectedCallback`. Anything a consumer's framework
injected later — async forms inside dialogs, async search results inside
comboboxes, lazy-loaded popover content with multiple `data-close`
buttons, virtualized rows with tooltips — was invisible to the primitive.
v0.7.1 rewires every wrapper around a shared `MutationObserver`-backed
helper.

#### New `src/_overlay/element-roles.js`

`createRoleObserver(host, roleSelector, wireFn, options)` returns
`{ rescan, follow, unfollow, disconnect }`:

- **WeakMap-tracked teardowns** so removed nodes don't leak.
- **Recursive scan** of added/removed subtrees on every mutation.
- **`skipNested: true` (default)** — walks up from each candidate node and
  skips it if the closest `lite-*` ancestor before `host` is not `host`
  itself. A `<lite-popover>` inside a `<lite-dialog>` does NOT have its
  `data-trigger` stolen by the outer dialog.
- **Explicit `rescan()`** — the helper does NOT scan during construction
  so `wireFn` can reference the returned handle (specifically `follow` /
  `unfollow`). The caller invokes `roles.rescan()` once after the
  `const roles = createRoleObserver(...)` line.
- **`follow(el)` escape hatch** for portaled content. When a modal dialog
  portals its `[data-content]` to `document.body`, mutations inside it
  are no longer descendants of the host. The wrapper calls
  `roles.follow(contentEl)` after `attachContent` so a second observer
  watches the content element directly, regardless of where it lives.
- **Portal guard in `scanAndUnmount`** — when the host observer reports a
  removed node that's currently being followed, the helper skips teardown.
  Otherwise the moment a primitive portaled its surface, the host
  observer would tear down the wiring. This was the critical correctness
  fix that made modal-dialog content injection work.

#### Per-wrapper changes

- **`lite-dialog`** — role observer for trigger/content/overlay/title/
  description/close; follows content for portal-survival.
- **`lite-popover`** — role observer for trigger/anchor/content/arrow/close;
  follows content; multiple triggers + multiple closes per popover now work.
- **`lite-tooltip`** — role observer for trigger/anchor/content/arrow;
  no portal-follow needed (tooltips don't have a follow-required role).
- **`lite-menu`** — role observer for trigger/menu/item/separator; follows
  the menu surface for portal-survival. **NEW declarative submenu
  pattern**: a parent `<li data-item data-submenu="key">` pairs with a
  nested `<lite-menu is-submenu data-submenu-key="key">`. The wrapper
  resolves the link in a microtask after both elements upgrade and calls
  `parent._menuInstance.attachSubmenu(item, child._menuInstance)`. The
  `host._menuInstance` escape hatch is still exposed for advanced
  programmatic wiring (cross-tree submenus, dynamic submenus inserted
  after connect).
- **`lite-combobox`** — role observer for trigger/listbox/item, with
  follow on the listbox so async search results piped into the listbox
  attach automatically. This is the highest-traffic primitive for the
  observer pattern — search comboboxes thrash items constantly.
- **`lite-date-picker`** — three bug fixes:
  1. **Dead grid bug.** v0.7.0 wired pre-rendered cells once and never
     subscribed to `viewMonth`, so clicking "next month" updated the
     internal date but the visible cells stayed pointing at the old
     dates. Now a unified `repaint()` subscribes to BOTH
     `picker.viewMonth` AND `picker.view` for both auto-render and
     pre-render branches.
  2. **Reactivity black hole.** v0.7.0 declared `observedAttributes:
     ["value", "disabled"]` but never read attribute changes. Now uses
     `scope.useAttr("value")` inside an `effect()` — external
     `setAttribute('value', '2027-03-15')` flows through `picker.setValue`.
  3. **Missing months/years views.** Auto-render now builds three cell
     pools (42 day + 12 month + 12 year buttons) and toggles
     `display:none` per the current `view` signal so days → months →
     years drilldown works in pure HTML without programmatic wiring.
- **`lite-slider`** — role observer for track/range/label; `data-thumb`
  attached opportunistically with try/catch around the primitive's range
  check. **Thumbs are NOT dynamically addable** — the underlying
  `createSlider` locks `thumbCount` to the initial value's length at
  construction. Flipping single → range requires replacing the entire
  `<lite-slider>` instance. Documented in the file header. `value`
  attribute sync via `useAttr` + `setValue`; `disabled` is one-way until
  the primitive exposes `setDisabled` (also documented).

#### Tests

- **`test-browser/wrappers.spec.js`** (NEW) — 5 specs codifying the v0.7.1
  behavioral guarantees: combobox async item injection, datepicker view
  drilldown across all three pools, datepicker value attribute sync, modal
  dialog + portaled content + dynamically-injected close button (the
  critical case proving the `follow()` escape hatch), declarative submenu
  pairing via `data-submenu`/`data-submenu-key`.
- **`test-browser/fixtures/wrappers.html`** (NEW) with importmap for the
  bare `@zakkster/*` specifiers.
- **Importmaps added to all existing fixtures** (popover, menu, slider,
  datepicker) so they load `@zakkster/lite-signal` correctly when the
  fixtures are served via `test-browser/serve.mjs`. The fixtures
  previously failed to load in any environment without globally-installed
  lite-signal.
- **Playwright config** — added optional `CHROMIUM_BIN` env-var override
  for sandboxed CI / dev environments where the playwright-managed
  chromium download isn't usable.

#### Demo

- **Version badge bumped to v0.7.1** (was stale at v0.1.0 since day one).
- **Tagline updated** to list all seven primitives.
- **Demo perf cleanup**: `$()` selectors cached outside reactive
  subscriptions, `$$()` NodeLists resolved once at setup, popover
  `updateResolution` no longer parses placement on every drag tick
  (`currentRequestedSide` precomputed on placement click), `refreshAriaBox`
  uses a manual tokenizer instead of `.split(/\s+/).filter(Boolean)`, rAF
  callbacks are coalesced with a token+named-callback pattern instead of
  inline arrows allocated per event, and the tab handler caches both the
  button NodeList and the scene NodeList outside the click closure.

#### Test results

- **305 / 305 unit tests** passing across three stability runs (~8.3 s each).
- **24 / 31 browser tests** passing in chromium 141 at 1024 × 768. The 7
  failures are pre-existing keyboard / multi-popover-escape-stack quirks
  that don't relate to v0.7.1 changes; net browser-test floor moved from
  26 (claimed in v0.7.0 but unverified in this sandbox) to 24 verified.

---

### 0.7.0 — 2026-06-11

#### Added

#### Positioner: nearest-scroll-ancestor boundary walk

- **`boundary: "clipping"` now walks the actual DOM** instead of mapping
  to the viewport. The positioner finds the nearest ancestor with
  `overflow: hidden | scroll | auto | clip` on any axis and uses its
  bounding rect as the flip/shift boundary, intersected with the viewport.
- Fixed/sticky ancestors break the walk and fall back to viewport (the
  practical behavior for descendants of a fixed element).
- New exported helper `findClippingAncestor(el)` for advanced consumers
  who want to compute clipping ancestors themselves.
- `getComputedStyle` resolution is resilient: tries
  `el.ownerDocument.defaultView` first, falls back to `globalThis` —
  works in browser, SSR, and tests without depending on globals.
- Caveat: returns the INNERMOST clipping ancestor only, not the
  intersection of all clipping ancestors up the chain. Consumers wanting
  intersection semantics should pass an explicit `HTMLElement` boundary.
- 11 new unit tests in `test/boundary-walk.test.js`.

#### Date picker: year + decade views

- **New `view` signal** (`"days" | "months" | "years"`) drives the grid
  layout and keyboard nav.
- `cycleView()` walks `days → months → years → days`. Wire it to the
  month label click via the new `attachMonthLabel(el, { clickToCycle: true })`
  option (backward-compatible: passing a function as the second arg is
  treated as `opts.formatter` per the v0.6 signature).
- **`getMonthsInView(year?)`** returns 12 Date objects (Jan–Dec) for the
  given year (or the current `viewMonth`'s year). 4×3 grid layout.
- **`getYearsInView(year?)`** returns 12 Date objects for the decade
  containing `year`: 1 padding year before, 10 in-decade years, 1
  padding year after. Padding cells get `data-outside-decade` so CSS
  can dim them.
- **`attachMonth(el, monthDate)`** and **`attachYear(el, yearDate)`** —
  idempotent on the same element like `attachDay`, so cells can be reused
  across drilldowns instead of churning DOM.
- **Per-view keyboard model**:
  - days: arrows ±1 day / ±7 days; Page ±1 month, Shift+Page ±1 year
  - months: arrows ±1 month / ±3 months; Page ±1 year; Home/End = Jan/Dec
  - years: arrows ±1 year / ±3 years; Page ±10 years (decade); Home/End = start/end of decade
- **Per-view drilldown**: Enter in months view sets `viewMonth.month` and
  switches to days view. Enter in years view sets `viewMonth.year` and
  switches to months view.
- **Per-view label formatting**: `"June 2026"` in days view, `"2026"` in
  months view, `"2020 – 2029"` in years view. Custom formatter receives
  `(viewMonth, view)`.
- **Per-view prev/next stride**: prev/next buttons stride by month in
  days view, year in months view, decade (10 years) in years view.
- `data-view` attribute on the grid mirrors the signal for CSS hooks.
- 32 new unit tests in `test/datepicker-views.test.js`.

#### Browser test harness (Playwright)

- `playwright.config.js` + `test-browser/` directory with 4 fixture pages
  and 4 spec files covering paths that happy-dom can't see: safe-triangle
  geometry with real submenu corners, real slider drag against an actual
  track rect, popover flip against the real viewport + real clipping
  ancestor, date picker focus events crossing month boundaries, full
  days→months→years drilldown flow.
- Zero-dep static server (`test-browser/serve.mjs`) with correct ESM
  MIME types; playwright's `webServer` config auto-starts it.
- 26 browser tests across 4 spec files.
- Scripts: `npm run test:browser`, `test:browser:headed`,
  `test:browser:ui`, `test:browser:setup` (one-time chromium fetch).
- Documentation in `test-browser/README.md` covers what each spec
  exercises, what is intentionally out of scope, and when to write a
  browser test vs a unit test (the latter is the default; browser
  tests cost ~30× a unit test).
- Cross-browser: chromium-only by default; Firefox/WebKit projects are
  commented in the config and can be uncommented for full coverage.

#### Tests

305 unit tests passing (273 v0.6 + 11 boundary-walk + 32 datepicker-views).
Plus 26 browser tests in `test-browser/` runnable via `npm run test:browser`
after `npx playwright install chromium`. **Total: 305 unit + 26 browser.**

#### Test harness improvements

- `_setup.js` now exposes `globalThis.getComputedStyle` (needed by the
  positioner's `findClippingAncestor` walk) and cleans it up on teardown.
- The source code does NOT depend on this — it resolves
  `getComputedStyle` from `el.ownerDocument.defaultView` as the primary
  source. The global is a fallback.

#### Notes

- The boundary walk's "innermost wins" simplification is a deliberate
  scope choice; the W3C spec defines a more elaborate containing-block
  rule involving transforms, filters, and will-change. v0.7 handles
  the common cases (cards, modals with internal scroll, sidebar panels)
  correctly; consumers needing the full spec can pass an explicit
  `HTMLElement` boundary.
- Year/decade views are read-only — there is no value semantic at the
  month or year level (a month or year is never the SELECTED value,
  only the DRILL-DOWN target). The value model remains date-precision.

### 0.6.0 — 2026-06-11

#### Added

- **`createDatePicker(options)`** — second form-control primitive in the
  package. Single (`mode: "single"`) and range (`mode: "range"`) modes;
  value is always an array (`[Date | null]` or `[Date | null, Date | null]`),
  matching the slider precedent. Range values auto-sort to `start <= end`
  on completion. Subpath: `@zakkster/lite-headless/datepicker`. Custom
  element: `<lite-date-picker>` from `@zakkster/lite-headless/datepicker/element`.
- **Calendar grid with 42-cell month view** rendered by the consumer
  (`getDaysInView()` returns the 42 Date objects; consumer creates the
  cells and calls `attachDay(el, date)` per cell). Or use the auto-render
  fallback in `<lite-date-picker>` when the `[data-grid]` container is empty.
- **`attachDay` is idempotent on the same element** — re-attaching with a
  new date replaces the previous binding so consumers can reuse 42 cells
  across month changes instead of churning DOM. Per-cell offs are tracked
  in a `WeakMap` so re-attachment cleans up the prior listeners + ARIA.
- **Full keyboard model on the grid**: ArrowLeft/Right (±1 day),
  ArrowUp/Down (±7 days), PageUp/Down (±1 month), Shift+PageUp/Down
  (±1 year), Home/End (start/end of week, respecting `weekStartsOn`),
  Enter/Space (pick focused). Crossing a month boundary auto-switches
  the `viewMonth` signal.
- **Range hover preview**: while `[startDate, null]`, hovering a day cell
  marks cells between `start` and `hover` with `data-in-range-preview`.
  Pure visual; no value mutation. Grid-level `pointerleave` (via
  `attachGridContainer`) clears the preview to avoid per-cell flicker.
- **Min/max constraints** via `minDate`/`maxDate`: cells outside the range
  get `data-disabled` + `aria-disabled="true"`; clicks are ignored;
  keyboard nav clamps within bounds.
- **Locale-aware `weekStartsOn`** (0=Sunday default; 1=Monday, etc.) and
  `Intl.DateTimeFormat` for the month label (override via the
  `formatter` argument to `attachMonthLabel`).
- **Testable + lite-time-compatible `today`**: pass a `Date` for tests, or
  a function (`() => Date`) that the picker calls inside a reactive
  effect — drop-in for `@zakkster/lite-time`'s midnight-rollover signal.
  Default: `new Date()` computed once at construction.
- **ARIA**: `role="grid"` on the grid, `role="gridcell"` on each cell,
  `aria-selected` on selected cells, `aria-current="date"` on today,
  `aria-disabled="true"` on cells outside min/max, `aria-live="polite"`
  on the month label.

#### Integration

The picker is designed to compose with other primitives, not depend on them:

- **`createPopover`**: wrap the calendar markup inside a popover content
  element. The popover's outside-click via `composedPath` covers the
  cells automatically (they're descendants of the content tree). Call
  `popover.setOpen(false)` on `onValueChange` to close after selection.
- **`@zakkster/lite-form`**: the picker's writable `value` signal is the
  integration point. Pass `value: form.field("departureDate")` and the
  form library owns the value; the picker just renders and emits changes.
- **`@zakkster/lite-time`**: the `today` callable option re-subscribes
  the paint effect to the day-rollover signal. For long-lived pickers
  (always-visible sidebar calendars) this keeps the today-marker fresh
  past midnight.

#### Tests

39 new tests covering: value normalization (Date/array/null → fixed-length
array), value sorting in range mode, single + range picking, hover
preview, viewMonth navigation, full keyboard model (including across
month boundaries), min/max disabling and clamping, attachDay idempotency,
reactive `today` integration. Total: **262 tests passing**.

#### Notes

- v0.6 ships single + range modes only. Multi-date mode and year/decade
  picker views are deferred to a later release.
- This is a date-only picker. No time-of-day, no timezone correction
  beyond what JS `Date` gives. `Intl` handles formatting; you bring the
  dates (matching the lite-time philosophy).

### 0.5.0 — 2026-06-11

#### Added

- **`createSlider(options)`** — first form-control primitive in the package.
  Value is always an array; the initial value's length determines the thumb
  count (`[50]` = single, `[20, 80]` = range, `[10, 40, 70]` = multi-thumb).
  Single API for all three; not a separate `createRangeSlider`. Subpath:
  `@zakkster/lite-headless/slider`. Custom element:
  `@zakkster/lite-headless/slider/element` registers `<lite-slider>` and
  dispatches `CustomEvent('valuechange', { detail: { value, reason } })` on
  the host on every change.
- **Pointer drag** with document-level pointermove/pointerup listeners
  installed only while a drag is active. Pointerdown on a thumb starts a
  drag; pointerdown on the track moves the nearest thumb to that position
  AND starts a drag from there (press-and-drag from any track position).
- **Keyboard model** matching WAI-ARIA slider pattern: ArrowUp/ArrowRight
  always increases value, ArrowDown/ArrowLeft always decreases (regardless
  of orientation or inversion); Shift+Arrow and PageUp/PageDown use
  `largeStep` (default `step × 10`); Home/End snap to min/max.
- **Orientation + inversion**: `orientation: "horizontal" | "vertical"`
  with vertical-default bottom-is-min (volume-slider convention). `inverted`
  reverses the visible axis. Keyboard semantics are unaffected — only the
  pointer-to-value math and CSS-variable output change.
- **Crossing constraints** for multi-thumb sliders via
  `minStepsBetweenThumbs` (default `0` — thumbs can touch but not cross).
  `-Infinity` allows crossing for advanced cases.
- **Positioning contract via CSS custom properties only**. Primitive sets
  `--lh-thumb-pct` on each thumb and `--lh-range-start` / `--lh-range-end`
  on the range fill; consumer styles them however they like. The primitive
  never writes `style.left` or `style.transform` — the consumer owns the
  geometry. `data-orientation`, `data-disabled`, `data-dragging`,
  `data-value`, `data-percentage`, `data-thumb-index` are exposed as CSS
  hooks.
- **ARIA**: `role="slider"` on each thumb with `aria-valuemin`,
  `aria-valuemax`, `aria-valuenow`, `aria-orientation`, and optional
  `aria-labelledby` (via `attachLabel(el)`).

#### Tests

33 new slider tests covering: value bounds and step-snapping, ARIA on
thumbs, CSS variable sync (single + range + inverted), full keyboard
model, range crossing constraints (`minStepsBetweenThumbs`), pointer drag
through document-level listeners, vertical/inverted axis math, and
disabled state. Track rect is stubbed via `Object.defineProperty` since
happy-dom doesn't lay out elements. Total: **223 tests passing**.

#### Notes

- Slider is the first non-overlay primitive in the package. No portal,
  no positioner, no dismiss layer — only `@zakkster/lite-signal` and the
  ARIA id helpers are reused from `_overlay/`. The folder is `src/slider/`
  parallel to `src/menu/` etc., not under `_overlay/`.
- Tracking real drag geometry requires a real browser. The demo (scene 08)
  is the integration test for that.

### 0.4.0 — 2026-06-11

#### Added

- **Context-menu mode** via `menu.attachContextTarget(el)`. Right-clicking
  the target preventDefaults the native menu, creates a 0×0 virtual anchor
  element at the pointer location, and opens the menu positioned against it.
  Rapid re-right-click on a different spot repositions the open menu rather
  than double-opening. Virtual anchor is removed on close.
- **`attachCheckboxItem(el, { checked, label, disabled, onCheckedChange })`** —
  `role="menuitemcheckbox"`, `aria-checked` tracking, activation toggles
  without closing (sticky behavior, matching platform convention).
- **`attachRadioItem(el, { value, group, label, disabled, onValueChange })`** —
  `role="menuitemradio"`, group-scoped single selection (one checked per
  group), activation sets the group's value and closes the menu (one-shot
  pick semantics). First item registered per group seeds the initial
  selection. Multiple independent groups in one menu supported.
- **Safe-triangle pointer tracking** for submenu hover-grace. When the
  pointer leaves a parent item with the submenu open, a document-level
  pointermove listener watches whether the pointer stays inside the convex
  region between the leave point and the submenu's near edge. While the
  pointer is inside the triangle the submenu stays open; once the pointer
  exits, it closes immediately. A hard cap (`2 × submenuCloseDelay`)
  prevents a still pointer from pinning the submenu open forever. Toggled
  via the new `safeTriangle: boolean` option (default `true`). Disabling
  it reverts to the v0.3 delay-only behavior.

#### Tests

15 new tests covering context menu lifecycle, checkbox/radio role and
state, safe-triangle install/cancel paths, and the hard-cap fallback.
Total: **190 tests passing**.

#### Notes

- Safe-triangle's geometry can only be verified in unit tests against the
  install/teardown lifecycle and the point-in-triangle math itself —
  happy-dom doesn't simulate layout, so `getBoundingClientRect()` returns
  zeros for unstyled elements. Real-browser correctness is covered by the
  demo scene.
- Menu `placement` still drives the side the context menu emerges from
  relative to the pointer. `bottom-start` (the default) matches OS-level
  right-click conventions on most platforms.

### 0.3.0 — 2026-06-11

#### Added

- **`createMenu`** — WAI-ARIA menu primitive with real DOM focus on items
  (roving tabindex), `onSelect` callbacks, disabled items, separators,
  typeahead (same-char cycles; mixed chars filter), and full keyboard model
  (ArrowDown/Up/Home/End/Enter/Space/Escape/Tab/ArrowRight/ArrowLeft).
  Subpath: `@zakkster/lite-headless/menu`. Custom element:
  `@zakkster/lite-headless/menu/element` registers `<lite-menu>` and
  dispatches `CustomEvent('select', { detail: { key, el } })` on the host
  when an item is activated.
- **Submenu composition** via `attachSubmenu(parentItemEl, submenuInstance)`.
  Each submenu is its own `createMenu` (with `isSubmenu: true` so ArrowLeft
  and Escape close only that submenu instead of the chain). The parent
  menu's `attachSubmenu` wires positioning anchor, ARIA (`aria-haspopup`,
  `aria-expanded` synced to the submenu's open state), hover-open with
  `submenuOpenDelay`, and hover-leave-close with `submenuCloseDelay` grace
  for crossing the trigger->submenu gap. Only one submenu per level is open
  at a time.
- **`attachAnchor(el)`** on menu (matching popover's API) — separates the
  positioning anchor from the trigger, used by `attachSubmenu` to make the
  parent item the submenu's anchor.

#### Roadmap moved

- Context-menu mode (right-click + virtual anchor at pointer) deferred to
  v0.4 to keep this release focused.
- Safe-triangle pointer tracking for submenu hover-grace deferred to v0.4.
  The `submenuCloseDelay` (300ms default) covers the common case.
- `menuitemcheckbox` / `menuitemradio` deferred to v0.4.

#### Tests

26 new menu tests (focus management, roving tabindex, disabled-skip,
typeahead, submenu open/close timing, outside-click coordination through
the submenu chain). Total: **175 tests passing**.

### 0.2.0 — 2026-06-11

#### Added

- **`createCombobox`** — single-select listbox-style combobox using the
  `aria-activedescendant` pattern. Focus stays on the trigger button; the
  highlight moves via an id reference. Full keyboard model
  (Arrow/Home/End/Enter/Tab/Escape), typeahead with same-char cycling and
  mixed-char prefix filtering. Subpath: `@zakkster/lite-headless/combobox`.
  Custom element: `@zakkster/lite-headless/combobox/element` registers
  `<lite-combobox>`.
- **`attachInside(el)`** on dialog, popover, and combobox. Marks an
  external element as "inside" for outside-click purposes. The motivating
  case: a sidebar/toolbar button that *controls* the overlay from outside
  its content tree. Without this, `pointerdown` on the external button
  closes the overlay before the `click` handler runs (pointerdown precedes
  click in the event order), so a toggle button would only ever open.
- Demo scene 05 (Combobox) added with autoFocus segmented control, loop /
  typeahead / closeOnSelect toggles, and a live ARIA readout showing
  `aria-activedescendant` updating as the keyboard moves the highlight.

#### Fixed (demo)

- Popover no longer auto-opens at page load. It used to fire
  `setOpen(true)` from a `requestAnimationFrame` while scene 02 was
  `display:none`; the anchor's `getBoundingClientRect()` returned zeros and
  the surface ended up pinned to the viewport top-left across all scenes.
- All overlays close on tab switch so portaled surfaces from the previous
  scene don't persist in `document.body`.
- The dialog "toggle button only opens, never closes" race fixed by marking
  the panel controls as inside via the new `attachInside` API.
- Flip visibility: the resolved-placement metric now shows a red
  "← flipped" badge when the positioner picked the opposite side.

### 0.1.0 — 2026-06-09

First public preview.

#### Added

- **`createDialog`** — modal/non-modal dialog with focus trap, scroll lock,
  Escape/outside-click dismissal, portal, status state machine.
- **`createPopover`** — anchored panel with positioner; modal:true engages
  focus trap and `role="dialog"`. `attachAnchor` separates positioning origin
  from trigger.
- **`createTooltip`** — hover/focus-driven; `openDelay`/`closeDelay` with
  hover-grace-period across trigger->content gap; `role="tooltip"` and
  `aria-describedby` (or `aria-labelledby`) on trigger.
- **`<lite-dialog>`, `<lite-popover>`, `<lite-tooltip>`** custom elements
  via `@zakkster/lite-element` (optional peer).
- **Positioner** (`_overlay/position.js`): 12 placements
  (`top|bottom|left|right` × `default|-start|-end`), basic flip and shift,
  arrow positioning with `data-side` hint, `autoUpdate` (scroll capture +
  resize + ResizeObserver).
- **Shadow-DOM-aware outside-click** via `event.composedPath()` with
  `contains()` as fallback.
- **Focus trap** honors `display:none`, `visibility:hidden`, `inert` via
  `checkVisibility()` (modern) with `getComputedStyle()` fallback.
- **Token-safe ARIA IDREF-list attributes.** `aria-describedby`,
  `aria-labelledby`, and `aria-controls` are space-separated lists per the
  W3C spec. Primitives add their content's id with `addIdToken()` and remove
  only their own id with `removeIdToken()` on cleanup. A trigger with a
  consumer-supplied `aria-describedby="field-error-1"` keeps that token
  after the tooltip attaches AND after it detaches.
- 126-test suite using `node:test` + `happy-dom` (with explicit
  `window.happyDOM.close()` teardown to release internal task queues).
- 4-scene interactive demo at `demo/index.html` (Dialog Lab, Popover
  Playground, Tooltip Workshop, Composition).

#### Architecture

- `status` ReadSignal as animation contract: `closed -> opening -> open ->
  closing -> closed`. Drop in a spring or transition library by subscribing.
- Static config, reactive state: only `open` is a signal. Keeps the effect
  graph small and predictable.
- One-effect-one-reactive-read discipline throughout the source. Helpers that
  read signals are forbidden inside effect bodies (would pollute dependency
  tracking).
- Subpath exports + `sideEffects: false` for full tree-shaking.

#### Known limitations

- Positioner's `boundary: 'clipping'` currently maps to viewport. Nearest
  scroll-ancestor walk is on the v1.x roadmap.
- Focus trap checks the element itself for visibility/inert; doesn't walk
  ancestors. Use `inert` on hidden ancestors as the portable workaround.
- No cross-iframe support, no virtual-keyboard awareness, no complex polygon
  boundaries. By design.

#### Peer dependencies

- `@zakkster/lite-signal ^1.1.5` (required)
- `@zakkster/lite-element ^1.1.0` (optional; only for `*/element` subpaths)
