// @zakkster/lite-headless / clipboard / element.js
//
// <lite-clipboard value="npm i @zakkster/lite-headless" timeout="2000">
//   <button data-trigger>Copy</button>
//   <span data-indicator>Copied!</span>
// </lite-clipboard>
//
// `value` reflects to/from the attribute. Slotted [data-trigger] and
// [data-indicator] are wired (and re-wired if injected later).
//
// Side-effect: importing this module registers the custom element.

import { define } from "@zakkster/lite-element";
import { createClipboard } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-indicator]";

function parseN(s, dflt) {
    const n = parseInt(s, 10);
    return isFinite(n) ? n : dflt;
}

define("lite-clipboard", (host, scope) => {
    const valueSig = scope.prop("value", "", { type: String, reflect: true });

    const cb = createClipboard({
        value:   valueSig(),
        timeout: parseN(host.getAttribute("timeout"), 2000),
    });
    const offRoot = cb.attachRoot(host);

    // keep the factory's copy-target in sync with the reflected attribute
    scope.effect(() => cb.setValue(valueSig()));

    function wire(node) {
        if (node.hasAttribute("data-trigger"))   return cb.attachTrigger(node);
        if (node.hasAttribute("data-indicator")) return cb.attachIndicator(node);
        return null;
    }
    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    host._clipboardInstance = cb;
    host.copy     = () => cb.copy();
    host.reset    = () => cb.reset();
    host.setValue = (v) => { valueSig.set(v); cb.setValue(v); };
    Object.defineProperty(host, "value",  { get: () => cb.value(),    set: (v) => host.setValue(v), configurable: true });
    Object.defineProperty(host, "copied", { get: () => cb.isCopied(), configurable: true });

    scope.onCleanup(() => {
        roles.disconnect();
        offRoot();
        cb.destroy();
    });
}, { observedAttributes: ["value"] });
