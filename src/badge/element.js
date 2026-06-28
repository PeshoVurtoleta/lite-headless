// @zakkster/lite-headless / badge / element.js
//
// <lite-badge count="3" intent="danger">3</lite-badge>
// <lite-badge dot intent="success"></lite-badge>
// <lite-badge count="105" max="99"></lite-badge>     // shows "99+"

import { define } from "@zakkster/lite-element";
import { createBadge } from "./index.js";

function parseN(s, dflt) {
    const n = parseInt(s, 10);
    return isFinite(n) ? n : dflt;
}

define("lite-badge", (host, scope) => {
    const b = createBadge({
        count:    parseN(host.getAttribute("count"), 0),
        max:      parseN(host.getAttribute("max"), 99),
        dot:      host.hasAttribute("dot"),
        showZero: host.hasAttribute("show-zero"),
        intent:   host.getAttribute("intent") || "default",
    });
    const offRoot = b.attachRoot(host);

    let _suppress = false;
    const attrMo = new MutationObserver((muts) => {
        if (_suppress) return;
        for (const mut of muts) {
            if (mut.attributeName === "count") {
                b.setCount(parseN(host.getAttribute("count"), 0));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["count"] });

    host._badgeInstance = b;
    host.setCount  = (n) => {
        _suppress = true;
        host.setAttribute("count", String(n));
        queueMicrotask(() => { _suppress = false; });
        b.setCount(n);
    };
    host.increment = (by) => host.setCount(b.count() + (typeof by === "number" ? by : 1));
    host.decrement = (by) => host.setCount(b.count() - (typeof by === "number" ? by : 1));
    host.reset     = () => host.setCount(0);
    Object.defineProperty(host, "count",     { get: () => b.count(),     configurable: true });
    Object.defineProperty(host, "displayed", { get: () => b.displayed(), configurable: true });

    return () => {
        attrMo.disconnect();
        offRoot();
        b.destroy();
    };
});
