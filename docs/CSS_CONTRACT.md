# @zakkster/lite-headless CSS Contract

> Status: **canonical as of v0.11.0**. Prior to v0.11.0 the painted-attribute
> set was inconsistent across primitives (`data-state` had 9 different value
> spaces). This document is now binding for every primitive and every new
> wrapper added going forward.

The headless primitives never style anything. They paint a small, predictable
set of attributes onto the DOM so the consumer's CSS can target state from
the outside. This document is the canonical set of those attributes.

The taxonomy splits into four classes:

1. **ARIA attributes** — semantic state (W3C-compliant). Always present
   where a W3C role expects it. Drives screen readers + assistive tech.
2. **Boolean data-attributes** — layout hooks. Present when true, absent
   when false. Drives `[data-x] { ... }` CSS targeting.
3. **Enum data-attributes** — multi-state hooks with a small, fixed value
   space. `[data-x="foo"]` style targeting.
4. **Slot markers** — declarative role identification, set by the
   consumer's markup, read by the wrapper to auto-discover elements.
   Format: `data-<primitive>-<role>`. Examples: `data-drawer-content`,
   `data-bc-item`. These are inputs to the wrapper, not outputs.

Class 1 + Class 2 + Class 3 are **outputs** painted by the primitive.
Class 4 is an **input** read by the wrapper.

---

## Class 1: ARIA attributes

Every primitive that paints state also paints the appropriate ARIA
attribute. The data-attribute is the CSS hook; the aria-attribute is the
accessibility contract. **Both are always present together.**

| ARIA attribute        | Paired data-attribute  | When painted                                |
|-----------------------|------------------------|---------------------------------------------|
| `aria-expanded`       | `data-open`            | accordion item, combobox, dialog, popover, menu, drawer, tree node, dropdown |
| `aria-checked`        | `data-checked`         | switch, checkbox-like menu item             |
| `aria-pressed`        | `data-pressed`         | toggle button                               |
| `aria-current`        | `data-current`         | breadcrumb item, pagination item, step      |
| `aria-selected`       | `data-selected`        | tab, listbox option, calendar day, tree node |
| `aria-disabled`       | `data-disabled`        | any disabled interactive control            |
| `aria-invalid`        | `data-invalid`         | form field control with validation error    |
| `aria-required`       | `data-required`        | required form field                         |
| `aria-hidden`         | `data-hidden`          | element rendered but visually hidden        |
| `aria-live`           | (n/a)                  | banner, toast, notification-center          |
| `aria-modal`          | (n/a; pair with `data-open`) | modal dialog, modal drawer                   |
| `aria-haspopup`       | (n/a)                  | trigger that opens a popover/menu/dialog    |
| `aria-controls`       | (n/a)                  | trigger ↔ panel pairing                     |
| `aria-labelledby`     | (n/a)                  | dialog/drawer title binding                 |
| `aria-describedby`    | (n/a)                  | form field helper + error chain             |

Consumers should generally **target the data-attribute, not the
aria-attribute**, in CSS. The aria-attributes carry semantic load
(screen reader announcement, assistive-tech navigation) that style hooks
should not depend on.

```css
/* good */
lite-dialog [data-dialog-content][data-open] { transform: scale(1); }

/* avoid -- couples style to assistive-tech-facing attribute */
lite-dialog [data-dialog-content][aria-modal="true"] { transform: scale(1); }
```

---

## Class 2: Boolean data-attributes

Painted by presence. `[data-x]` is true; absence is false. Never use
`data-x="true"` or `data-x="false"` -- those are for enums (Class 3).

