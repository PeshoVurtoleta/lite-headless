# Recipe: transfer list (two listboxes)

> G-07. Two `createCombobox({ multiple: true })` listboxes side by side --
> "available" and "selected" -- with Add / Remove buttons moving values
> between them. The multi-select Set surface (`values`, `has`, `toggleValue`)
> is the whole engine.

## Two multi-select comboboxes

```js
import { signal, effect } from "@zakkster/lite-signal";
import { createCombobox } from "@zakkster/lite-headless/combobox";

const ALL = ["apple", "banana", "cherry", "date", "elderberry"];

// The source of truth: which values live on the "selected" side.
const selected = signal([]);

const available = createCombobox({ multiple: true });
const chosen = createCombobox({ multiple: true });

available.attachTrigger(document.querySelector("[data-available-trigger]"));
available.attachListbox(document.querySelector("[data-available-list]"));
chosen.attachTrigger(document.querySelector("[data-chosen-trigger]"));
chosen.attachListbox(document.querySelector("[data-chosen-list]"));
```

## Render each side from the split

```js
function render() {
    const sel = selected();
    const avail = ALL.filter((v) => sel.indexOf(v) === -1);
    paint(available, document.querySelector("[data-available-list]"), avail);
    paint(chosen, document.querySelector("[data-chosen-list]"), sel);
}

function paint(combo, listEl, values) {
    listEl.replaceChildren();
    for (const v of values) {
        const li = document.createElement("li");
        li.textContent = v;
        listEl.appendChild(li);
        combo.attachItem(li, { value: v, label: v });
    }
}

effect(render);
```

## Move buttons

Each combobox tracks its own checked Set via `values()`; the buttons read those
Sets and rewrite the single `selected` signal.

```js
document.querySelector("[data-add]").addEventListener("click", () => {
    const toAdd = available.values();          // checked on the available side
    if (toAdd.length === 0) return;
    selected.set(selected().concat(toAdd));
});

document.querySelector("[data-remove]").addEventListener("click", () => {
    const toRemove = new Set(chosen.values()); // checked on the chosen side
    selected.set(selected().filter((v) => !toRemove.has(v)));
});
```

`combo.has(value)` gives a per-value membership test if you prefer to wire
individual move-on-double-click handlers instead of bulk Add/Remove. Because
each list rebuilds from `selected` on every change, the comboboxes never hold
stale state -- the signal is the single source of truth.
