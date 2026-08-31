# Recipe: autosave (isDirty + lite-debounce + lite-query mutation)

> G-08. Track a dirty flag, debounce edits with `@zakkster/lite-debounce`, and
> flush through a `@zakkster/lite-query` mutation. The form fields are any
> lite-headless controls whose `value` you own.

## Form state + dirty flag

```js
import { signal, computed, effect } from "@zakkster/lite-signal";

// The last value we know the server has, vs the live edited value.
const saved = signal({ title: "", body: "" });
const draft = signal({ title: "", body: "" });

const isDirty = computed(() => {
    const a = saved(), b = draft();
    return a.title !== b.title || a.body !== b.body;
});
```

Wire fields to `draft`. For example, a title `createInlineEdit` or a plain
input:

```js
const titleEl = document.querySelector("[data-title]");
titleEl.addEventListener("input", () => {
    draft.set({ ...draft(), title: titleEl.value });
});
```

## Debounced flush

```js
import { debounce } from "@zakkster/lite-debounce";
import { createMutation } from "@zakkster/lite-query";

const save = createMutation({
    mutate: (payload) => fetch("/api/doc", {
        method: "PUT",
        body: JSON.stringify(payload),
    }).then((r) => r.json()),
    onSuccess: (_res, payload) => saved.set(payload),  // dirty clears
});

// Debounce so a burst of keystrokes flushes once, 800ms after the last edit.
const flush = debounce((payload) => save.mutate(payload), 800);

effect(() => {
    if (isDirty()) flush(draft());
});
```

## Status readout + flush-on-exit

```js
effect(() => {
    const status = save.isPending() ? "Saving..."
        : isDirty() ? "Unsaved changes"
        : "All changes saved";
    document.querySelector("[data-save-status]").textContent = status;
});

// Belt-and-braces: flush immediately if the user navigates away mid-debounce.
window.addEventListener("beforeunload", () => {
    if (isDirty()) save.mutate(draft());
});
```

The debounce collapses a typing burst into one mutation; `isDirty` gates the
effect so a no-op edit (type then undo) never fires a save; and `onSuccess`
advancing `saved` to the flushed payload is what clears the dirty flag.
