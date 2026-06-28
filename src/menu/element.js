// @zakkster/lite-headless / menu / element.js
//
// <lite-menu placement="bottom-start">
//   <button data-trigger>Actions</button>
//   <ul data-menu>
//     <li data-item data-on-select="save">Save</li>
//     <li data-item data-on-select="export" data-disabled>Export</li>
//     <hr data-separator>
//     <li data-item data-submenu="recent">Open Recent ▸</li>
//     <li data-item data-on-select="quit">Quit</li>
//   </ul>
//   <lite-menu is-submenu data-submenu-key="recent">
//     <ul data-menu>
//       <li data-item data-on-select="recent-a">file_a.md</li>
//       <li data-item data-on-select="recent-b">file_b.md</li>
//     </ul>
//   </lite-menu>
// </lite-menu>
//
// `data-on-select` is dispatched as a CustomEvent('select', { detail: {...} })
// on the host so consumers can listen without writing custom-element code.
//
// SUBMENUS. v0.7 ships a declarative pattern (above): a parent <li> with
// `data-submenu="<key>"` is paired with a nested <lite-menu is-submenu
// data-submenu-key="<key>">`. The wrapper resolves the link in a second pass
// after both elements have been upgraded. Programmatic wiring is still
// available via `host._menuInstance.attachSubmenu(parentItem, childMenu)`
// for advanced cases (cross-tree submenu, dynamically inserted submenu
// after the host is connected).
//
// DYNAMIC CONTENT. New [data-item]/[data-separator] elements injected after
// mount are attached via MutationObserver; removed nodes are detached. Items
// inside a nested <lite-menu> belong to the nested primitive and are NOT
// claimed by the parent.

import { define } from "@zakkster/lite-element";
import { createMenu } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-menu],[data-item],[data-separator]";

define("lite-menu", (host, scope) => {
    const openSig = scope.prop("open", false, { type: Boolean, reflect: true });

    const cfg = {
        placement: host.getAttribute("placement") || "bottom-start",
        offset:    parseFloat(host.getAttribute("offset") || "4"),
        flip:      !host.hasAttribute("no-flip"),
        shift:     !host.hasAttribute("no-shift"),
        loop:      !host.hasAttribute("no-loop"),
        typeahead: !host.hasAttribute("no-typeahead"),
        closeOnSelect:       !host.hasAttribute("no-close-on-select"),
        closeOnEscape:       !host.hasAttribute("no-escape"),
        closeOnOutsideClick: !host.hasAttribute("no-outside"),
        isSubmenu:           host.hasAttribute("is-submenu"),
        container:           resolveContainer(host.getAttribute("container")),
        transition:          host.hasAttribute("transition"),
    };

    const menu = createMenu({
        open: openSig,
        onOpenChange: (next) => openSig.set(next),
        ...cfg,
    });

    let roles;

    function wire(node) {
        if (node.hasAttribute("data-trigger")) return menu.attachTrigger(node);
        if (node.hasAttribute("data-menu")) {
            const off = menu.attachMenu(node);
            // menu surface gets portaled to container -- follow it so
            // dynamically-injected items remain visible to the observer.
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-separator")) return menu.attachSeparator(node);
        if (node.hasAttribute("data-item")) {
            const key = node.getAttribute("data-on-select");
            return menu.attachItem(node, {
                disabled: node.hasAttribute("data-disabled"),
                label:    node.getAttribute("data-label") || node.textContent,
                onSelect: key ? () => {
                    host.dispatchEvent(new CustomEvent("select", { detail: { key, el: node }, bubbles: true }));
                } : undefined,
            });
        }
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    // Expose the raw instance for advanced wiring (programmatic submenu
    // attachment, custom anchoring, etc.). Documented contract for power users.
    host._menuInstance = menu;
    host.setOpen = (v, reason) => menu.setOpen(v, reason);
    host.toggle  = () => menu.toggle();

    // ----- declarative submenu pairing -----
    // After the initial role scan, walk the light DOM for items that declare
    // a submenu by key. Wait one microtask so nested <lite-menu> upgrades
    // settle and their `_menuInstance` becomes available.
    const submenuOffs = [];
    function pairSubmenus() {
        if (!menu || menu.destroyed) return;
        const declarators = host.querySelectorAll("[data-item][data-submenu]");
        for (let i = 0; i < declarators.length; i++) {
            const item = declarators[i];
            // The item itself must belong to THIS host (not a nested menu).
            let p = item.parentElement;
            let belongsHere = true;
            while (p && p !== host) {
                if (p.tagName === "LITE-MENU") { belongsHere = false; break; }
                p = p.parentElement;
            }
            if (!belongsHere) continue;

            const key = item.getAttribute("data-submenu");
            if (!key) continue;
            // Find the nested submenu with matching key, scoped to this host.
            const nested = host.querySelector('lite-menu[is-submenu][data-submenu-key="' + cssEscape(key) + '"]');
            if (!nested || !nested._menuInstance) continue;
            try {
                const off = menu.attachSubmenu(item, nested._menuInstance);
                if (off) submenuOffs.push(off);
            } catch { /* swallow */ }
        }
    }
    // Defer one microtask so nested upgrades complete first.
    if (typeof queueMicrotask === "function") queueMicrotask(pairSubmenus);
    else setTimeout(pairSubmenus, 0);

    scope.onCleanup(() => {
        for (let i = 0; i < submenuOffs.length; i++) {
            try { submenuOffs[i](); } catch { /* swallow */ }
        }
        roles.disconnect();
        menu.destroy();
    });
}, { observedAttributes: ["open"] });

// Minimal CSS.escape() polyfill for keys that may contain unusual chars.
// Most data-submenu keys are simple identifiers; this is defensive.
function cssEscape(s) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
    // fallback: backslash-escape ASCII non-word chars
    let out = "";
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        const isWord = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95;
        out += isWord ? s.charAt(i) : "\\" + s.charAt(i);
    }
    return out;
}

function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}
