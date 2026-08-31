# Recipe: textarea autosize + indeterminate checkbox (platform primitives)

> G-12. Two things the platform already does well, documented so you do not
> reach for a component: CSS `field-sizing` for a growing textarea, and the
> native `el.indeterminate` property for a "select all" checkbox. No
> lite-headless primitive is needed for either.

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

That is the whole recipe. `field-sizing: content` makes the control size to its
value; `min-height` / `max-height` in `lh` (line-height) units bound it. For
browsers without `field-sizing`, the textarea simply behaves as a normal fixed
box -- a safe, non-breaking fallback -- so no JS shim is required for
correctness, only for pixel-parity on old engines.

## "Select all" checkbox: native `indeterminate`

A header checkbox that reflects "all / none / some rows selected" uses the
platform's real tri-state. `indeterminate` is a DOM PROPERTY, not an attribute
-- you set `el.indeterminate = true`, never `setAttribute`.

```js
import { signal, computed, effect } from "@zakkster/lite-signal";

const rows = ["a", "b", "c"];
const selected = signal(new Set());

const allState = computed(() => {
    const n = selected().size;
    if (n === 0) return "none";
    if (n === rows.length) return "all";
    return "some";
});

const master = document.querySelector("[data-select-all]");

effect(() => {
    const s = allState();
    master.checked = s === "all";
    master.indeterminate = s === "some";   // the DOM property, not an attribute
});

master.addEventListener("change", () => {
    // A click clears indeterminate and toggles between all / none.
    selected.set(master.checked ? new Set(rows) : new Set());
});
```

Both pieces lean on the platform: the textarea needs zero JS, and the checkbox
needs only the `indeterminate` property plus a derived signal. Reaching for a
custom component here would add bytes and an accessibility surface the native
controls already ship correctly.
