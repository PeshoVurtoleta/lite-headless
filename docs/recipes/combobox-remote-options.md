# Recipe: combobox remote options (onQueryChange + @zakkster/lite-query)

> LH-04 / the G-01 completion. Drive a combobox's options from a remote source:
> the editable input fires `onQueryChange(query, generation)`, the caller fetches
> with `@zakkster/lite-query`, and applied results are guarded by `generation()`
> so a slow, superseded fetch can never replace the list the user is now looking
> at. For LOCAL, in-memory filtering use the `filter` option instead (the two are
> mutually exclusive -- async filtering IS the remote pattern).

## The seam (attach-native, ADR 0006)

lite-headless renders nothing: you own the option DOM. The combobox owns the
QUERY and a monotonic GENERATION. `setQuery` (driven by `attachInput`) bumps the
generation and fires `onQueryChange`; your handler does the IO and re-attaches
results, applying them only while the generation still matches. A commit
(Enter/click) against a superseded generation is additionally a no-op inside the
primitive (`selectIndex` checks each item's stamped generation), so stale
selection is impossible from both directions.

```js
import { effect } from "@zakkster/lite-signal";
import { queryClient, query } from "@zakkster/lite-query";
import { createCombobox } from "@zakkster/lite-headless/combobox";

const qc = queryClient();
const listbox = document.querySelector("[data-listbox]");
const input = document.querySelector("[data-input]");

let itemOffs = [];              // off() handles for the currently attached items

const combo = createCombobox({
    // REMOTE mode. Do NOT also pass `filter` -- that throws (they are exclusive).
    onQueryChange(q, generation) {
        combo.setLoading(true);

        // One reactive query per keystroke value; lite-query dedups by key and
        // GCs unobserved entries. The fetcher owns the IO (and the abort signal).
        const h = query(qc, {
            key: ["options", q],
            fetcher: async ({ signal }) => {
                const res = await fetch(`/api/options?q=${encodeURIComponent(q)}`, { signal });
                return res.json();           // e.g. [{ value, label }, ...]
            },
        });

        // Observe the query. Reading data()/status() inside an effect is what
        // makes lite-query fetch (observation-driven) -- read data() up front so
        // the subscription is unconditional.
        const stop = effect(() => {
            const rows = h.data();
            const s = h.status();
            if (s !== "success" && s !== "error") return;   // still fetching
            stop();
            combo.setLoading(false);
            // THE GUARD: only apply if this is still the newest query.
            if (combo.generation() !== generation) { h.dispose(); return; }
            if (s === "success") applyOptions(rows || []);
            h.dispose();
        });
    },
});

combo.attachInput(input);        // input event -> setQuery(input.value)
combo.attachListbox(listbox);

// Re-render the option DOM and re-register with the combobox. Items attached
// now are stamped at the current generation.
function applyOptions(rows) {
    for (const off of itemOffs) off();
    itemOffs = [];
    listbox.replaceChildren();
    for (const row of rows) {
        const li = document.createElement("li");
        li.textContent = row.label;
        listbox.appendChild(li);
        itemOffs.push(combo.attachItem(li, { value: row.value, label: row.label }));
    }
}
```

## Why the generation guard, not just "apply the latest"

Fetches race. Type `a` (generation 1), then `ap` (generation 2). If fetch 1 is
slow and resolves AFTER fetch 2 has already painted, applying it would show the
user options for a query they have moved past. `combo.generation() !== generation`
makes that late apply a no-op. You do not need to cancel fetch 1 for correctness
(though passing the fetcher's `signal` to `fetch` is good hygiene) -- the guard
is the invariant.

## Loading never blocks the keyboard

`setLoading(true)` paints `aria-busy="true"` + `data-loading` on the listbox for
your CSS (a spinner, a dimmed list). It does NOT gate typing, Escape, or
outside-click -- the user can keep editing while a fetch is in flight, and the
next keystroke simply bumps the generation again. The only thing guarded is the
COMMIT (via generation), never the input.

## Debounce is caller-side

There are no timers in lite-headless. To avoid a fetch per keystroke, debounce
the query with `@zakkster/lite-debounce` before it reaches `onQueryChange`, or
debounce inside the handler -- your policy, your timer.

## Local alternative: `filter`

If the full option set is already in memory, skip the remote lane entirely:

```js
const combo = createCombobox({
    // Runs per setQuery over each attached item; non-matches get `hidden` +
    // `data-hidden` and are skipped by keyboard navigation. Zero-alloc recompute.
    filter: (item, q) => item.label.toLowerCase().includes(q.toLowerCase()),
});
combo.attachInput(input);
// attach the whole option list ONCE; the filter shows/hides as the user types.
```
