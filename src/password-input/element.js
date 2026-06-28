// @zakkster/lite-headless / password-input / element.js
//
// <lite-password-input visible>
//   <input data-input type="password" autocomplete="current-password" />
//   <button data-toggle>show</button>
// </lite-password-input>
//
// `visible` reflects to/from the attribute. Slotted [data-input] and
// [data-toggle] are wired (and re-wired if injected later).
//
// Side-effect: importing this module registers the custom element.

import { define } from "@zakkster/lite-element";
import { createPasswordInput } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-input],[data-toggle]";

define("lite-password-input", (host, scope) => {
    const visibleSig = scope.prop("visible", false, { type: Boolean, reflect: true });

    const pw = createPasswordInput({
        visible: visibleSig(),
        onVisibilityChange: (v) => visibleSig.set(v),
    });
    const offRoot = pw.attachRoot(host);

    // external attribute change -> factory
    scope.effect(() => pw.setVisible(visibleSig()));

    function wire(node) {
        if (node.hasAttribute("data-input"))  return pw.attachInput(node);
        if (node.hasAttribute("data-toggle")) return pw.attachToggle(node);
        return null;
    }
    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    host._passwordInputInstance = pw;
    host.toggle = () => pw.toggle();
    host.show   = () => pw.show();
    host.hide   = () => pw.hide();
    host.setVisible = (v) => { visibleSig.set(!!v); pw.setVisible(!!v); };
    Object.defineProperty(host, "visible", { get: () => pw.isVisible(), set: (v) => host.setVisible(v), configurable: true });

    scope.onCleanup(() => {
        roles.disconnect();
        offRoot();
        pw.destroy();
    });
}, { observedAttributes: ["visible"] });
