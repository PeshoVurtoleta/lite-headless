// @zakkster/lite-headless / separator / element.js
//
// <lite-separator></lite-separator>                       horizontal, semantic
// <lite-separator orientation="vertical"></lite-separator>
// <lite-separator decorative></lite-separator>            visual only
//
// `orientation` reflects to/from the attribute so responsive CSS and outside
// code can read/flip it. `decorative` is locked at mount.
//
// Side-effect: importing this module registers the custom element.

import { define } from "@zakkster/lite-element";
import { createSeparator } from "./index.js";

define("lite-separator", (host, scope) => {
    const sep = createSeparator({
        orientation: host.getAttribute("orientation") || "horizontal",
        decorative:  host.hasAttribute("decorative"),
    });
    const offRoot = sep.attachRoot(host);

    let _suppress = false;
    const attrMo = new MutationObserver((muts) => {
        if (_suppress) return;
        for (const mut of muts) {
            if (mut.attributeName === "orientation") {
                sep.setOrientation(host.getAttribute("orientation") || "horizontal");
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["orientation"] });

    host._separatorInstance = sep;
    host.setOrientation = (or) => {
        _suppress = true;
        host.setAttribute("orientation", or);
        queueMicrotask(() => { _suppress = false; });
        sep.setOrientation(or);
    };
    Object.defineProperty(host, "orientation", { get: () => sep.orientation(), configurable: true });

    scope.onCleanup(() => {
        attrMo.disconnect();
        offRoot();
        sep.destroy();
    });
}, { observedAttributes: ["orientation"] });