| Attribute          | Meaning                                                  | Used by                                              |
|--------------------|----------------------------------------------------------|------------------------------------------------------|
| `data-open`        | Currently shown / expanded / on                          | overlays (dialog, drawer, popover, menu, tooltip, combobox), accordion item, tree node, banner, card (collapsible) |
| `data-disabled`    | Interaction disabled                                     | menu item, tab, slider, switch, stepper, tree node, sortable, accordion item, pagination button |
| `data-checked`     | Toggleable in "on" position                              | switch, checkbox-like menu item                      |
| `data-pressed`     | Toggle button is pressed                                 | toggle-group item                                    |
| `data-current`     | Active item in a sequence                                | breadcrumb item, pagination item, step, calendar today |
| `data-selected`    | In selection set                                         | tab, listbox option, calendar day, tree node, command-palette item |
| `data-active`      | Focused / playing / executing                            | command-palette focused item, carousel current slide, tab, kanban active column |
| `data-loading`     | Async fetch / load in progress                           | picture, skeleton, progress (mode=indeterminate)     |
| `data-error`       | Error condition                                          | picture (load failed), step (error override), file-upload row |
| `data-empty`       | Container has no items                                   | command-palette, notification-center, rating item    |
| `data-dragging`    | Currently being dragged                                  | slider thumb, sortable item, kanban card, split-panels divider |
| `data-drag-over`   | Drop target during a drag                                | file-upload root, sortable container, kanban column  |
| `data-required`    | Form field is required                                   | form-field root + label + control                    |
| `data-invalid`     | Form field has validation error                          | form-field root + control                            |
| `data-touched`     | Form field has been interacted with                      | form-field root                                      |
| `data-shows-error` | Form field error is currently visible (touched gate)     | form-field root                                      |
| `data-complete`    | Process step is complete                                 | step (status: complete), steps root (all done), progress (value === max), file-upload row |
| `data-leaf`        | Tree node has no children                                | tree node                                            |
| `data-today`       | Calendar day is today                                    | calendar day cell                                    |
| `data-outside-month` | Calendar day is outside the displayed month            | calendar day cell                                    |
| `data-filled`      | Rating item is fully filled                              | rating item                                          |
| `data-half-filled` | Rating item is half-filled (step=0.5)                    | rating item                                          |
| `data-hidden`      | Element is rendered but visually hidden (dismissed / closed / removed) | banner (dismissed), card (dismissed), tag (removed), form-field error (not shown), notification-center (empty) |
| `data-read-only`   | Control is in read-only mode                             | rating, inline-edit                                  |
| `data-navigable`   | Step can be navigated to from current position           | step                                                 |

---

## Class 3: Enum data-attributes

Painted as `data-x="<value>"`. The value space is fixed and documented
per attribute. Never write a value not in the space.

| Attribute              | Value space                                  | Used by                                |
|------------------------|----------------------------------------------|----------------------------------------|
| `data-status`          | `closed \| opening \| open \| closing`         | dialog, drawer, popover, menu, tooltip, combobox |
| `data-side`            | `left \| right \| top \| bottom`               | drawer                                 |
| `data-orientation`     | `horizontal \| vertical`                      | tabs, slider, toggle-group, split-panels, steps, carousel |
| `data-placement`       | `top \| bottom \| left \| right` (+ `-start`/`-end` variants) | popover, tooltip          |
| `data-kind`            | `info \| success \| warning \| error`          | banner, notification-center item       |
| `data-trend-direction` | `up \| down \| flat`                          | stat (when trend present)              |
| `data-aspect-ratio`    | `<number> \| 'auto'`                          | picture (when aspect ratio constrained)|
| `data-img-state`       | `idle \| loading \| loaded \| error`           | picture                                |
| `data-zone`           | `optimum \| sub-optimum \| low \| high`        | meter (when thresholds configured) |

The first set of overlay primitives (`dialog`, `drawer`, etc.) paint
**both** `data-open` (boolean) and `data-status` (enum). The boolean is
the CSS-targetable steady state; the enum reports transition phases for
consumers that want to animate enter/exit separately.

```css
/* steady state */
lite-dialog [data-dialog-content][data-open] { opacity: 1; transform: scale(1); }

/* mid-transition (open ↔ close) */
lite-dialog [data-dialog-content][data-status="opening"] { transition-duration: 200ms; }
lite-dialog [data-dialog-content][data-status="closing"] { transition-duration: 150ms; }
```

---

## Class 4: Slot markers (inputs, not outputs)

`data-<primitive>-<role>` attributes are set BY the consumer's markup
and READ by the wrapper to auto-discover which elements play which roles.
The wrapper never sets these; the consumer never reads CSS off them
(though styling against them is allowed).

Each primitive's `llms.txt` documents the slot markers it accepts; see
those files for the canonical list. Examples:

```
data-drawer-trigger / -content / -backdrop / -title / -description / -close
data-bc-list / -item / -sep / -current
data-cal-day / -event / -event-id / -grid / -label / -prev / -next
data-kanban-column / -cards / -card-id / -card-title
data-step-id / -prev / -next
data-rating-item / -rail
```

---

## Host accessor convention (custom elements)

When a wrapper exposes state on the host element, use these conventions:

1. **Booleans → `is`-prefix**: `host.isOpen`, `host.isDisabled`,
   `host.isValid`, `host.isReadOnly`, `host.isComplete`.
