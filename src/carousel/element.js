// @zakkster/lite-headless / carousel / element.js
//
// <lite-carousel> custom element wrapping createCarousel. Uses the
// shared createRoleObserver pattern so role markers
// ([data-carousel-viewport], [data-carousel-slide], etc) attach
// automatically as nodes appear.
//
// Markup contract:
//
// <lite-carousel label="Featured products" autoplay="4000">
//   <button data-carousel-prev aria-label="Previous">←</button>
//
//   <div data-carousel-viewport tabindex="0">
//     <div data-carousel-slide data-index="0">Slide 1</div>
//     <div data-carousel-slide data-index="1">Slide 2</div>
//     <div data-carousel-slide data-index="2">Slide 3</div>
//   </div>
//
//   <button data-carousel-next aria-label="Next">→</button>
//
//   <div role="tablist">
//     <button data-carousel-indicator data-index="0">●</button>
//     <button data-carousel-indicator data-index="1">○</button>
//     <button data-carousel-indicator data-index="2">○</button>
//   </div>
//
//   <button data-carousel-play-pause>⏯</button>
// </lite-carousel>
//
// Attribute -> option mapping:
//   label              -> attachRoot({ label })  (the aria-label)
//   orientation        -> orientation ("horizontal" | "vertical")
//   autoplay           -> autoplay ms interval (numeric; absent = off)
//   loop               -> loop (boolean; presence = true)
//   uniform-slide-width -> uniformSlideWidth (boolean)
//   index              -> defaultIndex + reactive sync via useAttr
//
// Dispatches CustomEvents:
//   indexchange { detail: { index, reason } }
//   playingchange { detail: { playing, reason } }

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createCarousel } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL =
    "[data-carousel-viewport]," +
    "[data-carousel-slide]," +
    "[data-carousel-prev]," +
    "[data-carousel-next]," +
    "[data-carousel-indicator]," +
    "[data-carousel-play-pause]";

function parseIntAttr(raw, fallback) {
    if (raw == null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

define("lite-carousel", (host, scope) => {
    const orientation = host.getAttribute("orientation") || "horizontal";
    const label = host.getAttribute("label") || null;
    const loop = host.hasAttribute("loop");
    const uniformSlideWidth = host.hasAttribute("uniform-slide-width");
    const autoplayRaw = host.getAttribute("autoplay");
    const autoplay = autoplayRaw != null ? parseIntAttr(autoplayRaw, null) : null;
    const initialIndex = parseIntAttr(host.getAttribute("index"), 0);

    // v0.7.12 cascade guard pattern: when our own onIndexChange writes
    // back to the `index` attribute, suppress the useAttr effect to
    // prevent the cascade observed in accordion/tabs/tree. External
    // attribute writes (route sync, framework prop bindings) leave
    // the flag false and pass through normally.
    let _suppressIndexEffect = false;
    let _firstIndexRun = true;

    const carousel = createCarousel({
        orientation,
        autoplay,
        loop,
        uniformSlideWidth,
        defaultIndex: initialIndex,
        onIndexChange: (index, reason) => {
            if (reason !== "attribute") {
                const ser = String(index);
                if (host.getAttribute("index") !== ser) {
                    _suppressIndexEffect = true;
                    host.setAttribute("index", ser);
                    queueMicrotask(() => { _suppressIndexEffect = false; });
                }
            }
            host.dispatchEvent(new CustomEvent("indexchange", {
                detail: { index, reason }, bubbles: true,
            }));
        },
        onPlayingChange: (playing, reason) => {
            host.dispatchEvent(new CustomEvent("playingchange", {
                detail: { playing, reason }, bubbles: true,
            }));
        },
    });

    // Reactive sync from the host's `index` attribute
    const indexAttr = scope.useAttr("index");
    const stopIndexAttr = effect(() => {
        const raw = indexAttr();
        if (_firstIndexRun) { _firstIndexRun = false; return; }
        if (_suppressIndexEffect) return;
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) carousel.go(n, undefined, "attribute");
    });

    // Host is the role="region" root
    const detachRoot = carousel.attachRoot(host, { label });

    // Role observer for child markers. Each slide / indicator needs an
    // index — we read `data-index` if present, otherwise infer from
    // child order among siblings (slides count slide-elements,
    // indicators count indicator-elements).
    function indexOfSlide(el) {
        const explicit = el.getAttribute("data-index");
        if (explicit != null) {
            const n = parseInt(explicit, 10);
            if (Number.isFinite(n) && n >= 0) return n;
        }
        // Find this element among its peer siblings (same parent +
        // same data-carousel-slide marker). Counts only mounted peers.
        const parent = el.parentElement;
        if (!parent) return 0;
        let i = 0;
        for (const sib of parent.children) {
            if (sib === el) return i;
            if (sib.hasAttribute && sib.hasAttribute("data-carousel-slide")) i++;
        }
        return 0;
    }
    function indexOfIndicator(el) {
        const explicit = el.getAttribute("data-index");
        if (explicit != null) {
            const n = parseInt(explicit, 10);
            if (Number.isFinite(n) && n >= 0) return n;
        }
        const parent = el.parentElement;
        if (!parent) return 0;
        let i = 0;
        for (const sib of parent.children) {
            if (sib === el) return i;
            if (sib.hasAttribute && sib.hasAttribute("data-carousel-indicator")) i++;
        }
        return 0;
    }

    const roles = createRoleObserver(host, ROLE_SEL, (node) => {
        if      (node.matches("[data-carousel-viewport]"))    return carousel.attachViewport(node);
        else if (node.matches("[data-carousel-slide]"))       return carousel.attachSlide(node, indexOfSlide(node), {
            label: node.getAttribute("aria-label") || null,
        });
        else if (node.matches("[data-carousel-prev]"))        return carousel.attachPrev(node);
        else if (node.matches("[data-carousel-next]"))        return carousel.attachNext(node);
        else if (node.matches("[data-carousel-indicator]"))   return carousel.attachIndicator(node, indexOfIndicator(node));
        else if (node.matches("[data-carousel-play-pause]")) return carousel.attachPlayPause(node);
    });
    roles.rescan();

    // Expose the primitive + imperative API on the host
    host._carouselInstance = carousel;
    host.go        = (i)    => carousel.go(i);
    host.next      = ()     => carousel.next();
    host.prev      = ()     => carousel.prev();
    host.first     = ()     => carousel.first();
    host.last      = ()     => carousel.last();
    host.play      = ()     => carousel.play();
    host.pause     = ()     => carousel.pause();
    host.toggle    = ()     => carousel.toggle();
    Object.defineProperty(host, "index", {
        get: () => carousel.index(),
        set: (n) => carousel.go(n),
        configurable: true,
    });
    Object.defineProperty(host, "playing", {
        get: () => carousel.isPlaying(),
        configurable: true,
    });
    Object.defineProperty(host, "slideCount", {
        get: () => carousel.slideCount(),
        configurable: true,
    });

    scope.onCleanup(() => {
        stopIndexAttr();
        roles.disconnect();
        detachRoot();
        carousel.destroy();
    });
}, { observedAttributes: ["index"] });
