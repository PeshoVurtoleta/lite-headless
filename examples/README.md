# lite-headless · examples

Runnable demos that pair lite-headless primitives with other
`@zakkster/lite-*` packages. Drop-in HTML files served from the
repo root.

## collab-sortable.html

A multi-tab collaborative task list built from:

| Package                     | Role                                       |
| --------------------------- | ------------------------------------------ |
| `@zakkster/lite-headless`   | sortable primitive (drag + keyboard pickup) |
| `@zakkster/lite-crdt`       | LWW-Map for ordering + per-id labels       |
| `@zakkster/lite-signal`     | reactive substrate                         |
| native `BroadcastChannel`   | cross-tab transport (no server)            |

### Run

```bash
PORT=5173 node test-browser/serve.mjs
# then open the URL in two or more tabs:
# http://127.0.0.1:5173/examples/collab-sortable.html
```

Drag an item in one tab. The reorder propagates to every other tab
on the same origin via BroadcastChannel. Late-joiners (open a third
tab after the first two have made changes) hydrate to the converged
state via the CRDT's full-state handshake.

### Architecture

```
   ┌──────────────────────────────────────┐
   │  user drags item                     │
   │      │                               │
   │      ▼                               │
   │  lite-sortable emits "reorder"       │
   │      │                               │
   │      ▼                               │
   │  list.set("order", newOrder)         │
   │      │                               │
   │      ▼                               │
   │  CRDT emits "op"                     │
   │      │                               │
   │      ├── transport (BroadcastChannel)│
   │      │                               │
   │      ▼                               │
   │  CRDT emits "change"                 │
   │      │                               │
   │      ▼                               │
   │  renderItems(newOrder) +             │
   │  sortable.setOrder(newOrder)         │
   │      │                               │
   │      ▼                               │
   │  DOM reflects new order              │
   └──────────────────────────────────────┘
```

The CRDT projection is **authoritative**: every reorder writes
through it. The sortable receives the truth via the `change` event
regardless of source (local or remote). A single-flag re-entrance
guard (`_suppressNextLocalReorder`) prevents the local
`change`-handler-driven `setOrder` from echoing back as a new
`reorder` event.

### Why LWW-Map (and not OR-Set)?

`@zakkster/lite-crdt` ships two CRDTs:

- **LWW-Map** — keyed registers; last write wins per key.
- **OR-Set** — observed-remove set with stable first-add ordering;
  edits to existing ids keep position.

For a sortable list the user can **reorder arbitrarily**, OR-Set's
first-add ordering doesn't fit — moving an item shouldn't require
re-adding it. We use LWW-Map and write the **entire `order` array**
as one LWW value. Concurrent reorders resolve atomically: one
user's reorder wins outright, the other's is lost. This is the
simplest correct strategy.

For true merge-preserving distributed lists (RGA / LSEQ /
fractional indexing), you'd need a positional-sequence CRDT.
That's out of scope for the v1 lite-crdt primitives —
[the README is explicit](https://www.npmjs.com/package/@zakkster/lite-crdt):

> No RGA / positional sequence / reorder / rich text. Order is
> causal, not index-positional.

### The microtask-defer fix (writer-tab vs reader-tab divergence)

The first iteration of this example had a subtle bug: when the
**writing** tab added a new item, that tab saw it at position 0
while all other tabs saw it at the end. Cause:

1. `b-add` mutates the CRDT synchronously
2. `change` fires → `renderItems` appends `<li>` to `<ul>`
3. `sortable.setOrder(newOrder)` is called immediately
4. The role observer (MutationObserver, microtask-async) **hasn't
   noticed the new `<li>` yet** — sortable's internal `_items` map
   doesn't know about it
5. `applyDOMReorder` walks `newOrder`, calls `appendChild` on each
   item it knows about (the OLD items). `appendChild` *moves*
   nodes — each old item gets pulled to the end past the new item
6. DOM final order: `[new, old1, old2, old3]` (wrong)

In reader tabs the op arrives via BroadcastChannel's `postMessage`,
which spins the event loop — by the time the handler runs, the
MutationObserver from any prior render has already fired. So
sortable knows about all items and `setOrder` works.

The fix is a one-microtask defer of `setOrder`, giving the role
observer time to attach the new `<li>` first:

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

A useful pattern any time you're driving a lite-headless primitive
from a state-source that BOTH appends new DOM nodes AND requires
the primitive to know about them in the same synchronous chunk.

### Re-use this pattern for any primitive

The bridge pattern generalises to any lite-headless primitive
whose state can be modeled as a small JS value (array, record):

```js
const doc = createCRDTDoc({ replicaId });
const state = doc.map("ui-state");

// outgoing: primitive event -> CRDT write
primitive.addEventListener("change", (e) => {
    if (suppressEcho) return;
    state.set("value", e.detail.value);
});

// incoming: CRDT change -> primitive update
doc.on("change", () => {
    suppressEcho = true;
    primitive.value = state.get("value");
    queueMicrotask(() => { suppressEcho = false; });
});

// transport
const conn = connectBroadcastChannel(doc, "room-name");
```

Try this with **accordion** (collaborative section open/closed),
**tabs** (which user is on which tab), **tree** (shared
selection + expansion), or **carousel** (synchronized slide
across tabs).

## flip-sortable.html

A zero-dep FLIP animation layered over the sortable primitive. Every
reorder — drag, keyboard pickup, shuffle, reverse, swap — animates
smoothly between positions.

### Run

```bash
PORT=5173 node test-browser/serve.mjs
# open http://127.0.0.1:5173/examples/flip-sortable.html
```

Try the shuffle and reverse buttons; pick up an item with Tab + Space
and use arrows. Toggle the FLIP checkbox to compare against
instantaneous commits.

### Why FLIP and not CSS transitions on `transform: translateY`?

`apply-dom-reorder: true` uses `appendChild` to physically reorder
nodes. The browser doesn't transition between the old DOM position
and the new one — the node just teleports. CSS transitions on
position properties don't fire.

The FLIP technique gets around this:

1. **F**irst — read `getBoundingClientRect()` for every item BEFORE
   the mutation. Stash in a `Map<HTMLElement, DOMRect>`.
2. **L**ast — let the mutation run. Items are now in their new DOM
   positions.
3. **I**nvert — read the NEW rects. Compute the per-item delta
   `(oldLeft - newLeft, oldTop - newTop)` and apply
   `transform: translate(dx, dy)` with **no transition**. The items
   visually appear unchanged.
4. **P**lay — on the next two animation frames (one frame for the
   browser to commit the transform, one to apply the transition
   property), clear the transform with
   `transition: transform 280ms`. The browser animates the
   difference, and the items glide from their old position to their
   new one.

The library has the dragstart/reorder events to drive this for
drag + keyboard. For imperative API calls, wrap them with a
`withFlip(fn)` helper that captures before + animates after.

### Why not bake this into the primitive?

Animation timing, easing, stagger, and the choice of whether to
animate at all are aesthetic decisions the consumer should own. The
primitive emits events at the right moments; the FLIP recipe is
~30 LOC of glue code in userland. GSAP's Flip plugin is also a
drop-in alternative if the consumer already uses GSAP (see the
sortable llms.txt for both versions).

