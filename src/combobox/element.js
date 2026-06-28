// @zakkster/lite-headless / combobox / element.js
//
// <lite-combobox value="apple" placement="bottom-start" no-loop>
//     <button data-trigger>Apple</button>
//     <ul data-listbox>
//         <li data-item data-value="apple">Apple</li>
//         <li data-item data-value="banana">Banana</li>
//         <li data-item data-value="cherry">Cherry</li>
//     </ul>
// </lite-combobox>
//
// Items are the high-traffic role: search comboboxes pipe in async results,
// virtualized lists paginate items, filtered renders thrash the listbox.
// The MutationObserver attaches new [data-item] nodes the moment they land
// in the DOM and detaches them on removal, so the primitive's focus/highlight
// indices stay consistent with what the user actually sees.

import { define } from "@zakkster/lite-element";
import { createCombobox } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-listbox],[data-item]";

define("lite-combobox", (host, scope) => {
    const openSig  = scope.prop("open",  false, { type: Boolean, reflect: true });
    const valueSig = scope.prop("value", null,  { type: String, reflect: true });

    const cfg = {
        placement: host.getAttribute("placement") || "bottom-start",
        offset:    parseFloat(host.getAttribute("offset") || "4"),
        flip:      !host.hasAttribute("no-flip"),
        shift:     !host.hasAttribute("no-shift"),
        loop:      !host.hasAttribute("no-loop"),
        typeahead: !host.hasAttribute("no-typeahead"),
        autoFocus: host.getAttribute("auto-focus") || "first",
        closeOnSelect:       !host.hasAttribute("no-close-on-select"),
        closeOnEscape:       !host.hasAttribute("no-escape"),
        closeOnOutsideClick: !host.hasAttribute("no-outside"),
        container:           resolveContainer(host.getAttribute("container")),
        transition:          host.hasAttribute("transition"),
    };

    const combo = createCombobox({
        open: openSig,
        value: valueSig,
        onOpenChange:  (next) => openSig.set(next),
        onValueChange: (next) => valueSig.set(next),
        ...cfg,
    });

    let roles;

    function wire(node) {
        if (node.hasAttribute("data-trigger")) return combo.attachTrigger(node);
        if (node.hasAttribute("data-listbox")) {
            const off = combo.attachListbox(node);
            // listbox portals to container; follow so async items stay wired.
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-item")) {
            return combo.attachItem(node, {
                value: node.getAttribute("data-value"),
                label: node.getAttribute("data-label") || node.textContent,
            });
        }
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    host.setOpen  = (v, reason) => combo.setOpen(v, reason);
    host.setValue = (v, reason) => combo.setValue(v, reason);
    host.toggle   = () => combo.toggle();

    scope.onCleanup(() => {
        roles.disconnect();
        combo.destroy();
    });
}, { observedAttributes: ["open", "value"] });

function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}
