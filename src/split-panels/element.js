// @zakkster/lite-headless / split-panels / element.js
//
// <lite-split-panels orientation="horizontal">
//   <div data-panel data-min-size="15" data-default-size="25" data-collapsible>Sidebar</div>
//   <div data-handle aria-label="Resize sidebar"></div>
//   <div data-panel data-min-size="40">Main</div>
//   <div data-handle aria-label="Resize inspector"></div>
//   <div data-panel data-min-size="15" data-default-size="20" data-collapsible>Inspector</div>
// </lite-split-panels>
//
// The wrapper discovers panels + handles in document order, assigning
// sequential indices (0..N-1 for panels, 0..N-2 for handles). The handle
// at index `i` always operates on panel[i] / panel[i+1]. Reordering or
// inserting/removing panels via the MutationObserver re-walks the tree
// to keep indices stable with respect to document order.
//
// Per-panel options come from attributes:
//   data-min-size       (numeric percentage)
//   data-max-size       (numeric percentage)
//   data-default-size   (numeric percentage)
//   data-collapsible    (boolean)
//
// Dispatches CustomEvent('layoutchange', { detail: { layout, reason } })
// on every layout update.

import { define } from "@zakkster/lite-element";
import { createSplitPanels } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-panel],[data-handle]";

define("lite-split-panels", (host, scope) => {
    const orientation = host.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";

    const split = createSplitPanels({
        orientation,
        snapThreshold: host.hasAttribute("snap-threshold") ? parseFloat(host.getAttribute("snap-threshold")) : 0.5,
        keyboardStep:  host.hasAttribute("keyboard-step")  ? parseFloat(host.getAttribute("keyboard-step"))  : 5,
        onLayoutChange: (sizes, reason) => {
            host.dispatchEvent(new CustomEvent("layoutchange", {
                detail: { layout: sizes.slice(), reason }, bubbles: true,
            }));
        },
    });

    const containerOff = split.attachContainer(host);

    // We don't use createRoleObserver here because split-panels needs
    // POSITIONAL indexing (panel index = position in document order), not
    // role-based one-shot wiring. Re-walking the tree on every mutation
    // is cheap relative to the alternative (maintaining a stable index
    // across reorders), and the MutationObserver fires async-batched.
    //
    // Currently-attached handles + panels, keyed by element so we know
    // what to detach when the DOM changes.
    const panelOffs = new Map();   // el -> off()
    const handleOffs = new Map();  // el -> off()

    function reconcile() {
        // Collect current panels + handles in document order. The
        // belongsToHost filter is critical for split-panels: nested
        // splits (sidebar with a horizontal pane that contains another
        // vertical split) are a real-world pattern. Without scoping,
        // an outer split would steal the inner's panels + handles,
        // breaking both layouts. We filter into arrays so the
        // positional indexing below sees ONLY this instance's children.
        const rawPanels = host.querySelectorAll("[data-panel]");
        const rawHandles = host.querySelectorAll("[data-handle]");
        const panels = [];
        const handles = [];
        for (let i = 0; i < rawPanels.length; i++) {
            const el = rawPanels[i];
            if (belongsToHost(el, host)) panels.push(el);
        }
        for (let i = 0; i < rawHandles.length; i++) {
            const el = rawHandles[i];
            if (belongsToHost(el, host)) handles.push(el);
        }

        // Build a set of currently-present elements for diff.
        const presentPanels = new Set();
        for (let i = 0; i < panels.length; i++) presentPanels.add(panels[i]);
        const presentHandles = new Set();
        for (let i = 0; i < handles.length; i++) presentHandles.add(handles[i]);

        // Detach any panels/handles that left the DOM.
        for (const [el, off] of panelOffs) {
            if (!presentPanels.has(el)) {
                try { off(); } catch { /* swallow */ }
                panelOffs.delete(el);
            }
        }
        for (const [el, off] of handleOffs) {
            if (!presentHandles.has(el)) {
                try { off(); } catch { /* swallow */ }
                handleOffs.delete(el);
            }
        }

        // Re-attach all panels with their current index. If an element
        // is already attached at the right index, we still call detach +
        // re-attach -- the primitive treats this as a no-op for unchanged
        // configs but picks up min-size/max-size attribute changes.
        for (let i = 0; i < panels.length; i++) {
            const el = panels[i];
            const prev = panelOffs.get(el);
            if (prev) { try { prev(); } catch { /* swallow */ } }
            const off = split.attachPanel(el, i, {
                minSize:     el.hasAttribute("data-min-size")     ? parseFloat(el.getAttribute("data-min-size"))     : 0,
                maxSize:     el.hasAttribute("data-max-size")     ? parseFloat(el.getAttribute("data-max-size"))     : 100,
                defaultSize: el.hasAttribute("data-default-size") ? parseFloat(el.getAttribute("data-default-size")) : undefined,
                collapsible: el.hasAttribute("data-collapsible"),
            });
            panelOffs.set(el, off);
        }

        // Same for handles, indexed 0..N-2.
        for (let i = 0; i < handles.length; i++) {
            const el = handles[i];
            const prev = handleOffs.get(el);
            if (prev) { try { prev(); } catch { /* swallow */ } }
            const off = split.attachHandle(el, i);
            handleOffs.set(el, off);
        }
    }

    reconcile();

    // MutationObserver: re-walk on any childList/subtree change. We don't
    // observe attribute mutations because reading min-size etc. on every
    // reconcile would mean re-attaching panels just to update constraints.
    // Consumers who change panel attributes at runtime should call
    // host.reconcile() manually (exposed below).
    let observer = null;
    if (typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(reconcile);
        observer.observe(host, { childList: true, subtree: true });
    }

    // Expose the primitive for programmatic control + the reconcile hook
    // for attribute changes.
    host._splitInstance = split;
    host.setLayout = (sizes, reason) => split.setLayout(sizes, reason);
    host.collapsePanel = (idx) => split.collapsePanel(idx);
    host.expandPanel = (idx, sizeOverride) => split.expandPanel(idx, sizeOverride);
    host.reconcile = reconcile;
    Object.defineProperty(host, "layout", { get: () => split.layout(), configurable: true });

    scope.onCleanup(() => {
        if (observer) observer.disconnect();
        for (const off of panelOffs.values())  { try { off(); } catch {} }
        for (const off of handleOffs.values()) { try { off(); } catch {} }
        panelOffs.clear();
        handleOffs.clear();
        if (containerOff) containerOff();
        split.destroy();
    });
});