2. **Values → no prefix**: `host.value`, `host.index`, `host.side`,
   `host.status`, `host.label`.
3. **Mutations → verb-form**: `host.setValue(v)`, `host.show()`,
   `host.hide()`, `host.reset()`.
4. **Underlying instance → `_<primitive>Instance`**: e.g.
   `host._drawerInstance`, `host._stepsInstance`. Hidden by the
   leading underscore convention; available for power-user access to
   the headless API.

Accessors that returned `current<X>` historically (`currentValue`,
`currentSide`, `currentKind`) have been renamed to drop the `current`
prefix in v0.11.0. The old names remain as deprecated aliases.

---

## Event naming convention

| Pattern              | Use for                                         | Examples                                     |
|----------------------|-------------------------------------------------|----------------------------------------------|
| `<dim>change`        | Value or state change                           | `valuechange`, `openchange`, `indexchange`, `expandedchange`, `playingchange`, `querychange`, `viewchange`, `layoutchange` |
| Bare verb (one-shot) | Action / intent                                 | `commit`, `cancel`, `dismiss`, `editstart`, `complete`, `add`, `error`, `dragstart`, `dragend` |
| `<noun>` (DOM-ish)   | Discrete item interaction                       | `cardclick`, `cardmove`, `dateclick`, `eventclick`, `itemclick` |

The `change` event (used by some primitives historically for value
changes) is renamed to `valuechange` in v0.11.0 for symmetry with
`openchange`, `indexchange`, etc. The old name remains as a deprecated
alias.

---

## Host accessor carve-outs (HTML-mirror primitives)

Per the host-accessor convention above, booleans take the `is`-prefix
(`host.isOpen`, `host.isDisabled`). Two primitives deliberately deviate
to feel like native HTML form controls:

- **`<lite-switch>`** exposes `host.checked` (not `host.isChecked`). This
  matches `HTMLInputElement.checked` so the wrapper feels native to consumers
  who treat the switch as a checkbox replacement. The factory itself still
  uses the convention name (`switch.isChecked()`); only the host element
  mirrors the HTML naming.

- **`<lite-slider>`** exposes `host.disabled` (not `host.isDisabled`). Same
  reasoning: matches `HTMLInputElement.disabled` for the form-control feel.

These are the only documented exceptions. New primitives should follow the
canonical `is`-prefix convention.

## Internal anchor markers (non-public)

Some primitives create synthetic anchor elements at runtime. These get a
namespaced marker so the wrapper code can distinguish them from
consumer-provided slot markers. They are NOT part of the public CSS contract
and consumer CSS should not rely on them:

- `data-menu-virtual-anchor` -- set on the synthetic `<div>` that `<lite-menu>`
  creates at the cursor position for `contextmenu` mode.


## Migration notes (v0.10.x → v0.11.0)

The taxonomy above is canonical as of v0.11.0. Pre-v0.11.0, the
following attributes were used inconsistently and have been replaced:

| Old (v0.10.x)                  | New (v0.11.0)                              | Affected primitives                          |
|--------------------------------|--------------------------------------------|----------------------------------------------|
| `data-state="optimum"` / `"sub-optimum"` / `"low"` / `"high"` | `data-zone` (Class 3 enum) | meter |
| `data-state="open"` / `"closed"` | `data-open` (boolean)                     | accordion, combobox, dialog, drawer, menu, popover, tooltip, tree (open dim) |
| `data-state="active"`           | `data-active` (boolean)                   | carousel (slide), tabs                       |
| `data-state="playing"`          | `data-playing` (boolean)                  | carousel                                     |
| `data-state="loading"`          | `data-loading` (boolean)                  | progress, skeleton                           |
| `data-state="complete"`         | `data-complete` (boolean)                 | progress                                     |
| `data-state="ready"`            | (none -- absence of `data-loading` means ready) | skeleton                                |
| `data-state="on"`               | `data-pressed` (toggle-group items)       | toggle-group                                 |
| `data-state="leaf"`             | `data-leaf` (boolean)                     | tree node                                    |
| `data-state="image"` / `"fallback"` | `data-loaded` (boolean; absent means fallback) | avatar                                |
| `data-state="inactive"`         | (none -- absence of `data-active` means inactive) | tabs                                  |

Consumers with CSS targeting `[data-state="open"]` (or similar) MUST
migrate to the new boolean attributes. There is no compatibility shim --
the old `data-state` is no longer painted.
