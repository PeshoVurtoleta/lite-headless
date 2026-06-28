// @zakkster/lite-headless / tabs / element.js
//
// <lite-tabs value="overview" orientation="horizontal" activation="automatic">
//   <div data-tablist>
//     <button data-tab="overview">Overview</button>
//     <button data-tab="settings">Settings</button>
//     <button data-tab="billing"  data-disabled>Billing</button>
//   </div>
//   <div data-panel="overview">overview content</div>
//   <div data-panel="settings">settings content</div>
//   <div data-panel="billing">billing content</div>
// </lite-tabs>
//
// The wrapper discovers [data-tablist], [data-tab="<key>"], and
// [data-panel="<key>"] children via createRoleObserver so dynamically-
// added tabs + panels wire automatically (e.g. when a route loads).
//
// Attribute → option mapping:
//   value         -> reactive sync via useAttr (setAttribute drives the active tab)
//   orientation   -> "horizontal" | "vertical"  (default horizontal)
//   activation    -> "automatic" | "manual"     (default automatic)
//   no-loop       -> loop:false
//   typeahead     -> typeahead:true
//
// Each tab child supports:
//   data-tab="<key>"     -- required, identifies the tab
//   data-disabled        -- mark the tab as disabled at attach time
//
// Each panel child supports:
//   data-panel="<key>"   -- required, links to the same key as a tab
//
// Dispatches CustomEvent('valuechange', { detail: { value, reason } })
// when the active tab changes.

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createTabs } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-tablist],[data-tab],[data-panel]";

define("lite-tabs", (host, scope) => {
    const orientation = host.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
    const activation  = host.getAttribute("activation") === "manual" ? "manual" : "automatic";
    const loop = !host.hasAttribute("no-loop");
    const typeahead = host.hasAttribute("typeahead");
    const initialValue = host.getAttribute("value");

    // v0.7.12: re-entrance guard (see accordion/element.js for the full
    // explanation). The `reason !== "attribute"` mirror guard alone is
    // not enough — calling host.setAttribute INSIDE onValueChange
    // (which runs inside _value.set's flush) re-enters the useAttr
    // effect twice in chromium under lite-signal. Final value is
    // correct but extra "valuechange" CustomEvents fire with stale
    // detail. The flag suppresses the effect runs caused by our own
    // setAttribute; external writes (route sync etc.) leave the flag
    // false and pass through normally.
    let _suppressValueEffect = false;
    let _firstValueRun = true;

    const tabs = createTabs({
        defaultValue: initialValue,
        orientation, activation, loop, typeahead,
        onValueChange: (value, reason) => {
            if (reason !== "attribute" && host.getAttribute("value") !== value) {
                _suppressValueEffect = true;
                host.setAttribute("value", value);
                queueMicrotask(() => { _suppressValueEffect = false; });
            }
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value, reason }, bubbles: true,
            }));
        },
    });

    // Reactive sync from the host's `value` attribute (controlled-ish mode).
    // skip the first run so we don't double-fire onValueChange at startup.
    const valueAttr = scope.useAttr("value");
    const stopValueAttr = effect(() => {
        const raw = valueAttr();
        if (_firstValueRun) { _firstValueRun = false; return; }
        if (_suppressValueEffect) return;          // v0.7.12 cascade guard
        if (raw == null) return;
        tabs.setValue(raw, "attribute");
    });

    // Role observer for [data-tablist], [data-tab], [data-panel].
    // skipNested:true means a nested <lite-tabs> won't have its
    // children grabbed by the outer wrapper -- the inner wrapper claims
    // them. This is the same v0.7.1 contract every wrapper uses.
    let roles;
    roles = createRoleObserver(host, ROLE_SEL, (node) => {
        if (node.matches("[data-tablist]")) return tabs.attachTablist(node);
        if (node.matches("[data-tab]")) {
            const key = node.getAttribute("data-tab");
            if (!key) return null;
            return tabs.attachTab(node, key, {
                disabled: node.hasAttribute("data-disabled") || node.hasAttribute("disabled"),
            });
        }
        if (node.matches("[data-panel]")) {
            const key = node.getAttribute("data-panel");
            if (!key) return null;
            return tabs.attachPanel(node, key);
        }
        return null;
    });
    roles.rescan();

    // Expose the primitive instance + ergonomic accessors
    host._tabsInstance = tabs;
    host.setValue   = (key, reason) => tabs.setValue(key, reason);
    host.setDisabled = (key, flag) => tabs.setDisabled(key, flag);
    host.next  = () => tabs.next();
    host.prev  = () => tabs.prev();
    host.first = () => tabs.first();
    host.last  = () => tabs.last();
    Object.defineProperty(host, "value", {
        get: () => tabs.value(),
        set: (key) => tabs.setValue(key, "property"),
        configurable: true,
    });

    scope.onCleanup(() => {
        stopValueAttr();
        roles.disconnect();
        tabs.destroy();
    });
}, { observedAttributes: ["value"] });
