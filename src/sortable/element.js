// @zakkster/lite-headless / sortable / element.js
//
// <lite-sortable> custom element wrapping createSortable. Uses the
// shared createRoleObserver pattern so child markers attach
// automatically as nodes appear.
//
// Markup contract:
//
// <lite-sortable label="Reorder tasks" orientation="vertical">
//   <ul>
//     <li data-sortable-item="task-1">Buy milk
//       <span data-sortable-handle>⋮⋮</span>
//     </li>
//     <li data-sortable-item="task-2">Walk dog</li>
//     <li data-sortable-item="task-3" data-disabled>Pay rent</li>
//   </ul>
// </lite-sortable>
//
// Attribute -> option mapping:
//   label            -> attachRoot({ label }) (aria-label)
//   orientation      -> orientation ("vertical" | "horizontal")
//   disabled         -> setDisabled
//   apply-dom-reorder -> applyDOMReorder (boolean; presence = true)
//   no-keyboard      -> keyboardEnabled = false (presence = disable)
//
// Dispatches CustomEvents:
//   reorder { detail: { order, info } }
//   dragstart { detail: { key } }
//   dragend { detail: { key, committed } }

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createSortable } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-sortable-item]";
const HANDLE_SEL = "[data-sortable-handle]";

define("lite-sortable", (host, scope) => {
    const orientation = host.getAttribute("orientation") || "vertical";
    const label = host.getAttribute("label") || null;
    const applyDOMReorder = host.hasAttribute("apply-dom-reorder");
    const keyboardEnabled = !host.hasAttribute("no-keyboard");
    const disabled = host.hasAttribute("disabled");

    const sortable = createSortable({
        orientation,
        applyDOMReorder,
        keyboardEnabled,
        disabled,
        onReorder: (order, info) => {
            host.dispatchEvent(new CustomEvent("reorder", {
                detail: { order, info }, bubbles: true,
            }));
        },
        onDragStart: (key) => {
            host.dispatchEvent(new CustomEvent("dragstart", {
                detail: { key }, bubbles: true,
            }));
        },
        onDragEnd: (key, committed) => {
            host.dispatchEvent(new CustomEvent("dragend", {
                detail: { key, committed }, bubbles: true,
            }));
        },
    });

    // Host is the role="listbox" root
    const detachRoot = sortable.attachRoot(host, { label });

    // Role observer for [data-sortable-item]. Each item carries its
    // key as the ATTRIBUTE VALUE (data-sortable-item="key"). After
    // the item attaches, we also look inside it for a
    // [data-sortable-handle] descendant and register it.
    const roles = createRoleObserver(host, ROLE_SEL, (node) => {
        const key = node.getAttribute("data-sortable-item");
        if (!key) return;
        const opts = { disabled: node.hasAttribute("data-disabled") };
        const offItem = sortable.attachItem(node, key, opts);
        // Look for a handle inside the item
        const handle = node.querySelector(HANDLE_SEL);
        let offHandle = null;
        if (handle) {
            try { offHandle = sortable.attachHandle(handle, key); }
            catch { /* swallow -- handle might be re-attached elsewhere */ }
        }
        return () => {
            if (offHandle) offHandle();
            offItem();
        };
    });
    roles.rescan();

    // Reactive `disabled` attribute
    const disabledAttr = scope.useAttr("disabled");
    let _firstDisabledRun = true;
    const stopDisabledAttr = effect(() => {
        const raw = disabledAttr();
        if (_firstDisabledRun) { _firstDisabledRun = false; return; }
        sortable.setDisabled(raw != null);
    });

    // Expose imperative API on the host
    host._sortableInstance = sortable;
    host.move      = (key, idx) => sortable.move(key, idx);
    host.swap      = (a, b)     => sortable.swap(a, b);
    host.setOrder  = (order)    => sortable.setOrder(order);
    host.insertAt  = (key, idx) => sortable.insertAt(key, idx);
    host.removeKey = (key)      => sortable.removeKey(key);
    host.setItemDisabled = (key, flag) => sortable.setItemDisabled(key, flag);
    Object.defineProperty(host, "items", {
        get: () => sortable.items(),
        configurable: true,
    });
    Object.defineProperty(host, "isDragging", {
        get: () => sortable.isDragging(),
        configurable: true,
    });

    scope.onCleanup(() => {
        stopDisabledAttr();
        roles.disconnect();
        detachRoot();
        sortable.destroy();
    });
}, { observedAttributes: ["disabled"] });
