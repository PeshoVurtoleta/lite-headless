# Recipe: bulk actions bar (toolbar + selection signals)

> G-09. A row-selection signal drives a `createToolbar` action bar that appears
> only when a selection exists, showing "N selected" and bulk actions
> (Delete, Archive, Export).

## Selection state

```js
import { signal, computed, effect } from "@zakkster/lite-signal";

// A Set of selected row ids. One reused signal; replace the Set on mutation.
const selection = signal(new Set());

function toggleRow(id) {
    const next = new Set(selection());
    if (next.has(id)) next.delete(id); else next.add(id);
    selection.set(next);
}
function clearSelection() { selection.set(new Set()); }

const count = computed(() => selection().size);
const hasSelection = computed(() => count() > 0);
```

Wire each row checkbox:

```js
for (const box of document.querySelectorAll("[data-row-check]")) {
    box.addEventListener("change", () => toggleRow(box.dataset.id));
}
```

## Toolbar that shows the bulk actions

```js
import { createToolbar } from "@zakkster/lite-headless/toolbar";

const bar = createToolbar();
bar.attachRoot(document.querySelector("[data-bulk-bar]"));
for (const el of document.querySelectorAll("[data-bulk-bar] [data-bulk-action]")) {
    bar.attachItem(el);
}
```

## Reactive show/hide + count

```js
const barEl = document.querySelector("[data-bulk-bar]");
effect(() => {
    barEl.hidden = !hasSelection();
    document.querySelector("[data-bulk-count]").textContent = `${count()} selected`;
    if (hasSelection()) bar.focusFirst();   // roving focus lands on first action
});
```

## Bulk action handlers

```js
document.querySelector("[data-bulk-action=delete]").addEventListener("click", async () => {
    const ids = Array.from(selection());
    await fetch("/api/rows", { method: "DELETE", body: JSON.stringify(ids) });
    clearSelection();
});
```

`createToolbar` owns roving tabindex across the actions, so keyboard users land
on the bar with one Tab and arrow between actions. Because the bar is driven by
`hasSelection()`, it disappears the moment the selection empties -- no imperative
show/hide bookkeeping.
