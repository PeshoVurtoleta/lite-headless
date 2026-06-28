// @zakkster/lite-headless / affix / element.js
//
// <lite-affix offset-top="64">
//     <nav class="page-nav">...</nav>
// </lite-affix>

import { define } from "@zakkster/lite-element";
import { createAffix } from "./index.js";

function parseN(s, dflt) {
    const n = parseFloat(s);
    return isFinite(n) ? n : dflt;
}

define("lite-affix", (host, scope) => {
    // Resolve root scroll container (optional)
    let rootEl = null;
    const rootAttr = host.getAttribute("root");
    if (rootAttr && rootAttr !== "window") {
        rootEl = document.querySelector(rootAttr);
    }
    const aff = createAffix({
        offsetTop: parseN(host.getAttribute("offset-top"), 0),
        root: rootEl,
        onChange: (pinned) => {
            host.dispatchEvent(new CustomEvent("affixchange", { detail: { pinned }, bubbles: true }));
        },
    });
    // Attach to the host itself: the host is the element that gets pinned
    const offRoot = aff.attachRoot(host);

    host._affixInstance = aff;
    Object.defineProperty(host, "isPinned",  { get: () => aff.isPinned(),  configurable: true });
    Object.defineProperty(host, "offsetTop", { get: () => aff.offsetTop(), configurable: true });

    return () => {
        offRoot();
        aff.destroy();
    };
});
