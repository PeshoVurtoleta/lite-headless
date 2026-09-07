// @zakkster/lite-headless / checkbox-group / element.js
//
// <lite-checkbox-group>
//     <span data-select-all></span>
//     <label><span data-checkbox value="a"></span> Apple</label>
//     <label><span data-checkbox value="b" checked></span> Banana</label>
//     <label><span data-checkbox value="c" disabled></span> Cherry</label>
// </lite-checkbox-group>
//
// The wrapper auto-discovers members (`[data-checkbox]` with a `value`) and a
// single select-all master (`[data-select-all]`). Each member gets its own
// createCheckbox (allocated at register() time, outside any effect -- ADR 0008
// ruling 3), bound to its node via attachRoot. The group's tri-state is DERIVED
// from members; the master paints "mixed" when they are partial.
//
// Attribute mapping (on the host):
//   disabled  -> group disabled (observed)
//   required  -> required
//
// Member attributes (on each [data-checkbox]):
//   value / data-value        -> the member's value (required)
//   checked / default-checked  -> defaultChecked
//   disabled                   -> disabled
//
// Imperative API on host:
//   host.setAll(bool, reason?)
//   host.setDisabled(bool)
//   host.value        -> array of checked member values
//   host.state        -> "true" | "false" | "mixed"
//   host.memberCount  -> number
//
// Dispatched events:
//   valuechange       { detail: { values, reason } }

import { define } from "@zakkster/lite-element";
import { createCheckboxGroup } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-checkbox],[data-select-all]";

define("lite-checkbox-group", (host, scope) => {
    const group = createCheckboxGroup({
        disabled: host.hasAttribute("disabled"),
        required: host.hasAttribute("required"),
        onChange: (values, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { values, reason }, bubbles: true,
            }));
        },
    });

    if (!host.hasAttribute("role")) host.setAttribute("role", "group");

    function wire(node) {
        // createRoleObserver calls wire(host) too -- ignore anything that is
        // not an actual member or the master.
        if (node.hasAttribute("data-select-all")) {
            return group.attachMaster(node);
        }
        if (node.hasAttribute("data-checkbox")) {
            const value = node.getAttribute("value") != null
                ? node.getAttribute("value")
                : node.getAttribute("data-value");
            if (value == null) return null;
            const { checkbox, off } = group.register(value, {
                defaultChecked: node.hasAttribute("checked") || node.hasAttribute("default-checked"),
                defaultIndeterminate: node.hasAttribute("indeterminate"),
                disabled: node.hasAttribute("disabled"),
            });
            if (!checkbox) return off;
            const offRoot = checkbox.attachRoot(node);
            const labelEl = node.querySelector("[data-checkbox-label]");
            const offLabel = labelEl ? checkbox.attachLabel(labelEl) : null;
            return () => {
                if (offLabel) offLabel();
                if (offRoot) offRoot();
                off();   // splices the member + pool-returns its nodes (H-12)
            };
        }
        return null;
    }
    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    // Reactive attributes
    const attrMo = new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.attributeName === "disabled") {
                group.setDisabled(host.hasAttribute("disabled"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["disabled"] });

    // Imperative surface
    host._checkboxGroupInstance = group;
    host.setAll = (v, reason) => group.setAll(v, reason);
    host.setDisabled = (b) => {
        if (b) host.setAttribute("disabled", "");
        else host.removeAttribute("disabled");
    };
    Object.defineProperty(host, "value",       { get: () => group.value(),       configurable: true });
    Object.defineProperty(host, "state",       { get: () => group.state(),       configurable: true });
    Object.defineProperty(host, "memberCount", { get: () => group.memberCount,   configurable: true });

    scope.onCleanup(() => {
        roles.disconnect();
        attrMo.disconnect();
        group.destroy();
    });
});
