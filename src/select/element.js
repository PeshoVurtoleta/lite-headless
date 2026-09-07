// @zakkster/lite-headless / select / element.js
//
// <lite-select value="apple" placement="bottom-start" no-loop>
//     <button data-trigger>Apple</button>
//     <ul data-listbox>
//         <li data-item data-value="apple">Apple</li>
//         <li data-item data-value="banana">Banana</li>
//         <li data-item data-value="cherry" data-disabled>Cherry</li>
//     </ul>
// </lite-select>
//
// The listbox-button pattern: a button trigger + a listbox popup, NO text
// editing. Items are the high-traffic role; the MutationObserver attaches new
// [data-item] nodes the moment they land and detaches them on removal, so the
// primitive's highlight indices stay consistent with what the user sees.
//
// Attribute mapping:
//   value                -> selected value (reactive; reflected)
//   open                 -> open state (reactive; reflected)
//   placement / offset / no-flip / no-shift / no-loop / no-typeahead
//   auto-focus           -> 'selected' | 'first' | 'none' (default 'selected')
//   no-close-on-select / no-escape / no-outside / transition / container
//
// Painted output attributes (CSS contract): see src/select/llms.txt.

import { define } from "@zakkster/lite-element";
import { createSelect } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-listbox],[data-item]";

define("lite-select", (host, scope) => {
    const openSig  = scope.prop("open",  false, { type: Boolean, reflect: true });
    const valueSig = scope.prop("value", null,  { type: String, reflect: true });

    const cfg = {
        placement: host.getAttribute("placement") || "bottom-start",
        offset:    parseFloat(host.getAttribute("offset") || "4"),
        flip:      !host.hasAttribute("no-flip"),
        shift:     !host.hasAttribute("no-shift"),
        loop:      !host.hasAttribute("no-loop"),
        typeahead: !host.hasAttribute("no-typeahead"),
        autoFocus: host.getAttribute("auto-focus") || "selected",
        closeOnSelect:       !host.hasAttribute("no-close-on-select"),
        closeOnEscape:       !host.hasAttribute("no-escape"),
        closeOnOutsideClick: !host.hasAttribute("no-outside"),
        container:           resolveContainer(host.getAttribute("container")),
        transition:          host.hasAttribute("transition"),
    };

    const select = createSelect({
        open: openSig,
        value: valueSig,
        onOpenChange:  (next) => openSig.set(next),
        onValueChange: (next) => valueSig.set(next),
        ...cfg,
    });

    let roles;

    function wire(node) {
        if (node.hasAttribute("data-trigger")) return select.attachTrigger(node);
        if (node.hasAttribute("data-listbox")) {
            const off = select.attachListbox(node);
            // listbox portals to container; follow so async items stay wired.
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-item")) {
            return select.attachItem(node, {
                value: node.getAttribute("data-value"),
                label: node.getAttribute("data-label") || node.textContent,
                disabled: node.hasAttribute("data-disabled"),
            });
        }
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    host.setOpen  = (v, reason) => select.setOpen(v, reason);
    host.setValue = (v, reason) => select.setValue(v, reason);
    host.toggle   = () => select.toggle();

    scope.onCleanup(() => {
        roles.disconnect();
        select.destroy();
    });
}, { observedAttributes: ["open", "value"] });

function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}
