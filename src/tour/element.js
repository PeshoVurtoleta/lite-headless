// @zakkster/lite-headless / tour / element.js
//
// <lite-tour id="t1">
//     <div data-tour-step="nav" data-tour-target="#nav">
//         <h3>Navigation</h3>
//         <p>Use this to switch between sections.</p>
//         <div data-tour-prev>Back</div>
//         <div data-tour-next>Next</div>
//         <div data-tour-skip>Skip</div>
//     </div>
//     <div data-tour-step="new" data-tour-target="#new-btn">
//         <h3>Create</h3>
//         <p>Click here to start a new project.</p>
//         <div data-tour-prev>Back</div>
//         <div data-tour-next>Finish</div>
//     </div>
// </lite-tour>
//
// The `data-tour-target` attribute (on the step content element)
// holds a CSS selector that resolves to the target element. The
// wrapper looks the target up once on connect; consumers wanting
// dynamic targets should use the headless API directly.

import { define } from "@zakkster/lite-element";
import { createTour } from "./index.js";

define("lite-tour", (host, scope) => {
    const tour = createTour({
        loop: host.hasAttribute("loop"),
        onStepChange: (idx, step) => {
            host.dispatchEvent(new CustomEvent("stepchange", {
                detail: { index: idx, id: step.id, target: step.target },
                bubbles: true,
            }));
        },
        onComplete: () => {
            host.dispatchEvent(new CustomEvent("complete", { bubbles: true }));
        },
        onSkip: (atIdx) => {
            host.dispatchEvent(new CustomEvent("skip", {
                detail: { atIndex: atIdx }, bubbles: true,
            }));
        },
    });

    // Discover steps from declarative markup. Each child with
    // `data-tour-step="<id>"` registers itself as a step.
    function discoverSteps() {
        const stepEls = host.querySelectorAll("[data-tour-step]");
        for (let i = 0; i < stepEls.length; i++) {
            const el = stepEls[i];
            const id = el.getAttribute("data-tour-step");
            if (!id) continue;
            // Resolve target by selector if provided.
            const sel = el.getAttribute("data-tour-target");
            const target = sel ? document.querySelector(sel) : null;
            tour.addStep({ id, target });
            tour.attachStepContent(id, el);
        }
    }

    const offRoot = tour.attachRoot(host);

    // Wire prev/next/skip buttons inside step contents. Single
    // delegated listener on the host.
    function onClick(ev) {
        const t = ev.target;
        if (!(t instanceof Element)) return;
        if (t.closest("[data-tour-next]")) { tour.next(); }
        else if (t.closest("[data-tour-prev]")) { tour.prev(); }
        else if (t.closest("[data-tour-skip]")) { tour.skip(); }
        else if (t.closest("[data-tour-finish]")) { tour.finish(); }
    }
    host.addEventListener("click", onClick);

    discoverSteps();

    // Auto-start if `start-on-mount` attribute is present.
    if (host.hasAttribute("start-on-mount")) {
        // Defer one frame so consumer can subscribe to stepchange first.
        requestAnimationFrame(() => tour.start());
    }

    // Imperative surface
    host._tourInstance = tour;
    host.start  = () => tour.start();
    host.next   = () => tour.next();
    host.prev   = () => tour.prev();
    host.skip   = () => tour.skip();
    host.finish = () => tour.finish();
    host.goTo   = (idxOrId) => tour.goTo(idxOrId);

    Object.defineProperty(host, "index",      { get: () => tour.current(),  configurable: true });
    Object.defineProperty(host, "isActive",   { get: () => tour.isActive(), configurable: true });
    Object.defineProperty(host, "isFirst",    { get: () => tour.isFirst(),  configurable: true });
    Object.defineProperty(host, "isLast",     { get: () => tour.isLast(),   configurable: true });
    Object.defineProperty(host, "count",      { get: () => tour.count(),    configurable: true });

    return () => {
        host.removeEventListener("click", onClick);
        offRoot();
        tour.destroy();
    };
});
