// @zakkster/lite-headless / saved-views / element.js
//
// <lite-saved-views></lite-saved-views>
//
// PROPERTY-DRIVEN (the key wrinkle, ADR 0012 ruling 5): createSavedViews is
// generic over getState / setState FUNCTIONS, and a function cannot be an HTML
// attribute. So this element takes NO observed attributes -- the consumer wires
// it through JS PROPERTIES set before (or at) connect:
//
//     const el = document.createElement("lite-saved-views");
//     el.getState = () => table.getViewState();
//     el.setState = (v) => table.setViewState(v);
//     el.views    = [];              // optional
//     el.activeId = null;           // optional
//     el.storage  = myAdapter;      // optional
//     document.body.appendChild(el);
//     el.savedViews.save("Overdue"); // the live instance
//
// On connect, IF getState AND setState are both functions the element
// instantiates createSavedViews and paints role=group via attachRoot(host);
// otherwise it stays INERT (fail closed, no throw). Teardown runs through
// scope.onCleanup -- NEVER a returned arrow (the 1.9.1 element-teardown fix):
// lite-element discards setup's return value, so a return-arrow teardown would
// leak the instance's signals.
//
// Side-effect: importing this module registers the custom element.

import { define } from "@zakkster/lite-element";
import { createSavedViews } from "./index.js";

define("lite-saved-views", (host, scope) => {
    let instance = null;

    // Property-driven: both hooks must be functions or the element is inert.
    if (typeof host.getState === "function" && typeof host.setState === "function") {
        instance = createSavedViews({
            getState: host.getState,
            setState: host.setState,
            views: Array.isArray(host.views) ? host.views : [],
            activeId: host.activeId != null ? host.activeId : null,
            storage: host.storage || null,
        });
        instance.attachRoot(host);
    }

    // Expose the live instance for imperative use (null when inert).
    host._savedViewsInstance = instance;
    Object.defineProperty(host, "savedViews", {
        get: () => instance,
        configurable: true,
    });

    scope.onCleanup(() => {
        if (instance) instance.destroy();
    });
});
