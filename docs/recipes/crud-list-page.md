# Recipe: CRUD list page (table + query + pagination + toolbar)

> G-02 / G-11. Compose `@zakkster/lite-table` (the grid) with
> `@zakkster/lite-query` (async data + cache) and this package's `pagination`
> + `toolbar` primitives. lite-headless is table-less on purpose; the grid
> lives in lite-table. This recipe wires the surrounding controls.

## Shape

- lite-query owns fetching + cache for the current page.
- lite-table renders rows + sort state.
- `createPagination` owns page state and paints the pager.
- `createToolbar` owns the action row (New, Refresh, ...).

## Page state + query

```js
import { signal, computed, effect } from "@zakkster/lite-signal";
import { createQuery } from "@zakkster/lite-query";
import { createPagination } from "@zakkster/lite-headless/pagination";

const pageSize = 25;
const page = signal(1);

// lite-query re-fetches whenever its key changes; `page()` is a reactive dep.
const list = createQuery({
    key: () => ["users", page(), pageSize],
    fetch: ([, p, size]) =>
        fetch(`/api/users?page=${p}&size=${size}`).then((r) => r.json()),
});

// Total rows come back from the API; derive page count from it.
const totalRows = computed(() => list.data()?.total ?? 0);
const pageCount = computed(() => Math.max(1, Math.ceil(totalRows() / pageSize)));
```

## Pagination wiring

`createPagination` exposes `setPage`, `setPageCount`, `next`, `prev`, `first`,
`last`, `items()`, and the attach helpers `attachRoot` / `attachPrev` /
`attachNext` / `attachPageList` / `markPage`.

```js
const pager = createPagination({
    page: page.peek(),
    pageCount: pageCount.peek(),
    onChange: (p) => page.set(p),   // pager click -> page signal -> query refetch
});

pager.attachRoot(document.querySelector("[data-pager]"));
pager.attachPrev(document.querySelector("[data-pager-prev]"));
pager.attachNext(document.querySelector("[data-pager-next]"));
pager.attachPageList(document.querySelector("[data-pager-pages]"));

// Keep the pager's page-count in sync as the total changes.
effect(() => pager.setPageCount(pageCount()));
// Keep the pager's highlighted page in sync if page() is set elsewhere.
effect(() => pager.setPage(page()));
```

## The "X-Y of Z" range readout (G-11)

Derive the human range from `page`, `pageSize`, and the total. No formatting in
a hot loop -- this is a once-per-page computed.

```js
const rangeText = computed(() => {
    const total = totalRows();
    if (total === 0) return "No results";
    const start = (page() - 1) * pageSize + 1;
    const end = Math.min(page() * pageSize, total);
    return `${start}-${end} of ${total}`;
});
effect(() => {
    document.querySelector("[data-range]").textContent = rangeText();
});
```

Guidance: keep `pageSize` a single constant shared by the query key AND the
range math, so the page the API returns and the range you print can never
disagree. If you expose a page-size picker, make `pageSize` a signal and add it
to the query key -- lite-query treats a key change as a fresh page.

## Toolbar

```js
import { createToolbar } from "@zakkster/lite-headless/toolbar";

const bar = createToolbar();
bar.attachRoot(document.querySelector("[data-toolbar]"));
for (const el of document.querySelectorAll("[data-toolbar] [data-action]")) {
    bar.attachItem(el);
}
document.querySelector("[data-action=refresh]").addEventListener("click", () => list.refetch());
```

## Table

lite-table renders the rows from `list.data()?.rows` and owns sort state; on a
sort change, push the sort key into the query key so the server re-sorts. See
`@zakkster/lite-table` for the grid API; this package supplies the controls
around it.
