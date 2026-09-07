# Recipe: textarea autosize + tri-state "select all" checkbox

> G-12. Two "select all"-adjacent surfaces: a growing textarea (pure CSS
> `field-sizing` -- no primitive needed) and a tri-state select-all checkbox.
> Since H12 (v1.9.0) the tri-state derivation is a first-class primitive --
> `createCheckboxGroup` -- so this recipe consumes it (shared law 5) instead of
> hand-deriving the master state. The native `el.indeterminate` property remains
> the zero-dependency option when your rows are real `<input type=checkbox>`.

## Textarea autosize: CSS `field-sizing`

Modern browsers grow a textarea to fit its content with one CSS declaration --
no JavaScript scroll-height measuring, no ResizeObserver, no reflow loop.

```css
.autosize {
    field-sizing: content;   /* grow with content */
    min-height: 3lh;          /* start at three lines */
    max-height: 20lh;         /* then scroll */
}
```

```html
<textarea class="autosize"></textarea>
```

That is the whole textarea recipe. `field-sizing: content` makes the control size
to its value; `min-height` / `max-height` in `lh` (line-height) units bound it.
For browsers without `field-sizing`, the textarea behaves as a normal fixed box
-- a safe, non-breaking fallback -- so no JS shim is required for correctness,
only for pixel-parity on old engines. No lite-headless primitive is involved.

## "Select all" checkbox: `createCheckboxGroup`

A header checkbox that reflects "all / none / some rows selected" is a tri-state
master over a set of members -- exactly `createCheckboxGroup`. The group DERIVES
its state from the members (`state()` -> "true" | "false" | "mixed"), never
storing an aggregate that can drift, and `attachMaster` paints
`aria-checked="mixed"` and wires the all-on / all-off click. Members can be your
own styled elements (the primitive owns their ARIA + `data-*`), which is the case
the native property below cannot serve.

```js
import { createCheckboxGroup } from "@zakkster/lite-headless/checkbox-group";

const rows = ["a", "b", "c"];
const group = createCheckboxGroup({
    onChange: (values) => console.log("selected:", values),   // ["a", "c"], ...
});

// Each row is a member; attach its checkbox to the row's control element.
for (const id of rows) {
    const { checkbox } = group.register(id);
    checkbox.attachRoot(document.querySelector(`[data-row="${id}"]`));
}

// The header "select all" is the master: it paints aria-checked="mixed" when
// some (not all) rows are checked, and flips all-on <-> all-off on click / Space.
group.attachMaster(document.querySelector("[data-select-all]"));

group.state();   // "true" | "false" | "mixed"  -- derived, never stored
group.value();   // array of checked row ids
```

Or with the element wrapper -- members are `[data-checkbox]` with a `value`, the
master is `[data-select-all]`:

```html
<lite-checkbox-group>
    <span data-select-all></span>
    <label><span data-checkbox value="a"></span> Row A</label>
    <label><span data-checkbox value="b"></span> Row B</label>
    <label><span data-checkbox value="c"></span> Row C</label>
</lite-checkbox-group>
```

### Zero-dependency fallback: native `el.indeterminate`

If your rows are real `<input type=checkbox>`, the platform's tri-state needs no
primitive at all. `indeterminate` is a DOM PROPERTY, not an attribute -- set
`el.indeterminate = true`, never `setAttribute`:

```js
import { signal, computed, effect } from "@zakkster/lite-signal";

const selected = signal(new Set());
const allState = computed(() => {
    const n = selected().size;
    return n === 0 ? "none" : n === rows.length ? "all" : "some";
});
const master = document.querySelector("[data-select-all]");
effect(() => {
    master.checked = allState() === "all";
    master.indeterminate = allState() === "some";   // the DOM property
});
master.addEventListener("change", () => {
    selected.set(master.checked ? new Set(rows) : new Set());
});
```

Reach for `createCheckboxGroup` when the checkboxes are custom-styled non-input
elements (it owns their ARIA, `data-*`, keyboard, and the derived master); reach
for the native property when a real `<input>` already ships that behavior.
