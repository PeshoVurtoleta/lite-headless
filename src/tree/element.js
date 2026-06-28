// @zakkster/lite-headless / tree / element.js
//
// <lite-tree selection-mode="single" expanded="src,docs" selected="readme.md">
//     <ul>
//         <li data-tree-node="src">
//             src
//             <span data-tree-toggle>chevron</span>
//             <ul>
//                 <li data-tree-node="src/index.js">index.js</li>
//                 <li data-tree-node="src/util.js" data-disabled>util.js</li>
//             </ul>
//         </li>
//         <li data-tree-node="docs">docs</li>
//     </ul>
// </lite-tree>
//
// Discovers [data-tree-node="<key>"] via createRoleObserver so dynamically
// inserted nodes wire automatically. Parent inference is purely DOM-based:
// the primitive walks each new node's ancestor chain looking for the
// nearest existing tree-node element. This means lazy-loaded subtrees
// "just work" -- attach the parent, then attach children later.
//
// Reactive attributes:
//   selected       -- string (single mode) or comma-separated keys (multi)
//   expanded       -- comma-separated keys
// Element-level attributes (read once, not reactive):
//   selection-mode -- "single" | "multiple"
//   typeahead      -- presence => enabled (default true)
//   loop           -- presence => enabled (default true)
//
// Dispatches:
//   selectionchange  { detail: { selected, reason } }
//   expandedchange   { detail: { expanded, reason } }

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createTree } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-tree-node]";

function parseSelected(raw, mode) {
    if (raw == null || raw === "") return mode === "multiple" ? [] : null;
    if (mode === "single") return raw;
    return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function parseExpanded(raw) {
    if (!raw) return [];
    return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function serializeSelected(v, mode) {
    if (mode === "single") return v == null ? "" : String(v);
    return Array.isArray(v) ? v.join(",") : "";
}
function serializeExpanded(v) {
    return Array.isArray(v) ? v.join(",") : "";
}

define("lite-tree", (host, scope) => {
    const selectionMode = host.getAttribute("selection-mode") === "multiple" ? "multiple" : "single";
    const typeahead = !host.hasAttribute("no-typeahead");
    const loop = !host.hasAttribute("no-loop");

    const defaultSelected = parseSelected(host.getAttribute("selected"), selectionMode);
    const defaultExpanded = parseExpanded(host.getAttribute("expanded"));

    // v0.7.12: re-entrance guard for both `selected` and `expanded`
    // attributes (see accordion/element.js for the full explanation).
    // Tree has two mirror-attributes so we need two flags. Without
    // the guards, calling host.setAttribute(...) inside an onChange
    // callback (which runs inside the corresponding _signal.set
    // flush) re-enters the useAttr effect twice with stale signal
    // states. Final primitive state is correct but extra
    // CustomEvents fire with stale detail.
    let _suppressSelEffect = false;
    let _suppressExpEffect = false;
    let _firstSel = true, _firstExp = true;

    const tree = createTree({
        selectionMode, typeahead, loop,
        defaultSelected, defaultExpanded,
        onSelectionChange: (value, reason) => {
            if (reason !== "attribute") {
                const ser = serializeSelected(value, selectionMode);
                if (host.getAttribute("selected") !== ser) {
                    _suppressSelEffect = true;
                    host.setAttribute("selected", ser);
                    queueMicrotask(() => { _suppressSelEffect = false; });
                }
            }
            host.dispatchEvent(new CustomEvent("selectionchange", {
                detail: { selected: value, reason }, bubbles: true,
            }));
        },
        onExpandedChange: (value, reason) => {
            if (reason !== "attribute") {
                const ser = serializeExpanded(value);
                if (host.getAttribute("expanded") !== ser) {
                    _suppressExpEffect = true;
                    host.setAttribute("expanded", ser);
                    queueMicrotask(() => { _suppressExpEffect = false; });
                }
            }
            host.dispatchEvent(new CustomEvent("expandedchange", {
                detail: { expanded: value, reason }, bubbles: true,
            }));
        },
    });

    // Reactive attribute sync
    const selectedAttr = scope.useAttr("selected");
    const expandedAttr = scope.useAttr("expanded");
    const stopSel = effect(() => {
        const raw = selectedAttr();
        if (_firstSel) { _firstSel = false; return; }
        if (_suppressSelEffect) return;            // v0.7.12 cascade guard
        tree.setSelected(parseSelected(raw, selectionMode), "attribute");
    });
    const stopExp = effect(() => {
        const raw = expandedAttr();
        if (_firstExp) { _firstExp = false; return; }
        if (_suppressExpEffect) return;            // v0.7.12 cascade guard
        tree.setExpanded(parseExpanded(raw), "attribute");
    });

    // Find the inner element to use as the role="tree" container. Most
    // consumers wrap their nodes in a <ul> or <div>; we accept whatever
    // is the first element child. If none, we fall back to the host
    // (custom-element-as-tree).
    const treeRootEl = host.firstElementChild || host;
    const detachRoot = tree.attachRoot(treeRootEl);

    // Role observer scans for [data-tree-node] and wires them. Attach
    // ORDER matters here -- DOM-order means parents come before children,
    // so the findParentKey walk in attachNode finds the right parent.
    const roles = createRoleObserver(host, ROLE_SEL, (node) => {
        if (!node.matches("[data-tree-node]")) return null;
        const key = node.getAttribute("data-tree-node");
        if (!key) return null;
        const disabled = node.hasAttribute("data-disabled");
        const hasChildren = node.hasAttribute("data-has-children") || undefined;
        return tree.attachNode(node, key, { disabled, hasChildren });
    });
    roles.rescan();

    // Public host surface
    host._treeInstance = tree;
    host.expand           = (key, reason) => tree.expand(key, reason);
    host.collapse         = (key, reason) => tree.collapse(key, reason);
    host.toggleExpanded   = (key, reason) => tree.toggleExpanded(key, reason);
    host.select           = (key, reason) => tree.select(key, reason);
    host.deselect         = (key, reason) => tree.deselect(key, reason);
    host.toggleSelected   = (key, reason) => tree.toggleSelected(key, reason);
    host.setSelected      = (v, reason) => tree.setSelected(v, reason);
    host.setExpanded      = (v, reason) => tree.setExpanded(v, reason);
    host.expandAll        = () => tree.expandAll();
    host.collapseAll      = () => tree.collapseAll();
    host.setDisabled      = (key, flag) => tree.setDisabled(key, flag);
    host.focusKey         = (key) => tree.focusKey(key);
    Object.defineProperty(host, "selected", {
        get: () => tree.selected(),
        set: (v) => tree.setSelected(v, "property"),
        configurable: true,
    });
    Object.defineProperty(host, "expanded", {
        get: () => tree.expanded(),
        set: (v) => tree.setExpanded(v, "property"),
        configurable: true,
    });

    scope.onCleanup(() => {
        stopSel();
        stopExp();
        detachRoot();
        roles.disconnect();
        tree.destroy();
    });
}, { observedAttributes: ["selected", "expanded"] });
