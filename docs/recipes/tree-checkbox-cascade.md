# Recipe: tri-state checkbox cascade over a tree

> G-06 (planner ruling R4). Tri-state parent/child checkbox cascade layered
> ON TOP of the existing `createTree` primitive -- this is a recipe, NOT a tree
> code change. The tree owns expand/collapse + roving focus; the cascade is a
> checked-Set you maintain alongside it and paint onto each node's checkbox.

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

## Paint the checkboxes (native indeterminate)

Use the platform's real `indeterminate` property on `<input type=checkbox>` --
it is not an attribute, so set it via the DOM property.

```js
import { effect } from "@zakkster/lite-signal";

const tree = createTree();
tree.attachRoot(document.querySelector("[data-tree]"));
// ... attachNode / attachLabel per your markup ...

effect(() => {
    checkedLeaves();  // subscribe
    for (const id of allIds) {
        const box = document.querySelector(`[data-node-check="${id}"]`);
        if (!box) continue;
        const s = stateOf(id);
        box.checked = s === "checked";
        box.indeterminate = s === "indeterminate";
    }
});

for (const box of document.querySelectorAll("[data-node-check]")) {
    box.addEventListener("change", () => toggleNode(box.dataset.nodeCheck));
}
```

The tree primitive is untouched: it still owns expansion (`expand` / `collapse`
/ `toggleExpanded`) and keyboard roving. The cascade is a pure derivation over a
leaf Set, so a parent can never disagree with its children -- there is no parent
state to keep in sync, only leaves.
