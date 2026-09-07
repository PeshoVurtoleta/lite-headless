# Recipe: tri-state checkbox cascade over a tree

> G-06 (planner ruling R4). Tri-state parent/child checkbox cascade layered
> ON TOP of the existing `createTree` primitive -- this is a recipe, NOT a tree
> code change. The tree owns expand/collapse + roving focus. Since H12 (v1.9.0)
> each node's checkbox is a `createCheckbox` instance (shared law 5: the recipe
> consumes the primitive that now exists), so the tri-state ARIA + paint are the
> primitive's job -- the recipe owns only the cascade DERIVATION over a leaf Set.

## The model

Every node has a checkbox in one of three states:

- checked      -- the node and all descendants are on.
- unchecked    -- the node and all descendants are off.
- indeterminate -- some but not all descendants are on.

Leaves are only checked or unchecked. A parent's state is DERIVED from its
leaves, so the single source of truth is "which LEAF ids are checked".

```js
import { signal, computed } from "@zakkster/lite-signal";
import { createTree } from "@zakkster/lite-headless/tree";

// id -> array of descendant leaf ids (precompute once from your data).
const leavesOf = new Map(/* parentId -> [leafId, ...]; leafId -> [leafId] */);
const allIds = [/* every node id */];

const checkedLeaves = signal(new Set());
```

## Derive each node's tri-state

```js
function stateOf(id) {
    const leaves = leavesOf.get(id) || [];
    if (leaves.length === 0) return "unchecked";
    let on = 0;
    for (const leaf of leaves) if (checkedLeaves().has(leaf)) on++;
    if (on === 0) return "unchecked";
    if (on === leaves.length) return "checked";
    return "indeterminate";
}
```

## Toggling cascades down

Clicking a node's checkbox turns ALL its descendant leaves on or off together.

```js
function toggleNode(id) {
    const leaves = leavesOf.get(id) || [];
    const next = new Set(checkedLeaves());
    const turningOn = stateOf(id) !== "checked";  // indeterminate -> on
    for (const leaf of leaves) {
        if (turningOn) next.add(leaf); else next.delete(leaf);
    }
    checkedLeaves.set(next);
}
```

## Paint the checkboxes with `createCheckbox`

One `createCheckbox` per node owns the tri-state ARIA (`aria-checked="mixed"`),
`data-checked` / `data-indeterminate`, and Space/click -- so a node's checkbox can
be any styled element, not only a native `<input>`. The recipe drives each one
from the derived cascade state; the primitive never stores an incoherent
checked+indeterminate pair.

```js
import { effect } from "@zakkster/lite-signal";
import { createCheckbox } from "@zakkster/lite-headless/checkbox";

const tree = createTree();
tree.attachRoot(document.querySelector("[data-tree]"));
// ... attachNode / attachLabel per your markup ...

// One checkbox per node. A USER toggle (reason "click" / "keyboard") cascades to
// the leaves; PROGRAMMATIC syncs from the effect below use reason "set" and are
// ignored here, so there is no feedback loop.
const boxes = new Map();   // id -> checkbox instance
for (const id of allIds) {
    const el = document.querySelector(`[data-node-check="${id}"]`);
    if (!el) continue;
    const cb = createCheckbox({
        onChange: (_checked, reason) => { if (reason !== "set") toggleNode(id); },
    });
    cb.attachRoot(el);
    boxes.set(id, cb);
}

// Drive every node's checkbox from the derived cascade state. setChecked clears
// mixed; setIndeterminate(true) paints "mixed". Unchanged nodes short-circuit.
effect(() => {
    checkedLeaves();   // subscribe
    for (const [id, cb] of boxes) {
        const s = stateOf(id);
        if (s === "indeterminate") cb.setIndeterminate(true);
        else cb.setChecked(s === "checked");
    }
});
```

Reach for the native `el.indeterminate` DOM property (see the textarea recipe)
only when your nodes are real `<input type=checkbox>` and you do not need the
managed ARIA / keyboard; for styled node rows, `createCheckbox` owns that surface.

The tree primitive is untouched: it still owns expansion (`expand` / `collapse`
/ `toggleExpanded`) and keyboard roving. The cascade is a pure derivation over a
leaf Set, so a parent can never disagree with its children -- there is no parent
state to keep in sync, only leaves.
